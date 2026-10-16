import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../lib/db.ts";
import { createGameRecord, resignGameForPlayer, offerDrawForPlayer, respondToDrawForPlayer } from "../lib/game-repository.ts";
import { loadGameHistory } from "../lib/game-history-repository.ts";
import { processReplayAnalysis, analysisRetryDelayMs } from "../lib/replay-analysis-worker.ts";
import { cachedReplayAnalysis } from "../lib/replay-analysis-cache.ts";
import { solverEndpoints } from "../lib/pushfight-analysis-service.ts";
import { resumeReplayAnalysis } from "../lib/replay-analysis-resume.ts";
import { SOLVER_OUTAGE_STOP_MS } from "../lib/replay-analysis-policy.ts";
import { solverPosition } from "../lib/pushfight-analysis.ts";

const payloads = [
  { type: "setup", pieces: [
    { row: 0, col: 2, kind: "pusher" }, { row: 0, col: 3, kind: "pusher" }, { row: 1, col: 0, kind: "pusher" },
    { row: 1, col: 1, kind: "nonpusher" }, { row: 1, col: 2, kind: "nonpusher" },
  ] },
  { type: "setup", pieces: [
    { row: 0, col: 4, kind: "pusher" }, { row: 0, col: 5, kind: "pusher" }, { row: 1, col: 7, kind: "pusher" },
    { row: 1, col: 6, kind: "nonpusher" }, { row: 1, col: 5, kind: "nonpusher" },
  ] },
  { type: "turn", actions: [
    { type: "move", from: { row: 0, col: 3 }, to: { row: 1, col: 3 } },
    { type: "move", from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    { type: "push", index: { row: 1, col: 0 }, dir: "right" },
  ] },
  { type: "turn", actions: [
    { type: "move", from: { row: 0, col: 5 }, to: { row: 0, col: 6 } },
    { type: "push", index: { row: 0, col: 4 }, dir: "left" },
  ] },
];

test("retry delays grow from five minutes to a bounded daily attempt", () => {
  assert.equal(analysisRetryDelayMs(1), 300000);
  assert.equal(analysisRetryDelayMs(2), 900000);
  assert.equal(analysisRetryDelayMs(100), 86400000);
});

test("finished games queue transactionally; background results survive outages and are reused", async t => {
  if (!process.env.DATABASE_URL) { t.skip("No database configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  if (!(await client.query("SELECT to_regclass('pushfight_position_analysis') AS name")).rows[0].name) {
    // Exercise the production migration without leaving schema or data changes.
    await client.query(await readFile(new URL("../database/migrations/019_add_replay_analysis_cache.sql", import.meta.url), "utf8"));
  }
  await client.query(await readFile(new URL("../database/migrations/020_add_replay_analysis_monitor.sql", import.meta.url), "utf8"));
  await client.query(await readFile(new URL("../database/migrations/021_stop_prolonged_solver_retries.sql", import.meta.url), "utf8"));
  await client.query("UPDATE pushfight_analysis_monitor_state SET endpoint=NULL, incident_started_at=NULL, check_failures=0, stopped_at=NULL, stop_alert_at=NULL WHERE id=1");
  await client.query("DELETE FROM pushfight_analysis_jobs");
  await client.query("UPDATE pushfight_analysis_provider_state SET failures = 0, next_attempt_at = now(), last_error = NULL WHERE id = 1");
  const white = `analysis-white-${randomUUID()}`;
  const black = `analysis-black-${randomUUID()}`;
  for (const id of [white, black]) {
    await client.query(`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",username,"displayUsername")
      VALUES($1,$1,$2,false,now(),now(),$1,$1)`, [id, `${id}@example.test`]);
  }
  async function makeGame(moveCount = 4) {
    const id = await createGameRecord(client, white, black, "pushfight", "X", null);
    for (let index = 0; index < moveCount; index++) {
      await client.query("INSERT INTO moves(game_id, player_id, move_number, payload) VALUES ($1,$2,$3,$4)",
        [id, index % 2 === 0 ? white : black, index + 1, JSON.stringify(payloads[index])]);
    }
    return id;
  }
  const game = await makeGame();
  assert.equal((await client.query("SELECT 1 FROM pushfight_analysis_jobs WHERE game_id=$1", [game])).rowCount, 0);
  await client.query("SAVEPOINT finish_test");
  await resignGameForPlayer(client, game, black);
  assert.equal((await client.query("SELECT 1 FROM pushfight_analysis_jobs WHERE game_id=$1", [game])).rowCount, 1);
  await client.query("ROLLBACK TO SAVEPOINT finish_test");
  assert.equal((await client.query("SELECT 1 FROM pushfight_analysis_jobs WHERE game_id=$1", [game])).rowCount, 0);
  await resignGameForPlayer(client, game, black);
  const history = await loadGameHistory(game, client);
  assert.ok(history);
  const frame1 = history.frames[3];
  const frame2 = history.frames[4];
  assert.ok(frame1.type === "pushfight" && frame1.turnEnd);
  assert.ok(frame2.type === "pushfight" && frame2.turnEnd);
  const pos1 = solverPosition(frame1.board, frame1.turnEnd.nextPlayer)!;
  const pos2 = solverPosition(frame2.board, frame2.turnEnd.nextPlayer)!;
  assert.ok(pos1); assert.ok(pos2);
  await client.query("DELETE FROM pushfight_position_analysis WHERE permutation = ANY($1)", [[pos1.permutation, pos2.permutation]]);
  assert.deepEqual(await cachedReplayAnalysis(client, game, frame1), { label: "Analysis pending", pending: true });

  let requests = 0;
  const lookup = async () => { requests++; return { status: "W2", source: solverEndpoints()[0] }; };
  const partial = await processReplayAnalysis(client, { lookup, maxLookups: 1, minDelayMs: 0 });
  assert.equal(partial.lookups, 1);
  assert.equal(partial.completed, 0);
  assert.equal(requests, 1);
  assert.deepEqual(await cachedReplayAnalysis(client, game, frame1), { label: "Black wins in 2 turns", pending: false });
  assert.equal((await client.query("SELECT cursor_step FROM pushfight_analysis_jobs WHERE game_id=$1", [game])).rows[0].cursor_step, 3);

  const outage = await processReplayAnalysis(client, { minDelayMs: 0, lookup: async () => { requests++; return null; } });
  assert.equal(outage.cooldown, true);
  assert.equal(requests, 2);
  assert.deepEqual(await cachedReplayAnalysis(client, game, frame1), { label: "Black wins in 2 turns", pending: false });
  assert.deepEqual(await cachedReplayAnalysis(client, game, frame2), { label: "Analysis temporarily unavailable; retry scheduled", pending: true });
  const cooldown = await processReplayAnalysis(client, { lookup, minDelayMs: 0 });
  assert.equal(cooldown.cooldown, true);
  assert.equal(requests, 2, "persisted cooldown prevents more requests even in a new worker invocation");
  await client.query("UPDATE pushfight_analysis_provider_state SET next_attempt_at = now() WHERE id = 1");
  await processReplayAnalysis(client, { lookup, minDelayMs: 0 });
  assert.equal(requests, 3, "resume skips the first saved position");
  assert.deepEqual(await cachedReplayAnalysis(client, game, frame2), { label: "White wins in 2 turns", pending: false });
  assert.equal((await client.query("SELECT state FROM pushfight_analysis_jobs WHERE game_id=$1", [game])).rows[0].state, "completed");

  const repeated = await makeGame();
  await resignGameForPlayer(client, repeated, black);
  const reused = await processReplayAnalysis(client, { lookup: async () => { throw new Error("Network must not be used for saved positions"); } });
  assert.equal(reused.cached, 2);
  assert.equal(reused.lookups, 0);
  assert.equal(reused.completed, 1);
  assert.equal(requests, 3);

  await t.test("draws and timeout-style updates also queue once, while tic-tac-toe is excluded", async () => {
    const drawn = await makeGame(3);
    await offerDrawForPlayer(client, drawn, white);
    const offer = (await client.query("SELECT draw_offer_id FROM games WHERE id=$1", [drawn])).rows[0].draw_offer_id;
    await respondToDrawForPlayer(client, drawn, black, offer, "accept");
    const timedOut = await makeGame(3);
    await client.query("UPDATE games SET status='won',winner_id=$2 WHERE id=$1", [timedOut, white]);
    await client.query("UPDATE games SET status='won' WHERE id=$1", [timedOut]);
    const tic = await createGameRecord(client, white, black, "tic_tac_toe", "X", null);
    await resignGameForPlayer(client, tic, black);
    assert.equal((await client.query("SELECT 1 FROM pushfight_analysis_jobs WHERE game_id=ANY($1)", [[drawn, timedOut]])).rowCount, 2);
    assert.equal((await client.query("SELECT 1 FROM pushfight_analysis_jobs WHERE game_id=$1", [tic])).rowCount, 0);
  });

  await t.test("invalid histories finish without any upstream requests", async () => {
    await client.query("DELETE FROM pushfight_analysis_jobs WHERE state='pending'");
    const missing = await makeGame(0);
    await resignGameForPlayer(client, missing, black);
    const result = await processReplayAnalysis(client, { lookup: async () => { throw new Error("Invalid history must not query the solver"); } });
    assert.equal(result.invalid, 1);
    assert.equal(result.lookups, 0);
  });

  await t.test("the worker latches the one-week stop before a request; saved results survive and manual resume keeps jobs", async () => {
    const pending = await makeGame();
    await resignGameForPlayer(client, pending, black);
    await client.query("DELETE FROM pushfight_position_analysis WHERE permutation=$1", [pos2.permutation]);
    await client.query("UPDATE pushfight_analysis_monitor_state SET incident_started_at=$1, stopped_at=NULL WHERE id=1",
      [new Date(Date.now() - SOLVER_OUTAGE_STOP_MS - 1000)]);
    let called = false;
    const stopped = await processReplayAnalysis(client, { lookup: async () => { called = true; throw new Error("No requests after a week"); } });
    assert.equal(stopped.stopped, true);
    assert.equal(called, false);
    assert.deepEqual(await cachedReplayAnalysis(client, pending, frame1), { label: "Black wins in 2 turns", pending: false });
    assert.deepEqual(await cachedReplayAnalysis(client, pending, frame2), { label: "Analysis unavailable; automatic retries stopped", pending: false, stopped: true });
    const again = await processReplayAnalysis(client, { lookup: async () => { called = true; return null; } });
    assert.equal(again.stopped, true);
    assert.equal(called, false);
    await resumeReplayAnalysis(client);
    const resumed = await processReplayAnalysis(client, { lookup, minDelayMs: 0 });
    assert.equal(resumed.lookups, 1);
    assert.equal(resumed.completed, 1);
    assert.deepEqual(await cachedReplayAnalysis(client, pending, frame2), { label: "White wins in 2 turns", pending: false });
  });

  await t.test("overlapping workers cannot obtain the session lock", async () => {
    const other: PoolClient = await pool.connect();
    try {
      await other.query("SELECT pg_advisory_lock(40726103)");
      const result = await processReplayAnalysis(client, { lookup });
      assert.equal(result.busy, true);
    } finally {
      await other.query("SELECT pg_advisory_unlock(40726103)");
      other.release();
    }
  });
});
