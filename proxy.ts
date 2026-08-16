import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0].trim();
  const requestHost = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
  const hostname = requestHost.replace(/^\[|\](:\d+)?$|:\d+$/g, "").toLowerCase();

  if (hostname !== "www.shoveactually.com") {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.hostname = "shoveactually.com";
  destination.protocol = "https:";
  destination.port = "";
  return NextResponse.redirect(destination, 308);
}
