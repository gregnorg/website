import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { isChatOriginAllowed, saveChatMessage, validateChatMessage } from "../lib/game-chat.ts";

test("chat accepts the public HTTPS origin behind an HTTP proxy and rejects other sites", () => {
  const request = (origin?: string, site?: string) => new Request("http://127.0.0.1:3000/api/games/1/chat", {
    headers: { ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}) },
  });
  assert.equal(isChatOriginAllowed(request("https://shoveactually.com", "same-origin")), true);
  assert.equal(isChatOriginAllowed(request("https://www.shoveactually.com")), true);
  assert.equal(isChatOriginAllowed(request("http://127.0.0.1:3000")), true);
  assert.equal(isChatOriginAllowed(request()), true);
  for (const origin of ["https://other.example", "https://shoveactually.com.other.example", "null", "http://shoveactually.com"]) {
    assert.equal(isChatOriginAllowed(request(origin)), false);
  }
  assert.equal(isChatOriginAllowed(request("https://shoveactually.com", "cross-site")), false);
});

test("chat validates empty, oversized, and non-text messages", () => {
  for (const body of [null, undefined, 42, {}, "", " \n\t ", "a".repeat(1001)]) {
    assert.equal(validateChatMessage(body), null);
  }
  assert.equal(validateChatMessage("  Good game!\n "), "Good game!");
  assert.equal(validateChatMessage("a".repeat(1000)), "a".repeat(1000));
  assert.equal(validateChatMessage("<script>alert('hello')</script>"), "<script>alert('hello')</script>");
});

test("spectators can save chat independently of moves, with account-wide rate limiting", async (t) => {
  if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL is not configured");
  const client = await pool.connect();
  await client.query("BEGIN");
  t.after(async () => {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  });
  const userId = `chat-test-${randomUUID()}`;
  await client.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", username, "displayUsername")
     VALUES ($1, $1, $2, false, now(), now(), $1, $1)`,
    [userId, `${userId}@example.test`],
  );
  const game = await client.query<{ id: string; updated_at: Date }>("INSERT INTO games (created_by, status) VALUES ($1, 'draw') RETURNING id, updated_at", [userId]);
  const gameId = game.rows[0].id;
  assert.equal(await saveChatMessage(client, gameId, userId, "Good game!"), true);
  assert.equal(await saveChatMessage(client, gameId, userId, "Too soon"), false);
  const other = await client.query<{ id: string }>("INSERT INTO games (created_by) VALUES ($1) RETURNING id", [userId]);
  assert.equal(await saveChatMessage(client, other.rows[0].id, userId, "Still too soon"), false);
  await client.query("UPDATE game_chat_messages SET created_at = now() - interval '4 seconds' WHERE user_id = $1", [userId]);
  assert.equal(await saveChatMessage(client, gameId, userId, "Another message"), true);
  const messages = await client.query("SELECT body FROM game_chat_messages WHERE game_id = $1 ORDER BY id", [gameId]);
  assert.deepEqual(messages.rows.map((row) => row.body), ["Good game!", "Another message"]);
  const unchanged = await client.query("SELECT status, updated_at, (SELECT count(*)::int FROM moves WHERE game_id = $1) AS moves FROM games WHERE id = $1", [gameId]);
  assert.equal(unchanged.rows[0].status, "draw");
  assert.equal(unchanged.rows[0].moves, 0);
  assert.deepEqual(unchanged.rows[0].updated_at, game.rows[0].updated_at);
});
