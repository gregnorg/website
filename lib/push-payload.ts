export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  badgeCount?: number;
};

export function buildPushPayload(payload: PushPayload, siteUrl: string) {
  const count = payload.badgeCount;
  const appBadge = typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? String(count) : undefined;
  // Keep the legacy fields so already-installed workers can read this payload.
  // Newer iOS versions can apply app_badge without running worker JavaScript.
  return {
    ...payload,
    web_push: 8030,
    ...(appBadge !== undefined ? { app_badge: appBadge } : {}),
    notification: {
      title: payload.title,
      body: payload.body,
      navigate: new URL(payload.url, siteUrl).href,
      icon: new URL("/icons/icon-192.png", siteUrl).href,
      badge: new URL("/icons/icon-192.png", siteUrl).href,
      tag: payload.tag,
      renotify: true,
      silent: false,
      data: { url: payload.url },
      // Older WebKit releases read app_badge inside notification.
      ...(appBadge !== undefined ? { app_badge: appBadge } : {}),
    },
  };
}
