"use client";

import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/game";

type Props = {
  board: Board;
  replayPosition: number | null;
  replayEnabled: boolean;
  replayLabel?: string;
  gameId: string;
  canMove: boolean;
  action: (formData: FormData) => Promise<void>;
};

export function TicTacToeBoard({ board, replayPosition, replayEnabled, replayLabel = "Replay opponent’s last turn", gameId, canMove, action }: Props) {
  const [replaying, setReplaying] = useState(false);
  const [showLastMove, setShowLastMove] = useState(true);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function replay() {
    if (replayPosition === null || !replayEnabled || replaying) return;
    timers.current.forEach(window.clearTimeout);
    setReplaying(true);
    setShowLastMove(false);
    timers.current = [
      window.setTimeout(() => setShowLastMove(true), 650),
      window.setTimeout(() => setReplaying(false), 1400),
    ];
  }

  return (
    <>
      <div className="game-board" aria-label="Tic-tac-toe board">
        {board.map((cell, position) => {
          const displayedCell = replaying && position === replayPosition && !showLastMove ? null : cell;
          return (
            <form action={action} key={position}>
              <input type="hidden" name="gameId" value={gameId} />
              <input type="hidden" name="position" value={position} />
              <button
                className={`game-square${replaying && position === replayPosition && showLastMove ? " replay-highlight" : ""}`}
                type="submit"
                aria-label={displayedCell ? `Square ${position + 1}: ${displayedCell}` : `Play square ${position + 1}`}
                disabled={replaying || Boolean(cell) || !canMove}
              >
                {displayedCell}
              </button>
            </form>
          );
        })}
      </div>
      {replayPosition !== null && (
        <button className="button secondary replay-button" type="button" onClick={replay} disabled={replaying || !replayEnabled}>
          {replaying ? "Replaying…" : replayLabel}
        </button>
      )}
    </>
  );
}
