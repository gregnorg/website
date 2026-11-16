"use client";

import { useEffect, useState } from "react";
import { ChampionCrown } from "@/components/champion-crown";

type Props = {
  myIsChampion?: boolean;
  opponentIsChampion?: boolean;
  label?: string;
  delaySeconds: number;
  myColor: "white" | "black";
  myName: string;
  opponentName: string;
  myRemainingMs: number;
  opponentRemainingMs: number;
  myTurn: boolean;
  opponentTurn: boolean;
  startedAt: number | null;
  serverNow: number;
};

function formatClock(milliseconds: number) {
  const total = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function TournamentClocks({
  myName, opponentName, myRemainingMs, opponentRemainingMs, myTurn, opponentTurn,
  startedAt, serverNow, myColor, delaySeconds, myIsChampion = false,
  opponentIsChampion = false, label = "Tournament clocks",
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null || (!myTurn && !opponentTurn)) return;
    const origin = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - origin), 100);
    return () => clearInterval(timer);
  }, [serverNow, startedAt, myTurn, opponentTurn]);

  const delayMs = delaySeconds * 1000;
  const age = startedAt === null ? 0 : Math.max(0, serverNow + elapsed - startedAt);
  const deducted = Math.max(0, age - delayMs);
  const clocks = [
    { name: myName, base: myRemainingMs, active: myTurn, champion: myIsChampion, color: myColor },
    { name: opponentName, base: opponentRemainingMs, active: opponentTurn, champion: opponentIsChampion,
      color: myColor === "white" ? "black" : "white" },
  ];
  return (
    <div className="game-clocks" aria-label={label}>
      {clocks.map((clock, i) => (
        <div key={i} className={`clock-${clock.color}${clock.active ? " active" : ""}`}>
          <span>{clock.champion && <ChampionCrown />}{clock.name}</span>
          <strong>{formatClock(clock.base - (clock.active ? deducted : 0))}</strong>
          {clock.active && startedAt !== null && age < delayMs && (
            <small>Starts in {Math.ceil((delayMs - age) / 1000)}s</small>
          )}
        </div>
      ))}
    </div>
  );
}
