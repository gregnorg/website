type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function setAppBadgeCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) return;
  const badgeNavigator = navigator as BadgeNavigator;
  try {
    if (count > 0) await badgeNavigator.setAppBadge?.(count);
    else if (badgeNavigator.clearAppBadge) await badgeNavigator.clearAppBadge();
    else await badgeNavigator.setAppBadge?.(0);
  } catch {
    // The worker can still update the badge when the window API is unavailable.
  }
  try {
    const worker = navigator.serviceWorker?.controller
      ?? (await navigator.serviceWorker?.getRegistration())?.active;
    worker?.postMessage({ type: "TURN_BADGE_COUNT", count });
  } catch {
    // Badging is optional outside an installed app.
  }
}

export async function refreshAppBadge() {
  try {
    const response = await fetch("/api/games/turn-count", { cache: "no-store" });
    if (!response.ok) return;
    const { count } = await response.json() as { count: number };
    await setAppBadgeCount(count);
  } catch {
    // Keep the last known count while offline.
  }
}
