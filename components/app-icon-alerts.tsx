"use client";

import { useEffect, useState } from "react";

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export function AppIconAlerts() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      const timer = window.setTimeout(() => setSupported(false), 0);
      return () => window.clearTimeout(timer);
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEnabled(Boolean(subscription)))
      .catch(() => setSupported(false));
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (enabled && existing) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setEnabled(false);
        setMessage("App icon alerts are off on this device.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Notification permission is required for app icon alerts.");
        return;
      }
      const keyResponse = await fetch("/api/push/public-key", { cache: "no-store" });
      if (!keyResponse.ok) throw new Error("App icon alerts are not configured on this server.");
      const { publicKey } = await keyResponse.json() as { publicKey: string };
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error("Could not enable app icon alerts.");
      setEnabled(true);
      setMessage("App icon alerts are on for this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update app icon alerts.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <p>App icon alerts are not supported by this browser.</p>;

  return (
    <div className="app-icon-alerts">
      <button className={enabled ? "button secondary" : "button"} type="button" onClick={toggle} disabled={busy}>
        {busy ? "Please wait…" : enabled ? "Turn off app icon alerts" : "Turn on app icon alerts"}
      </button>
      {message && <p className="pwa-message" role="status">{message}</p>}
    </div>
  );
}
