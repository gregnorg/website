import type { PoolClient } from "pg";
import { randomInt } from "node:crypto";
import type { GameStatus, GameType, PlayerMark } from "./game-state.ts";

export type MoveGame = {
  status: GameStatus;
  game_type: GameType;
  my_mark: PlayerMark;
};

export async function getMoveGameForPlayer(
  client: PoolClient,
  gameId: string,
  playerId: string,
): Promise<MoveGame | null> {
  const result = await client.query<MoveGame>(
    `SELECT g.status, g.game_type, me.mark AS my_mark
       FROM games AS g
       JOIN game_players AS me
         ON me.game_id = g.id AND me.user_id = $2
      WHERE g.id = $1
      FOR UPDATE OF g`,
    [gameId, playerId],
  );
  return result.rows[0] ?? null;
}

export async function createGameRecord(
  client: PoolClient,
  creatorId: string,
  opponentId: string,
  gameType: GameType,
  creatorMark: PlayerMark = randomInt(2) === 0 ? "X" : "O",
): Promise<string> {
  const game = await client.query<{ id: string }>(
    `INSERT INTO games (created_by, status, game_type)
     VALUES ($1, 'active', $2)
     RETURNING id`,
    [creatorId, gameType],
  );
  const gameId = game.rows[0].id;
  const opponentMark: PlayerMark = creatorMark === "X" ? "O" : "X";
  await client.query(
    `INSERT INTO game_players (game_id, user_id, mark)
     VALUES ($1, $2, $3), ($1, $4, $5)`,
    [gameId, creatorId, creatorMark, opponentId, opponentMark],
  );
  return gameId;
}

export async function clearFinishedGameForPlayer(
  client: PoolClient,
  gameId: string,
  playerId: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE game_players AS gp
        SET cleared_at = now()
       FROM games AS g
      WHERE gp.game_id = g.id
        AND gp.game_id = $1
        AND gp.user_id = $2
        AND g.status IN ('won', 'draw', 'cancelled')`,
    [gameId, playerId],
  );
  return result.rowCount === 1;
}

export async function resignGameForPlayer(
  client: PoolClient,
  gameId: string,
  playerId: string,
): Promise<boolean> {
  const result = await client.query(
    `UPDATE games AS g
        SET status = 'won', winner_id = opponent.user_id, updated_at = now()
       FROM game_players AS me
       JOIN game_players AS opponent
         ON opponent.game_id = me.game_id AND opponent.user_id <> me.user_id
      WHERE g.id = me.game_id
        AND g.id = $1
        AND me.user_id = $2
        AND g.status = 'active'`,
    [gameId, playerId],
  );
  return result.rowCount === 1;
}
