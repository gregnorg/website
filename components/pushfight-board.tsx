"use client";

import { useEffect, useRef, useState } from "react";
import type { Board, Coord, PushfightCell, MovePayload, TurnAction } from "@/lib/pushfight";
import { applyMove, isValidCoord } from "@/lib/pushfight";

type Props = {
  board: Board;
  gameId: string;
  myId: string;
  spectator?: boolean;
  currentPlayerId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  canMove: boolean;
  movesThisTurn: number;
  action: (formData: FormData) => Promise<void>;
  isSetupPhase: boolean;
  setupTeam: "white" | "black";
  setupTurnPlayerId: string;
  statusMessage: string;
  errorMessage?: string;
  gameOutcome: "win" | "loss" | null;
  replayBoards?: Board[];
  replayEnabled?: boolean;
};

type LegalTarget = { coord: Coord; action: TurnAction; board: Board; winner?: "white" | "black" };
type Knockout = { piece: PushfightCell; coord: Coord; dir: "up" | "down" | "left" | "right"; id: number };
type Rotation = 0 | 1 | 2 | 3;

function coordEquals(a: Coord, b: Coord) {
  return a.row === b.row && a.col === b.col;
}

function directionFrom(a: Coord, b: Coord): "up" | "down" | "left" | "right" | null {
  if (a.col === b.col && b.row === a.row - 1) return "up";
  if (a.col === b.col && b.row === a.row + 1) return "down";
  if (a.row === b.row && b.col === a.col - 1) return "left";
  if (a.row === b.row && b.col === a.col + 1) return "right";
  return null;
}

function cellColor(cell: PushfightCell) {
  if (cell.startsWith("white")) return "white";
  if (cell.startsWith("black")) return "black";
  return null;
}

function isAnchorCell(cell: PushfightCell) {
  return cell === "white-pusher-anchor" || cell === "black-pusher-anchor";
}

function isPusherCell(cell: PushfightCell) {
  return cell === "white-pusher" || cell === "black-pusher";
}

function isPieceCell(cell: PushfightCell) {
  return cell !== "empty" && cell !== "invalid";
}

function pushedOffPiece(board: Board, action: TurnAction): Omit<Knockout, "id"> | null {
  if (action.type !== "push") return null;
  const offsets = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] } as const;
  const [rowStep, colStep] = offsets[action.dir];
  let row = action.index.row + rowStep;
  let col = action.index.col + colStep;
  let last: Coord | null = null;

  while (board[row]?.[col] !== undefined && isPieceCell(board[row][col])) {
    last = { row, col };
    row += rowStep;
    col += colStep;
  }

  if (!last || board[row]?.[col] === "empty") return null;
  return { piece: board[last.row][last.col], coord: last, dir: action.dir };
}

function setupPieceKind(step: number): "pusher" | "nonpusher" {
  return step < 3 ? "pusher" : "nonpusher";
}

function buildPreviewPiece(color: "white" | "black", step: number): PushfightCell {
  return `${color}-${setupPieceKind(step)}` as PushfightCell;
}

function pieceClass(cell: PushfightCell) {
  if (cell === "empty" || cell === "invalid") return "";
  const color = cell.startsWith("white") ? "white" : "black";
  const isAnchor = cell.endsWith("anchor");
  const kind = cell.includes("nonpusher") ? "circle-piece" : "square-piece";
  return ["pf-piece", kind, `${color}-piece`, isAnchor ? "anchor-piece" : ""].filter(Boolean).join(" ");
}

function pieceLabel(cell: PushfightCell) {
  if (cell === "empty") return "empty";
  if (cell === "invalid") return "invalid";
  const color = cell.startsWith("white") ? "White" : "Black";
  if (cell.endsWith("anchor")) return `${color} anchor pusher`;
  if (cell.includes("nonpusher")) return `${color} non-pusher`;
  return `${color} pusher`;
}

function rotateCoord(coord: Coord, rotation: Rotation): Coord {
  if (rotation === 1) return { row: coord.col, col: 3 - coord.row };
  if (rotation === 2) return { row: 3 - coord.row, col: 7 - coord.col };
  if (rotation === 3) return { row: 7 - coord.col, col: coord.row };
  return coord;
}

function rotateDirection(direction: Knockout["dir"], rotation: Rotation): Knockout["dir"] {
  const directions: Knockout["dir"][] = ["up", "right", "down", "left"];
  return directions[(directions.indexOf(direction) + rotation) % directions.length];
}

export default function PushfightBoard({
  board,
  gameId,
  myId,
  spectator = false,
  currentPlayerId,
  whitePlayerId,
  canMove,
  movesThisTurn,
  action,
  isSetupPhase,
  setupTeam,
  gameOutcome,
  replayBoards = [],
  replayEnabled = true,
}: Props) {
  const [selectedPiece, setSelectedPiece] = useState<Coord | null>(null);
  const [setupSelection, setSetupSelection] = useState<Coord[]>([]);
  const [stagedBoard, setStagedBoard] = useState<Board>(board);
  const [stagedActions, setStagedActions] = useState<TurnAction[]>([]);
  const [knockout, setKnockout] = useState<Knockout | null>(null);
  const [stagedOutcome, setStagedOutcome] = useState<"win" | "loss" | null>(null);
  const [replayBoard, setReplayBoard] = useState<Board | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [rotationReady, setRotationReady] = useState(false);
  const knockoutId = useRef(0);
  const replayTimers = useRef<number[]>([]);

  useEffect(() => () => replayTimers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const restoreRotation = window.setTimeout(() => {
      try {
        const savedRotation = Number(window.localStorage.getItem(`pushfight-board-rotation:${myId}:${gameId}`));
        if (Number.isInteger(savedRotation) && savedRotation >= 0 && savedRotation <= 3) {
          setRotation(savedRotation as Rotation);
        }
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      } finally {
        setRotationReady(true);
      }
    }, 0);
    return () => window.clearTimeout(restoreRotation);
  }, [gameId, myId]);

  useEffect(() => {
    if (!rotationReady) return;
    try {
      window.localStorage.setItem(`pushfight-board-rotation:${myId}:${gameId}`, String(rotation));
    } catch {
      // Rotation still works for the current visit when storage is unavailable.
    }
  }, [gameId, myId, rotation, rotationReady]);

  const myColor = myId === whitePlayerId ? "white" : "black";
  const isSetupTurn = isSetupPhase && currentPlayerId === myId;
  const setupPieces = setupSelection.map((coord, idx) => ({ ...coord, kind: setupPieceKind(idx) }));
  const canSubmitSetup = isSetupPhase && setupSelection.length === 5 && isSetupTurn;
  const stagedMoveCount = stagedActions.filter((item) => item.type === "move").length;
  const turnComplete = stagedActions.at(-1)?.type === "push";
  const movesRemaining = Math.max(0, 2 - movesThisTurn - stagedMoveCount);

  const displayedBoard = replayBoard ?? (isSetupPhase
    ? board.map((row, rowIndex) => row.map((cell, colIndex) => {
        const index = setupSelection.findIndex((coord) => coordEquals(coord, { row: rowIndex, col: colIndex }));
        return index !== -1 && cell === "empty" ? buildPreviewPiece(myColor, index) : cell;
      }))
    : stagedBoard);

  const legalTargets: LegalTarget[] = [];
  if (!isSetupPhase && selectedPiece && !turnComplete) {
    const selectedCell = stagedBoard[selectedPiece.row][selectedPiece.col];
    for (let row = 0; row < stagedBoard.length; row += 1) {
      for (let col = 0; col < stagedBoard[row].length; col += 1) {
        const coord = { row, col };
        if (!isValidCoord(coord)) continue;
        const destination = stagedBoard[row][col];
        let candidate: TurnAction | null = null;
        if (destination === "empty" && movesRemaining > 0) {
          candidate = { type: "move", from: selectedPiece, to: coord };
        } else if (isPieceCell(destination) && isPusherCell(selectedCell)) {
          const dir = directionFrom(selectedPiece, coord);
          if (dir) candidate = { type: "push", index: selectedPiece, dir };
        }
        if (!candidate) continue;
        try {
          const result = applyMove(stagedBoard, candidate, myColor);
          legalTargets.push({ coord, action: candidate, board: result.board, winner: result.winner });
        } catch {
          // Not a legal destination from the current staged position.
        }
      }
    }
  }

  const actionPayload: MovePayload | null = isSetupPhase
    ? { type: "setup", pieces: setupPieces }
    : turnComplete ? { type: "turn", actions: stagedActions } : null;

  const resetTurn = () => {
    setSelectedPiece(null);
    setSetupSelection([]);
    setStagedBoard(board);
    setStagedActions([]);
    setKnockout(null);
    setStagedOutcome(null);
  };

  const handleCellClick = (row: number, col: number) => {
    if (replaying || !canMove || !isValidCoord({ row, col })) return;
    const coord = { row, col };

    if (isSetupPhase) {
      if (!isSetupTurn || board[row][col] !== "empty") return;
      setSetupSelection((current) => {
        const exists = current.some((item) => coordEquals(item, coord));
        if (exists) return current.filter((item) => !coordEquals(item, coord));
        return current.length < 5 ? [...current, coord] : current;
      });
      return;
    }

    if (turnComplete) return;
    const target = legalTargets.find((item) => coordEquals(item.coord, coord));
    if (target) {
      const eliminated = target.winner ? pushedOffPiece(stagedBoard, target.action) : null;
      knockoutId.current += 1;
      setStagedBoard(target.board);
      setStagedActions((current) => [...current, target.action]);
      setKnockout(eliminated ? { ...eliminated, id: knockoutId.current } : null);
      setStagedOutcome(target.winner ? (target.winner === myColor ? "win" : "loss") : null);
      setSelectedPiece(null);
      return;
    }

    const cell = stagedBoard[row][col];
    if (isPieceCell(cell) && !isAnchorCell(cell) && cellColor(cell) === myColor) {
      setSelectedPiece(coordEquals(selectedPiece ?? { row: -1, col: -1 }, coord) ? null : coord);
    } else {
      setSelectedPiece(null);
    }
  };

  const columnLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rowLabels = ["1", "2", "3", "4"];
  const horizontalLabels = rotation === 0 ? columnLabels
    : rotation === 1 ? rowLabels.toReversed()
      : rotation === 2 ? columnLabels.toReversed()
        : rowLabels;
  const verticalLabels = rotation === 0 ? rowLabels
    : rotation === 1 ? columnLabels
      : rotation === 2 ? rowLabels.toReversed()
        : columnLabels.toReversed();
  const visualRows = rotation % 2 === 0 ? 4 : 8;
  const visualColumns = rotation % 2 === 0 ? 8 : 4;
  const displayedOutcome = stagedOutcome ?? gameOutcome;

  const replayLastTurn = () => {
    if (replaying || !replayEnabled || replayBoards.length < 2) return;
    replayTimers.current.forEach(window.clearTimeout);
    setSelectedPiece(null);
    setReplaying(true);
    setReplayBoard(replayBoards[0]);
    replayTimers.current = replayBoards.slice(1).map((frame, index) => window.setTimeout(
      () => setReplayBoard(frame),
      650 * (index + 1),
    ));
    replayTimers.current.push(window.setTimeout(() => {
      setReplayBoard(null);
      setReplaying(false);
    }, 650 * replayBoards.length + 500));
  };

  return (
    <div className="pushfight-wrapper">
      <div
        className={`pf-board${rotation % 2 ? " rotated-sideways" : ""}`}
        style={{ gridTemplateColumns: `repeat(${visualColumns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${visualRows}, minmax(0, 1fr))` }}
        aria-label={`Pushfight board, rotated ${rotation * 90} degrees clockwise`}
      >
        <div className="pf-axis-labels pf-column-labels top" style={{ gridTemplateColumns: `repeat(${visualColumns}, minmax(0, 1fr))` }}>{horizontalLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="pf-axis-labels pf-column-labels bottom" style={{ gridTemplateColumns: `repeat(${visualColumns}, minmax(0, 1fr))` }}>{horizontalLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="pf-axis-labels pf-row-labels left" style={{ gridTemplateRows: `repeat(${visualRows}, minmax(0, 1fr))` }}>{verticalLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="pf-axis-labels pf-row-labels right" style={{ gridTemplateRows: `repeat(${visualRows}, minmax(0, 1fr))` }}>{verticalLabels.map((label) => <span key={label}>{label}</span>)}</div>
        {displayedBoard.map((row, rowIndex) => row.map((cell, colIndex) => {
          const coord = { row: rowIndex, col: colIndex };
          const valid = isValidCoord(coord);
          const setupBlocked = isSetupPhase && valid && (setupTeam === "white" ? colIndex >= 4 : colIndex <= 3);
          const selected = isSetupPhase
            ? setupSelection.some((item) => coordEquals(item, coord))
            : Boolean(selectedPiece && coordEquals(selectedPiece, coord));
          const legalTarget = legalTargets.find((item) => coordEquals(item.coord, coord));
          const visualCoord = rotateCoord(coord, rotation);
          const gridPosition = { gridRow: visualCoord.row + 1, gridColumn: visualCoord.col + 1 };
          if (!valid) return <div key={`${rowIndex}-${colIndex}`} className="pf-cell pf-hole" style={gridPosition} />;
          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              type="button"
              style={gridPosition}
              className={`pf-cell${selected ? " selected" : ""}${isPieceCell(cell) && cellColor(cell) === myColor ? " mine" : ""}${isPieceCell(cell) && cellColor(cell) !== myColor ? " theirs" : ""}${isAnchorCell(cell) ? " anchor" : ""}${setupBlocked ? " setup-blocked" : ""}${legalTarget ? " legal-target" : ""}`}
              onClick={() => handleCellClick(rowIndex, colIndex)}
              disabled={setupBlocked}
              aria-label={setupBlocked ? `Unavailable during ${setupTeam} setup` : legalTarget ? `Legal ${legalTarget.action.type} destination` : cell !== "empty" ? pieceLabel(cell) : `Empty cell ${rowIndex + 1}, ${colIndex + 1}`}
            >
              {cell !== "empty" ? <span className={pieceClass(cell)} /> : null}
              {legalTarget ? <span className="pf-legal-dot" aria-hidden="true" /> : null}
            </button>
          );
        }))}
        <div className="pf-rails" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${visualColumns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${visualRows}, minmax(0, 1fr))` }}>
          {([
            { start: { row: 0, col: 2 }, end: { row: 0, col: 6 }, edge: "up" },
            { start: { row: 3, col: 1 }, end: { row: 3, col: 5 }, edge: "down" },
          ] as const).map((rail) => {
            const start = rotateCoord(rail.start, rotation);
            const end = rotateCoord(rail.end, rotation);
            const edge = rotateDirection(rail.edge, rotation);
            return <span key={rail.edge} className={`pf-rail ${edge}`} style={{
              gridRow: `${Math.min(start.row, end.row) + 1} / ${Math.max(start.row, end.row) + 2}`,
              gridColumn: `${Math.min(start.col, end.col) + 1} / ${Math.max(start.col, end.col) + 2}`,
            }} />;
          })}
        </div>
        {knockout && (
          <div
            key={knockout.id}
            className={`pf-knockout pf-knockout-${rotateDirection(knockout.dir, rotation)}`}
            style={{ gridRow: rotateCoord(knockout.coord, rotation).row + 1, gridColumn: rotateCoord(knockout.coord, rotation).col + 1 }}
            aria-label={`${pieceLabel(knockout.piece)} pushed off the board`}
          >
            <span className={pieceClass(knockout.piece)}>
              <span className="pf-skull" aria-hidden="true">☠</span>
            </span>
          </div>
        )}
        {displayedOutcome && !replaying && (
          <div className={`pf-result-overlay ${displayedOutcome}`} role="status" aria-live="polite">
            {displayedOutcome === "win" ? "VICTORY!" : "DEFEAT"}
          </div>
        )}
      </div>
      {!spectator && <form action={action} className="pushfight-controls">
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="action_type" value={isSetupPhase ? "setup" : turnComplete ? "turn" : ""} />
        <input type="hidden" name="action_payload" value={actionPayload ? JSON.stringify(actionPayload) : ""} />
        <div className="form-actions">
          <button className="button" type="submit" disabled={!canMove || !(isSetupPhase ? canSubmitSetup : turnComplete)}>
            {isSetupPhase ? "Submit setup" : "Submit turn"}
          </button>
          <button className="button small" type="button" onClick={resetTurn} disabled={!canMove}>
            Reset
          </button>
        </div>
      </form>}
      <div className="pushfight-view-actions">
        {replayBoards.length > 1 && (
          <button className="button secondary replay-button" type="button" onClick={replayLastTurn} disabled={replaying || !replayEnabled}>
            {replaying ? "Replaying…" : "View Last Turn"}
          </button>
        )}
        <button
          className="button small board-rotate-button"
          type="button"
          onClick={() => setRotation((current) => ((current + 1) % 4) as Rotation)}
          aria-label="Rotate board 90 degrees clockwise"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>
    </div>
  );
}
