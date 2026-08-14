"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { Board, EMPTY_BOARD, isDraw, play, winner } from "@/lib/game";
import { applyMove, emptyBoard as pfInitialBoard, MovePayload, Direction, movesSinceLastPush, normalizeMovePayload } from "@/lib/pushfight";

export async function makeMove(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const gameId = String(formData.get("gameId") ?? "").trim();
  if (!gameId) redirect("/games?error=Missing+game+id.");

  const client = await pool.connect();
  let message = "";
  try {
    await client.query("BEGIN");
    const game = await client.query<{ status: string; game_type: string }>(
      "SELECT status, game_type FROM games WHERE id = $1 FOR UPDATE",
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

    const moves = await client.query<any>(
      `SELECT m.position, m.payload, m.player_id, gp.mark
         FROM moves m
         LEFT JOIN game_players gp
           ON gp.game_id = m.game_id AND gp.user_id = m.player_id
        WHERE m.game_id = $1
        ORDER BY m.move_number`,
      [gameId],
    );

    // Handle Tic-tac-toe as before
    if (game.rows[0].game_type === "tic_tac_toe") {
      const board = [...EMPTY_BOARD] as Board;
      for (const move of moves.rows) board[move.position] = move.mark;

      const position = Number(formData.get("position"));
      let nextBoard: Board | undefined;
      if (!message && player) {
        if (!Number.isInteger(position) || position < 0 || position > 8) {
          message = "That square is invalid.";
        } else {
          try {
            nextBoard = play(board, position, player.mark);
          } catch (error) {
            message = error instanceof Error ? error.message : "That move is not allowed.";
          }
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
      revalidatePath(`/games/${gameId}`);
      revalidatePath("/games");
      if (message) redirect(`/games/${gameId}?error=${encodeURIComponent(message)}`);
      redirect(`/games/${gameId}`);
      return;
    }

    // Handle Pushfight (simplified)
    // identify players by mark: X = white, O = black
    const playerX = players.rows.find((r) => r.mark === "X")?.user_id;
    const playerO = players.rows.find((r) => r.mark === "O")?.user_id;
    if (!playerX || !playerO) {
      message = "Game players are not set up correctly.";
    }

    const playerColor = session.user.id === playerX ? "white" : "black";

    // reconstruct board from initial setup and applied payloads
    let pfBoard = pfInitialBoard();
    for (const mv of moves.rows) {
      if (!mv.payload) continue;
      try {
        const normalizedPayload = normalizeMovePayload(mv.payload);
        const moverColor = mv.player_id === playerX ? "white" : "black";
        pfBoard = applyMove(pfBoard, normalizedPayload, moverColor).board;
      } catch (err) {
        // malformed historical move — treat as error
        message = "Corrupt game history.";
      }
    }

    const setupMoves = moves.rows.filter((mv) => mv.payload?.type === "setup");
    const setupStage = setupMoves.length < 2;

    // During setup white places first, then black. Afterwards a push ends the turn.
    let lastPushBy: string | null = null;
    for (const mv of moves.rows) {
      if (mv.payload && (mv.payload.type === "push" || mv.payload.type === "turn")) lastPushBy = mv.player_id;
    }
    const expectedPlayer = setupStage
      ? (setupMoves.length === 0 ? playerX : playerO)
      : lastPushBy === null ? playerX : (lastPushBy === playerX ? playerO : playerX);
    if (!message && session.user.id !== expectedPlayer) message = "It is not your turn.";

    let actionPayload: MovePayload | null = null;
    const actionType = String(formData.get("action_type") ?? "").trim();
    const actionPayloadRaw = String(formData.get("action_payload") ?? "").trim();
    if (!actionType) {
      message = "Missing action type.";
    } else if (!actionPayloadRaw) {
      message = "Missing action payload.";
    } else {
      try {
        const parsedPayload = JSON.parse(actionPayloadRaw);
        actionPayload = normalizeMovePayload(parsedPayload);
      } catch (err) {
        message = "Invalid action payload.";
      }

      if (actionPayload && actionPayload.type !== actionType) {
        message = "Action type and payload type must match.";
      }

      if (!message && actionType !== "move" && actionType !== "push" && actionType !== "turn" && actionType !== "setup") {
        message = "Invalid action type.";
      }
      if (!message && setupStage && actionType !== "setup") {
        message = "Both players must finish setup before moving.";
      }
      if (!message && !setupStage && actionType !== "turn") {
        message = "Submit the complete turn, ending with a push.";
      }
    }

    const movesThisTurn = movesSinceLastPush(moves.rows);
    if (!message && actionPayload?.type === "move" && movesThisTurn >= 2) {
      message = "You can only make up to two moves before pushing.";
    }
    if (!message && actionPayload?.type === "turn") {
      const stagedMoves = actionPayload.actions.filter((action) => action.type === "move").length;
      if (movesThisTurn + stagedMoves > 2) {
        message = "You can only make up to two moves before pushing.";
      }
    }

    if (message || !actionPayload) {
      await client.query("ROLLBACK");
    } else {
      try {
        const result = applyMove(pfBoard, actionPayload, playerColor);
        await client.query(
          `INSERT INTO moves (game_id, player_id, payload, move_number)
           VALUES ($1, $2, $3, $4)`,
          [gameId, session.user.id, actionPayload, moves.rows.length + 1],
        );
        if (result.winner) {
          await client.query(
            `UPDATE games SET status = 'won', winner_id = $2, updated_at = now() WHERE id = $1`,
            [gameId, result.winner === "white" ? playerX : playerO],
          );
        } else {
          await client.query("UPDATE games SET updated_at = now() WHERE id = $1", [gameId]);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        message = err instanceof Error ? err.message : "That action is not allowed.";
      }
    }
    revalidatePath(`/games/${gameId}`);
    revalidatePath("/games");
    if (message) redirect(`/games/${gameId}?error=${encodeURIComponent(message)}`);
    redirect(`/games/${gameId}`);
    return;
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
