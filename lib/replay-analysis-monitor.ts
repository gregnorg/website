import type { PoolClient } from "pg";
import { pool } from "./db.ts";
import { lookupPushfightStatus, solverEndpoints } from "./pushfight-analysis-service.ts";
import { sendMonitoringEmail, type MonitoringEmail } from "./push-monitor.ts";
import { solverHealthState, stopExpiredSolverRetries, recordSolverHealth } from "./replay-analysis-health.ts";
import { SOLVER_OUTAGE_ALERT_MS, SOLVER_OUTAGE_STOP_MS } from "./replay-analysis-policy.ts";
export { SOLVER_OUTAGE_ALERT_MS, SOLVER_OUTAGE_STOP_MS } from "./replay-analysis-policy.ts";

const probePosition = "..Y.OO........x.xoO.oXX...";

export async function checkReplaySolverHealth(options: {
  client?: PoolClient; endpoint?: string;
  probe?: (endpoint: string) => Promise<boolean>;
  sendEmail?: (email: MonitoringEmail) => Promise<void>;
  now?: Date; dryRun?: boolean;
} = {}) {
  const client = options.client ?? await pool.connect();
  let locked = false;
  try {
    // Share the worker lock so a successful analysis and an outage check cannot
    // overwrite each other's recovery, backoff, or permanent-stop decisions.
    locked = (await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(40726103) AS locked")).rows[0].locked;
    if (!locked) return { skipped: true };
    const endpoint = options.endpoint ?? solverEndpoints()[0];
    const now = options.now ?? new Date();
    const state = await solverHealthState(client);
    const expired = state.incident_started_at !== null && now.getTime() - state.incident_started_at.getTime() >= SOLVER_OUTAGE_STOP_MS;
    const stopped = options.dryRun ? Boolean(state.stopped_at || expired) : await stopExpiredSolverRetries(client, state, now);
    if (!stopped && (state.endpoint !== endpoint || state.next_check_at.getTime() <= now.getTime())) {
      let healthy = false;
      try {
        healthy = options.probe ? await options.probe(endpoint)
          : (await lookupPushfightStatus(probePosition, [endpoint])) !== null;
      } catch { /* Failed probes share the worker's increasing retry delay. */ }
      if (!options.dryRun) await recordSolverHealth(client, state, endpoint, healthy, now);
      else {
        state.incident_started_at = healthy ? null : (state.endpoint === endpoint ? state.incident_started_at : null) ?? now;
        state.last_alert_at = healthy || state.endpoint !== endpoint ? null : state.last_alert_at;
      }
    }
    const incident = state.incident_started_at;
    const alert = stopped ? state.stop_alert_at === null
      : incident !== null && state.last_alert_at === null && now.getTime() - incident.getTime() > SOLVER_OUTAGE_ALERT_MS;
    if (options.dryRun) return { healthy: incident === null, alert, stopped, dryRun: true };
    if (alert) {
      const recipients = (await client.query<{ email: string }>(
        `SELECT email FROM "user" WHERE 'admin' = ANY(string_to_array(role, ',')) AND banned IS NOT TRUE ORDER BY id`,
      )).rows.map(user => user.email);
      if (!recipients.length) throw new Error("No site admin email is configured for solver outage alerts.");
      await (options.sendEmail ?? sendMonitoringEmail)({
        to: recipients,
        subject: stopped ? "Shove Actually: solver requests stopped after a week-long outage"
          : "Shove Actually: Push Fight solver unavailable for over 24 hours",
        text: stopped
          ? `The Push Fight solver has been unavailable since ${incident!.toISOString()} (UTC), at least one week. All automatic analysis requests and health probes have now stopped.\n\nService: ${state.endpoint}\n\nSaved replay evaluations remain available. Unfinished analyses stay queued, and new games will not restart requests.\n\nAfter checking the service manually, run npm run games:analysis:resume from the website directory to resume. Restarting the app does not resume requests.\n\nCheck journalctl -u shoveactually-analysis-monitor.service (system timer) or journalctl -t shoveactually-analysis-monitor (cron) for details. This stop notice is sent once.`
          : `The primary Push Fight analysis service has failed checks since ${incident!.toISOString()} (UTC), more than 24 hours ago.\n\nService: ${state.endpoint}\n\nSaved replay evaluations remain available. Uncached positions will retry at increasing delays. After one week of outage, all automatic requests will stop and you will receive a separate stop notice.\n\nCheck journalctl -t shoveactually-analysis and journalctl -t shoveactually-analysis-monitor for cron logs, or the corresponding .service units for system timers.`,
        idempotencyKey: `replay-solver/${stopped ? "stopped" : "outage"}/${incident!.getTime()}`,
      });
      await client.query(stopped
        ? "UPDATE pushfight_analysis_monitor_state SET stop_alert_at = $1 WHERE id = 1"
        : "UPDATE pushfight_analysis_monitor_state SET last_alert_at = $1 WHERE id = 1", [now]);
    }
    return { healthy: incident === null, alert, stopped };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(40726103)");
    if (!options.client) client.release();
  }
}
