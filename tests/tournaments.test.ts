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
