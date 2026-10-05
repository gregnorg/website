"use client";

import { useEffect } from "react";
import { refreshAppBadge, setAppBadgeCount } from "@/lib/app-badge";

export function AppIconBadge({ initialCount }: { initialCount: number }) {
  useEffect(() => {
    void setAppBadgeCount(initialCount);
    let inFlight = false;
    async function refreshBadge() {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try { await refreshAppBadge(); }
      finally { inFlight = false; }
    }
    void refreshBadge();
    const timer = window.setInterval(refreshBadge, 30_000);
    document.addEventListener("visibilitychange", refreshBadge);
    window.addEventListener("focus", refreshBadge);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshBadge);
      window.removeEventListener("focus", refreshBadge);
    };
  }, [initialCount]);

  return null;
}
