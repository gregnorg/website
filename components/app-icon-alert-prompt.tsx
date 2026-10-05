"use client";

import { useEffect, useState } from "react";
import { refreshAppBadge } from "@/lib/app-badge";

const DISMISSED_KEY = "app-icon-alert-prompt-dismissed";

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function isInstalledApp() {
  const appNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(appNavigator.standalone);
}

export function AppIconAlertPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isInstalledApp()
      || !("Notification" in window)
      || !("serviceWorker" in navigator)
      || !("PushManager" in window)
      || Notification.permission !== "default"
      || localStorage.getItem(DISMISSED_KEY)) return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!subscription) setVisible(true);
      })
      .catch(() => undefined);
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        localStorage.setItem(DISMISSED_KEY, "1");
        setVisible(false);
        return;
      }

      const [registration, keyResponse] = await Promise.all([
        navigator.serviceWorker.ready,
        fetch("/api/push/public-key", { cache: "no-store" }),
      ]);
      if (!keyResponse.ok) throw new Error("App icon alerts are not configured on this server.");
      const { publicKey } = await keyResponse.json() as { publicKey: string };
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error("Could not enable app icon alerts.");
      await refreshAppBadge();
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable app icon alerts.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className="app-alert-prompt" aria-labelledby="app-alert-prompt-title">
      <div>
        <strong id="app-alert-prompt-title">Turn on app icon alerts?</strong>
        <p>Get a notification and app icon badge when a game is waiting for your move.</p>
        {message && <p className="error" role="alert">{message}</p>}
      </div>
      <div className="app-alert-prompt-actions">
        <button className="button" type="button" onClick={enable} disabled={busy}>
          {busy ? "Enabling…" : "Enable alerts"}
        </button>
        <button className="app-alert-dismiss" type="button" onClick={dismiss} disabled={busy}>Not now</button>
      </div>
    </aside>
  );
}
