"use client";

import { useEffect, useRef, useState } from "react";
import type { HistoryFrame } from "@/lib/game-history";
import PushfightBoard from "@/components/pushfight-board";

export default function GameHistory({ frames, gameId, whiteId, blackId }: {
  frames: HistoryFrame[]; gameId: string; whiteId: string; blackId: string;
}) {
  const [step, setStep] = useState(0);
  const [animationFrame, setAnimationFrame] = useState<HistoryFrame | null>(null);
  const timers = useRef<number[]>([]);
  const animating = useRef(false);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const frame = animationFrame ?? frames[step];

  function nextTurn() {
    if (animating.current || step >= frames.length - 1) return;
    const next = frames[step + 1];
    if (next.type !== "pushfight" || !next.actions?.length) {
      setStep(step + 1);
      return;
    }
    animating.current = true;
    setAnimationFrame(frames[step]);
    setStep(step + 1);
    timers.current = next.actions.map((action, index) => window.setTimeout(() => {
      setAnimationFrame({ type: "pushfight", ...action });
    }, 650 * (index + 1)));
    timers.current.push(window.setTimeout(() => {
      setAnimationFrame(null);
      animating.current = false;
      timers.current = [];
    }, 650 * (next.actions.length + 1)));
  }

  const playing = animationFrame !== null;
  const last = frames.length - 1;
  return <>
    <nav className="history-controls" aria-label="Game history controls">
      <button className="button secondary" onClick={() => setStep(0)} disabled={playing || step === 0}>First</button>
      <button className="button secondary" onClick={() => setStep(step - 1)} disabled={playing || step === 0}>Previous</button>
      <button className="button" onClick={nextTurn} disabled={playing || step === last}>{playing ? "Playing…" : "Next"}</button>
      <button className="button secondary" onClick={() => setStep(last)} disabled={playing || step === last}>Last</button>
    </nav>
    <p className="game-summary" aria-live="polite">{frame.label}</p>
    <label className="history-slider">Jump to step
      <input type="range" disabled={playing} min={0} max={last} value={step} onChange={event => setStep(Number(event.target.value))} />
    </label>
    {frame.type === "tic_tac_toe" ? <div className="game-board" aria-label="Historical tic-tac-toe board">
      {frame.board.map((cell, index) => <button type="button" disabled className="game-square" key={index} aria-label={`Square ${index + 1}: ${cell ?? "empty"}`}>{cell}</button>)}
    </div> : <PushfightBoard key={step} board={frame.board} gameId={gameId} spectator myId="spectator"
      currentPlayerId="" whitePlayerId={whiteId} blackPlayerId={blackId} canMove={false}
      movesThisTurn={0} action={async () => {}} isSetupPhase={false} setupTeam="white"
      setupTurnPlayerId="" statusMessage="" gameOutcome={null} replayEnabled={false} />}
  </>;
}
