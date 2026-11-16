import { ECDH } from "node:crypto";

// Only browser push providers may receive server-side notification requests.
// URL parsing prevents userinfo, lookalike suffixes, and nonstandard ports from
// turning an apparently trusted endpoint into an arbitrary network destination.
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
    return url.hostname === "fcm.googleapis.com"
      || url.hostname === "updates.push.services.mozilla.com"
      || url.hostname.endsWith(".push.apple.com")
      || url.hostname === "notify.windows.com"
      || url.hostname.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

export function arePushKeysValid(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== "string" || typeof auth !== "string"
    || !/^[A-Za-z0-9_-]{87}=?$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}(==)?$/.test(auth)) return false;
  try {
    const key = Buffer.from(p256dh, "base64url");
    if (key.length !== 65 || key[0] !== 4 || Buffer.from(auth, "base64url").length !== 16) return false;
    ECDH.convertKey(key, "prime256v1");
    return true;
  } catch {
    return false;
  }
}
