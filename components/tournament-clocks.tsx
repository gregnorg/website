"use client";
import { useEffect, useState } from "react";
export function TournamentClocks({ myName, opponentName, myRemainingMs, opponentRemainingMs, myTurn, opponentTurn, startedAt, serverNow, myColor, delaySeconds }: {
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
    useEffect(() => { const origin = Date.now(); setElapsed(0); const timer = setInterval(() => setElapsed(Date.now() - origin), 100); return () => clearInterval(timer); }, [serverNow]);
    const delayMs = delaySeconds * 1000;
    const age = startedAt === null ? 0 : Math.max(0, serverNow + elapsed - startedAt);
    const format = (base: number, active: boolean) => { const total = Math.ceil(Math.max(0, base - (active ? Math.max(0, age - delayMs) : 0)) / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
    return <div className="game-clocks" aria-label="Tournament clocks">{[{ name: myName, base: myRemainingMs, active: myTurn }, { name: opponentName, base: opponentRemainingMs, active: opponentTurn }].map((p, i) => <div key={i} className={`clock-${i === 0 ? myColor : myColor === 'white' ? 'black' : 'white'}${p.active ? ' active' : ''}`}><span>{p.name}</span><strong>{format(p.base, p.active)}</strong>{p.active && startedAt !== null && age < delayMs && <small>Starts in {Math.ceil((delayMs - age) / 1000)}s</small>}</div>)}</div>;
}
