import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";

test("notification jobs commit with game changes and roll back with failed moves", async t => {
  if (!process.env.DATABASE_URL) { t.skip("No database configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  const id = randomUUID();
  const userId = `push-test-${id}`;
  await client.query(`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt",username,"displayUsername")
    VALUES($1,$1,$2,false,now(),now(),$1,$1)`, [userId, `${userId}@example.test`]);
  await client.query("INSERT INTO games(id,created_by,game_type,status) VALUES($1,$2,'pushfight','active')", [id, userId]);
  assert.equal((await client.query("SELECT count(*)::int n FROM turn_notification_jobs WHERE game_id=$1", [id])).rows[0].n, 1);
  await client.query("DELETE FROM turn_notification_jobs WHERE game_id=$1", [id]);
  await client.query("SAVEPOINT move_test");
  await client.query("UPDATE games SET updated_at=now() WHERE id=$1", [id]);
  assert.equal((await client.query("SELECT count(*)::int n FROM turn_notification_jobs WHERE game_id=$1", [id])).rows[0].n, 1);
  await client.query("INSERT INTO moves(game_id,player_id,move_number,payload) VALUES($1,$2,1,$3)",
    [id,userId,JSON.stringify({type:"setup"})]);
  assert.equal((await client.query("SELECT count(*)::int n FROM turn_notification_jobs WHERE game_id=$1", [id])).rows[0].n, 1,
    "move and game update coalesce into one job");
  for (let attempt = 0; attempt < 2; attempt++) {
    await client.query(`INSERT INTO push_deliveries(game_id,user_id,event_key,endpoint,payload)
      VALUES($1,$2,'turn-1','https://example.test/push','{}')
      ON CONFLICT(game_id,event_key,endpoint) DO NOTHING`, [id,userId]);
  }
  assert.equal((await client.query("SELECT count(*)::int n FROM push_deliveries WHERE game_id=$1", [id])).rows[0].n, 1,
    "repeated preparation cannot duplicate a delivery for the same turn and device");
  await client.query("ROLLBACK TO SAVEPOINT move_test");
  assert.equal((await client.query("SELECT count(*)::int n FROM turn_notification_jobs WHERE game_id=$1", [id])).rows[0].n, 0);
});
