import type { PoolClient } from "pg";
import { analysisRetryDelayMs, SOLVER_HEALTHY_CHECK_MS, SOLVER_OUTAGE_STOP_MS } from "./replay-analysis-policy.ts";

export type SolverHealthState = {
  endpoint: string | null; incident_started_at: Date | null; last_alert_at: Date | null;
  check_failures: number; next_check_at: Date; stopped_at: Date | null; stop_alert_at: Date | null;
};
export async function solverHealthState(client: PoolClient): Promise<SolverHealthState> {
  const state = (await client.query<SolverHealthState>("SELECT * FROM pushfight_analysis_monitor_state WHERE id = 1")).rows[0];
  if (!state) throw new Error("Solver monitoring state is missing; apply database migrations.");
  return state;
}

// Caller holds the shared analysis/monitor session lock (40726103).
export async function stopExpiredSolverRetries(client: PoolClient, state: SolverHealthState, now: Date): Promise<boolean> {
  if (state.stopped_at) return true;
  if (!state.incident_started_at || now.getTime() - state.incident_started_at.getTime() < SOLVER_OUTAGE_STOP_MS) return false;
  await client.query("UPDATE pushfight_analysis_monitor_state SET stopped_at = $1, last_error = 'Automatic requests stopped after a week-long outage' WHERE id = 1", [now]);
  state.stopped_at = now;
  return true;
}

export async function recordSolverHealth(client: PoolClient, state: SolverHealthState, endpoint: string, healthy: boolean, now: Date) {
  const sameEndpoint = state.endpoint === endpoint;
  const failures = healthy ? 0 : (sameEndpoint ? state.check_failures : 0) + 1;
  const incident = healthy ? null : (sameEndpoint ? state.incident_started_at : null) ?? now;
  const nextCheck = new Date(now.getTime() + (healthy ? SOLVER_HEALTHY_CHECK_MS : analysisRetryDelayMs(failures)));
  await client.query(
    `UPDATE pushfight_analysis_monitor_state SET endpoint = $1, incident_started_at = $2,
       last_alert_at = $3, last_checked_at = $4, last_error = $5, check_failures = $6,
       next_check_at = $7, stop_alert_at = NULL WHERE id = 1 AND stopped_at IS NULL`,
    [endpoint, incident, healthy || !sameEndpoint ? null : state.last_alert_at, now,
      healthy ? null : "Primary solver lookup failed", failures, nextCheck],
  );
  await client.query(
    `UPDATE pushfight_analysis_provider_state SET failures = $1, next_attempt_at = $2, last_error = $3 WHERE id = 1`,
    [failures, healthy ? now : nextCheck, healthy ? null : "Solver unavailable"],
  );
  Object.assign(state, { endpoint, incident_started_at: incident, check_failures: failures,
    next_check_at: nextCheck, last_alert_at: healthy || !sameEndpoint ? null : state.last_alert_at });
}
