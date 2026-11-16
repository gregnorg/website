import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import test from "node:test";
import { arePushKeysValid, isAllowedPushEndpoint } from "../lib/push-subscription.ts";

test("push endpoints are restricted to HTTPS browser push providers", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/id", "https://updates.push.services.mozilla.com/wpush/v2/id", "https://web.push.apple.com/id", "https://wns2.notify.windows.com/id"]) {
    assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
  }
  for (const endpoint of ["http://fcm.googleapis.com/id", "https://127.0.0.1/id", "https://[::1]/id", "https://169.254.169.254/id", "https://example.com/id", "https://fcm.googleapis.com.evil.test/id", "https://evilpush.apple.com/id", "https://fcm.googleapis.com@evil.test/id", "https://user@fcm.googleapis.com/id", "https://fcm.googleapis.com:8443/id", "https://fcm.googleapis.com/id#fragment", "invalid", null]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, String(endpoint));
  }
});

test("push keys must be a valid P-256 public key and a 16-byte authentication secret", () => {
  const key = createECDH("prime256v1").generateKeys().toString("base64url");
  const auth = randomBytes(16).toString("base64url");
  assert.equal(arePushKeysValid(key, auth), true);
  assert.equal(arePushKeysValid(key + "=", auth + "=="), true);
  assert.equal(arePushKeysValid(Buffer.alloc(65, 4).toString("base64url"), auth), false);
  assert.equal(arePushKeysValid(key, "x"), false);
  assert.equal(arePushKeysValid(null, auth), false);
});
