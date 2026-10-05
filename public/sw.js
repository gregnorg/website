const CACHE = "shove-actually-shell-v3";
const SHELL = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#295b45"><title>Shove Actually — Offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f4;color:#1e2320;font:16px/1.5 Arial,sans-serif}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:2rem}button{padding:.7rem 1rem;border:0;border-radius:4px;color:white;background:#295b45;font:inherit;font-weight:700}</style><main><img src="/icons/icon-192.png" width="96" height="96" alt=""><h1>You’re offline</h1><p>Shove Actually needs a connection to load games and submit moves.</p><button onclick="location.reload()">Try again</button></main></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      )),
    );
  }
});

async function updateBadge(count) {
  if (!Number.isSafeInteger(count) || count < 0) return;
  try {
    if (count > 0) await self.navigator.setAppBadge?.(count);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
    else await self.navigator.setAppBadge?.(0);
  } catch {
    // Optional badging must not prevent a visible notification.
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* Show a fallback notification. */ }
  const notification = data.notification ?? data;
  const count = data.badgeCount ?? (notification.app_badge !== undefined ? Number(notification.app_badge) : undefined);
  const display = Promise.resolve().then(() => self.registration.showNotification(notification.title ?? "Shove Actually", {
    body: notification.body ?? "There is an update to one of your games.",
    icon: notification.icon ?? "/icons/icon-192.png",
    badge: notification.badge ?? "/icons/icon-192.png",
    data: { url: notification.navigate ?? data.url ?? "/games" },
    tag: notification.tag,
    renotify: Boolean(notification.tag),
  }));
  event.waitUntil(Promise.allSettled([display, updateBadge(count)]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "TURN_BADGE_COUNT") return;
  const count = Number(event.data.count);
  if (!Number.isSafeInteger(count) || count < 0) return;
  const work = [updateBadge(count)];
  if (count === 0) {
    work.push(self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => notification.close());
    }));
  }
  event.waitUntil(Promise.allSettled(work));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/games", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === target);
      return existing ? existing.focus() : self.clients.openWindow(target);
    }),
  );
});
