import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildPushPayload } from "../lib/push-payload.ts";
import { refreshAppBadge, setAppBadgeCount } from "../lib/app-badge.ts";

function workerHarness(badgeApi: Record<string, unknown> = {}) {
  const handlers = new Map<string, (event: unknown) => void>();
  const notifications: { title: string; options: { data: { url: string } } }[] = [];
  const self = {
    navigator: badgeApi,
    registration: {
      showNotification: async (title: string, options: { data: { url: string } }) => { notifications.push({ title, options }); },
      getNotifications: async () => [],
    },
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, URL });
  async function push(data: unknown, malformed = false) {
    let done: Promise<unknown> | undefined;
    handlers.get("push")!({
      data: { json: () => { if (malformed) throw new Error("Invalid JSON"); return data; } },
      waitUntil: (work: Promise<unknown>) => { done = work; },
    });
    assert.ok(done);
    await done;
  }
  return { notifications, push };
}

const payload = { title: "Your turn", body: "Make your move", url: "/games/12", tag: "turn-12", badgeCount: 3 };

test("iOS receives a native badge and legacy workers still receive familiar fields", () => {
  const result = buildPushPayload(payload, "https://example.test");
  assert.equal(result.web_push, 8030);
  assert.equal(result.app_badge, "3");
  assert.equal(result.notification.app_badge, "3");
  assert.equal(result.notification.navigate, "https://example.test/games/12");
  assert.equal(result.title, payload.title);
  assert.equal(result.badgeCount, 3);
  assert.equal(buildPushPayload({ ...payload, badgeCount: 0 }, "https://example.test").notification.app_badge, "0");
});

test("worker updates badges and game links for both legacy and declarative pushes", async () => {
  const badges: number[] = [];
  const worker = workerHarness({ setAppBadge: async (count: number) => { badges.push(count); } });
  await worker.push(payload);
  await worker.push(buildPushPayload({ ...payload, badgeCount: 4 }, "https://example.test"));
  assert.deepEqual(badges, [3, 4]);
  assert.equal(worker.notifications.length, 2);
  assert.equal(worker.notifications[0].options.data.url, "/games/12");
  assert.equal(worker.notifications[1].options.data.url, "https://example.test/games/12");
});

test("a synchronous badge error cannot suppress the notification", async () => {
  const worker = workerHarness({ setAppBadge: () => { throw new Error("Badging is unavailable"); } });
  await worker.push(payload);
  assert.equal(worker.notifications[0].title, "Your turn");
});

test("malformed pushes still display a fallback; clearing works without clearAppBadge", async () => {
  const badges: number[] = [];
  const worker = workerHarness({ setAppBadge: async (count: number) => { badges.push(count); } });
  await worker.push({}, true);
  await worker.push({ ...payload, badgeCount: 0 });
  assert.equal(worker.notifications[0].title, "Shove Actually");
  assert.deepEqual(badges, [0]);
});

test("badge refresh reaches a newly installed worker even before it controls the page", async t => {
  const messages: { type: string; count: number }[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    setAppBadge: async () => { throw new Error("Window badging failed"); },
    serviceWorker: { controller: null, getRegistration: async () => ({ active: { postMessage: (message: { type: string; count: number }) => messages.push(message) } }) },
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ count: 2 })));
  await refreshAppBadge();
  assert.deepEqual(messages, [{ type: "TURN_BADGE_COUNT", count: 2 }]);
  await setAppBadgeCount(-1);
  assert.equal(messages.length, 1);
});

test("a failed count request preserves the badge instead of clearing it", async t => {
  const badges: number[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    setAppBadge: async (count: number) => { badges.push(count); },
    clearAppBadge: async () => { badges.push(0); },
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); });
  t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  await refreshAppBadge();
  assert.deepEqual(badges, []);
});

test("an older count response cannot overwrite a newer badge", async t => {
  const badges: number[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    setAppBadge: async (count: number) => { badges.push(count); },
  } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); });
  const resolve: ((response: Response) => void)[] = [];
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(done => { resolve.push(done); }));
  const older = refreshAppBadge();
  const newer = refreshAppBadge();
  resolve[1](new Response(JSON.stringify({ count: 4 })));
  await newer;
  resolve[0](new Response(JSON.stringify({ count: 1 })));
  await older;
  assert.deepEqual(badges, [4]);
});
