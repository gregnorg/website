import assert from "node:assert/strict";
import test from "node:test";
import { TournamentFeed } from "../lib/tournament-live.ts";

test("viewers share one database read and new viewers receive the cached frame", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  let resolve!: (value: { version: string; frames: { id: string; game_id: string; base_move_count: number; board: unknown }[] }) => void;
  const feed = new TournamentFeed(async () => {
    reads++;
    return await new Promise(done => { resolve = done; });
  });
  const received: unknown[][] = [[], [], []];
  const first = feed.subscribe(update => received[0].push(update));
  const second = feed.subscribe(update => received[1].push(update));
  assert.equal(reads, 1);
  const update = { version: "turn1", frames: [{ id: "1", game_id: "game", base_move_count: 2, board: [] }] };
  resolve(update);
  await new Promise<void>(done => setImmediate(done));
  assert.deepEqual(received[0], [update]);
  assert.deepEqual(received[1], [update]);
  const third = feed.subscribe(update => received[2].push(update));
  assert.deepEqual(received[2], [update]);
  assert.equal(reads, 1);
  first(); second(); third();
  t.mock.timers.tick(1000);
  assert.equal(reads, 1);
  const reconnect = feed.subscribe(() => {});
  assert.equal(reads, 2);
  reconnect();
  resolve(update);
});
