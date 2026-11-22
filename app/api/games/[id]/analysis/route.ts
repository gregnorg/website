import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { loadGameHistory } from "@/lib/game-history-repository";
import { pool } from "@/lib/db";
import { cachedReplayAnalysis } from "@/lib/replay-analysis-cache";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const step = new URL(request.url).searchParams.get("step");
  if (!step || !/^[1-9]\d*$/.test(step) || !Number.isSafeInteger(Number(step))) {
    return NextResponse.json({ error: "Invalid history step." }, { status: 400 });
  }
  // Use the same complete-history validation as the replay page. Never analyze
  // active games or accept arbitrary client-supplied positions.
  const session = await auth.api.getSession({ headers: await headers() });
  const history = await loadGameHistory((await params).id, { allowTournament: Boolean(session) });
  const frame = history?.frames[Number(step)];
  if (!history || frame?.type !== "pushfight" || !frame.turnEnd) {
    return NextResponse.json({ error: "Completed replay turn not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const result = await cachedReplayAnalysis(pool, history.game.id, frame);
  return NextResponse.json(result, {
    status: result.pending ? 202 : 200,
    headers: { "Cache-Control": (history.game.tournament_id || result.pending || result.stopped) ? "no-store" : "private, max-age=86400" },
  });
}
