import type { PoolClient } from "pg";
import type { HistoryMove } from "./game-history.ts";

export async function loadGameMoves(db: Pick<PoolClient, "query">, gameId: string): Promise<HistoryMove[]> {
  return (await db.query<HistoryMove>(
    `SELECT m.move_number,m.position,m.payload,m.player_id,gp.mark FROM moves m
     LEFT JOIN game_players gp ON gp.game_id=m.game_id AND gp.user_id=m.player_id
     WHERE m.game_id=$1 ORDER BY m.move_number`, [gameId],
  )).rows;
}
