"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChampionCrown } from "@/components/champion-crown";
import { TournamentClocks } from "@/components/tournament-clocks";

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
  startedAt: number | null;
  serverNow: number;
  canUpdate: boolean;
};

export function GameClocks(props: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState({
    myRemainingMs: props.myRemainingMs, opponentRemainingMs: props.opponentRemainingMs,
    startedAt: props.startedAt, serverNow: props.serverNow,
  });
  const { gameId, canUpdate, canMove, timed, myTurn = canMove } = props;
  useEffect(() => {
    // Waiting players retain manual board refreshes. The server still expires
    // both clocks independently, so a browser heartbeat is never authoritative.
    if (!canUpdate || !canMove || !timed) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/games/clock", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId }), signal: controller.signal,
        });
        if (!response.ok || stopped) return;
        const next = await response.json();
        if (stopped) return;
        if (next.status !== "active" || next.myTurn !== myTurn) router.refresh();
        setSnapshot(next);
      } catch { /* Keep displaying the last server clock until the next check. */ }
      finally { if (!stopped) timer = setTimeout(refresh, 2000); }
    };
    timer = setTimeout(refresh, 0);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [canUpdate, canMove, timed, gameId, myTurn, router]);

  if (timed) return <TournamentClocks key={snapshot.serverNow} {...snapshot}
    myName={props.myName} opponentName={props.opponentName} myColor={props.myColor}
    myTurn={myTurn} opponentTurn={props.opponentCanMove} delaySeconds={10}
    myIsChampion={props.myIsChampion} opponentIsChampion={props.opponentIsChampion}
    label="Game clocks" />;
  return <div className="game-clocks" aria-label="Game clocks">
    {[{ name: props.myName, champion: props.myIsChampion, color: props.myColor, active: myTurn },
      { name: props.opponentName, champion: props.opponentIsChampion, color: props.myColor === "white" ? "black" : "white", active: props.opponentCanMove }].map((p, i) =>
      <div key={i} className={`clock-${p.color}${p.active ? " active" : ""}`}>
        <span>{p.champion && <ChampionCrown />}{p.name}</span><strong />
      </div>)}
  </div>;
}
