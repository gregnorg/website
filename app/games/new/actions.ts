"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function createGame(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const username = String(formData.get("username") ?? "").trim();
  const gameType = String(formData.get("game_type") ?? "pushfight").trim();
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
  try {
    await client.query("BEGIN");
    const game = await client.query<{ id: string }>(
      `INSERT INTO games (created_by, status, game_type)
       VALUES ($1, 'active', $2)
       RETURNING id`,
      [session.user.id, gameType],
    );
    await client.query(
      `INSERT INTO game_players (game_id, user_id, mark)
       VALUES ($1, $2, 'X'), ($1, $3, 'O')`,
      [game.rows[0].id, session.user.id, opponent.rows[0].id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  redirect("/games");
}
