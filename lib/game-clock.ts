import type { PoolClient } from "pg";
import { loadGameMoves } from "./game-moves.ts";
import { transferChampionship } from "./championship.ts";
import { currentPlayerId, isSetupPhase, summarizeTurns, type GameType } from "./game-state.ts";

type ClockSample = { userId: string; moveCount: number; elapsedMs: number };

// The caller owns the transaction. Only a sample from the player on turn can
// spend time. Finishing a turn resets the delay for the next player.
export async function settleGameClock(client: PoolClient, gameId: string, sample: ClockSample) {
  const game = (await client.query<{
    status: string; game_type: GameType; time_control_seconds: number | null;
    clock_delay_remaining_ms: number; clock_started_at: Date | null; server_now: Date;
  }>(`WITH locked_game AS (
        SELECT status,game_type,time_control_seconds,clock_delay_remaining_ms,clock_started_at
        FROM games WHERE id=$1 AND tournament_id IS NULL FOR UPDATE
      )
      SELECT *,clock_timestamp() server_now FROM locked_game`, [gameId])).rows[0];
  if (!game || game.status !== "active" || game.time_control_seconds === null) return false;

  const summary = summarizeTurns(await loadGameMoves(client, gameId));
  if (summary.moveCount !== sample.moveCount || isSetupPhase(game.game_type, summary)) return false;
  const players = (await client.query<{ user_id: string; mark: string; time_remaining_ms: string }>(
    "SELECT user_id,mark,time_remaining_ms FROM game_players WHERE game_id=$1", [gameId])).rows;
  const x = players.find(p => p.mark === "X")!;
  const o = players.find(p => p.mark === "O")!;
  const active = currentPlayerId(game.game_type, x.user_id, o.user_id, summary);
  if (active !== sample.userId) return false;

  // For ordinary games clock_started_at records the last sample's receipt.
  // Bound reported time by that interval so simultaneous tabs cannot stack it.
  const sinceLastSample = game.clock_started_at
    ? Math.max(0, game.server_now.getTime() - game.clock_started_at.getTime())
    : sample.elapsedMs;
  const elapsed = Math.min(sample.elapsedMs, sinceLastSample);
  const delay = Math.max(0, game.clock_delay_remaining_ms - elapsed);
  const player = active === x.user_id ? x : o;
  const remaining = Math.max(0, Number(player.time_remaining_ms) - Math.max(0, elapsed - game.clock_delay_remaining_ms));
  await client.query("UPDATE games SET clock_delay_remaining_ms=$2,clock_started_at=$3 WHERE id=$1",
    [gameId, delay, game.server_now]);
  if (remaining !== Number(player.time_remaining_ms)) {
    await client.query("UPDATE game_players SET time_remaining_ms=$3 WHERE game_id=$1 AND user_id=$2", [gameId, active, remaining]);
  }
  if (remaining > 0) return false;

  const winner = active === x.user_id ? o.user_id : x.user_id;
  await client.query(`UPDATE games SET status='won',winner_id=$2,draw_offered_by_id=NULL,draw_offer_id=NULL,updated_at=clock_timestamp() WHERE id=$1`, [gameId, winner]);
  await transferChampionship(client, winner, active);
  return true;
}

export async function resetGameClockDelay(client: PoolClient, gameId: string) {
  await client.query(`UPDATE games SET clock_delay_remaining_ms=DEFAULT,clock_started_at=NULL
    WHERE id=$1 AND tournament_id IS NULL AND time_control_seconds IS NOT NULL`, [gameId]);
}
