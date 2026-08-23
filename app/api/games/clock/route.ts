import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { currentPlayerId, isSetupPhase, summarizeTurns, type GameMove, type GameType } from "@/lib/game-state";
import { transferChampionship } from "@/lib/championship";
import { sendGameEndedEmail } from "@/lib/turn-email";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { gameId?: unknown; elapsedMs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const elapsedMs = Math.round(Number(body.elapsedMs));
  if (!gameId || !Number.isFinite(elapsedMs) || elapsedMs < 1 || elapsedMs > 15_000) {
    return NextResponse.json({ error: "Invalid clock update" }, { status: 400 });
  }

  const client = await pool.connect();
  let timedOut = false;
  let remainingMs = 0;
  try {
    await client.query("BEGIN");
    const gameResult = await client.query<{
      status: string;
      game_type: GameType;
      time_control_seconds: number | null;
      x_player_id: string;
      o_player_id: string;
    }>(
      `SELECT g.status, g.game_type, g.time_control_seconds,
              xplayer.user_id AS x_player_id, oplayer.user_id AS o_player_id
         FROM games g
         JOIN game_players me ON me.game_id = g.id AND me.user_id = $2
         JOIN game_players xplayer ON xplayer.game_id = g.id AND xplayer.mark = 'X'
         JOIN game_players oplayer ON oplayer.game_id = g.id AND oplayer.mark = 'O'
        WHERE g.id = $1
        FOR UPDATE OF g`,
      [gameId, session.user.id],
    );
    const game = gameResult.rows[0];
    if (!game || game.status !== "active" || game.time_control_seconds === null) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Clock is not active" }, { status: 409 });
    }

    const moves = await client.query<GameMove>(
      `SELECT m.position, m.payload, m.player_id, gp.mark
         FROM moves m
         LEFT JOIN game_players gp ON gp.game_id = m.game_id AND gp.user_id = m.player_id
        WHERE m.game_id = $1
        ORDER BY m.move_number`,
      [gameId],
    );
    const turnSummary = summarizeTurns(moves.rows);
    if (isSetupPhase(game.game_type, turnSummary)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Clocks are paused during setup" }, { status: 409 });
    }
    const activePlayerId = currentPlayerId(
      game.game_type,
      game.x_player_id,
      game.o_player_id,
      turnSummary,
    );
    if (activePlayerId !== session.user.id) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "It is not your turn" }, { status: 409 });
    }

    const clockResult = await client.query<{ time_remaining_ms: string }>(
      `UPDATE game_players
          SET time_remaining_ms = GREATEST(0, time_remaining_ms - $3)
        WHERE game_id = $1 AND user_id = $2 AND time_remaining_ms IS NOT NULL
      RETURNING time_remaining_ms`,
      [gameId, session.user.id, elapsedMs],
    );
    if (!clockResult.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Clock is unavailable" }, { status: 409 });
    }
    remainingMs = Number(clockResult.rows[0].time_remaining_ms);

    if (remainingMs === 0) {
      const winnerId = session.user.id === game.x_player_id ? game.o_player_id : game.x_player_id;
      await client.query(
        `UPDATE games SET status = 'won', winner_id = $2, updated_at = now()
          WHERE id = $1 AND status = 'active'`,
        [gameId, winnerId],
      );
      await transferChampionship(client, winnerId, session.user.id);
      timedOut = true;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (timedOut) await sendGameEndedEmail(gameId, `clock-${session.user.id}`);
  return NextResponse.json({ remainingMs, timedOut });
}
