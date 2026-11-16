"use client";
import { useEffect, useState } from "react";
import { ChampionCrown } from "@/components/champion-crown";
export function TournamentClocks({ myName, opponentName, myRemainingMs, opponentRemainingMs, myTurn, opponentTurn, startedAt, serverNow, myColor, delaySeconds, myIsChampion = false, opponentIsChampion = false, label = "Tournament clocks" }: {
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
}) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const origin = Date.now();
        const timer = setInterval(() => setElapsed(Date.now() - origin), 100);
        return () => clearInterval(timer);
    }, [serverNow]);
    const delayMs = delaySeconds * 1000;
    const age = startedAt === null ? 0 : Math.max(0, serverNow + elapsed - startedAt);
    const format = (base: number, active: boolean) => { const total = Math.ceil(Math.max(0, base - (active ? Math.max(0, age - delayMs) : 0)) / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
    return <div className="game-clocks" aria-label={label}>{[{ name: myName, base: myRemainingMs, active: myTurn, champion: myIsChampion }, { name: opponentName, base: opponentRemainingMs, active: opponentTurn, champion: opponentIsChampion }].map((p, i) => <div key={i} className={`clock-${i === 0 ? myColor : myColor === 'white' ? 'black' : 'white'}${p.active ? ' active' : ''}`}><span>{p.champion && <ChampionCrown />}{p.name}</span><strong>{format(p.base, p.active)}</strong>{p.active && startedAt !== null && age < delayMs && <small>Starts in {Math.ceil((delayMs - age) / 1000)}s</small>}</div>)}</div>;
}
