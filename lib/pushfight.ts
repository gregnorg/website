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
export type TurnAction =
  | { type: "move"; from: Coord; to: Coord }
  | { type: "push"; index: Coord; dir: Direction };
export type MovePayload =
  | TurnAction
  | { type: "turn"; actions: TurnAction[] }
  | SetupPayload;

export type LegacyMovePayload =
  | { type: "move"; from: number; to: number }
  | { type: "push"; index: number; dir: Direction }
  | { type: "setup"; pieces: Array<SetupPiece | { index: number; kind: "pusher" | "nonpusher" }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

function readCoord(value: unknown): Coord | null {
  if (!isRecord(value)) return null;
  return Number.isInteger(value.row) && Number.isInteger(value.col)
    ? { row: value.row as number, col: value.col as number }
    : null;
}

function readSetupPiece(value: unknown): SetupPiece {
  if (!isRecord(value) || (value.kind !== "pusher" && value.kind !== "nonpusher")) {
    throw new Error("Invalid setup piece.");
  }
  if (Number.isInteger(value.index)) {
    return { ...indexToCoord(value.index as number), kind: value.kind };
  }
  const coord = readCoord(value);
  if (!coord) throw new Error("Invalid setup piece.");
  return { ...coord, kind: value.kind };
}

export function normalizeMovePayload(payload: unknown): MovePayload {
  if (!isRecord(payload)) {
    throw new Error("Invalid move payload.");
  }

  if (payload.type === "move") {
    if (typeof payload.from === "number" && typeof payload.to === "number") {
      return {
        type: "move",
        from: indexToCoord(payload.from),
        to: indexToCoord(payload.to),
      };
    }
    const from = readCoord(payload.from);
    const to = readCoord(payload.to);
    if (from && to) return { type: "move", from, to };
    throw new Error("Invalid move payload.");
  }

  if (payload.type === "push") {
    if (!isDirection(payload.dir)) {
      throw new Error("Invalid push direction.");
    }
    if (typeof payload.index === "number") {
      return { type: "push", index: indexToCoord(payload.index), dir: payload.dir };
    }
    const index = readCoord(payload.index);
    if (index) return { type: "push", index, dir: payload.dir };
    throw new Error("Invalid push payload.");
  }

  if (payload.type === "setup") {
    if (!Array.isArray(payload.pieces)) {
      throw new Error("Invalid setup payload.");
    }
    return { type: "setup", pieces: payload.pieces.map(readSetupPiece) };
  }

  if (payload.type === "turn") {
    const actions = payload.actions;
    if (!Array.isArray(actions) || actions.length < 1 || actions.length > 3) {
      throw new Error("A turn must contain a push and no more than two moves.");
    }
    const normalizedActions = actions.map((action) => normalizeMovePayload(action));
    if (normalizedActions.some((action) => action.type !== "move" && action.type !== "push")) {
      throw new Error("A turn can only contain moves and a push.");
    }
    const pushIndex = normalizedActions.findIndex((action) => action.type === "push");
    if (pushIndex !== normalizedActions.length - 1) {
      throw new Error("A turn must end with exactly one push.");
    }
    return { type: "turn", actions: normalizedActions as TurnAction[] };
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

function withoutAnchor(cell: PushfightCell): PushfightCell {
  if (cell === "white-pusher-anchor") return "white-pusher";
  if (cell === "black-pusher-anchor") return "black-pusher";
  return cell;
}

function isOccupiedCell(cell: PushfightCell) {
  return cell !== "empty" && cell !== "invalid";
}

export function applyMove(board: Board, payload: MovePayload, playerColor: "white" | "black"): { board: Board; winner?: "white" | "black" } {
  if (payload.type === "turn") {
    let current = board;
    let winner: "white" | "black" | undefined;
    for (const action of payload.actions) {
      const result = applyMove(current, action, playerColor);
      current = result.board;
      winner = result.winner ?? winner;
    }
    return { board: current, winner };
  }

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
    let offBoard = false;
    let exitedThroughCutout = false;
    while (current) {
      const currentCell = next[current.row][current.col];
      if (currentCell === "invalid") {
        offBoard = true;
        exitedThroughCutout = true;
        break;
      }
      if (!isOccupiedCell(currentCell)) break;
      if (isAnchorCell(currentCell)) throw new Error("Line contains anchor");
      line.push(current);
      current = neighbor(current, dir);
    }

    offBoard ||= current === null;
    const lastPos = line[line.length - 1];
    const lastPiece = next[lastPos.row][lastPos.col];

    if (offBoard && !exitedThroughCutout && (dir === "up" || dir === "down")) {
      throw new Error("Cannot push a piece through the siderail");
    }

    for (let i = line.length - 1; i >= 0; i -= 1) {
      const fromPos = line[i];
      const toPos = neighbor(fromPos, dir);
      if (!toPos || next[toPos.row][toPos.col] === "invalid") {
        next[fromPos.row][fromPos.col] = "empty";
        continue;
      }
      next[toPos.row][toPos.col] = next[fromPos.row][fromPos.col];
      next[fromPos.row][fromPos.col] = "empty";
    }

    for (let row = 0; row < next.length; row += 1) {
      for (let col = 0; col < next[row].length; col += 1) {
        next[row][col] = withoutAnchor(next[row][col]);
      }
    }
    next[index.row][index.col] = "empty";
    next[first.row][first.col] = playerColor === "white" ? "white-pusher-anchor" : "black-pusher-anchor";

    if (offBoard && lastPiece !== "empty" && lastPiece !== "invalid") {
      return { board: next, winner: cellColor(lastPiece) === "white" ? "black" : "white" };
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
      if ((playerColor === "white" && piece.col > 3) || (playerColor === "black" && piece.col < 4)) {
        throw new Error(`${playerColor === "white" ? "White" : "Black"} setup pieces are outside their setup zone.`);
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
    if (payload.type === "push" || payload.type === "turn") break;
    if (payload.type === "move") count += 1;
  }
  return count;
}
