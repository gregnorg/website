"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createGameRecord } from "@/lib/game-repository";
import type { GameType } from "@/lib/game-state";
import { sendTurnEmail } from "@/lib/turn-email";

export async function createGame(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const username = String(formData.get("username") ?? "").trim();
  const gameType = String(formData.get("game_type") ?? "pushfight").trim() as GameType;
  if (!["tic_tac_toe", "pushfight"].includes(gameType)) {
    redirect("/games/new?error=Invalid+game+type.");
  }
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    redirect("/games/new?error=Enter+a+valid+username.");
  }

  const opponent = await pool.query<{ id: string }>(
    `SELECT id
       FROM "user"
      WHERE lower(username) = lower($1)
      LIMIT 1`,
    [username],
  );
  if (!opponent.rowCount) {
    redirect("/games/new?error=No+account+has+that+username.");
  }
  if (opponent.rows[0].id === session.user.id) {
    redirect("/games/new?error=Choose+someone+other+than+yourself.");
  }

  const client = await pool.connect();
  let gameId = "";
  let firstPlayerId = "";
  try {
    await client.query("BEGIN");
    gameId = await createGameRecord(client, session.user.id, opponent.rows[0].id, gameType);
    const firstPlayer = await client.query<{ user_id: string }>(
      `SELECT user_id FROM game_players WHERE game_id = $1 AND mark = 'X'`,
      [gameId],
    );
    firstPlayerId = firstPlayer.rows[0].user_id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await sendTurnEmail(gameId, firstPlayerId, "start");
  redirect("/games");
}
