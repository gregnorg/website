import { NextResponse } from "next/server";
import { loadGameHistory } from "@/lib/game-history-repository";
import { lookupPushfightAnalysis } from "@/lib/pushfight-analysis-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const step = new URL(request.url).searchParams.get("step");
  if (!step || !/^[1-9]\d*$/.test(step) || !Number.isSafeInteger(Number(step))) {
    return NextResponse.json({ error: "Invalid history step." }, { status: 400 });
  }
  // Use the same complete-history validation as the replay page. Never analyze
  // active games or accept arbitrary client-supplied positions.
  const history = await loadGameHistory((await params).id);
  const frame = history?.frames[Number(step)];
  if (frame?.type !== "pushfight" || !frame.turnEnd) {
    return NextResponse.json({ error: "Completed replay turn not found." }, { status: 404 });
  }
  const label = frame.turnEnd.winner
    ? `${frame.turnEnd.winner === "white" ? "White" : "Black"} wins`
    : await lookupPushfightAnalysis(frame.board, frame.turnEnd.nextPlayer);
  return NextResponse.json({ label: label ?? "Analysis unavailable" }, {
    status: label ? 200 : 503,
    headers: { "Cache-Control": label ? "private, max-age=86400" : "no-store" },
  });
}
