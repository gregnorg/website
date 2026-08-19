"use client";

import { useEffect } from "react";

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

async function setBadge(count: number) {
  const badgeNavigator = navigator as BadgeNavigator;
  try {
    if (count > 0) await badgeNavigator.setAppBadge?.(count);
    else await badgeNavigator.clearAppBadge?.();
  } catch {
    // App icon badging is optional and may be unavailable outside an installed PWA.
  }
  navigator.serviceWorker?.controller?.postMessage({ type: "TURN_BADGE_COUNT", count });
}

export function AppIconBadge({ initialCount }: { initialCount: number }) {
  useEffect(() => {
    void setBadge(initialCount);

    async function refreshBadge() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/games/turn-count", { cache: "no-store" });
        if (!response.ok) return;
        const { count } = await response.json() as { count: number };
        await setBadge(count);
      } catch {
        // Keep the last known badge if refreshing fails.
      }
    }

    document.addEventListener("visibilitychange", refreshBadge);
    window.addEventListener("focus", refreshBadge);
    return () => {
      document.removeEventListener("visibilitychange", refreshBadge);
      window.removeEventListener("focus", refreshBadge);
    };
  }, [initialCount]);

  return null;
}
