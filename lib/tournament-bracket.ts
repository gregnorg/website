import { randomInt } from "node:crypto";
export function seedBracket(ids: string[]): (string | null)[][] {
    if (ids.length < 4 || ids.length > 8 || new Set(ids).size !== ids.length)
        throw new Error("Select 4–8 different members.");
    const players = [...ids];
    for (let i = players.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [players[i], players[j]] = [players[j], players[i]];
    }
    const size = players.length === 4 ? 4 : 8;
    const pairs: (string | null)[][] = [];
    for (let i = 0; i < size / 2; i++)
        pairs.push([players.shift()!, null]);
    for (const pair of pairs)
        if (players.length)
            pair[1] = players.shift()!;
    return pairs;
}
// The delay resets each turn and does not add time to the base clock.
export function tournamentRemaining(base: number, startedAt: Date | null, now = Date.now(), delaySeconds = 10) {
    return Math.max(0, base - (startedAt ? Math.max(0, now - startedAt.getTime() - delaySeconds * 1000) : 0));
}

export type BracketSource = { round: number; slot: number; outcome: "winner" | "loser" };
export type BracketMatch = {
    round: number; slot: number; label: string;
    players: (string | null)[]; sources: BracketSource[] | null; reset: boolean;
};
// Every source precedes its destination, so settlement can advance byes in one pass.
export function doubleEliminationBracket(pairs: (string | null)[][]): BracketMatch[] {
    const matches: BracketMatch[] = [];
    let round = 0;
    const stage = (label: string, sources: BracketSource[][], players?: (string | null)[][]) => {
        const refs = sources.map((source, slot) => {
            matches.push({ round, slot, label, players: players?.[slot] ?? [null, null], sources: players ? null : source, reset: false });
            return { round, slot, outcome: "winner" as const };
        });
        round++;
        return refs;
    };
    let winners = stage("Winners round 1", pairs.map(() => []), pairs);
    let losers = stage("Losers round 1", Array.from({ length: winners.length / 2 }, (_, i) =>
        [winners[i * 2], winners[i * 2 + 1]].map(ref => ({ ...ref, outcome: "loser" }))));
    let level = 2;
    while (winners.length > 1) {
        winners = stage(`Winners round ${level}`, Array.from({ length: winners.length / 2 }, (_, i) => [winners[i * 2], winners[i * 2 + 1]]));
        // Cross incoming losers to avoid immediate rematches where possible.
        losers = stage(`Losers round ${2 * level - 2}`, losers.map((ref, i) =>
            [ref, { ...winners[winners.length - 1 - i], outcome: "loser" }]));
        if (losers.length > 1)
            losers = stage(`Losers round ${2 * level - 1}`, Array.from({ length: losers.length / 2 }, (_, i) => [losers[i * 2], losers[i * 2 + 1]]));
        level++;
    }
    const final = stage("Grand final", [[winners[0], losers[0]]]);
    stage("Grand final reset (if needed)", [[final[0], { ...final[0], outcome: "loser" }]]);
    matches[matches.length - 1].reset = true;
    return matches;
}
