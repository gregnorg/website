"use client";

import { useState } from "react";
import type { Board, Coord, PushfightCell, MovePayload, TurnAction } from "@/lib/pushfight";
import { applyMove, isValidCoord } from "@/lib/pushfight";

type Props = {
  board: Board;
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
  statusMessage: string;
  errorMessage?: string;
  gameOutcome: "win" | "loss" | null;
};

type LegalTarget = { coord: Coord; action: TurnAction; board: Board; winner?: "white" | "black" };

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
  canMove,
  movesThisTurn,
  action,
  isSetupPhase,
  setupTeam,
  statusMessage,
  errorMessage,
  gameOutcome,
}: Props) {
  const [selectedPiece, setSelectedPiece] = useState<Coord | null>(null);
  const [setupSelection, setSetupSelection] = useState<Coord[]>([]);
  const [stagedBoard, setStagedBoard] = useState<Board>(board);
  const [stagedActions, setStagedActions] = useState<TurnAction[]>([]);
  const [stagedWinner, setStagedWinner] = useState<"white" | "black" | null>(null);

  const myColor = myId === whitePlayerId ? "white" : "black";
  const isSetupTurn = isSetupPhase && currentPlayerId === myId;
  const setupPieces = setupSelection.map((coord, idx) => ({ ...coord, kind: setupPieceKind(idx) }));
  const remainingPushers = 3 - Math.min(setupSelection.length, 3);
  const remainingNonpushers = Math.max(0, 2 - Math.max(0, setupSelection.length - 3));
  const canSubmitSetup = isSetupPhase && setupSelection.length === 5 && isSetupTurn;
  const stagedMoveCount = stagedActions.filter((item) => item.type === "move").length;
  const turnComplete = stagedActions.at(-1)?.type === "push";
  const movesRemaining = Math.max(0, 2 - movesThisTurn - stagedMoveCount);

  const displayedBoard = isSetupPhase
    ? board.map((row, rowIndex) => row.map((cell, colIndex) => {
        const index = setupSelection.findIndex((coord) => coordEquals(coord, { row: rowIndex, col: colIndex }));
        return index !== -1 && cell === "empty" ? buildPreviewPiece(myColor, index) : cell;
      }))
    : stagedBoard;

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
    setStagedWinner(null);
  };

  const handleCellClick = (row: number, col: number) => {
    if (!canMove || !isValidCoord({ row, col })) return;
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
      setStagedBoard(target.board);
      setStagedActions((current) => [...current, target.action]);
      setStagedWinner(target.winner ?? null);
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

  const selectedDescription = isSetupPhase
    ? !isSetupTurn
      ? `Waiting for the ${setupTeam} team to finish setup.`
      : setupSelection.length < 5
        ? `Select ${remainingPushers} pusher${remainingPushers === 1 ? "" : "s"} and ${remainingNonpushers} non-pusher${remainingNonpushers === 1 ? "" : "s"}.`
        : "Ready to submit setup."
    : turnComplete
      ? "Turn ready — submit it or reset the board."
      : selectedPiece
        ? "Choose one of the dotted legal destinations."
        : `Choose a piece. ${movesRemaining} optional move${movesRemaining === 1 ? "" : "s"} remaining; your turn must end with a push.`;

  const columnLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rowLabels = ["1", "2", "3", "4"];
  const displayedOutcome = stagedWinner ? (stagedWinner === myColor ? "win" : "loss") : gameOutcome;

  return (
    <div className="pushfight-wrapper">
      <div className="pf-board" aria-label="Pushfight board">
        <div className="pf-axis-labels pf-column-labels top">{columnLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="pf-axis-labels pf-column-labels bottom">{columnLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="pf-axis-labels pf-row-labels left">{rowLabels.map((label) => <span key={label}>{label}</span>)}</div>
        <div className="pf-axis-labels pf-row-labels right">{rowLabels.map((label) => <span key={label}>{label}</span>)}</div>
        {displayedBoard.map((row, rowIndex) => row.map((cell, colIndex) => {
          const coord = { row: rowIndex, col: colIndex };
          const valid = isValidCoord(coord);
          const setupBlocked = isSetupPhase && valid && (setupTeam === "white" ? colIndex >= 4 : colIndex <= 3);
          const selected = isSetupPhase
            ? setupSelection.some((item) => coordEquals(item, coord))
            : Boolean(selectedPiece && coordEquals(selectedPiece, coord));
          const legalTarget = legalTargets.find((item) => coordEquals(item.coord, coord));
          if (!valid) return <div key={`${rowIndex}-${colIndex}`} className="pf-cell pf-hole" />;
          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              type="button"
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
      </div>
      <div className="pushfight-meta">
        {displayedOutcome && (
          <p className={`pushfight-outcome ${displayedOutcome}`}>
            {displayedOutcome === "win" ? "Victory!" : "Defeat!"}
          </p>
        )}
        <p className="game-summary">{statusMessage}</p>
        {errorMessage && <p className="error game-error" role="alert">{errorMessage}</p>}
        {!gameOutcome && (
          <>
            <p>{currentPlayerId === myId ? "Your turn" : "Waiting for opponent"}</p>
            {!isSetupPhase && <p>Moves this turn: {movesThisTurn + stagedMoveCount} / 2</p>}
            <p className={turnComplete || canSubmitSetup ? "ready-description" : undefined}>{selectedDescription}</p>
            {isSetupPhase && <p className="setup-hint">First 3 pieces are pushers; last 2 are non-pushers.</p>}
          </>
        )}
      </div>
      <form action={action} className="pushfight-controls">
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
      </form>
    </div>
  );
}
