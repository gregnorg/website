import type { PoolClient } from "pg";
import { applyMove, emptyBoard, isValidCoord, normalizeMovePayload, type Board } from "./pushfight.ts";
import { currentPlayerId, isSetupPhase, summarizeTurns, type GameMove } from "./game-state.ts";
import { lockTournamentGame } from "./tournaments.ts";

export class PreviewError extends Error {}

// Rebuild every preview from the committed position. Clients cannot supply a board,
// change clocks, finish a game, or advance a bracket through this path.
export function previewBoard(board: Board, value: unknown, setup: boolean, color: "white" | "black"): Board {
  if (!value || typeof value !== "object") throw new PreviewError("Invalid preview.");
  const draft = value as { type?: unknown; pieces?: unknown; actions?: unknown };
  if (setup) {
    const payload = normalizeMovePayload(draft);
    if (payload.type !== "setup" || payload.pieces.length > 5) throw new PreviewError("Invalid setup preview.");
    const result = board.map(row => [...row]);
    for (const [index, piece] of payload.pieces.entries()) {
      if (!isValidCoord(piece) || !Number.isInteger(piece.row) || !Number.isInteger(piece.col)
        || (color === "white" ? piece.col >= 4 : piece.col <= 3)
        || result[piece.row][piece.col] !== "empty"
        || piece.kind !== (index < 3 ? "pusher" : "nonpusher")) throw new PreviewError("Invalid setup preview.");
      result[piece.row][piece.col] = `${color}-${piece.kind}`;
    }
    return result;
  }
  if (draft.type !== "turn" || !Array.isArray(draft.actions) || draft.actions.length > 3) throw new PreviewError("Invalid turn preview.");
  let result = board;
  let moves = 0;
  let pushed = false;
  for (const value of draft.actions) {
    const action = normalizeMovePayload(value);
    if (pushed || (action.type !== "move" && action.type !== "push")) throw new PreviewError("Invalid turn preview.");
    if (action.type === "move" && ++moves > 2) throw new PreviewError("Only two moves are allowed before pushing.");
    if (action.type === "push") pushed = true;
    result = applyMove(result, action, color).board;
  }
  return result;
}

export async function saveTournamentPreview(client: PoolClient, gameId: string, userId: string, baseMoveCount: number, draft: unknown) {
  if (!await lockTournamentGame(client, gameId)) throw new PreviewError("This is not a live tournament game.");
  const game = (await client.query<{ status: string; x: string; o: string }>(
    `SELECT g.status, x.user_id x, o.user_id o FROM games g
     JOIN game_players x ON x.game_id=g.id AND x.mark='X'
     JOIN game_players o ON o.game_id=g.id AND o.mark='O'
     WHERE g.id=$1 FOR UPDATE OF g`, [gameId])).rows[0];
  if (!game || game.status !== "active" || (userId !== game.x && userId !== game.o)) throw new PreviewError("Preview is not available.");
  const moves = (await client.query<GameMove>("SELECT player_id,payload FROM moves WHERE game_id=$1 ORDER BY move_number", [gameId])).rows;
  const summary = summarizeTurns(moves);
  if (moves.length !== baseMoveCount || currentPlayerId("pushfight", game.x, game.o, summary) !== userId) throw new PreviewError("The turn has changed.");
  let board = emptyBoard();
  for (const move of moves) if (move.payload) board = applyMove(board, normalizeMovePayload(move.payload), move.player_id === game.x ? "white" : "black").board;
  const preview = previewBoard(board, draft, isSetupPhase("pushfight", summary), userId === game.x ? "white" : "black");
  await client.query("INSERT INTO tournament_move_previews(game_id,base_move_count,board) VALUES($1,$2,$3)", [gameId, baseMoveCount, JSON.stringify(preview)]);
}
