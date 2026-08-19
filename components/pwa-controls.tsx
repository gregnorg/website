"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    const statusTimer = window.setTimeout(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    }, 0);

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallMessage("Installed.");
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(statusTimer);
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

  return (
    <div className="pwa-controls">
      <div>
        <button className="button" type="button" onClick={install} disabled={installed}>
          {installed ? "App installed" : "Install app"}
        </button>
        {installMessage && <p className="pwa-message" role="status">{installMessage}</p>}
      </div>
    </div>
  );
}
