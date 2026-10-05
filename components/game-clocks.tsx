"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChampionCrown } from "@/components/champion-crown";

type Props = {
  gameId: string;
  myName: string;
  opponentName: string;
  myIsChampion: boolean;
  opponentIsChampion: boolean;
  myRemainingMs: number;
  opponentRemainingMs: number;
  canMove: boolean;
  opponentCanMove: boolean;
  myColor: "white" | "black";
  timed: boolean;
  myTurn?: boolean;
};

function formatClock(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function GameClocks({ gameId, myName, opponentName, myIsChampion, opponentIsChampion, myRemainingMs, opponentRemainingMs, canMove, opponentCanMove, myColor, timed, myTurn = canMove }: Props) {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState(myRemainingMs);
  const [graceMs, setGraceMs] = useState(10_000);
  const remainingRef = useRef(myRemainingMs);
  const graceRef = useRef(10_000);
  const pendingRef = useRef(0);
  const requestInFlight = useRef(false);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    remainingRef.current = remainingMs;
  }, [remainingMs]);

  useEffect(() => {
    if (!timed || !canMove || remainingRef.current <= 0) return;
    lastTick.current = Date.now();

    const flushElapsed = async () => {
      if (requestInFlight.current || pendingRef.current < 1) return;
      const elapsedMs = Math.min(15_000, Math.round(pendingRef.current));
      pendingRef.current -= elapsedMs;
      requestInFlight.current = true;
      try {
        const response = await fetch("/api/games/clock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId, elapsedMs }),
          keepalive: true,
        });
        if (!response.ok) {
          if (response.status === 409) router.refresh();
          else pendingRef.current += elapsedMs;
          return;
        }
        const result = await response.json() as { remainingMs: number; timedOut: boolean };
        const adjustedRemaining = Math.max(0, result.remainingMs - pendingRef.current);
        remainingRef.current = adjustedRemaining;
        setRemainingMs(adjustedRemaining);
        if (result.timedOut) router.refresh();
      } finally {
        requestInFlight.current = false;
      }
    };

    const onVisibilityChange = () => {
      lastTick.current = Date.now();
      if (document.visibilityState !== "visible") void flushElapsed();
    };
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - (lastTick.current ?? now);
      lastTick.current = now;
      if (document.visibilityState !== "visible") return;

      let clockElapsed = elapsed;
      if (graceRef.current > 0) {
        const graceElapsed = Math.min(graceRef.current, clockElapsed);
        graceRef.current -= graceElapsed;
        clockElapsed -= graceElapsed;
        setGraceMs(graceRef.current);
      }
      if (clockElapsed > 0) {
        const deducted = Math.min(remainingRef.current, clockElapsed);
        remainingRef.current -= deducted;
        pendingRef.current += deducted;
        setRemainingMs(remainingRef.current);
      }
      if (pendingRef.current >= 1_000 || remainingRef.current === 0) void flushElapsed();
    }, 250);

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void flushElapsed();
    };
  }, [canMove, gameId, router, timed]);

  return (
    <div className="game-clocks" aria-label="Game clocks">
      <div className={`clock-${myColor}${myTurn ? " active" : ""}`}>
        <span>{myIsChampion && <ChampionCrown />}{myName}</span>
        <strong>{timed ? formatClock(canMove ? remainingMs : myRemainingMs) : "∞"}</strong>
        {timed && canMove && graceMs > 0 && <small>Starts in {Math.ceil(graceMs / 1000)}s</small>}
      </div>
      <div className={`clock-${myColor === "white" ? "black" : "white"}${opponentCanMove ? " active" : ""}`}>
        <span>{opponentIsChampion && <ChampionCrown />}{opponentName}</span>
        <strong>{timed ? formatClock(opponentRemainingMs) : "∞"}</strong>
      </div>
    </div>
  );
}
