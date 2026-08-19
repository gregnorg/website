import { pool } from "@/lib/db";
import { currentPlayerId, type GameType } from "@/lib/game-state";

export async function gamesWaitingForMove(userId: string) {
  const result = await pool.query<{
    game_type: GameType;
    x_player_id: string;
    o_player_id: string;
    move_count: number;
    setup_move_count: number;
    last_turn_player_id: string | null;
  }>(
    `SELECT g.game_type, xplayer.user_id AS x_player_id, oplayer.user_id AS o_player_id,
            COUNT(m.id)::int AS move_count,
            COUNT(m.id) FILTER (WHERE m.payload->>'type' = 'setup')::int AS setup_move_count,
            (ARRAY_AGG(m.player_id ORDER BY m.move_number DESC)
              FILTER (WHERE m.payload->>'type' IN ('push', 'turn')))[1] AS last_turn_player_id
       FROM games g
       JOIN game_players me ON me.game_id = g.id AND me.user_id = $1
       JOIN game_players xplayer ON xplayer.game_id = g.id AND xplayer.mark = 'X'
       JOIN game_players oplayer ON oplayer.game_id = g.id AND oplayer.mark = 'O'
       LEFT JOIN moves m ON m.game_id = g.id
      WHERE g.status = 'active' AND me.cleared_at IS NULL
      GROUP BY g.id, xplayer.user_id, oplayer.user_id`,
    [userId],
  );

  return result.rows.filter((game) => currentPlayerId(
    game.game_type,
    game.x_player_id,
    game.o_player_id,
    {
      moveCount: game.move_count,
      setupMoveCount: game.setup_move_count,
      lastTurnPlayerId: game.last_turn_player_id,
    },
  ) === userId).length;
}
