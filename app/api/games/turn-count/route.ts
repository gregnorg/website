import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { gamesWaitingForMove } from "@/lib/turn-count";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const count = session ? await gamesWaitingForMove(session.user.id) : 0;
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
