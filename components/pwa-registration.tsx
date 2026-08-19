"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(async (registration) => {
        void registration.update();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Repair a missing server-side subscription as soon as the signed-in
          // installed app opens; users should not need to revisit Account first.
          await fetch("/api/push/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription),
          });
        }
      }).catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    }
  }, []);

  return null;
}
