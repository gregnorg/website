import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_BOARD, currentMark, isDraw, play, winner } from "../lib/game.ts";

test("players alternate turns", () => {
  const afterX = play(EMPTY_BOARD, 0, "X");
  assert.equal(currentMark(afterX), "O");
  assert.throws(() => play(afterX, 1, "X"), /not that player's turn/);
});

test("detects a winner", () => {
  const board = ["X", "X", "X", "O", "O", null, null, null, null] as const;
  assert.equal(winner([...board]), "X");
});

test("detects a draw", () => {
  const board = ["X", "O", "X", "X", "O", "O", "O", "X", "X"] as const;
  assert.equal(isDraw([...board]), true);
});

test("rejects occupied squares", () => {
  const board = play(EMPTY_BOARD, 4, "X");
  assert.throws(() => play(board, 4, "O"), /occupied/);
});
