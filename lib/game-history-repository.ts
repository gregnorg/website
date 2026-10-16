import { pool } from "./db.ts";
import { completeGameHistory, type HistoryGame, type HistoryMove } from "./game-history.ts";

export async function loadGameHistory(id: string) {
  const result = await pool.query<HistoryGame & { id: string; game_number: string; white_name: string; black_name: string }>(
    `SELECT g.id, g.game_number, g.game_type, g.status, g.winner_id,
            w.user_id AS x_player_id, b.user_id AS o_player_id,
            wu.username AS white_name, bu.username AS black_name,
            (g.resigned_by_id IS NOT NULL OR g.idle_expired OR
             (g.time_control_seconds IS NOT NULL AND (w.time_remaining_ms = 0 OR b.time_remaining_ms = 0))) AS "externalEnding"
       FROM games g
       JOIN game_players w ON w.game_id = g.id AND w.mark = 'X'
       JOIN game_players b ON b.game_id = g.id AND b.mark = 'O'
       JOIN "user" wu ON wu.id = w.user_id
       JOIN "user" bu ON bu.id = b.user_id
      WHERE (g.id::text = $1 OR g.game_number::text = $1) AND (NOT g.idle_expired OR g.status = 'won')`, [id],
  );
  const game = result.rows[0];
  if (!game) return null;
  const moves = await pool.query<HistoryMove>(
    `SELECT m.move_number, m.position, m.payload, m.player_id, gp.mark FROM moves m
     LEFT JOIN game_players gp ON gp.game_id = m.game_id AND gp.user_id = m.player_id
     WHERE m.game_id = $1 ORDER BY m.move_number`, [game.id],
  );
  const frames = completeGameHistory(game, moves.rows);
  if (!frames) return null;
  return { game, frames };
}
