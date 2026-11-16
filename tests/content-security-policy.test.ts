import assert from "node:assert/strict";
import test from "node:test";
import { contentSecurityPolicy } from "../lib/content-security-policy.ts";

test("production scripts require a nonce and do not allow inline handlers or eval", () => {
  const policy = contentSecurityPolicy("randomNonce==");
  const script = policy.split(";").find(part => part.trim().startsWith("script-src "))!;
  assert.ok(script.includes("'nonce-randomNonce=='"));
  assert.ok(script.includes("'strict-dynamic'"));
  assert.ok(!script.includes("unsafe-inline"));
  assert.ok(!script.includes("unsafe-eval"));
  assert.ok(policy.includes("script-src-attr 'none'"));
  assert.throws(() => contentSecurityPolicy("bad'; script-src *"));
});

test("development permits debugging eval without weakening production policy", () => {
  assert.ok(contentSecurityPolicy("nonce", true).includes("'unsafe-eval'"));
  assert.ok(!contentSecurityPolicy("nonce", true).includes("upgrade-insecure-requests"));
});
