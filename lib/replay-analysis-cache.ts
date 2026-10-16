import type { PoolClient } from "pg";
import type { HistoryFrame } from "./game-history.ts";
import { solverPosition, solverVerdict } from "./pushfight-analysis.ts";

export type AnalysisDb = Pick<PoolClient, "query">;
export type CachedReplayAnalysis = { label: string; pending: boolean };

export async function cachedReplayAnalysis(db: AnalysisDb, gameId: string, frame: HistoryFrame): Promise<CachedReplayAnalysis> {
  if (frame.type !== "pushfight" || !frame.turnEnd) return { label: "Analysis unavailable", pending: false };
  if (frame.turnEnd.winner) {
    return { label: `${frame.turnEnd.winner === "white" ? "White" : "Black"} wins`, pending: false };
  }
  const position = solverPosition(frame.board, frame.turnEnd.nextPlayer);
  if (!position) return { label: "Analysis unavailable", pending: false };
  const saved = await db.query<{ outcome: string }>(
    "SELECT outcome FROM pushfight_position_analysis WHERE permutation = $1", [position.permutation],
  );
  const label = solverVerdict(saved.rows[0]?.outcome, frame.turnEnd.nextPlayer);
  if (label) return { label, pending: false };
  const job = await db.query<{ state: string; failures: number }>(
    `SELECT j.state, p.failures FROM pushfight_analysis_jobs j
       CROSS JOIN pushfight_analysis_provider_state p WHERE j.game_id = $1 AND p.id = 1`, [gameId],
  );
  if (job.rows[0]?.state !== "pending") return { label: "Analysis unavailable", pending: false };
  return {
    label: job.rows[0].failures > 0 ? "Analysis temporarily unavailable; retry scheduled" : "Analysis pending",
    pending: true,
  };
}
