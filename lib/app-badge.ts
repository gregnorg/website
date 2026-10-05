type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

let latestUpdate = 0;

async function applyBadgeCount(count: number, version: number) {
  if (!Number.isSafeInteger(count) || count < 0 || version !== latestUpdate) return;
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
    if (version !== latestUpdate) return;
    worker?.postMessage({ type: "TURN_BADGE_COUNT", count });
  } catch {
    // Badging is optional outside an installed app.
  }
}

export function setAppBadgeCount(count: number) {
  return applyBadgeCount(count, ++latestUpdate);
}

export async function refreshAppBadge() {
  const version = ++latestUpdate;
  try {
    const response = await fetch("/api/games/turn-count", { cache: "no-store" });
    if (!response.ok) return;
    const { count } = await response.json() as { count: number };
    await applyBadgeCount(count, version);
  } catch {
    // Keep the last known count while offline.
  }
}
