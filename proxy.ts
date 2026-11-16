import { type NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy } from "./lib/content-security-policy";

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim();
  const requestHost = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
  const hostname = requestHost.replace(/^\[|\](:\d+)?$|:\d+$/g, "").toLowerCase();

  if (hostname !== "www.shoveactually.com") {
    const path = request.nextUrl.pathname;
    if (path.startsWith("/api/") || path.startsWith("/_next/") || /\.[^/]+$/.test(path)) return NextResponse.next();
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
    const requestHeaders = new Headers(request.headers);
    // Next.js reads the request CSP and attaches this nonce to its scripts.
    requestHeaders.set("Content-Security-Policy", policy);
    requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", policy);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const destination = request.nextUrl.clone();
  destination.hostname = "shoveactually.com";
  destination.protocol = "https:";
  destination.port = "";
  return NextResponse.redirect(destination, 308);
}
