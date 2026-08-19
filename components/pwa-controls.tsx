"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    const appNavigator = navigator as Navigator & {
      standalone?: boolean;
      userAgentData?: { mobile?: boolean };
    };
    const installed = window.matchMedia("(display-mode: standalone)").matches || Boolean(appNavigator.standalone);
    const mobile = appNavigator.userAgentData?.mobile
      ?? (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
        || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
    const eligibilityTimer = window.setTimeout(() => setEligible(mobile && !installed), 0);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setEligible(false);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(eligibilityTimer);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      setInstallMessage(choice.outcome === "accepted" ? "Installing…" : "Installation was cancelled.");
      return;
    }
    setInstallMessage(/iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "In Safari, tap Share, then Add to Home Screen."
      : "Use your browser menu and choose Install app or Add to Home screen.");
  }

  if (!eligible) return null;

  return (
    <div className="pwa-controls">
      <div>
        <button className="button" type="button" onClick={install}>
          Install app
        </button>
        {installMessage && <p className="pwa-message" role="status">{installMessage}</p>}
      </div>
    </div>
  );
}
