"use client";

import { useState } from "react";
import type { HistoryFrame } from "@/lib/game-history";
import PushfightBoard from "@/components/pushfight-board";

export default function GameHistory({ frames, gameId, whiteId, blackId, outcome }: {
  frames: HistoryFrame[]; gameId: string; whiteId: string; blackId: string; outcome: string;
}) {
  const [step, setStep] = useState(0);
  const frame = frames[step];
  const last = frames.length - 1;
  return <>
    <nav className="history-controls" aria-label="Game history controls">
      <button className="button secondary" onClick={() => setStep(0)} disabled={step === 0}>First</button>
      <button className="button secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>Previous</button>
      <button className="button" onClick={() => setStep(step + 1)} disabled={step === last}>Next</button>
      <button className="button secondary" onClick={() => setStep(last)} disabled={step === last}>Last</button>
    </nav>
    <p className="game-summary" aria-live="polite">Step {step} of {last} · {frame.label}{step === last ? ` · ${outcome}` : ""}</p>
    <label className="history-slider">Jump to step
      <input type="range" min={0} max={last} value={step} onChange={event => setStep(Number(event.target.value))} />
    </label>
    {frame.type === "tic_tac_toe" ? <div className="game-board" aria-label="Historical tic-tac-toe board">
      {frame.board.map((cell, index) => <button type="button" disabled className="game-square" key={index} aria-label={`Square ${index + 1}: ${cell ?? "empty"}`}>{cell}</button>)}
    </div> : <PushfightBoard key={step} board={frame.board} gameId={gameId} spectator myId="spectator"
      currentPlayerId="" whitePlayerId={whiteId} blackPlayerId={blackId} canMove={false}
      movesThisTurn={0} action={async () => {}} isSetupPhase={false} setupTeam="white"
      setupTurnPlayerId="" statusMessage="" gameOutcome={null} replayEnabled={false} />}
  </>;
}
