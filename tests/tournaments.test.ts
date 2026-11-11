import assert from "node:assert/strict";
import test from "node:test";
import { seedBracket, tournamentRemaining } from "../lib/tournament-bracket.ts";
for (let count = 4; count <= 8; count++)
    test(`${count} members are seeded once, with ${count === 4 ? 0 : 8 - count} byes`, () => {
        const ids = Array.from({ length: count }, (_, i) => String(i));
        for (let repeat = 0; repeat < 20; repeat++) {
            const pairs = seedBracket(ids);
            assert.deepEqual(pairs.flat().filter(Boolean).sort(), ids);
            assert.equal(pairs.length, count === 4 ? 2 : 4);
            assert.equal(pairs.filter(p => p[1] === null).length, count === 4 ? 0 : 8 - count);
            assert.ok(pairs.every(p => p[0] !== null));
        }
    });
test("invalid membership rejected", () => {
    for (const ids of [['a', 'b', 'c'], Array(9).fill('a'), ['a', 'b', 'c', 'c']])
        assert.throws(() => seedBracket(ids));
});
test("server clock pauses for setup and gives ten seconds each turn without page activity", () => {
    const now = 100000;
    assert.equal(tournamentRemaining(60000, null, now), 60000);
    assert.equal(tournamentRemaining(60000, new Date(now - 9000), now), 60000);
    assert.equal(tournamentRemaining(60000, new Date(now - 20000), now), 50000);
    assert.equal(tournamentRemaining(60000, new Date(now - 70000), now), 0);
    assert.equal(tournamentRemaining(60000, new Date(now - 500000), now), 0);
});

test("tournament clocks use the configured whole-second delay, including zero", () => {
    const now = 100000;
    const started = new Date(now - 20000);
    assert.equal(tournamentRemaining(60000, started, now, 0), 40000);
    assert.equal(tournamentRemaining(60000, started, now, 3), 43000);
    assert.equal(tournamentRemaining(60000, started, now, 30), 60000);
    assert.equal(tournamentRemaining(60000, new Date(now - 35000), now, 30), 55000);
    assert.equal(tournamentRemaining(60000, null, now, 0), 60000);
    assert.equal(tournamentRemaining(60000, new Date(now - 100000), now, 30), 0);
});

import { doubleEliminationBracket } from "../lib/tournament-bracket.ts";
for (let count = 4; count <= 8; count++)
    test(`double elimination: ${count} players need two losses, including byes and final resets`, () => {
        for (let trial = 0; trial < 100; trial++) {
            const ids = Array.from({ length: count }, (_, i) => String(i));
            const matches = doubleEliminationBracket(seedBracket(ids));
            const results = new Map<string, { players: (string | null)[]; winner: string | null }>();
            const losses = new Map(ids.map(id => [id, 0]));
            let champion: string | null = null;
            let games = 0;
            for (const match of matches) {
                let players = match.players;
                if (match.sources) {
                    players = match.sources.map(source => {
                        const feeder = results.get(`${source.round}:${source.slot}`)!;
                        assert.ok(feeder);
                        return source.outcome === "winner" ? feeder.winner :
                            feeder.players.find(p => p !== feeder.winner) ?? null;
                    });
                    const final = results.get(`${match.sources[0].round}:${match.sources[0].slot}`)!;
                    if (match.reset && final.winner === final.players[0]) players[1] = null;
                }
                const active = players.filter((p): p is string => p !== null);
                for (const player of active) assert.ok(losses.get(player)! < 2);
                assert.equal(new Set(active).size, active.length);
                const winner = active.length ? active[(trial + games * 7) % active.length] : null;
                if (active.length === 2) {
                    games++;
                    const loser = active.find(p => p !== winner)!;
                    losses.set(loser, losses.get(loser)! + 1);
                }
                results.set(`${match.round}:${match.slot}`, { players, winner });
                champion = winner;
            }
            assert.ok(champion);
            for (const id of ids) assert.equal(id === champion ? losses.get(id)! < 2 : losses.get(id) === 2, true);
            assert.ok(games === 2 * count - 2 || games === 2 * count - 1);
        }
    });
