import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import {
  clearFinishedGameForPlayer,
  createGameRecord,
  getMoveGameForPlayer,
  resignGameForPlayer,
} from "../lib/game-repository.ts";

test("game database operations enforce membership and finished-game clearing", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  });

  const suffix = randomUUID();
  const creatorId = `test-creator-${suffix}`;
  const opponentId = `test-opponent-${suffix}`;
  const outsiderId = `test-outsider-${suffix}`;
  for (const [id, username] of [
    [creatorId, `creator_${suffix.slice(0, 8)}`],
    [opponentId, `opponent_${suffix.slice(0, 8)}`],
    [outsiderId, `outsider_${suffix.slice(0, 8)}`],
  ]) {
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", username, "displayUsername")
       VALUES ($1, $2, $3, false, now(), now(), $2, $2)`,
      [id, username, `${username}@example.test`],
    );
  }

  const gameId = await createGameRecord(client, creatorId, opponentId, "pushfight", "O");
  const players = await client.query<{ user_id: string; mark: string }>(
    "SELECT user_id, mark FROM game_players WHERE game_id = $1 ORDER BY mark",
    [gameId],
  );
  assert.deepEqual(players.rows, [
    { user_id: opponentId, mark: "X" },
    { user_id: creatorId, mark: "O" },
  ]);

  assert.deepEqual(await getMoveGameForPlayer(client, gameId, creatorId), {
    status: "active",
    game_type: "pushfight",
    my_mark: "O",
  });
  assert.equal(await getMoveGameForPlayer(client, gameId, outsiderId), null);
  assert.equal(await getMoveGameForPlayer(client, randomUUID(), creatorId), null);

  assert.equal(await clearFinishedGameForPlayer(client, gameId, creatorId), false);
  await client.query("UPDATE games SET status = 'won', winner_id = $2 WHERE id = $1", [gameId, creatorId]);
  assert.equal(await clearFinishedGameForPlayer(client, gameId, creatorId), true);
  const cleared = await client.query<{ user_id: string; cleared_at: Date | null }>(
    "SELECT user_id, cleared_at FROM game_players WHERE game_id = $1 ORDER BY mark",
    [gameId],
  );
  assert.ok(cleared.rows.find((row) => row.user_id === creatorId)?.cleared_at instanceof Date);
  assert.equal(cleared.rows.find((row) => row.user_id === opponentId)?.cleared_at, null);

  const resignationGameId = await createGameRecord(client, creatorId, opponentId, "tic_tac_toe", "X");
  assert.equal(await resignGameForPlayer(client, resignationGameId, outsiderId), false);
  assert.equal(await resignGameForPlayer(client, resignationGameId, opponentId), true);
  const resignedGame = await client.query<{ status: string; winner_id: string | null }>(
    "SELECT status, winner_id FROM games WHERE id = $1",
    [resignationGameId],
  );
  assert.deepEqual(resignedGame.rows[0], { status: "won", winner_id: creatorId });
  assert.equal(await resignGameForPlayer(client, resignationGameId, opponentId), false);
});
