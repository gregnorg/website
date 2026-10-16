import type { PoolClient } from "pg";
import { pool } from "./db.ts";
import { lookupPushfightStatus, solverEndpoints } from "./pushfight-analysis-service.ts";
import { sendMonitoringEmail, type MonitoringEmail } from "./push-monitor.ts";

export const SOLVER_OUTAGE_ALERT_MS = 24 * 60 * 60_000;
// A known valid position, independent of game activity and the permanent cache.
const probePosition = "..Y.OO........x.xoO.oXX...";

export async function checkReplaySolverHealth(options: {
  client?: PoolClient;
  endpoint?: string;
  probe?: (endpoint: string) => Promise<boolean>;
  sendEmail?: (email: MonitoringEmail) => Promise<void>;
  now?: Date;
  dryRun?: boolean;
} = {}) {
  const client = options.client ?? await pool.connect();
  let locked = false;
  try {
    locked = (await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(40726104) AS locked")).rows[0].locked;
    if (!locked) return { skipped: true };
    const endpoint = options.endpoint ?? solverEndpoints()[0];
    const now = options.now ?? new Date();
    const state = (await client.query<{
      endpoint: string | null; incident_started_at: Date | null; last_alert_at: Date | null;
    }>("SELECT endpoint, incident_started_at, last_alert_at FROM pushfight_analysis_monitor_state WHERE id = 1")).rows[0];
    if (!state) throw new Error("Solver monitoring state is missing; apply database migrations.");
    let healthy = false;
    try {
      // Check the primary explicitly, even if a configured backup is working.
      healthy = options.probe ? await options.probe(endpoint)
        : (await lookupPushfightStatus(probePosition, [endpoint])) !== null;
    } catch { /* A timeout or failed probe starts/continues the same incident. */ }
    const sameEndpoint = state.endpoint === endpoint;
    const incident = healthy ? null : (sameEndpoint ? state.incident_started_at : null) ?? now;
    const lastAlert = healthy || !sameEndpoint ? null : state.last_alert_at;
    const alert = incident !== null && lastAlert === null && now.getTime() - incident.getTime() > SOLVER_OUTAGE_ALERT_MS;
    if (options.dryRun) return { healthy, alert, dryRun: true };
    // Save the incident before sending; email failures must not reset the clock
    // or change the idempotency key used for the next delivery attempt.
    await client.query(
      `UPDATE pushfight_analysis_monitor_state SET endpoint = $1, incident_started_at = $2,
         last_alert_at = $3, last_checked_at = $4, last_error = $5 WHERE id = 1`,
      [endpoint, incident, lastAlert, now, healthy ? null : "Primary solver lookup failed"],
    );
    if (alert) {
      const recipients = (await client.query<{ email: string }>(
        `SELECT email FROM "user" WHERE 'admin' = ANY(string_to_array(role, ',')) AND banned IS NOT TRUE ORDER BY id`,
      )).rows.map(user => user.email);
      if (!recipients.length) throw new Error("No site admin email is configured for solver outage alerts.");
      await (options.sendEmail ?? sendMonitoringEmail)({
        to: recipients,
        subject: "Shove Actually: Push Fight solver unavailable for over 24 hours",
        text: `The primary Push Fight analysis service has failed every scheduled check since ${incident!.toISOString()} (UTC), more than 24 hours ago.\n\nService: ${endpoint}\n\nSaved replay evaluations remain available. New uncached positions will use the configured independent backup, if available, or wait for automatic retries.\n\nCheck journalctl -u shoveactually-analysis.service and journalctl -u shoveactually-analysis-monitor.service. You can configure PUSHFIGHT_SOLVER_FALLBACK_URL for an independent backup or self-host Maks Verver's solver.\n\nThis is the only alert for this outage. A successful check resets monitoring for future outages.`,
        idempotencyKey: `replay-solver/outage/${incident!.getTime()}`,
      });
      await client.query("UPDATE pushfight_analysis_monitor_state SET last_alert_at = $1 WHERE id = 1", [now]);
    }
    return { healthy, alert };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(40726104)");
    if (!options.client) client.release();
  }
}
