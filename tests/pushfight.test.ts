import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMove,
  emptyBoard,
  movesSinceLastPush,
  normalizeMovePayload,
  type MovePayload,
} from "../lib/pushfight.ts";

const whiteSetup: MovePayload = {
  type: "setup",
  pieces: [
    { row: 0, col: 2, kind: "pusher" },
    { row: 0, col: 3, kind: "pusher" },
    { row: 1, col: 0, kind: "pusher" },
    { row: 1, col: 1, kind: "nonpusher" },
    { row: 1, col: 2, kind: "nonpusher" },
  ],
};

test("empty board contains only empty playable cells and invalid cutouts", () => {
  const board = emptyBoard();
  assert.equal(board.flat().filter((cell) => cell === "empty").length, 26);
  assert.equal(board.flat().filter((cell) => cell === "invalid").length, 6);
});

test("setup places three pushers and two non-pushers in the player's zone", () => {
  const result = applyMove(emptyBoard(), whiteSetup, "white");
  assert.equal(result.board[0][2], "white-pusher");
  assert.equal(result.board[1][2], "white-nonpusher");
  assert.throws(
    () => applyMove(emptyBoard(), {
      ...whiteSetup,
      pieces: whiteSetup.type === "setup"
        ? whiteSetup.pieces.map((piece, index) => index === 0 ? { ...piece, col: 4 } : piece)
        : [],
    }, "white"),
    /outside their setup zone/,
  );
});

test("applyMove is immutable and its returned board can reconstruct history", () => {
  const initial = emptyBoard();
  const afterSetup = applyMove(initial, whiteSetup, "white").board;
  assert.equal(initial[0][2], "empty");
  const afterMove = applyMove(afterSetup, {
    type: "move",
    from: { row: 1, col: 0 },
    to: { row: 2, col: 0 },
  }, "white").board;
  assert.equal(afterMove[1][0], "empty");
  assert.equal(afterMove[2][0], "white-pusher");
});

test("a successful push transfers the anchor", () => {
  const board = emptyBoard();
  board[1][0] = "white-pusher";
  board[1][1] = "white-nonpusher";
  board[1][7] = "black-pusher-anchor";
  const result = applyMove(board, { type: "push", index: { row: 1, col: 0 }, dir: "right" }, "white");
  assert.equal(result.board[1][0], "empty");
  assert.equal(result.board[1][1], "white-pusher-anchor");
  assert.equal(result.board[1][2], "white-nonpusher");
  assert.equal(result.board[1][7], "black-pusher");
});

test("the anchored pusher cannot push and an anchored piece cannot be pushed", () => {
  const anchoredPusher = emptyBoard();
  anchoredPusher[1][0] = "white-pusher-anchor";
  anchoredPusher[1][1] = "black-nonpusher";
  assert.throws(
    () => applyMove(anchoredPusher, { type: "push", index: { row: 1, col: 0 }, dir: "right" }, "white"),
    /Only pushers can push/,
  );

  const anchoredLine = emptyBoard();
  anchoredLine[1][0] = "white-pusher";
  anchoredLine[1][1] = "black-pusher-anchor";
  assert.throws(
    () => applyMove(anchoredLine, { type: "push", index: { row: 1, col: 0 }, dir: "right" }, "white"),
    /Line contains anchor/,
  );
});

test("pushing an opponent through an irregular edge wins", () => {
  const board = emptyBoard();
  board[0][4] = "white-pusher";
  board[0][5] = "white-nonpusher";
  board[0][6] = "black-nonpusher";
  const result = applyMove(board, { type: "push", index: { row: 0, col: 4 }, dir: "right" }, "white");
  assert.equal(result.winner, "white");
  assert.equal(result.board[0][6], "white-nonpusher");
});

test("pushing your own piece off makes the opponent win", () => {
  const board = emptyBoard();
  board[0][4] = "white-pusher";
  board[0][5] = "white-nonpusher";
  board[0][6] = "white-nonpusher";
  const result = applyMove(board, { type: "push", index: { row: 0, col: 4 }, dir: "right" }, "white");
  assert.equal(result.winner, "black");
});

test("a push cannot send a piece through the top or bottom siderail", () => {
  const board = emptyBoard();
  board[1][3] = "white-pusher";
  board[2][3] = "white-nonpusher";
  board[3][3] = "white-pusher";
  assert.throws(
    () => applyMove(board, { type: "push", index: { row: 1, col: 3 }, dir: "down" }, "white"),
    /siderail/,
  );
});

test("pushing a piece from G3 into the open G4 cutout ends the game", () => {
  const board = emptyBoard();
  board[0][6] = "white-pusher";
  board[1][6] = "white-nonpusher";
  board[2][6] = "black-nonpusher";
  const result = applyMove(board, { type: "push", index: { row: 0, col: 6 }, dir: "down" }, "white");
  assert.equal(result.winner, "white");
  assert.equal(result.board[2][6], "white-nonpusher");
});

test("move count resets after a push and payload directions are validated", () => {
  const moves: Array<{ payload: MovePayload | null }> = [
    { payload: { type: "move", from: { row: 1, col: 0 }, to: { row: 1, col: 1 } } },
    { payload: { type: "push", index: { row: 1, col: 1 }, dir: "right" } },
    { payload: { type: "move", from: { row: 1, col: 2 }, to: { row: 2, col: 2 } } },
  ];
  assert.equal(movesSinceLastPush(moves), 1);
  assert.throws(
    () => normalizeMovePayload({ type: "push", index: { row: 1, col: 1 }, dir: "sideways" }),
    /Invalid push direction/,
  );
});

test("a complete turn applies up to two moves followed by one push", () => {
  const board = emptyBoard();
  board[1][0] = "white-pusher";
  board[1][2] = "white-nonpusher";
  board[1][3] = "black-nonpusher";
  const payload = normalizeMovePayload({
    type: "turn",
    actions: [
      { type: "move", from: { row: 1, col: 0 }, to: { row: 2, col: 0 } },
      { type: "move", from: { row: 2, col: 0 }, to: { row: 1, col: 1 } },
      { type: "push", index: { row: 1, col: 1 }, dir: "right" },
    ],
  });
  const result = applyMove(board, payload, "white");
  assert.equal(result.board[1][1], "empty");
  assert.equal(result.board[1][2], "white-pusher-anchor");
  assert.equal(result.board[1][4], "black-nonpusher");
  assert.throws(
    () => normalizeMovePayload({ type: "turn", actions: [{ type: "move", from: 8, to: 9 }] }),
    /must end with exactly one push/,
  );
});
