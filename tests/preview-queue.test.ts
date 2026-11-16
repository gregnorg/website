import assert from "node:assert/strict";
import test from "node:test";
import { flushPreviewQueue } from "../lib/preview-queue.ts";

test("official submissions proceed after the deadline even if a preview never responds", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let submitted = false;
  const flush = flushPreviewQueue(new Promise<void>(() => {})).then(() => { submitted = true; });
  t.mock.timers.tick(299);
  await Promise.resolve();
  assert.equal(submitted, false);
  t.mock.timers.tick(1);
  await flush;
  assert.equal(submitted, true);
});

test("healthy previews finish before submission and failed previews do not prevent it", async () => {
  const order: string[] = [];
  await flushPreviewQueue(Promise.resolve().then(() => { order.push("preview"); }));
  order.push("submit");
  assert.deepEqual(order, ["preview", "submit"]);
  await flushPreviewQueue(Promise.reject(new Error("offline")));
});
