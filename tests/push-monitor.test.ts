import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { checkPushHealth, type MonitoringEmail } from "../lib/push-monitor.ts";
import { pushHealthProblems, type PushHealth } from "../lib/push-monitor-policy.ts";

function fixture() {
  const state = { last_failed_delivery_id: "0", incident_started_at: null as Date | null, last_alert_at: null as Date | null };
  const health: PushHealth = { failed_count: 0, latest_failed_id: "0", stalled_jobs: 0, delayed_deliveries: 0, worker_age_seconds: 0, worker_error: null };
  const emails: MonitoringEmail[] = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (sql.includes('SELECT email FROM "user"')) return { rows: [{ email: "admin@example.test" }] };
      if (sql.startsWith("SELECT last_failed_delivery_id")) return { rows: [state] };
      if (sql.includes("failed_count,")) return { rows: [{ ...health,
        failed_count: BigInt(health.latest_failed_id) > BigInt(state.last_failed_delivery_id) ? health.failed_count : 0,
      }] };
      if (sql.includes("SET last_failed_delivery_id")) {
        state.last_failed_delivery_id = values[0] as string;
        state.incident_started_at = values[1] as Date | null;
        state.last_alert_at = values[2] as Date | null;
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const now = new Date("2026-10-10T16:00:00Z");
  const check = (time = now, sendEmail = async (email: MonitoringEmail) => { emails.push(email); }) => checkPushHealth({ client, now: time, sendEmail });
  return { state, health, emails, check, client, now };
}

test("monitor identifies delivery failures, old queues and stopped workers", () => {
  assert.equal(pushHealthProblems({ failed_count: 1, latest_failed_id: "1", stalled_jobs: 2, delayed_deliveries: 3, worker_age_seconds: 1200, worker_error: "worker crashed" }).length, 5);
  assert.equal(pushHealthProblems({ failed_count: 0, latest_failed_id: "0", stalled_jobs: 0, delayed_deliveries: 0, worker_age_seconds: 1199, worker_error: null }).length, 0);
});

test("ongoing outages alert once an hour and send a single recovery", async () => {
  const f = fixture();
  await f.check();
  assert.equal(f.emails.length, 0);
  f.health.stalled_jobs = 1;
  await f.check();
  await f.check(new Date(f.now.getTime() + 5 * 60_000));
  assert.equal(f.emails.length, 1);
  await f.check(new Date(f.now.getTime() + 60 * 60_000));
  assert.equal(f.emails.length, 2);
  assert.notEqual(f.emails[0].idempotencyKey, f.emails[1].idempotencyKey);
  f.health.stalled_jobs = 0;
  await f.check();
  assert.match(f.emails[2].subject, /recovered/);
  await f.check();
  assert.equal(f.emails.length, 3);
});

test("permanent failures are reported once without claiming they were repaired", async () => {
  const f = fixture();
  f.health.failed_count = 1;
  f.health.latest_failed_id = "12";
  await f.check();
  assert.equal(f.state.last_failed_delivery_id, "12");
  await f.check();
  assert.equal(f.emails.length, 1);
  f.health.latest_failed_id = "13";
  await f.check();
  assert.equal(f.emails.length, 2);
  assert.equal(f.state.incident_started_at, null);
});

test("failed monitoring email preserves state and retries the same idempotency key", async () => {
  const f = fixture();
  f.health.failed_count = 1;
  f.health.latest_failed_id = "17";
  let failedKey = "";
  await assert.rejects(f.check(f.now, async email => { failedKey = email.idempotencyKey; throw new Error("email provider down"); }), /email provider down/);
  assert.equal(f.state.last_failed_delivery_id, "0");
  await f.check();
  assert.equal(f.emails[0].idempotencyKey, failedKey);
});

test("dry run reports problems without sending email or acknowledging failures", async () => {
  const f = fixture();
  f.health.failed_count = 1;
  f.health.latest_failed_id = "20";
  const result = await checkPushHealth({ client: f.client, now: f.now, dryRun: true, sendEmail: async email => { f.emails.push(email); } });
  assert.equal(result.alert, true);
  assert.equal(f.emails.length, 0);
  assert.equal(f.state.last_failed_delivery_id, "0");
});
