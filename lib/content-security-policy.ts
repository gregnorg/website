export function contentSecurityPolicy(nonce: string, development = false): string {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)) throw new Error("Invalid CSP nonce.");
  return [
    "default-src 'self'", "base-uri 'self'", "form-action 'self'",
    "frame-ancestors 'none'", "object-src 'none'", "img-src 'self' data:",
    "font-src 'self'", "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'", "worker-src 'self'", "connect-src 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
