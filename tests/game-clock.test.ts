import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pool } from "../lib/db.ts";
import { createGameRecord } from "../lib/game-repository.ts";
import { settleGameClock } from "../lib/game-clock.ts";

test("ordinary clocks use server time, preserve delay and setup, and expire without heartbeats", async t => {
  if (!process.env.DATABASE_URL) { t.skip("DATABASE_URL is not configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) await client.query('INSERT INTO "user"(id,name,email,username,"emailVerified") VALUES($1,$1,$1,$1,false)', [id]);
  const clock = async (id: string) => (await client.query(`SELECT g.status,g.winner_id,g.clock_started_at,g.clock_expires_at,
    p.time_remaining_ms FROM games g JOIN game_players p ON p.game_id=g.id AND p.mark='X' WHERE g.id=$1`, [id])).rows[0];
  const untimed = await createGameRecord(client, ids[0], ids[1], "tic_tac_toe", "X", null);
  const setup = await createGameRecord(client, ids[0], ids[1], "pushfight", "X", 300);
  for (const id of [untimed, setup]) {
    assert.equal(await settleGameClock(client, id, true), false);
    assert.equal((await clock(id)).clock_started_at, null);
  }
  for (const [i, user] of ids.entries()) await client.query(`INSERT INTO moves(game_id,player_id,move_number,payload) VALUES($1,$2,$3,'{"type":"setup"}')`, [setup, user, i + 1]);
  await settleGameClock(client, setup);
  assert.ok((await clock(setup)).clock_started_at instanceof Date);

  const game = await createGameRecord(client, ids[0], ids[1], "tic_tac_toe", "X", 300);
  assert.ok((await clock(game)).clock_expires_at instanceof Date);
  await client.query("UPDATE games SET clock_started_at=clock_timestamp()-interval '5 seconds' WHERE id=$1", [game]);
  await settleGameClock(client, game, true);
  assert.equal(Number((await clock(game)).time_remaining_ms), 300000);
  await settleGameClock(client, game);
  await client.query("UPDATE games SET clock_started_at=clock_timestamp()-interval '20 seconds' WHERE id=$1", [game]);
  await settleGameClock(client, game, true);
  const remaining = Number((await clock(game)).time_remaining_ms);
  assert.ok(remaining <= 290000 && remaining > 289000);
  assert.equal((await clock(game)).clock_started_at, null);
  await client.query("INSERT INTO moves(game_id,player_id,move_number,position) VALUES($1,$2,1,0)", [game, ids[0]]);
  await settleGameClock(client, game);
  assert.ok((await clock(game)).clock_started_at instanceof Date);
  await client.query("UPDATE games SET clock_started_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [game]);
  assert.equal(await settleGameClock(client, game), true);
  const expired = await clock(game);
  assert.equal(expired.status, "won");
  assert.equal(expired.winner_id, ids[0]);
  assert.equal(expired.clock_expires_at, null);
  assert.equal((await client.query("SELECT time_remaining_ms FROM game_players WHERE game_id=$1 AND user_id=$2", [game, ids[1]])).rows[0].time_remaining_ms, "0");
  assert.equal(await settleGameClock(client, game), false);
});
