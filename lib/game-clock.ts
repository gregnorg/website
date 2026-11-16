import type { PoolClient } from "pg";
import { pool } from "./db.ts";
import { transferChampionship } from "./championship.ts";
import { currentPlayerId, isSetupPhase, summarizeTurns, type GameMove, type GameType } from "./game-state.ts";
import { tournamentRemaining } from "./tournament-bracket.ts";

// Caller owns the transaction. Browser-reported elapsed time is never used.
export async function settleGameClock(client: PoolClient, gameId: string, finishTurn = false) {
  const game = (await client.query<{
    status: string; game_type: GameType; time_control_seconds: number | null;
    clock_started_at: Date | null; server_now: Date;
  }>(`SELECT status,game_type,time_control_seconds,clock_started_at,clock_timestamp() server_now
      FROM games WHERE id=$1 AND tournament_id IS NULL FOR UPDATE`, [gameId])).rows[0];
  if (!game || game.status !== "active" || game.time_control_seconds === null) return false;
  const players = (await client.query<{ user_id: string; mark: string; time_remaining_ms: string }>(
    "SELECT user_id,mark,time_remaining_ms FROM game_players WHERE game_id=$1", [gameId])).rows;
  const moves = (await client.query<GameMove>("SELECT player_id,payload FROM moves WHERE game_id=$1 ORDER BY move_number", [gameId])).rows;
  const summary = summarizeTurns(moves);
  if (isSetupPhase(game.game_type, summary)) return false;
  const x = players.find(p => p.mark === "X")!;
  const o = players.find(p => p.mark === "O")!;
  const active = currentPlayerId(game.game_type, x.user_id, o.user_id, summary);
  const player = players.find(p => p.user_id === active)!;
  const remaining = tournamentRemaining(Number(player.time_remaining_ms), game.clock_started_at, game.server_now.getTime(), 10);
  if (remaining === 0 || finishTurn) {
    await client.query("UPDATE game_players SET time_remaining_ms=$3 WHERE game_id=$1 AND user_id=$2", [gameId, active, remaining]);
    await client.query("UPDATE games SET clock_started_at=NULL,clock_expires_at=NULL WHERE id=$1", [gameId]);
  }
  if (remaining === 0) {
    const winner = active === x.user_id ? o.user_id : x.user_id;
    await client.query(`UPDATE games SET status='won',winner_id=$2,draw_offered_by_id=NULL,draw_offer_id=NULL,updated_at=clock_timestamp() WHERE id=$1`, [gameId, winner]);
    await transferChampionship(client, winner, active);
    return true;
  }
  if (!game.clock_started_at && !finishTurn) {
    await client.query(`UPDATE games SET clock_started_at=$2,
      clock_expires_at=$2::timestamptz+($3 * interval '1 millisecond') WHERE id=$1`, [gameId, game.server_now, remaining + 10000]);
  }
  return false;
}

export async function maintainGameClocks() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const due = await client.query<{ id: string }>(`SELECT id FROM games
      WHERE status='active' AND tournament_id IS NULL AND clock_expires_at<=clock_timestamp()
      ORDER BY clock_expires_at LIMIT 50 FOR UPDATE SKIP LOCKED`);
    let expired = 0;
    for (const game of due.rows) if (await settleGameClock(client, game.id)) expired++;
    await client.query("COMMIT");
    return expired;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
