import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { pool } from "../lib/db.ts";
import { createGameRecord } from "../lib/game-repository.ts";
import { resetGameClockDelay, settleGameClock } from "../lib/game-clock.ts";

test("ordinary clocks charge only visible time for the current player and turn", async t => {
  if (!process.env.DATABASE_URL) { t.skip("DATABASE_URL is not configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  const [x, o] = [randomUUID(), randomUUID()];
  for (const id of [x, o]) await client.query('INSERT INTO "user"(id,name,email,username,"emailVerified") VALUES($1,$1,$1,$1,false)', [id]);
  const clock = async (id: string, userId = x) => (await client.query(`SELECT g.status,g.winner_id,g.clock_started_at,
    g.clock_expires_at,g.clock_delay_remaining_ms,p.time_remaining_ms FROM games g JOIN game_players p
    ON p.game_id=g.id AND p.user_id=$2 WHERE g.id=$1`, [id, userId])).rows[0];
  const sample = (id: string, elapsedMs: number, userId = x, moveCount = 0) =>
    settleGameClock(client, id, { userId, moveCount, elapsedMs });
  const ageSample = (id: string) => client.query(
    "UPDATE games SET clock_started_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [id]);

  const untimed = await createGameRecord(client, x, o, "tic_tac_toe", "X", null);
  const setup = await createGameRecord(client, x, o, "pushfight", "X", 300);
  for (const id of [untimed, setup]) {
    assert.equal(await sample(id, 1000), false);
    assert.equal((await clock(id)).clock_started_at, null);
  }

  const game = await createGameRecord(client, x, o, "tic_tac_toe", "X", 300);
  assert.equal((await clock(game)).clock_started_at, null);
  assert.equal((await clock(game)).clock_expires_at, null);
  await sample(game, 1000, o);
  assert.equal((await clock(game)).clock_delay_remaining_ms, 10000);
  await sample(game, 1000);
  await ageSample(game);
  await sample(game, 500);
  assert.equal((await clock(game)).clock_delay_remaining_ms, 8500);
  assert.equal(Number((await clock(game)).time_remaining_ms), 300000);

  for (let i = 0; i < 9; i++) {
    await ageSample(game);
    await sample(game, 1000);
  }
  assert.equal(Number((await clock(game)).time_remaining_ms), 299500);

  await client.query("INSERT INTO moves(game_id,player_id,move_number,position) VALUES($1,$2,1,0)", [game, x]);
  await resetGameClockDelay(client, game);
  await sample(game, 1000, o, 0);
  assert.equal((await clock(game)).clock_delay_remaining_ms, 10000);
  await sample(game, 1000, o, 1);
  assert.equal((await clock(game)).clock_delay_remaining_ms, 9000);

  await client.query("UPDATE games SET clock_delay_remaining_ms=0 WHERE id=$1", [game]);
  await client.query("UPDATE game_players SET time_remaining_ms=1000 WHERE game_id=$1 AND user_id=$2", [game, o]);
  await ageSample(game);
  assert.equal(await sample(game, 250, o, 1), false);
  assert.equal(Number((await clock(game, o)).time_remaining_ms), 750);
  await ageSample(game);
  assert.equal(await sample(game, 750, o, 1), true);
  assert.equal((await clock(game)).status, "won");
  assert.equal((await clock(game)).winner_id, x);
  assert.equal(Number((await clock(game, o)).time_remaining_ms), 0);
});
