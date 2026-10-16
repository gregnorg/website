import assert from "node:assert/strict";
import test from "node:test";
import { completeGameHistory, type HistoryGame, type HistoryMove } from "../lib/game-history.ts";

const game: HistoryGame = { game_type: "tic_tac_toe", status: "won", winner_id: "white", x_player_id: "white", o_player_id: "black", externalEnding: false };
const moves: HistoryMove[] = [0, 3, 1, 4, 2].map((position, index) => ({
  move_number: index + 1, position, payload: null,
  player_id: index % 2 === 0 ? "white" : "black", mark: index % 2 === 0 ? "X" : "O",
}));

test("complete history reconstructs every tic-tac-toe position without changing moves", () => {
  const original = structuredClone(moves);
  const frames = completeGameHistory(game, moves)!;
  assert.equal(frames.length, 6);
  assert.deepEqual(frames[0].board, Array(9).fill(null));
  assert.deepEqual(frames[5].board, ["X", "X", "X", "O", "O", null, null, null, null]);
  assert.deepEqual(moves, original);
});

test("missing, invalid, or truncated history never qualifies for the button", () => {
  assert.equal(completeGameHistory(game, []), null);
  assert.equal(completeGameHistory(game, moves.slice(1)), null);
  assert.equal(completeGameHistory(game, moves.filter(m => m.move_number !== 3)), null);
  assert.equal(completeGameHistory(game, moves.slice(0, -1)), null);
  assert.equal(completeGameHistory(game, [{ ...moves[0], position: 10 }, ...moves.slice(1)]), null);
  assert.equal(completeGameHistory(game, [{ ...moves[0], player_id: "outsider" }, ...moves.slice(1)]), null);
  assert.equal(completeGameHistory({ ...game, winner_id: "black" }, moves), null);
  assert.equal(completeGameHistory({ ...game, status: "active" }, moves), null);
  assert.equal(completeGameHistory({ ...game, status: "draw" }, moves), null);
});

test("resignation, timeout, forfeit and agreed draw can end before a board win", () => {
  assert.ok(completeGameHistory({ ...game, externalEnding: true }, moves.slice(0, 2)));
  assert.ok(completeGameHistory({ ...game, status: "draw", winner_id: null }, moves.slice(0, 2)));
});

const setups: HistoryMove[] = [
  { move_number: 1, player_id: "white", mark: "X", position: null, payload: { type: "setup", pieces: [
    { row: 0, col: 2, kind: "pusher" }, { row: 0, col: 3, kind: "pusher" }, { row: 1, col: 0, kind: "pusher" },
    { row: 1, col: 1, kind: "nonpusher" }, { row: 1, col: 2, kind: "nonpusher" },
  ] } },
  { move_number: 2, player_id: "black", mark: "O", position: null, payload: { type: "setup", pieces: [
    { row: 0, col: 4, kind: "pusher" }, { row: 0, col: 5, kind: "pusher" }, { row: 1, col: 7, kind: "pusher" },
    { row: 1, col: 6, kind: "nonpusher" }, { row: 1, col: 5, kind: "nonpusher" },
  ] } },
];
const turn: HistoryMove = { move_number: 3, player_id: "white", mark: "X", position: null, payload: { type: "turn", actions: [
  { type: "move", from: { row: 0, col: 3 }, to: { row: 1, col: 3 } },
  { type: "push", index: { row: 1, col: 0 }, dir: "right" },
] } };
const pushGame = { ...game, game_type: "pushfight" as const, externalEnding: true };

test("Push Fight history includes both setups and one frame per completed turn", () => {
  const frames = completeGameHistory(pushGame, [...setups, turn])!;
  assert.equal(frames.length, 4);
  const boards = frames.map(frame => {
    assert.equal(frame.type, "pushfight");
    if (frame.type !== "pushfight") throw new Error("Expected a Push Fight frame");
    return frame.board;
  });
  assert.equal(boards[0][1][0], "empty");
  assert.equal(boards[1][1][0], "white-pusher");
  assert.equal(boards[3][1][4], "white-pusher");
  assert.equal(boards[3][1][1], "white-pusher-anchor");
  assert.equal(boards[3][1][0], "empty");
  assert.deepEqual(frames.map(frame => frame.label), ["Before setup", "White setup", "Black setup", "Turn 1"]);
});

test("Push Fight rejects missing setup, null payloads and wrong players", () => {
  assert.equal(completeGameHistory(pushGame, [turn]), null);
  assert.equal(completeGameHistory(pushGame, [...setups, { ...turn, payload: null }]), null);
  assert.equal(completeGameHistory(pushGame, [...setups, { ...turn, player_id: "black", mark: "O" }]), null);
  assert.equal(completeGameHistory({ ...pushGame, externalEnding: false }, [...setups, turn]), null);
});


test("active games never offer history replay", () => {
  const activeTic = { ...game, status: "active" as const, winner_id: null };
  assert.equal(completeGameHistory(activeTic, moves.slice(0, 3)), null);
  assert.equal(completeGameHistory(activeTic, moves.filter(move => move.move_number !== 2).slice(0, 3)), null);
  const activePush = { ...pushGame, status: "active" as const, winner_id: null, externalEnding: false };
  assert.equal(completeGameHistory(activePush, [...setups, turn]), null);
  assert.equal(completeGameHistory(activePush, [setups[1], turn]), null);
});


test("whole-turn frames match for bundled and legacy turns", () => {
  if (turn.payload?.type !== "turn") throw new Error("Expected a turn");
  const twoMoves: HistoryMove = { ...turn, payload: { type: "turn", actions: [
    turn.payload.actions[0],
    { type: "move", from: { row: 0, col: 2 }, to: { row: 0, col: 3 } },
    turn.payload.actions[1],
  ] } };
  const blackTurn: HistoryMove = { move_number: 4, position: null, player_id: "black", mark: "O", payload: { type: "turn", actions: [
    { type: "move", from: { row: 0, col: 5 }, to: { row: 0, col: 6 } },
    { type: "push", index: { row: 0, col: 4 }, dir: "left" },
  ] } };
  const frames = completeGameHistory(pushGame, [...setups, twoMoves, blackTurn])!;
  assert.ok(frames);
  assert.deepEqual(frames.slice(3).map(frame => frame.label), ["Turn 1", "Turn 2"]);
  const whiteFrame = frames[3];
  if (whiteFrame.type !== "pushfight") throw new Error("Expected Push Fight");
  assert.deepEqual(whiteFrame.actions?.map(action => action.label), [
    "Turn 1 Move 1", "Turn 1 Move 2", "Turn 1 Push",
  ]);
  assert.equal(whiteFrame.actions?.[0].board[0][2], "white-pusher");
  assert.equal(whiteFrame.actions?.[1].board[0][2], "empty");
  assert.equal(whiteFrame.actions?.[1].board[1][0], "white-pusher");
  assert.deepEqual(whiteFrame.actions?.[2].board, whiteFrame.board);
  if (twoMoves.payload?.type !== "turn" || blackTurn.payload?.type !== "turn") throw new Error("Expected turns");
  const legacy = [...twoMoves.payload.actions.map(payload => ({ ...twoMoves, payload })),
    ...blackTurn.payload.actions.map(payload => ({ ...blackTurn, payload }))]
    .map((move, index) => ({ ...move, move_number: index + 3 }));
  assert.deepEqual(completeGameHistory(pushGame, [...setups, ...legacy]), frames);
});


test("push-only and one-move turns each advance one frame", () => {
  const whitePush: HistoryMove = { ...turn, payload: { type: "turn", actions: [
    { type: "push", index: { row: 1, col: 0 }, dir: "right" },
  ] } };
  const blackPush: HistoryMove = { ...turn, move_number: 4, player_id: "black", mark: "O", payload: { type: "turn", actions: [
    { type: "push", index: { row: 1, col: 7 }, dir: "left" },
  ] } };
  const pushOnly = completeGameHistory(pushGame, [...setups, whitePush, blackPush]);
  assert.ok(pushOnly);
  assert.deepEqual(pushOnly.slice(1).map(frame => frame.label), ["White setup", "Black setup", "Turn 1", "Turn 2"]);
  const oneMove = completeGameHistory(pushGame, [...setups, turn]);
  assert.ok(oneMove);
  assert.deepEqual(oneMove.slice(3).map(frame => frame.label), ["Turn 1"]);
});


test("external endings retain the final unfinished turn as a single frame", () => {
  if (turn.payload?.type !== "turn") throw new Error("Expected a turn");
  const partial = { ...turn, payload: turn.payload.actions[0] };
  const frames = completeGameHistory(pushGame, [...setups, partial])!;
  assert.equal(frames.length, 4);
  assert.equal(frames[3].label, "Turn 1 (incomplete)");
  assert.equal(frames[3].type, "pushfight");
  if (frames[3].type !== "pushfight") throw new Error("Expected Push Fight");
  assert.equal(frames[3].board[1][3], "white-pusher");
});
