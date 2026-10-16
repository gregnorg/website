import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { checkReplaySolverHealth, SOLVER_OUTAGE_ALERT_MS, SOLVER_OUTAGE_STOP_MS } from "../lib/replay-analysis-monitor.ts";
import type { MonitoringEmail } from "../lib/push-monitor.ts";

test("solver outage alerts persist across checks and send only after more than 24 hours", async t => {
  if (!process.env.DATABASE_URL) { t.skip("No database configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  if (!(await client.query("SELECT to_regclass('pushfight_position_analysis') AS name")).rows[0].name) {
    await client.query(await readFile(new URL("../database/migrations/019_add_replay_analysis_cache.sql", import.meta.url), "utf8"));
  }
  await client.query(await readFile(new URL("../database/migrations/020_add_replay_analysis_monitor.sql", import.meta.url), "utf8"));
  await client.query(await readFile(new URL("../database/migrations/021_stop_prolonged_solver_retries.sql", import.meta.url), "utf8"));
  const admin = `solver-admin-${randomUUID()}`;
  const bannedAdmin = `solver-banned-${randomUUID()}`;
  for (const id of [admin, bannedAdmin]) {
    await client.query(`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",username,"displayUsername",role,banned)
      VALUES($1,$1,$2,false,now(),now(),$1,$1,'user,admin',$3)`, [id, `${id}@example.test`, id === bannedAdmin]);
  }
  const emails: MonitoringEmail[] = [];
  const start = new Date("2026-10-16T12:00:00Z");
  const at = (offset: number) => new Date(start.getTime() + offset);
  const day = SOLVER_OUTAGE_ALERT_MS;
  const reset = async () => {
    emails.length = 0;
    await client.query("UPDATE pushfight_analysis_monitor_state SET endpoint=NULL, incident_started_at=NULL, last_alert_at=NULL, last_checked_at=NULL, last_error=NULL, check_failures=0, next_check_at=now(), stopped_at=NULL, stop_alert_at=NULL WHERE id=1");
  };
  const sendEmail = async (email: MonitoringEmail) => { emails.push(email); };
  const check = async (offset: number, healthy = false) => {
    // Force a due probe for the threshold/recovery scenarios. Separate tests
    // below exercise automatic increasing delays without this override.
    await client.query("UPDATE pushfight_analysis_monitor_state SET next_check_at=$1 WHERE id=1", [at(offset)]);
    return checkReplaySolverHealth({ client, endpoint: "https://primary.example.test/lookup", now: at(offset), probe: async () => healthy, sendEmail });
  };
  await reset();
  await check(0);
  await check(day - 1);
  await check(day);
  assert.equal(emails.length, 0);
  await check(day + 15 * 60_000);
  assert.equal(emails.length, 1);
  assert.ok(emails[0].to.includes(`${admin}@example.test`));
  assert.ok(!emails[0].to.includes(`${bannedAdmin}@example.test`));
  assert.match(emails[0].subject, /over 24 hours/);
  assert.match(emails[0].text, /Saved replay evaluations remain available/);
  await check(3 * day);
  assert.equal(emails.length, 1, "the same ongoing incident cannot spam admin email");
  await check(3 * day + 1, true);
  const state = (await client.query("SELECT incident_started_at, last_alert_at FROM pushfight_analysis_monitor_state WHERE id=1")).rows[0];
  assert.equal(state.incident_started_at, null);
  assert.equal(state.last_alert_at, null);
  await check(4 * day);
  await check(5 * day + 1);
  assert.equal(emails.length, 2);
  assert.notEqual(emails[0].idempotencyKey, emails[1].idempotencyKey);

  await t.test("failed email retains the incident and retries delivery with the same key", async () => {
    await reset();
    await check(0);
    let failedKey = "";
    await assert.rejects(checkReplaySolverHealth({ client, endpoint: "https://primary.example.test/lookup", now: at(day + 1),
      probe: async () => false, sendEmail: async email => { failedKey = email.idempotencyKey; throw new Error("email unavailable"); },
    }), /email unavailable/);
    const state = (await client.query("SELECT incident_started_at, last_alert_at FROM pushfight_analysis_monitor_state WHERE id=1")).rows[0];
    assert.equal(state.incident_started_at.toISOString(), start.toISOString());
    assert.equal(state.last_alert_at, null);
    await check(day + 15 * 60_000);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].idempotencyKey, failedKey);
  });

  await t.test("a changed primary endpoint starts a fresh outage timer", async () => {
    await reset();
    await check(0);
    const result = await checkReplaySolverHealth({ client, endpoint: "https://new-primary.example.test/lookup", now: at(2 * day),
      probe: async () => false, sendEmail,
    });
    assert.equal(result.alert, false);
    assert.equal(emails.length, 0);
    assert.equal((await client.query("SELECT incident_started_at FROM pushfight_analysis_monitor_state WHERE id=1")).rows[0].incident_started_at.toISOString(), at(2 * day).toISOString());
  });

  await t.test("dry-run checks never send email or acknowledge an incident", async () => {
    await reset();
    await check(0);
    const result = await checkReplaySolverHealth({ client, endpoint: "https://primary.example.test/lookup", now: at(day + 1),
      probe: async () => false, sendEmail, dryRun: true,
    });
    assert.equal(result.alert, true);
    assert.equal(emails.length, 0);
    assert.equal((await client.query("SELECT last_alert_at FROM pushfight_analysis_monitor_state WHERE id=1")).rows[0].last_alert_at, null);
  });

  await t.test("the health check probes the primary directly, bypassing a working fallback and cache", async t => {
    await reset();
    const original = process.env.PUSHFIGHT_SOLVER_FALLBACK_URL;
    process.env.PUSHFIGHT_SOLVER_FALLBACK_URL = "https://backup.example.test/lookup";
    t.after(() => { if (original === undefined) delete process.env.PUSHFIGHT_SOLVER_FALLBACK_URL; else process.env.PUSHFIGHT_SOLVER_FALLBACK_URL = original; });
    const urls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
      urls.push(url);
      return url.includes("backup") ? Response.json({ status: "W1" }) : new Response("offline", { status: 503 });
    });
    const result = await checkReplaySolverHealth({ client, endpoint: "https://primary.example.test/lookup", now: start, sendEmail });
    assert.equal(result.healthy, false);
    assert.deepEqual(urls, ["https://primary.example.test/lookup/perms/..Y.OO........x.xoO.oXX..."]);
    assert.equal(emails.length, 0);
  });

  await t.test("outage probes respect increasing delays instead of checking every timer tick", async () => {
    await reset();
    let probes = 0;
    const run = (minutes: number) => checkReplaySolverHealth({ client, endpoint: "https://primary.example.test/lookup",
      now: at(minutes * 60_000), probe: async () => { probes++; return false; }, sendEmail });
    await run(0); await run(1); await run(4);
    assert.equal(probes, 1);
    await run(5); await run(6); await run(19);
    assert.equal(probes, 2);
    await run(20); await run(21);
    assert.equal(probes, 3);
    const next = (await client.query("SELECT next_check_at FROM pushfight_analysis_monitor_state WHERE id=1")).rows[0].next_check_at;
    assert.equal(next.toISOString(), at(65 * 60_000).toISOString());
  });

  await t.test("a week stops all probes, sends one stop notice, and persists even if email delivery fails", async () => {
    await reset();
    await check(0);
    const week = SOLVER_OUTAGE_STOP_MS;
    let probes = 0;
    let failedKey = "";
    const stopped = (offset: number, fail = false) => checkReplaySolverHealth({ client, endpoint: "https://primary.example.test/lookup", now: at(offset),
      probe: async () => { probes++; return true; },
      sendEmail: async email => { if (fail) { failedKey = email.idempotencyKey; throw new Error("email unavailable"); } emails.push(email); },
    });
    await assert.rejects(stopped(week, true), /email unavailable/);
    assert.equal(probes, 0, "no last-chance request is made after the cutoff");
    const state = (await client.query("SELECT stopped_at,stop_alert_at FROM pushfight_analysis_monitor_state WHERE id=1")).rows[0];
    assert.equal(state.stopped_at.toISOString(), at(week).toISOString());
    assert.equal(state.stop_alert_at, null);
    await stopped(week + 60_000);
    assert.equal(emails.length, 1);
    assert.match(emails[0].subject, /requests stopped/);
    assert.match(emails[0].text, /npm run games:analysis:resume/);
    assert.equal(emails[0].idempotencyKey, failedKey);
    await stopped(week + day);
    await checkReplaySolverHealth({ client, endpoint: "https://different.example.test/lookup", now: at(week + 2 * day),
      probe: async () => { probes++; return true; }, sendEmail });
    assert.equal(emails.length, 1);
    assert.equal(probes, 0, "new invocations and endpoint changes cannot restart a stopped service");
  });

});
