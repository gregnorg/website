"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChampionCrown } from "@/components/champion-crown";
import { formatClock } from "@/components/tournament-clocks";

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
  moveCount: number;
  delayRemainingMs: number;
  canUpdate: boolean;
};

export function GameClocks(props: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState({
    myRemainingMs: props.myRemainingMs,
    opponentRemainingMs: props.opponentRemainingMs,
    delayRemainingMs: props.delayRemainingMs,
  });
  const { gameId, canUpdate, canMove, timed, moveCount, myTurn = canMove } = props;

  useEffect(() => {
    if (!canUpdate || !canMove || !timed) return;
    const isViewing = () => document.visibilityState === "visible" && document.hasFocus();
    let visibleSince = isViewing() ? performance.now() : null;
    let stopped = false;
    let sequence = 0;
    let lastResponse = 0;

    function sample(pause = false) {
      if (visibleSince === null) return;
      const now = performance.now();
      const elapsedMs = Math.round(now - visibleSince);
      visibleSince = pause ? null : now;
      // Discard long gaps caused by sleep or a suspended browser.
      if (elapsedMs <= 0 || elapsedMs > 1500) return;
      const request = ++sequence;
      void fetch("/api/games/clock", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, moveCount, elapsedMs }), keepalive: true,
      }).then(async response => {
        if (!response.ok || stopped) return;
        const next = await response.json();
        if (stopped || request <= lastResponse) return;
        lastResponse = request;
        setSnapshot(next);
        if (next.status !== "active" || next.moveCount !== moveCount || !next.myTurn) {
          stopped = true;
          visibleSince = null;
          router.refresh();
        }
      }).catch(() => { /* The next sample can update the clock. */ });
    }

    function updateViewing() {
      if (stopped) return;
      if (!isViewing()) sample(true);
      else visibleSince ??= performance.now();
    }

    const pauseClock = () => sample(true);
    const timer = setInterval(() => {
      if (isViewing()) sample();
      else sample(true);
    }, 1000);
    document.addEventListener("visibilitychange", updateViewing);
    window.addEventListener("focus", updateViewing);
    window.addEventListener("blur", pauseClock);
    window.addEventListener("pagehide", pauseClock);
    window.addEventListener("pageshow", updateViewing);
    return () => {
      stopped = true;
      sample(true);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", updateViewing);
      window.removeEventListener("focus", updateViewing);
      window.removeEventListener("blur", pauseClock);
      window.removeEventListener("pagehide", pauseClock);
      window.removeEventListener("pageshow", updateViewing);
    };
  }, [canUpdate, canMove, timed, gameId, moveCount, router]);

  const clocks = [
    { name: props.myName, champion: props.myIsChampion, color: props.myColor, active: myTurn, remaining: snapshot.myRemainingMs },
    { name: props.opponentName, champion: props.opponentIsChampion, color: props.myColor === "white" ? "black" : "white",
      active: props.opponentCanMove, remaining: snapshot.opponentRemainingMs },
  ];
  return <div className="game-clocks" aria-label="Game clocks">
    {clocks.map(clock =>
      <div key={clock.color} className={`clock-${clock.color}${clock.active ? " active" : ""}`}>
        <span>{clock.champion && <ChampionCrown />}{clock.name}</span>
        <strong>{timed ? formatClock(clock.remaining) : ""}</strong>
        {timed && clock.active && canMove && snapshot.delayRemainingMs > 0 && (
          <small>Starts in {Math.ceil(snapshot.delayRemainingMs / 1000)}s</small>
        )}
      </div>)}
  </div>;
}
