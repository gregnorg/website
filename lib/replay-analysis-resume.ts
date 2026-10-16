import type { PoolClient } from "pg";

// Explicit administrator action only. Queued jobs and saved results are kept.
export async function resumeReplayAnalysis(client: PoolClient) {
  const locked = (await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(40726103) AS locked")).rows[0].locked;
  if (!locked) throw new Error("Analysis is currently running; try resuming again shortly.");
  try {
    // A single statement resets both records atomically, including when a caller
    // already owns a transaction (for example an administrative operation).
    await client.query(`WITH resumed AS (
      UPDATE pushfight_analysis_monitor_state SET endpoint = NULL,
        incident_started_at = NULL, last_checked_at = NULL, last_alert_at = NULL,
        check_failures = 0, next_check_at = now(), stopped_at = NULL, stop_alert_at = NULL, last_error = NULL
      WHERE id = 1 RETURNING id
    ) UPDATE pushfight_analysis_provider_state SET failures = 0, next_attempt_at = now(), last_error = NULL
      WHERE id IN (SELECT id FROM resumed)`);
  } finally {
    await client.query("SELECT pg_advisory_unlock(40726103)");
  }
}
