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
// The existing ten-second bonus is a delay before the base clock runs each turn.
export function tournamentRemaining(base: number, startedAt: Date | null, now = Date.now()) {
    return Math.max(0, base - (startedAt ? Math.max(0, now - startedAt.getTime() - 10000) : 0));
}
