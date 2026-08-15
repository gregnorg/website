import type { MovePayload } from "./pushfight.ts";

export type GameType = "tic_tac_toe" | "pushfight";
export type GameStatus = "waiting" | "active" | "won" | "draw" | "cancelled";
export type PlayerMark = "X" | "O";

export type GameMove = {
  player_id: string;
  position: number | null;
  payload: MovePayload | null;
  mark: PlayerMark | null;
};

export type TurnSummary = {
  moveCount: number;
  setupMoveCount: number;
  lastTurnPlayerId: string | null;
};

export function summarizeTurns(moves: ReadonlyArray<Pick<GameMove, "player_id" | "payload">>): TurnSummary {
  let setupMoveCount = 0;
  let lastTurnPlayerId: string | null = null;

  for (const move of moves) {
    if (move.payload?.type === "setup") setupMoveCount += 1;
    if (move.payload?.type === "push" || move.payload?.type === "turn") {
      lastTurnPlayerId = move.player_id;
    }
  }

  return { moveCount: moves.length, setupMoveCount, lastTurnPlayerId };
}

export function currentPlayerId(
  gameType: GameType,
  xPlayerId: string,
  oPlayerId: string,
  summary: TurnSummary,
): string {
  if (gameType === "tic_tac_toe") {
    return summary.moveCount % 2 === 0 ? xPlayerId : oPlayerId;
  }
  if (summary.setupMoveCount < 2) {
    return summary.setupMoveCount === 0 ? xPlayerId : oPlayerId;
  }
  if (summary.lastTurnPlayerId === null) return xPlayerId;
  return summary.lastTurnPlayerId === xPlayerId ? oPlayerId : xPlayerId;
}

export function isSetupPhase(gameType: GameType, summary: TurnSummary): boolean {
  return gameType === "pushfight" && summary.setupMoveCount < 2;
}
