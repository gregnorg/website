export type PushfightCell =
  | "invalid"
  | "empty"
  | "black-pusher"
  | "black-nonpusher"
  | "black-pusher-anchor"
  | "white-pusher"
  | "white-nonpusher"
  | "white-pusher-anchor";

export type Coord = {
  row: number;
  col: number;
};

export type Board = PushfightCell[][];

export type SetupPiece = {
  row: number;
  col: number;
  kind: "pusher" | "nonpusher";
};

export type SetupPayload = {
  type: "setup";
  pieces: SetupPiece[];
};

export type Direction = "up" | "down" | "left" | "right";
export type MovePayload =
  | { type: "move"; from: Coord; to: Coord }
  | { type: "push"; index: Coord; dir: Direction }
  | SetupPayload;

export type LegacyMovePayload =
  | { type: "move"; from: number; to: number }
  | { type: "push"; index: number; dir: Direction }
  | { type: "setup"; pieces: Array<SetupPiece | { index: number; kind: "pusher" | "nonpusher" }> };

export function normalizeMovePayload(payload: unknown): MovePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid move payload.");
  }

  const typed = payload as { type?: unknown };
  if (typed.type === "move") {
    const movePayload = payload as LegacyMovePayload | MovePayload;
    if (typeof (movePayload as any).from === "number" && typeof (movePayload as any).to === "number") {
      return {
        type: "move",
        from: indexToCoord((movePayload as any).from),
        to: indexToCoord((movePayload as any).to),
      };
    }
    if (
      typeof (movePayload as any).from === "object" &&
      typeof (movePayload as any).from?.row === "number" &&
      typeof (movePayload as any).from?.col === "number" &&
      typeof (movePayload as any).to === "object" &&
      typeof (movePayload as any).to?.row === "number" &&
      typeof (movePayload as any).to?.col === "number"
    ) {
      return movePayload as MovePayload;
    }
    throw new Error("Invalid move payload.");
  }

  if (typed.type === "push") {
    const pushPayload = payload as LegacyMovePayload | MovePayload;
    if (typeof (pushPayload as any).index === "number") {
      return {
        type: "push",
        index: indexToCoord((pushPayload as any).index),
        dir: (pushPayload as any).dir,
      };
    }
    if (
      typeof (pushPayload as any).index === "object" &&
      typeof (pushPayload as any).index?.row === "number" &&
      typeof (pushPayload as any).index?.col === "number"
    ) {
      return pushPayload as MovePayload;
    }
    throw new Error("Invalid push payload.");
  }

  if (typed.type === "setup") {
    const setupPayload = payload as any;
    if (!Array.isArray(setupPayload.pieces)) {
      throw new Error("Invalid setup payload.");
    }
    const normalizedPieces = (setupPayload.pieces as any[]).map((piece: any) => {
      if (typeof (piece as any).index === "number") {
        return {
          row: indexToCoord((piece as any).index).row,
          col: indexToCoord((piece as any).index).col,
          kind: (piece as any).kind,
        };
      }
      if (
        typeof (piece as any).row === "number" &&
        typeof (piece as any).col === "number"
      ) {
        return piece as SetupPiece;
      }
      throw new Error("Invalid setup piece.");
    });
    return { type: "setup", pieces: normalizedPieces };
  }

  throw new Error("Invalid action type.");
}

const VALID_CELL_MASK: boolean[][] = [
  [false, false, true, true, true, true, true, false],
  [true, true, true, true, true, true, true, true],
  [true, true, true, true, true, true, true, true],
  [false, true, true, true, true, true, false, false],
];

export function isValidCell(index: number) {
  const { row, col } = indexToCoord(index);
  return VALID_CELL_MASK[row]?.[col] ?? false;
}

export function isValidCoord(coord: Coord) {
  return VALID_CELL_MASK[coord.row]?.[coord.col] ?? false;
}

export function emptyBoard(): Board {
  return VALID_CELL_MASK.map((row) => row.map((valid) => (valid ? "empty" : "invalid")));
}

export function indexToCoord(index: number): Coord {
  return { row: Math.floor(index / 8), col: index % 8 };
}

export function coordToIndex(coord: Coord) {
  return coord.row * 8 + coord.col;
}

function inBounds(coord: Coord) {
  return coord.row >= 0 && coord.row < 4 && coord.col >= 0 && coord.col < 8;
}

function neighbor(coord: Coord, dir: Direction) {
  if (dir === "left") return coord.col > 0 ? { row: coord.row, col: coord.col - 1 } : null;
  if (dir === "right") return coord.col < 7 ? { row: coord.row, col: coord.col + 1 } : null;
  if (dir === "up") return coord.row > 0 ? { row: coord.row - 1, col: coord.col } : null;
  return coord.row < 3 ? { row: coord.row + 1, col: coord.col } : null;
}

function cellColor(cell: PushfightCell) {
  if (cell.startsWith("white")) return "white";
  if (cell.startsWith("black")) return "black";
  return null;
}

function isPusherCell(cell: PushfightCell) {
  return cell === "white-pusher" || cell === "black-pusher";
}

function isAnchorCell(cell: PushfightCell) {
  return cell === "white-pusher-anchor" || cell === "black-pusher-anchor";
}

function isOccupiedCell(cell: PushfightCell) {
  return cell !== "empty" && cell !== "invalid";
}

export function applyMove(board: Board, payload: MovePayload, playerColor: "white" | "black"): { board: Board; winner?: string } {
  const next = board.map((row) => row.slice()) as Board;

  if (payload.type === "move") {
    const { from, to } = payload;
    if (!inBounds(from) || !inBounds(to)) throw new Error("Out of bounds");
    const piece = next[from.row][from.col];
    if (piece === "invalid" || piece === "empty") throw new Error("No piece at 'from'");
    if (cellColor(piece) !== playerColor) throw new Error("Not your piece");
    if (next[to.row][to.col] !== "empty") throw new Error("Destination not empty");

    const visited = new Set<string>();
    const queue = [from];
    visited.add(`${from.row},${from.col}`);
    let reachable = false;
    while (queue.length) {
      const current = queue.shift()!;
      if (current.row === to.row && current.col === to.col) {
        reachable = true;
        break;
      }
      for (const dir of ["left", "right", "up", "down"] as Direction[]) {
        const nextPos = neighbor(current, dir);
        if (!nextPos) continue;
        const key = `${nextPos.row},${nextPos.col}`;
        if (visited.has(key)) continue;
        if (!isValidCoord(nextPos)) continue;
        if (next[nextPos.row][nextPos.col] === "empty") {
          visited.add(key);
          queue.push(nextPos);
        }
      }
    }

    if (!reachable) throw new Error("Destination not reachable by sliding");
    next[to.row][to.col] = piece;
    next[from.row][from.col] = "empty";
    return { board: next };
  }

  if (payload.type === "push") {
    const { index, dir } = payload;
    if (!inBounds(index)) throw new Error("Out of bounds");
    const pusher = next[index.row][index.col];
    if (pusher === "invalid" || pusher === "empty") throw new Error("No pusher piece");
    if (cellColor(pusher) !== playerColor) throw new Error("Not your piece");
    if (!isPusherCell(pusher)) throw new Error("Only pushers can push");

    const first = neighbor(index, dir);
    if (!first) throw new Error("Cannot push off that edge");
    if (!isOccupiedCell(next[first.row][first.col])) throw new Error("Nothing to push");

    const line: Coord[] = [];
    let current: Coord | null = first;
    while (current) {
      const currentCell = next[current.row][current.col];
      if (currentCell === "invalid") throw new Error("Line contains invalid cell");
      if (!isOccupiedCell(currentCell)) break;
      if (isAnchorCell(currentCell)) throw new Error("Line contains anchor");
      line.push(current);
      current = neighbor(current, dir);
    }

    const offBoard = current === null;
    const lastPos = line[line.length - 1];
    const lastPiece = next[lastPos.row][lastPos.col];

    for (let i = line.length - 1; i >= 0; i -= 1) {
      const fromPos = line[i];
      const toPos = neighbor(fromPos, dir);
      if (!toPos) {
        next[fromPos.row][fromPos.col] = "empty";
        continue;
      }
      next[toPos.row][toPos.col] = next[fromPos.row][fromPos.col];
      next[fromPos.row][fromPos.col] = "empty";
    }

    next[index.row][index.col] = playerColor === "white" ? "white-pusher-anchor" : "black-pusher-anchor";

    if (offBoard && lastPiece !== "empty" && lastPiece !== "invalid" && cellColor(lastPiece) !== playerColor) {
      return { board: next, winner: playerColor };
    }
    return { board: next };
  }

  if (payload.type === "setup") {
    if (!Array.isArray(payload.pieces) || payload.pieces.length !== 5) {
      throw new Error("Setup must place exactly 3 pushers and 2 non-pushers.");
    }

    const seen = new Set<string>();
    let pusherCount = 0;
    let nonpusherCount = 0;

    for (const piece of payload.pieces) {
      if (!Number.isInteger(piece.row) || !Number.isInteger(piece.col)) {
        throw new Error("Invalid setup coordinate.");
      }
      if (!inBounds({ row: piece.row, col: piece.col }) || !isValidCoord({ row: piece.row, col: piece.col })) {
        throw new Error("Setup pieces must be placed on valid board cells.");
      }
      const key = `${piece.row},${piece.col}`;
      if (seen.has(key)) throw new Error("Setup pieces must occupy distinct cells.");
      if (next[piece.row][piece.col] !== "empty") throw new Error("Setup square is already occupied.");
      if (piece.kind === "pusher") pusherCount += 1;
      else if (piece.kind === "nonpusher") nonpusherCount += 1;
      else throw new Error("Invalid setup piece type.");
      seen.add(key);
    }

    if (pusherCount !== 3 || nonpusherCount !== 2) {
      throw new Error("Setup must place 3 pushers and 2 non-pushers.");
    }

    for (const piece of payload.pieces) {
      next[piece.row][piece.col] = playerColor === "white"
        ? piece.kind === "pusher" ? "white-pusher" : "white-nonpusher"
        : piece.kind === "pusher" ? "black-pusher" : "black-nonpusher";
    }

    return { board: next };
  }

  throw new Error("Invalid move payload.");
}

export function movesSinceLastPush(moves: { payload: MovePayload | null }[]) {
  let count = 0;
  for (let i = moves.length - 1; i >= 0; i -= 1) {
    const payload = moves[i].payload;
    if (!payload) continue;
    if (payload.type === "push") break;
    if (payload.type === "move") count += 1;
  }
  return count;
}
