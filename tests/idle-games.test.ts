import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { createGameRecord, offerDrawForPlayer } from "../lib/game-repository.ts";
import { getLeaderboards } from "../lib/leaderboard.ts";
import { IDLE_DAY_MS, processIdleGame, type IdleReminder } from "../lib/idle-games.ts";

test("idle reminders and forfeits use submitted moves and update rankings", async t => {
  if (!process.env.DATABASE_URL) { t.skip("DATABASE_URL is not configured"); return; }
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
  const suffix = randomUUID();
  const white = `idle-white-${suffix}`;
  const black = `idle-black-${suffix}`;
  for (const id of [white, black]) {
    await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", username, "displayUsername", email_notifications)
      VALUES ($1, $1, $2, false, now(), now(), $1, $1, true)`, [id, `${id}@example.test`]);
  }
  const start = new Date();
  const at = (days: number) => new Date(start.getTime() + days * IDLE_DAY_MS);
  const emails: IdleReminder[] = [];
  const sendReminder = async (email: IdleReminder) => { emails.push(email); };
  const run = (gameId: string, days: number, dryRun = false) => processIdleGame(client, gameId, {
    now: at(days), sendReminder, siteUrl: "https://example.test", dryRun,
  });
  async function game(type: "tic_tac_toe" | "pushfight" = "tic_tac_toe") {
    const id = await createGameRecord(client, white, black, type, "X", null);
    await client.query("UPDATE games SET created_at = $2 WHERE id = $1", [id, start]);
    return id;
  }

  await t.test("daily reminders on days 3 through 6, no backlog, forfeit at 7", async () => {
    const id = await game();
    assert.equal(await run(id, 3 - 1 / IDLE_DAY_MS), "skipped");
    assert.equal(await run(id, 3), "reminded");
    assert.equal(emails.at(-1)?.to, `${white}@example.test`);
    assert.match(emails.at(-1)!.text, /you will forfeit/);
    assert.equal(await run(id, 3), "skipped");
    assert.equal(await run(id, 4 - 1 / IDLE_DAY_MS), "skipped");
    assert.equal(await run(id, 4), "reminded");
    const count = emails.length;
    assert.equal(await run(id, 6), "reminded");
    assert.equal(emails.length, count + 1);
    assert.equal(await run(id, 7), "forfeited");
    assert.equal(emails.length, count + 1);
    assert.equal(await run(id, 8), "skipped");
    const result = (await client.query("SELECT status, winner_id, idle_expired FROM games WHERE id = $1", [id])).rows[0];
    assert.deepEqual(result, { status: "won", winner_id: black, idle_expired: true });
    const cleared = await client.query("SELECT cleared_at FROM game_players WHERE game_id = $1", [id]);
    assert.ok(cleared.rows.every(row => row.cleared_at === null));
    assert.equal((await client.query("SELECT id FROM games WHERE id = $1 AND (NOT idle_expired OR status = 'won')", [id])).rowCount, 1);
  });

  await t.test("all four reminder days send once and day seven forfeits", async () => {
    const id = await game();
    const count = emails.length;
    for (const day of [3, 4, 5, 6]) {
      assert.equal(await run(id, day), "reminded");
      assert.equal(await run(id, day + 0.5), "skipped");
    }
    assert.equal(emails.length, count + 4);
    assert.equal(await run(id, 7 - 1 / IDLE_DAY_MS), "skipped");
    assert.equal(await run(id, 7), "forfeited");
    assert.equal(emails.length, count + 4);
  });

  await t.test("actual moves restart the schedule and notify the new player", async () => {
    const id = await game();
    await run(id, 3);
    await client.query("INSERT INTO moves (game_id, player_id, position, move_number, created_at) VALUES ($1, $2, 0, 1, $3)", [id, white, at(4)]);
    assert.equal(await run(id, 6), "skipped");
    assert.equal(await run(id, 7), "reminded");
    assert.equal(emails.at(-1)?.to, `${black}@example.test`);
    assert.equal(await run(id, 10), "reminded");
    assert.equal(await run(id, 11), "forfeited");
  });

  await t.test("Push Fight setup and turns select the player who must move", async () => {
    const id = await game("pushfight");
    await run(id, 3);
    assert.equal(emails.at(-1)?.to, `${white}@example.test`);
    await client.query("INSERT INTO moves (game_id, player_id, payload, move_number, created_at) VALUES ($1, $2, $3, 1, $4)", [id, white, { type: "setup" }, at(4)]);
    await run(id, 7);
    assert.equal(emails.at(-1)?.to, `${black}@example.test`);
    await client.query("INSERT INTO moves (game_id, player_id, payload, move_number, created_at) VALUES ($1, $2, $3, 2, $4)", [id, black, { type: "setup" }, at(8)]);
    await run(id, 11);
    assert.equal(emails.at(-1)?.to, `${white}@example.test`);
    await client.query("INSERT INTO moves (game_id, player_id, payload, move_number, created_at) VALUES ($1, $2, $3, 3, $4)", [id, white, { type: "turn", actions: [] }, at(12)]);
    await run(id, 15);
    assert.equal(emails.at(-1)?.to, `${black}@example.test`);
  });

  await t.test("draw offers and clock updates do not reset inactivity; forfeits update stats and champion", async () => {
    const id = await game();
    await offerDrawForPlayer(client, id, white);
    await client.query("UPDATE games SET updated_at = $2 WHERE id = $1", [id, at(6)]);
    await client.query("UPDATE game_players SET time_remaining_ms = 100 WHERE game_id = $1", [id]);
    await client.query("INSERT INTO champion_state (singleton, user_id) VALUES (true, $1) ON CONFLICT (singleton) DO UPDATE SET user_id = EXCLUDED.user_id", [white]);
    const win = await game();
    await client.query("UPDATE games SET status = 'won', winner_id = $2 WHERE id = $1", [win, white]);
    const before = await getLeaderboards(client);
    assert.equal(await run(id, 7), "forfeited");
    const after = await getLeaderboards(client);
    for (const playerId of [white, black]) {
      const oldStats = before.byWins.find(p => p.id === playerId)!;
      const newStats = after.byWins.find(p => p.id === playerId)!;
      assert.equal(newStats.completedGames, oldStats.completedGames + 1);
      assert.equal(newStats.wins, oldStats.wins + (playerId === black ? 1 : 0));
    }
    assert.equal(after.champion?.id, black);
    const ended = (await client.query("SELECT draw_offer_id, draw_offered_by_id FROM games WHERE id = $1", [id])).rows[0];
    assert.deepEqual(ended, { draw_offer_id: null, draw_offered_by_id: null });
  });

  await t.test("legacy email opt-out does not suppress mandatory reminders or forfeits", async () => {
    const id = await game();
    await client.query('UPDATE "user" SET email_notifications = false WHERE id = $1', [white]);
    const count = emails.length;
    assert.equal(await run(id, 3), "reminded");
    assert.equal(await run(id, 7), "forfeited");
    assert.equal(emails.length, count + 1);
    await client.query('UPDATE "user" SET email_notifications = true WHERE id = $1', [white]);
  });

  await t.test("dry run is read-only and failures can retry without marking delivery", async () => {
    const id = await game();
    const count = emails.length;
    assert.equal(await run(id, 3, true), "reminded");
    assert.equal(await run(id, 7, true), "forfeited");
    assert.equal(emails.length, count);
    let failedKey = "";
    await assert.rejects(processIdleGame(client, id, {
      now: at(3), siteUrl: "https://example.test", sendReminder: async email => {
        failedKey = email.idempotencyKey; throw new Error("Simulated transport failure");
      },
    }), /Simulated transport failure/);
    const unchanged = (await client.query("SELECT status, idle_reminder_at FROM games WHERE id = $1", [id])).rows[0];
    assert.deepEqual(unchanged, { status: "active", idle_reminder_at: null });
    assert.equal(await run(id, 3), "reminded");
    assert.equal(emails.at(-1)?.idempotencyKey, failedKey);
  });
});
