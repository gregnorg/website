export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell];

export const EMPTY_BOARD: Board = [null, null, null, null, null, null, null, null, null];

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export function winner(board: Board): Mark | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

export function isDraw(board: Board): boolean {
  return !winner(board) && board.every(Boolean);
}

export function currentMark(board: Board): Mark {
  const xCount = board.filter((cell) => cell === "X").length;
  const oCount = board.filter((cell) => cell === "O").length;
  return xCount === oCount ? "X" : "O";
}

export function play(board: Board, position: number, mark: Mark): Board {
  if (!Number.isInteger(position) || position < 0 || position > 8) throw new Error("Invalid position");
  if (winner(board) || isDraw(board)) throw new Error("This game is finished");
  if (board[position]) throw new Error("That square is occupied");
  if (currentMark(board) !== mark) throw new Error("It is not that player's turn");

  const next = [...board] as Board;
  next[position] = mark;
  return next;
}
