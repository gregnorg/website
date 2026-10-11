import { EMPTY_BOARD, play, winner, isDraw, type Board as TicBoard } from "./game.ts";
import { applyMove, emptyBoard, normalizeMovePayload, type Board as PushBoard } from "./pushfight.ts";
import { currentPlayerId, summarizeTurns, type GameMove, type GameStatus, type GameType } from "./game-state.ts";

export type HistoryMove = GameMove & { move_number: number };
export type HistoryGame = {
  game_type: GameType; status: GameStatus; winner_id: string | null;
  x_player_id: string; o_player_id: string; externalEnding: boolean;
};
export type HistoryFrame = { label: string } & (
  { type: "tic_tac_toe"; board: TicBoard } | { type: "pushfight"; board: PushBoard }
);

// Fail closed: never skip missing or invalid moves as the live board renderer does.
export function completeGameHistory(game: HistoryGame, moves: HistoryMove[]): HistoryFrame[] | null {
  if (!moves.length || !["active", "won", "draw", "cancelled"].includes(game.status)) return null;
  let ticBoard = [...EMPTY_BOARD] as TicBoard;
  let pushBoard = emptyBoard();
  const frames: HistoryFrame[] = [game.game_type === "tic_tac_toe"
    ? { type: "tic_tac_toe", board: ticBoard, label: "Starting board" }
    : { type: "pushfight", board: pushBoard, label: "Before setup" }];
  let boardWinner: string | null = null;
  let individualMoves = 0;
  const processed: GameMove[] = [];
  try {
    for (const [index, move] of moves.entries()) {
      if (move.move_number !== index + 1 || boardWinner) return null;
      const expectedPlayer = currentPlayerId(game.game_type, game.x_player_id, game.o_player_id, summarizeTurns(processed));
      if (move.player_id !== expectedPlayer) return null;
      const mark = move.player_id === game.x_player_id ? "X" : "O";
      if (move.mark !== mark) return null;
      const team = mark === "X" ? "White" : "Black";
      if (game.game_type === "tic_tac_toe") {
        if (move.position === null) return null;
        ticBoard = play(ticBoard, move.position, mark);
        const winningMark = winner(ticBoard);
        boardWinner = winningMark === "X" ? game.x_player_id : winningMark === "O" ? game.o_player_id : null;
        frames.push({ type: "tic_tac_toe", board: ticBoard, label: `Move ${index + 1}: ${mark} plays square ${move.position + 1}` });
      } else {
        const payload = normalizeMovePayload(move.payload);
        const setupCount = summarizeTurns(processed).setupMoveCount;
        if ((setupCount < 2) !== (payload.type === "setup")) return null;
        if (payload.type === "turn" && individualMoves !== 0) return null;
        const actions = payload.type === "turn" ? payload.actions : [payload];
        for (const [actionIndex, action] of actions.entries()) {
          if (boardWinner) return null;
          if (action.type === "move" && ++individualMoves > 2) return null;
          const result = applyMove(pushBoard, action, mark === "X" ? "white" : "black");
          pushBoard = result.board;
          boardWinner = result.winner === "white" ? game.x_player_id : result.winner === "black" ? game.o_player_id : null;
          if (action.type === "push") individualMoves = 0;
          const description = action.type === "setup" ? "sets up" : action.type === "push" ? `pushes ${action.dir}` : "moves a piece";
          frames.push({ type: "pushfight", board: pushBoard, label: `Move ${index + 1}${actions.length > 1 ? `, step ${actionIndex + 1}` : ""}: ${team} ${description}` });
        }
      }
      processed.push(move);
    }
    if (boardWinner && (game.status !== "won" || boardWinner !== game.winner_id)) return null;
    if (game.status === "won" && (!game.winner_id || (!boardWinner && !game.externalEnding))) return null;
    if (game.game_type === "tic_tac_toe" && isDraw(ticBoard) && game.status !== "draw") return null;
    return frames;
  } catch {
    return null;
  }
}
