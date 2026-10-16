import type { PoolClient } from "pg";
import { loadGameHistory } from "./game-history-repository.ts";
import { solverPosition, solverVerdict } from "./pushfight-analysis.ts";
import { lookupPushfightStatus, type SolverValue } from "./pushfight-analysis-service.ts";

export function analysisRetryDelayMs(failures: number): number {
  return Math.min(24 * 60 * 60_000, 5 * 60_000 * 3 ** Math.max(0, failures - 1));
}

// The single session lock serializes scheduled and manual invocations. Network
// calls hold no row locks or open transaction; each saved position is durable
// before its cursor advances, so interruption never loses completed analysis.
export async function processReplayAnalysis(client: PoolClient, options: {
  maxLookups?: number; maxDurationMs?: number; minDelayMs?: number;
  lookup?: (permutation: string) => Promise<SolverValue | null>;
} = {}) {
  const counts = { lookups: 0, cached: 0, completed: 0, invalid: 0, cooldown: false, busy: false };
  const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(40726103) AS locked");
  if (!lock.rows[0].locked) return { ...counts, busy: true };
  const started = Date.now();
  let lastLookupAt = 0;
  try {
    const provider = (await client.query<{ failures: number; next_attempt_at: Date }>(
      "SELECT failures, next_attempt_at FROM pushfight_analysis_provider_state WHERE id = 1",
    )).rows[0];
    const jobs = await client.query<{ game_id: string; cursor_step: number }>(
      "SELECT game_id, cursor_step FROM pushfight_analysis_jobs WHERE state = 'pending' ORDER BY queued_at, game_id LIMIT 10",
    );
    for (const job of jobs.rows) {
      const history = await loadGameHistory(job.game_id, client);
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
              if (provider.next_attempt_at.getTime() > Date.now()) return { ...counts, cooldown: true };
              if (counts.lookups >= (options.maxLookups ?? 20) || Date.now() - started >= (options.maxDurationMs ?? 45_000)) return counts;
              const delay = Math.max(0, (options.minDelayMs ?? 1000) - (Date.now() - lastLookupAt));
              if (delay) await new Promise(resolve => setTimeout(resolve, delay));
              counts.lookups++;
              const result = await (options.lookup ?? lookupPushfightStatus)(position.permutation);
              lastLookupAt = Date.now();
              if (!result || solverVerdict(result.status, "white") === null) {
                const failures = provider.failures + 1;
                await client.query(
                  `UPDATE pushfight_analysis_provider_state SET failures = $1,
                     next_attempt_at = now() + ($2 * interval '1 millisecond'), last_error = 'Solver unavailable' WHERE id = 1`,
                  [failures, analysisRetryDelayMs(failures)],
                );
                await client.query("UPDATE pushfight_analysis_jobs SET last_error = 'Solver unavailable; retry scheduled' WHERE game_id = $1", [job.game_id]);
                return { ...counts, cooldown: true };
              }
              await client.query(
                `INSERT INTO pushfight_position_analysis(permutation, outcome, source_url) VALUES ($1, $2, $3)
                 ON CONFLICT (permutation) DO NOTHING`, [position.permutation, result.status, result.source],
              );
              provider.failures = 0;
              await client.query("UPDATE pushfight_analysis_provider_state SET failures = 0, next_attempt_at = now(), last_error = NULL WHERE id = 1");
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
