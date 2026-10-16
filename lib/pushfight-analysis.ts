import { isValidCoord, type Board } from "./pushfight.ts";

export type Team = "white" | "black";
export type SolverPosition = { permutation: string; sourceUrl: string };
const analyzerUrl = "https://pushfight.verver.ch/";

// Matches Maks Verver's FIELD_INDEX, read from the top row left to right.
// The API always treats o/O as the next player and Y as the opponent's anchor.
export function solverPosition(board: Board, nextPlayer: Team): SolverPosition | null {
  if (board.length !== 4 || board.some(row => row.length !== 8)) return null;
  let permutation = "";
  let displayPermutation = "";
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = board[row][col];
      if (!isValidCoord({ row, col })) {
        if (cell !== "invalid") return null;
        continue;
      }
      if (cell === "empty") {
        permutation += ".";
        displayPermutation += ".";
        continue;
      }
      if (cell === "invalid") return null;
      const team = cell.startsWith("white-") ? "white" : "black";
      const anchored = cell.endsWith("-anchor");
      if (anchored && team === nextPlayer) return null;
      const round = cell.endsWith("-nonpusher");
      permutation += anchored ? "Y" : team === nextPlayer ? (round ? "o" : "O") : (round ? "x" : "X");
      displayPermutation += team === "white" ? (anchored ? "P" : round ? "o" : "O") : (anchored ? "Y" : round ? "x" : "X");
    }
  }
  // Exclude setup, unfinished placement, and terminal boards with missing pieces.
  const count = (char: string) => [...permutation].filter(cell => cell === char).length;
  if (count(".") !== 16 || count("o") !== 2 || count("O") !== 3 ||
      count("x") !== 2 || count("X") !== 2 || count("Y") !== 1) return null;
  return { permutation, sourceUrl: `${analyzerUrl}#history=${displayPermutation}` };
}

// Upstream lookup-min.cc: W2 = player, opponent, player wins;
// L2 = player, opponent, player, opponent wins.
export function solverVerdict(status: unknown, nextPlayer: Team): string | null {
  if (status === "T") return "Draw with perfect play";
  if (typeof status !== "string" || !/^(W[1-9]\d*|L(?:0|[1-9]\d*))$/.test(status)) return null;
  const turns = Number(status.slice(1));
  if (!Number.isSafeInteger(turns)) return null;
  const winner = status.startsWith("W") ? nextPlayer : nextPlayer === "white" ? "black" : "white";
  return `${winner === "white" ? "White" : "Black"} wins in ${turns} ${turns === 1 ? "turn" : "turns"}`;
}
