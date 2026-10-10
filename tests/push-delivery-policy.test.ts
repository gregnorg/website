import test from "node:test";
import assert from "node:assert/strict";
import { retryablePushStatus, pushRetryDelay } from "../lib/push-delivery-policy.ts";

test("retry temporary failures but not revoked subscriptions or authentication errors", () => {
  for (const status of [0, 408, 429, 500, 503]) assert.equal(retryablePushStatus(status), true);
  for (const status of [400, 401, 403, 404, 410, 413]) assert.equal(retryablePushStatus(status), false);
});
test("backoff increases and remains bounded at one hour", () => {
  assert.equal(pushRetryDelay(1), 30);
  assert.equal(pushRetryDelay(2), 60);
  assert.equal(pushRetryDelay(8), 3600);
  assert.equal(pushRetryDelay(100), 3600);
});
