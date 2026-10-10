import test from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import { pool } from "../lib/db.ts";
import { deliverPendingPushes } from "../lib/push-notifications.ts";

test("worker records acceptance, retries transient errors, and removes revoked endpoints", async t => {
  const updates: unknown[][] = [];
  const deletions: unknown[][] = [];
  const deliveries = [201, 503, 410, 403].map((status, i) => ({
    id: String(i), endpoint: `https://example.test/${status}`, payload: {}, attempts: 0, p256dh: "key", auth: "auth",
  }));
  const originalPublic = process.env.VAPID_PUBLIC_KEY;
  const originalPrivate = process.env.VAPID_PRIVATE_KEY;
  process.env.VAPID_PUBLIC_KEY = "test";
  process.env.VAPID_PRIVATE_KEY = "test";
  t.after(() => {
    if (originalPublic === undefined) delete process.env.VAPID_PUBLIC_KEY; else process.env.VAPID_PUBLIC_KEY = originalPublic;
    if (originalPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = originalPrivate;
  });
  t.mock.method(webpush, "setVapidDetails", () => undefined);
  t.mock.method(webpush, "sendNotification", async (subscription: { endpoint: string }) => {
    const statusCode = Number(subscription.endpoint.split("/").at(-1));
    if (statusCode !== 201) throw Object.assign(new Error("provider rejected request"), { statusCode });
    return { statusCode };
  });
  t.mock.method(console, "error", () => undefined);
  t.mock.method(pool, "connect", async () => ({
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.includes("SELECT d.id")) return { rows: deliveries };
      if (sql.startsWith("UPDATE push_deliveries")) updates.push(values);
      if (sql.startsWith("DELETE FROM push_subscriptions")) deletions.push(values);
      return { rows: [] };
    }, release() {},
  }));
  await deliverPendingPushes();
  assert.deepEqual(updates[0], ["0", 201]);
  assert.deepEqual(updates[1].slice(0, 3), ["1", "pending", 503]);
  assert.equal(updates[1][4], 30);
  assert.deepEqual(updates[2].slice(0, 3), ["2", "expired", 410]);
  assert.deepEqual(updates[3].slice(0, 3), ["3", "failed", 403]);
  assert.deepEqual(deletions, [["https://example.test/410"]]);
});
