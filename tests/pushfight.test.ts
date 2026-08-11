import assert from "node:assert/strict";
import test from "node:test";
import { emptyBoard, applyMove, movesSinceLastPush } from "../lib/pushfight.ts";

test("Pushfight initial board is empty before setup", () => {
  const board = emptyBoard();
  const nonEmptyCount = board.flat().filter((cell) => cell !== "empty").length;
  assert.equal(nonEmptyCount, 0);
});

test("movesSinceLastPush counts setup moves and resets after push", () => {
  const moves = [
    { payload: { type: "move" as const, from: 0, to: 1 } },
    { payload: { type: "move" as const, from: 1, to: 2 } },
    { payload: { type: "push" as const, index: 2, dir: "right" as const } },
    { payload: { type: "move" as const, from: 3, to: 4 } },
  ];
  assert.equal(movesSinceLastPush(moves), 1);
});

test("Pushfight push can remove an opponent piece and declare winner", () => {
  const board = new Array(32).fill(null);
  board[6] = { owner: "player-a", kind: "square" };
  board[7] = { owner: "player-b", kind: "circle" };
  const result = applyMove(board, { type: "push", index: 6, dir: "right" }, "player-a");
  assert.equal(result.winner, "player-a");
  assert.equal(result.board[6], "anchor");
  assert.equal(result.board[7], null);
});
