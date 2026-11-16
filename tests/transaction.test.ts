import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../lib/db.ts";
import { withTransaction } from "../lib/transaction.ts";

test("transactions commit before returning and release the connection", async t => {
  const events: string[] = [];
  t.mock.method(pool, "connect", async () => ({ query: async (sql: string) => { events.push(sql); }, release: () => events.push("release") }));
  assert.equal(await withTransaction(async () => { events.push("operation"); return 42; }), 42);
  assert.deepEqual(events, ["BEGIN", "operation", "COMMIT", "release"]);
});

test("transactions roll back and preserve the original failure even if rollback fails", async t => {
  const events: string[] = [];
  t.mock.method(console, "error", () => undefined);
  t.mock.method(pool, "connect", async () => ({ query: async (sql: string) => {
    events.push(sql);
    if (sql === "ROLLBACK") throw new Error("connection lost");
  }, release: () => events.push("release") }));
  const error = new Error("operation failed");
  await assert.rejects(() => withTransaction(async () => { throw error; }), e => e === error);
  assert.deepEqual(events, ["BEGIN", "ROLLBACK", "release"]);
});
