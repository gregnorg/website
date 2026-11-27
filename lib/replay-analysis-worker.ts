import type { PoolClient } from "pg";
import { pool } from "./db.ts";
import { loadGameHistory } from "./game-history-repository.ts";
import { solverPosition, solverVerdict } from "./pushfight-analysis.ts";
import { lookupPushfightStatus, solverEndpoints, type SolverValue } from "./pushfight-analysis-service.ts";

import { solverHealthState, stopExpiredSolverRetries, recordSolverHealth } from "./replay-analysis-health.ts";
export { analysisRetryDelayMs } from "./replay-analysis-policy.ts";

// The single session lock serializes scheduled and manual invocations. Network
// calls hold no row locks or open transaction; each saved position is durable
// before its cursor advances, so interruption never loses completed analysis.
export async function processReplayAnalysis(client: PoolClient, options: {
  gameId?: string;
  maxLookups?: number;
  lookup?: (permutation: string) => Promise<SolverValue | null>;
} = {}) {
  const counts = { lookups: 0, cached: 0, completed: 0, invalid: 0, cooldown: false, busy: false, stopped: false };
  const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(40726103) AS locked");
  if (!lock.rows[0].locked) return { ...counts, busy: true };
  try {
    const health = await solverHealthState(client);
    const primary = solverEndpoints()[0];
    const provider = (await client.query<{ failures: number; next_attempt_at: Date }>(
      "SELECT failures, next_attempt_at FROM pushfight_analysis_provider_state WHERE id = 1",
    )).rows[0];
    const jobs = await client.query<{ game_id: string; cursor_step: number }>(
      `SELECT game_id, cursor_step FROM pushfight_analysis_jobs
        WHERE state = 'pending' AND ($1::uuid IS NULL OR game_id = $1)
        ORDER BY queued_at, game_id LIMIT 10`, [options.gameId ?? null],
    );
    for (const job of jobs.rows) {
      const history = await loadGameHistory(job.game_id, { db: client, allowTournament: true });
      if (!history) {
        await client.query("UPDATE pushfight_analysis_jobs SET state = 'invalid', last_error = 'No complete replay history' WHERE game_id = $1", [job.game_id]);
        counts.invalid++;
        continue;
      }
      for (let step = job.cursor_step + 1; step < history.frames.length; step++) {
        const frame = history.frames[step];
        if (frame.type === "pushfight" && frame.turnEnd && !frame.turnEnd.winner) {
          const position = solverPosition(frame.board, frame.turnEnd.nextPlayer);
          if (position) {
            const cached = await client.query("SELECT 1 FROM pushfight_position_analysis WHERE permutation = $1", [position.permutation]);
            if (cached.rowCount) {
              counts.cached++;
            } else {
              if (await stopExpiredSolverRetries(client, health, new Date())) return { ...counts, stopped: true };
              if (provider.next_attempt_at.getTime() > Date.now()) return { ...counts, cooldown: true };
              if (options.maxLookups !== undefined && counts.lookups >= options.maxLookups) return counts;
              counts.lookups++;
              const result = await (options.lookup ?? lookupPushfightStatus)(position.permutation);
              if (!result || solverVerdict(result.status, "white") === null) {
                await recordSolverHealth(client, health, primary, false, new Date());
                await client.query("UPDATE pushfight_analysis_jobs SET last_error = 'Solver unavailable; retry scheduled' WHERE game_id = $1", [job.game_id]);
                return { ...counts, cooldown: true };
              }
              await client.query(
                `INSERT INTO pushfight_position_analysis(permutation, outcome, source_url) VALUES ($1, $2, $3)
                 ON CONFLICT (permutation) DO NOTHING`, [position.permutation, result.status, result.source],
              );
              if (result.source === primary) await recordSolverHealth(client, health, primary, true, new Date());
              provider.failures = 0;
              provider.next_attempt_at = new Date();
            }
          }
        }
        await client.query("UPDATE pushfight_analysis_jobs SET cursor_step = $2, last_error = NULL WHERE game_id = $1", [job.game_id, step]);
      }
      await client.query("UPDATE pushfight_analysis_jobs SET state = 'completed', completed_at = now(), last_error = NULL WHERE game_id = $1", [job.game_id]);
      counts.completed++;
    }
    await client.query("UPDATE pushfight_analysis_provider_state SET worker_succeeded_at = now() WHERE id = 1");
    return counts;
  } finally {
    await client.query("SELECT pg_advisory_unlock(40726103)");
  }
}

// Called after the finish commits. The scheduled worker can recover the durable
// job if this attempt is interrupted or another run already holds the lock.
export async function analyzeFinishedReplay(gameId: string) {
  try {
    const client = await pool.connect();
    try {
      await processReplayAnalysis(client, { gameId });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Replay analysis for game ${gameId} failed:`, error);
  }
}
