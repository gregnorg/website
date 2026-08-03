"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { Board, EMPTY_BOARD, isDraw, play, winner } from "@/lib/game";

export async function makeMove(gameId: string, formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const position = Number(formData.get("position"));
  if (!Number.isInteger(position) || position < 0 || position > 8) {
    redirect(`/games/${gameId}?error=That+square+is+invalid.`);
  }

  const client = await pool.connect();
  let message = "";
  try {
    await client.query("BEGIN");
    const game = await client.query<{ status: string }>(
      "SELECT status FROM games WHERE id = $1 FOR UPDATE",
      [gameId],
    );
    if (!game.rowCount) {
      message = "That game does not exist.";
    } else if (game.rows[0].status !== "active") {
      message = "This game is already finished.";
    }

    const players = await client.query<{ user_id: string; mark: "X" | "O" }>(
      "SELECT user_id, mark FROM game_players WHERE game_id = $1",
      [gameId],
    );
    const player = players.rows.find((row) => row.user_id === session.user.id);
    if (!message && !player) message = "You are not a player in this game.";

    const moves = await client.query<{ position: number; mark: "X" | "O" }>(
      `SELECT m.position, gp.mark
         FROM moves m
         JOIN game_players gp
           ON gp.game_id = m.game_id AND gp.user_id = m.player_id
        WHERE m.game_id = $1
        ORDER BY m.move_number`,
      [gameId],
    );
    const board = [...EMPTY_BOARD] as Board;
    for (const move of moves.rows) board[move.position] = move.mark;

    let nextBoard: Board | undefined;
    if (!message && player) {
      try {
        nextBoard = play(board, position, player.mark);
      } catch (error) {
        message = error instanceof Error ? error.message : "That move is not allowed.";
      }
    }

    if (message || !player || !nextBoard) {
      await client.query("ROLLBACK");
    } else {
      await client.query(
        `INSERT INTO moves (game_id, player_id, position, move_number)
         VALUES ($1, $2, $3, $4)`,
        [gameId, session.user.id, position, moves.rows.length + 1],
      );

      const winningMark = winner(nextBoard);
      if (winningMark) {
        await client.query(
          `UPDATE games
              SET status = 'won', winner_id = $2, updated_at = now()
            WHERE id = $1`,
          [gameId, session.user.id],
        );
      } else if (isDraw(nextBoard)) {
        await client.query(
          `UPDATE games SET status = 'draw', updated_at = now() WHERE id = $1`,
          [gameId],
        );
      } else {
        await client.query(
          "UPDATE games SET updated_at = now() WHERE id = $1",
          [gameId],
        );
      }
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  revalidatePath(`/games/${gameId}`);
  revalidatePath("/games");
  if (message) redirect(`/games/${gameId}?error=${encodeURIComponent(message)}`);
  redirect(`/games/${gameId}`);
}
