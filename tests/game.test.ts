import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_BOARD,
  currentMark,
  gameStatusLabel,
  isDraw,
  play,
  winner,
} from "../lib/game.ts";
import { currentPlayerId, summarizeTurns } from "../lib/game-state.ts";

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

test("shows completed game status from the player's perspective", () => {
  assert.equal(gameStatusLabel("won", "player-1", "player-1"), "won");
  assert.equal(gameStatusLabel("won", "player-1", "player-2"), "lost");
  assert.equal(gameStatusLabel("draw", null, "player-1"), "draw");
  assert.equal(gameStatusLabel("active", null, "player-1", true), "your turn");
  assert.equal(gameStatusLabel("active", null, "player-1", false), "opponent's turn");
});

test("shared turn state handles tic-tac-toe and Pushfight setup and turns", () => {
  assert.equal(currentPlayerId("tic_tac_toe", "x", "o", {
    moveCount: 3, setupMoveCount: 0, lastTurnPlayerId: null,
  }), "o");

  const afterWhiteSetup = summarizeTurns([
    { player_id: "white", payload: { type: "setup", pieces: [] } },
  ]);
  assert.equal(currentPlayerId("pushfight", "white", "black", afterWhiteSetup), "black");

  const afterWhiteTurn = summarizeTurns([
    { player_id: "white", payload: { type: "setup", pieces: [] } },
    { player_id: "black", payload: { type: "setup", pieces: [] } },
    { player_id: "white", payload: { type: "turn", actions: [{ type: "push", index: { row: 1, col: 1 }, dir: "right" }] } },
  ]);
  assert.equal(currentPlayerId("pushfight", "white", "black", afterWhiteTurn), "black");
});
