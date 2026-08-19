const CACHE = "shove-actually-shell-v2";
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

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const work = [];
  if ("setAppBadge" in self.navigator && Number.isFinite(data.badgeCount)) {
    work.push(data.badgeCount > 0
      ? self.navigator.setAppBadge(data.badgeCount)
      : self.navigator.clearAppBadge());
  }
  work.push(self.registration.showNotification(data.title ?? "Shove Actually", {
      body: data.body ?? "There is an update to one of your games.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/games" },
      tag: data.tag,
      renotify: Boolean(data.tag),
    }));
  event.waitUntil(Promise.all(work));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "TURN_BADGE_COUNT") return;
  const count = Number(event.data.count) || 0;
  const work = [];
  if ("setAppBadge" in self.navigator) {
    work.push(count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge());
  }
  if (count === 0) {
    work.push(self.registration.getNotifications({ tag: event.data.tag }).then((notifications) => {
      notifications.forEach((notification) => notification.close());
    }));
  }
  event.waitUntil(Promise.all(work));
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
