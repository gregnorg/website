import { Resend } from "resend";
import type { PoolClient } from "pg";
import { pool } from "./db.ts";
import { pushHealthProblems, shouldSendPushAlert, type PushHealth } from "./push-monitor-policy.ts";

export type MonitoringEmail = { to: string[]; subject: string; text: string; idempotencyKey: string };

export async function sendMonitoringEmail(email: MonitoringEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Monitoring email requires RESEND_API_KEY and RESEND_FROM_EMAIL.");
  const { idempotencyKey, ...payload } = email;
  const emailOptions = { idempotencyKey, signal: AbortSignal.timeout(15_000) };
  const result = await new Resend(apiKey).emails.send({ from, ...payload }, emailOptions);
  if (result.error || !result.data?.id) throw new Error(result.error?.message ?? "Monitoring email returned no delivery ID.");
}

export async function checkPushHealth(options: {
  client?: PoolClient;
  sendEmail?: (email: MonitoringEmail) => Promise<void>;
  now?: Date;
  dryRun?: boolean;
} = {}) {
  const client = options.client ?? await pool.connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(73401953) locked");
    locked = lock.rows[0].locked;
    if (!locked) return { skipped: true };
    const now = options.now ?? new Date();
    const state = (await client.query<{
      last_failed_delivery_id: string; incident_started_at: Date | null; last_alert_at: Date | null;
    }>("SELECT last_failed_delivery_id,incident_started_at,last_alert_at FROM push_monitor_state WHERE id=1")).rows[0];
    if (!state) throw new Error("Push monitoring state is missing; apply database migrations.");
    const health = (await client.query<PushHealth>(`
      SELECT
        (SELECT count(*)::int FROM push_deliveries WHERE status='failed' AND id > $1) failed_count,
        (SELECT COALESCE(max(id),$1::bigint)::text FROM push_deliveries WHERE status='failed' AND id > $1) latest_failed_id,
        (SELECT count(*)::int FROM turn_notification_jobs WHERE queued_at < $2::timestamptz - interval '10 minutes') stalled_jobs,
        (SELECT count(*)::int FROM push_deliveries WHERE status='pending' AND created_at < $2::timestamptz - interval '15 minutes') delayed_deliveries,
        GREATEST(0,extract(epoch FROM ($2::timestamptz-worker_succeeded_at)))::float8 worker_age_seconds,
        worker_error FROM push_monitor_state WHERE id=1`, [state.last_failed_delivery_id, now])).rows[0];
    const problems = pushHealthProblems(health);
    const ongoing = pushHealthProblems({ ...health, failed_count: 0 });
    const alert = shouldSendPushAlert(problems, health.failed_count,
      ongoing.length > 0 && !state.incident_started_at ? null : state.last_alert_at, now);
    const recovery = problems.length === 0 && state.incident_started_at !== null;
    if (options.dryRun) return { problems, alert, recovery, dryRun: true };
    if (alert || recovery) {
      const recipients = (await client.query<{ email: string }>(
        `SELECT email FROM "user" WHERE 'admin' = ANY(string_to_array(role, ',')) AND banned IS NOT TRUE ORDER BY id`,
      )).rows.map(user => user.email);
      if (!recipients.length) throw new Error("No site admin email is configured for notification monitoring.");
      const incident = state.incident_started_at ?? now;
      // Stable across a failed send/database update, unique for reminders and recovery.
      const key = recovery ? `push-monitor/recovered/${incident.getTime()}`
        : `push-monitor/alert/${state.last_failed_delivery_id}/${health.latest_failed_id}/${state.last_alert_at?.getTime() ?? 0}`;
      await (options.sendEmail ?? sendMonitoringEmail)({
        to: recipients,
        subject: recovery ? "Shove Actually notification monitoring: recovered" : "Shove Actually notification delivery needs attention",
        text: recovery
          ? "The notification monitor is healthy again: no new permanent failures, no delayed queue entries, and the retry worker is completing successfully.\n\nProvider acceptance does not confirm that a device displayed a notification."
          : `Notification monitoring detected:\n\n${problems.join("\n")}\n\nCheck journalctl -u shoveactually-push.service and the push_deliveries table.\n\nThe independent monitor will repeat ongoing problems at most hourly, and send a recovery message when they clear. New permanent failures can trigger an earlier alert.`,
        idempotencyKey: key,
      });
      await client.query(`UPDATE push_monitor_state SET last_failed_delivery_id=$1,
        incident_started_at=$2,last_alert_at=$3,last_checked_at=$4 WHERE id=1`,
      [health.latest_failed_id, ongoing.length > 0 ? incident : null, ongoing.length > 0 ? now : null, now]);
    } else {
      await client.query("UPDATE push_monitor_state SET last_checked_at=$1 WHERE id=1", [now]);
    }
    return { problems, alert, recovery };
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(73401953)");
    if (!options.client) client.release();
  }
}
