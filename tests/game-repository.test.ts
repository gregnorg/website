import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import {
  clearFinishedGameForPlayer,
  createGameRecord,
  getMoveGameForPlayer,
  resignGameForPlayer,
  offerDrawForPlayer,
  respondToDrawForPlayer,
} from "../lib/game-repository.ts";

import { getLeaderboards } from "../lib/leaderboard.ts";

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
  const clocks = await client.query<{ time_control_seconds: number; remaining: string[] }>(
    `SELECT g.time_control_seconds,
            array_agg(gp.time_remaining_ms ORDER BY gp.mark) AS remaining
       FROM games g
       JOIN game_players gp ON gp.game_id = g.id
      WHERE g.id = $1
      GROUP BY g.id`,
    [gameId],
  );
  assert.equal(clocks.rows[0].time_control_seconds, 300);
  assert.deepEqual(clocks.rows[0].remaining.map(Number), [300_000, 300_000]);

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
  await client.query(
    `INSERT INTO champion_state (singleton, user_id) VALUES (true, $1)
     ON CONFLICT (singleton) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [opponentId],
  );
  assert.equal(await resignGameForPlayer(client, resignationGameId, outsiderId), false);
  assert.equal(await resignGameForPlayer(client, resignationGameId, opponentId), true);
  const resignedGame = await client.query<{ status: string; winner_id: string | null; resigned_by_id: string | null }>(
    "SELECT status, winner_id, resigned_by_id FROM games WHERE id = $1",
    [resignationGameId],
  );
  assert.deepEqual(resignedGame.rows[0], { status: "won", winner_id: creatorId, resigned_by_id: opponentId });
  const champion = await client.query<{ user_id: string }>("SELECT user_id FROM champion_state WHERE singleton = true");
  assert.equal(champion.rows[0].user_id, creatorId);
  assert.equal(await resignGameForPlayer(client, resignationGameId, opponentId), false);

  await t.test("draw offers require opponent consent and ignore stale responses", async () => {
    const drawGame = await createGameRecord(client, creatorId, opponentId, "pushfight", "X");
    const pendingOffer = async () => (await client.query<{ draw_offer_id: string }>(
      "SELECT draw_offer_id FROM games WHERE id = $1", [drawGame],
    )).rows[0].draw_offer_id;
    assert.equal(await offerDrawForPlayer(client, drawGame, outsiderId), false);
    assert.equal(await offerDrawForPlayer(client, drawGame, creatorId), true);
    const firstOffer = await pendingOffer();
    assert.ok(firstOffer);
    assert.equal(await offerDrawForPlayer(client, drawGame, opponentId), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, creatorId, firstOffer, "accept"), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, creatorId, firstOffer, "decline"), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, outsiderId, firstOffer, "accept"), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, opponentId, firstOffer, "withdraw"), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, opponentId, firstOffer, "decline"), true);
    assert.equal(await offerDrawForPlayer(client, drawGame, creatorId), true);
    const secondOffer = await pendingOffer();
    assert.notEqual(secondOffer, firstOffer);
    assert.equal(await respondToDrawForPlayer(client, drawGame, opponentId, firstOffer, "accept"), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, creatorId, secondOffer, "withdraw"), true);
    assert.equal(await offerDrawForPlayer(client, drawGame, opponentId), true);
    const thirdOffer = await pendingOffer();
    assert.equal(await respondToDrawForPlayer(client, drawGame, creatorId, thirdOffer, "accept"), true);
    const result = await client.query("SELECT status, winner_id, resigned_by_id, draw_offer_id, draw_offered_by_id FROM games WHERE id = $1", [drawGame]);
    assert.deepEqual(result.rows[0], { status: "draw", winner_id: null, resigned_by_id: null, draw_offer_id: null, draw_offered_by_id: null });
    assert.equal(await offerDrawForPlayer(client, drawGame, creatorId), false);
    assert.equal(await respondToDrawForPlayer(client, drawGame, creatorId, thirdOffer, "accept"), false);
    assert.equal(await resignGameForPlayer(client, drawGame, creatorId), false);
    assert.equal((await client.query("SELECT user_id FROM champion_state WHERE singleton = true")).rows[0].user_id, creatorId);
    assert.equal(await clearFinishedGameForPlayer(client, drawGame, creatorId), true);

    const finishedGame = await createGameRecord(client, creatorId, opponentId, "tic_tac_toe", "X");
    assert.equal(await offerDrawForPlayer(client, finishedGame, creatorId), true);
    const finishedOffer = (await client.query("SELECT draw_offer_id FROM games WHERE id = $1", [finishedGame])).rows[0].draw_offer_id;
    assert.equal(await resignGameForPlayer(client, finishedGame, opponentId), true);
    assert.equal(await respondToDrawForPlayer(client, finishedGame, opponentId, finishedOffer, "accept"), false);
    assert.equal((await client.query("SELECT draw_offer_id FROM games WHERE id = $1", [finishedGame])).rows[0].draw_offer_id, null);
  });

  await t.test("draws leave win statistics unchanged and stop both players' streaks", async () => {
    // Establish a latest win for each player before the agreed draw.
    for (const playerId of [creatorId, opponentId]) {
      const winGame = await createGameRecord(client, playerId, outsiderId, "pushfight", "X");
      await client.query("UPDATE games SET status = 'won', winner_id = $2, updated_at = now() - interval '1 second' WHERE id = $1", [winGame, playerId]);
    }
    // Earlier fixtures should precede the new wins in the result history.
    await client.query("UPDATE games SET updated_at = now() - interval '2 seconds' WHERE created_by = $1 AND updated_at = now()", [creatorId]);
    const before = await getLeaderboards(client);
    const drawGame = await createGameRecord(client, creatorId, opponentId, "pushfight", "X");
    await offerDrawForPlayer(client, drawGame, creatorId);
    const offer = (await client.query("SELECT draw_offer_id FROM games WHERE id = $1", [drawGame])).rows[0].draw_offer_id;
    assert.equal(await respondToDrawForPlayer(client, drawGame, opponentId, offer, "accept"), true);
    const after = await getLeaderboards(client);
    for (const playerId of [creatorId, opponentId]) {
      const prior = before.byWins.find(p => p.id === playerId)!;
      const next = after.byWins.find(p => p.id === playerId)!;
      assert.ok(prior.currentStreak >= 1);
      assert.equal(next.currentStreak, 0);
      assert.equal(next.wins, prior.wins);
      assert.equal(next.completedGames, prior.completedGames);
      assert.equal(next.winPercentage, prior.winPercentage);
    }
    // New wins can start a fresh streak, without reaching past the draw.
    const newWin = await createGameRecord(client, creatorId, outsiderId, "pushfight", "X");
    await client.query("UPDATE games SET status = 'won', winner_id = $2, updated_at = clock_timestamp() WHERE id = $1", [newWin, creatorId]);
    const restarted = await getLeaderboards(client);
    assert.equal(restarted.byStreak.find(p => p.id === creatorId)!.currentStreak, 1);
  });

});
