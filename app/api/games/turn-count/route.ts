import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { gamesWaitingForMove } from "@/lib/turn-count";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const count = await gamesWaitingForMove(session.user.id);
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
