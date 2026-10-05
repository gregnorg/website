"use client";

import { useEffect } from "react";

export function PwaRegistration({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let inFlight = false;
    let lastSaved = 0;
    let disposed = false;
    const registrationPromise = navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    registrationPromise.then(registration => { void registration.update().catch(() => undefined); })
      .catch(error => console.error("Service worker registration failed:", error));

    async function repairSubscription() {
      if (!userId || disposed || inFlight || document.visibilityState !== "visible" || Date.now() - lastSaved < 60_000) return;
      inFlight = true;
      try {
        const registration = await registrationPromise;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription || disposed) return;
        const response = await fetch("/api/push/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        });
        if (response.ok) lastSaved = Date.now();
      } catch {
        // Retry on return or while visible if the previous request was offline.
      } finally { inFlight = false; }
    }
    void repairSubscription();
    const timer = window.setInterval(repairSubscription, 60_000);
    window.addEventListener("focus", repairSubscription);
    document.addEventListener("visibilitychange", repairSubscription);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", repairSubscription);
      document.removeEventListener("visibilitychange", repairSubscription);
    };
  }, [userId]);

  return null;
}
