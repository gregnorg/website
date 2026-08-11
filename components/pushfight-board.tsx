"use client";

import { useMemo, useState } from "react";
import type { Board as PushfightBoardType, Coord, PushfightCell } from "@/lib/pushfight";
import { isValidCoord } from "@/lib/pushfight";

type Props = {
  board: PushfightBoardType;
  gameId: string;
  myId: string;
  currentPlayerId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  canMove: boolean;
  movesThisTurn: number;
  action: (formData: FormData) => Promise<void>;
  isSetupPhase: boolean;
  setupTeam: "white" | "black";
  setupTurnPlayerId: string;
};

function coordEquals(a: Coord, b: Coord) {
  return a.row === b.row && a.col === b.col;
}

function isNeighbor(a: Coord, b: Coord) {
  return (
    (a.col === b.col && Math.abs(a.row - b.row) === 1) ||
    (a.row === b.row && Math.abs(a.col - b.col) === 1)
  );
}

function directionFrom(a: Coord, b: Coord): "up" | "down" | "left" | "right" | null {
  if (a.col === b.col) {
    if (b.row === a.row - 1) return "up";
    if (b.row === a.row + 1) return "down";
  }
  if (a.row === b.row) {
    if (b.col === a.col - 1) return "left";
    if (b.col === a.col + 1) return "right";
  }
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
  return cell === "white-pusher" || cell === "black-pusher" || cell === "white-pusher-anchor" || cell === "black-pusher-anchor";
}

function isPieceCell(cell: PushfightCell) {
  return cell !== "empty" && cell !== "invalid";
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

export default function PushfightBoard({
  board,
  gameId,
  myId,
  currentPlayerId,
  whitePlayerId,
  blackPlayerId,
  canMove,
  movesThisTurn,
  action,
  isSetupPhase,
  setupTeam,
  setupTurnPlayerId,
}: Props) {
  const [from, setFrom] = useState<Coord | null>(null);
  const [to, setTo] = useState<Coord | null>(null);
  const [setupSelection, setSetupSelection] = useState<Coord[]>([]);

  const myColor = myId === whitePlayerId ? "white" : "black";
  const isSetupTurn = isSetupPhase && currentPlayerId === myId;
  const setupPieces = setupSelection.map((coord, idx) => ({ row: coord.row, col: coord.col, kind: setupPieceKind(idx) }));
  const remainingPushers = 3 - Math.min(setupSelection.length, 3);
  const remainingNonpushers = Math.max(0, 2 - Math.max(0, setupSelection.length - 3));
  const canSubmitSetup = isSetupPhase && setupSelection.length === 5 && isSetupTurn;

  const previewBoard = board.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      const selectionIndex = setupSelection.findIndex((coord) => coordEquals(coord, { row: rowIndex, col: colIndex }));
      if (isSetupPhase && selectionIndex !== -1 && cell === "empty") {
        return buildPreviewPiece(myColor, selectionIndex);
      }
      return cell;
    }),
  );

  const targetCell = to ? previewBoard[to.row][to.col] : "empty";
  const actionType = isSetupPhase ? "setup" : from && to ? (targetCell !== "empty" ? "push" : "move") : "";
  const actionDir = !isSetupPhase && actionType === "push" && from && to ? directionFrom(from, to) : null;
  const canSubmit = !isSetupPhase && from && to && (actionType === "move" || (actionType === "push" && actionDir));
  const isSelectionReady = isSetupPhase ? setupSelection.length === 5 : Boolean(from && to);

  const selectedDescription = useMemo(() => {
    if (isSetupPhase) {
      if (!isSetupTurn) return `Waiting for the ${setupTeam} team to finish setup.`;
      if (setupSelection.length < 5) {
        return `Select ${remainingPushers} pusher${remainingPushers === 1 ? "" : "s"} and ${remainingNonpushers} non-pusher${remainingNonpushers === 1 ? "" : "s"}.`;
      }
      return "Ready to submit setup.";
    }

    if (!from) return "Choose one of your pieces.";
    if (!to) return "Click an empty square to move or a neighboring square piece to push.";
    return targetCell !== "empty" ? "Ready to push — click submit to finish your turn." : "Ready to move — click submit to finish your turn.";
  }, [from, to, targetCell, isSetupPhase, isSetupTurn, setupSelection.length, remainingPushers, remainingNonpushers, setupTeam]);

  const resetSelection = () => {
    setFrom(null);
    setTo(null);
    setSetupSelection([]);
  };

  const handleCellClick = (row: number, col: number) => {
    if (!canMove || !isValidCoord({ row, col })) return;
    const selectedCell = board[row][col];
    const coord = { row, col };

    if (isSetupPhase) {
      if (!isSetupTurn) return;
      if (selectedCell !== "empty") return;
      setFrom(null);
      setTo(null);
      setSetupSelection((current) => {
        const exists = current.find((item) => coordEquals(item, coord));
        if (exists) {
          return current.filter((item) => !coordEquals(item, coord));
        }
        if (current.length >= 5) return current;
        return [...current, coord];
      });
      return;
    }

    if (!from) {
      if (isPieceCell(selectedCell) && !isAnchorCell(selectedCell) && cellColor(selectedCell) === myColor) {
        setFrom(coord);
      }
      return;
    }

    if (coordEquals(coord, from)) {
      resetSelection();
      return;
    }

    if (selectedCell === "empty") {
      setTo(coord);
      return;
    }

    const fromCell = board[from.row][from.col];
    if (
      isPieceCell(selectedCell) &&
      !isAnchorCell(selectedCell) &&
      cellColor(selectedCell) !== myColor &&
      isPusherCell(fromCell) &&
      isNeighbor(from, coord)
    ) {
      setTo(coord);
      return;
    }

    if (isPieceCell(selectedCell) && !isAnchorCell(selectedCell) && cellColor(selectedCell) === myColor) {
      setFrom(coord);
      setTo(null);
    }
  };

  const actionPayload = isSetupPhase
    ? { type: "setup", pieces: setupPieces }
    : from && to
    ? targetCell !== "empty" && actionDir
      ? { type: "push", index: from, dir: actionDir }
      : { type: "move", from, to }
    : null;

  const columnLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rowLabels = ["1", "2", "3", "4"];

  return (
    <div className="pushfight-wrapper">
      <div className="pushfight-meta">
        <p>{currentPlayerId === myId ? "Your turn" : "Waiting for opponent"}</p>
        {!isSetupPhase && <p>Moves this turn: {movesThisTurn} / 2</p>}
        <p className={isSelectionReady ? "ready-description" : undefined}>{selectedDescription}</p>
        {isSetupPhase && <p className="setup-hint">First 3 pieces are pushers; last 2 are non-pushers.</p>}
      </div>
      <div className="pf-board" aria-label="Pushfight board">
        <div className="pf-axis-labels pf-column-labels top">
          {columnLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="pf-axis-labels pf-column-labels bottom">
          {columnLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="pf-axis-labels pf-row-labels left">
          {rowLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="pf-axis-labels pf-row-labels right">
          {rowLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {previewBoard.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const valid = isValidCoord({ row: rowIndex, col: colIndex });
            const selected = isSetupPhase
              ? setupSelection.some((coord) => coordEquals(coord, { row: rowIndex, col: colIndex }))
              : from && coordEquals(from, { row: rowIndex, col: colIndex }) || to && coordEquals(to, { row: rowIndex, col: colIndex });
            const isPreview = isSetupPhase && setupSelection.some((coord) => coordEquals(coord, { row: rowIndex, col: colIndex })) && board[rowIndex][colIndex] === "empty";
            const isMyPiece = isPieceCell(cell) && cellColor(cell) === myColor;
            const isOpponentPiece = isPieceCell(cell) && cellColor(cell) !== myColor;
            const isAnchor = isAnchorCell(cell);
            const isTarget = !isSetupPhase && from && !to && previewBoard[rowIndex][colIndex] === "empty";

            if (!valid) {
              return <div key={`${rowIndex}-${colIndex}`} className="pf-cell pf-hole" />;
            }

            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                className={`pf-cell${selected ? " selected" : ""}${isPreview ? " preview" : ""}${isMyPiece ? " mine" : ""}${isOpponentPiece ? " theirs" : ""}${isAnchor ? " anchor" : ""}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                aria-label={cell !== "empty" ? pieceLabel(cell) : `Empty cell ${rowIndex + 1}, ${colIndex + 1}`}
              >
                {cell !== "empty" ? <span className={pieceClass(cell)} /> : null}
              </button>
            );
          }),
        )}
      </div>
      <form action={action} className="pushfight-controls">
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="action_type" value={actionType} />
        <input type="hidden" name="action_payload" value={actionPayload ? JSON.stringify(actionPayload) : ""} />

        <div className="form-actions">
          <button className="button" type="submit" disabled={!canMove || !(isSetupPhase ? canSubmitSetup : canSubmit)}>
            {isSetupPhase ? "Submit setup" : "Submit action"}
          </button>
          <button className="button small" type="button" onClick={resetSelection} disabled={!canMove}>
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
