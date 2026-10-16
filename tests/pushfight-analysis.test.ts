import assert from "node:assert/strict";
import test from "node:test";
import { emptyBoard, isValidCoord, type Board, type PushfightCell } from "../lib/pushfight.ts";
import { solverPosition, solverVerdict } from "../lib/pushfight-analysis.ts";
import { lookupPushfightAnalysis, lookupPushfightStatus } from "../lib/pushfight-analysis-service.ts";

// The working 26-character example supplied for Maks Verver's lookup API.
const example = "..Y.OO........x.xoO.oXX...";
function exampleBoard(invert = false): Board {
  const cells: Record<string, PushfightCell> = {
    ".": "empty", o: "white-nonpusher", O: "white-pusher",
    x: "black-nonpusher", X: "black-pusher", Y: "black-pusher-anchor",
  };
  let index = 0;
  return emptyBoard().map((row, r) => row.map((cell, c) => {
    if (!isValidCoord({ row: r, col: c })) return cell;
    const piece = cells[example[index++]];
    if (!invert || piece === "empty") return piece;
    return piece.replace(/white|black/, team => team === "white" ? "black" : "white") as PushfightCell;
  }));
}

test("solver encoding matches upstream square order and preserves colors in the analyzer link", () => {
  const board = exampleBoard();
  const original = structuredClone(board);
  assert.equal(board[0][4], "black-pusher-anchor");
  assert.equal(board[1][0], "white-pusher");
  assert.deepEqual(solverPosition(board, "white"), {
    permutation: example, sourceUrl: `https://pushfight.verver.ch/#history=${example}`,
  });
  const inverted = exampleBoard(true);
  assert.deepEqual(solverPosition(inverted, "black"), {
    permutation: example,
    sourceUrl: "https://pushfight.verver.ch/#history=..P.XX........o.oxX.xOO...",
  });
  assert.deepEqual(board, original);
});

test("setup, wrong next player, missing pieces, extra anchors and malformed boards cannot be queried", () => {
  assert.equal(solverPosition(emptyBoard(), "white"), null);
  assert.equal(solverPosition(exampleBoard(), "black"), null);
  const terminal = exampleBoard(); terminal[1][0] = "empty";
  assert.equal(solverPosition(terminal, "white"), null);
  const extraAnchor = exampleBoard(); extraAnchor[3][1] = "black-pusher-anchor";
  assert.equal(solverPosition(extraAnchor, "white"), null);
  const badHole = exampleBoard(); badHole[0][0] = "white-pusher";
  assert.equal(solverPosition(badHole, "white"), null);
  assert.equal(solverPosition(exampleBoard().slice(1), "white"), null);
});

test("solver results map both next-player perspectives and retain the solver's turn counts", () => {
  assert.equal(solverVerdict("W1", "white"), "White wins in 1 turn");
  assert.equal(solverVerdict("L5", "white"), "Black wins in 5 turns");
  assert.equal(solverVerdict("W49", "black"), "Black wins in 49 turns");
  assert.equal(solverVerdict("L2", "black"), "White wins in 2 turns");
  assert.equal(solverVerdict("L0", "black"), "White wins in 0 turns");
  assert.equal(solverVerdict("T", "white"), "Draw with perfect play");
  for (const status of [null, 5, "", "W0", "W-1", "W1junk", "L01", "W999999999999999999999"]) {
    assert.equal(solverVerdict(status, "white"), null);
  }
});

test("lookup sends normalized positions with a timeout; PostgreSQL owns the durable cache", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, `https://styx.verver.ch/pushfight/lookup/perms/${example}`);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.cache, "no-store");
    return Response.json({ status: "W1", successors: [] });
  });
  assert.equal(await lookupPushfightAnalysis(exampleBoard(), "white"), "White wins in 1 turn");
  assert.equal(await lookupPushfightAnalysis(exampleBoard(true), "black"), "Black wins in 1 turn");
  assert.equal(await lookupPushfightAnalysis(emptyBoard(), "white"), null);
  assert.equal(calls, 2);
});

test("upstream errors, bad JSON, unexpected outcomes and timeouts yield unavailable analysis", async t => {
  const mock = t.mock.method(globalThis, "fetch");
  for (const response of [new Response("offline", { status: 503 }), new Response("not JSON"),
    Response.json({ status: "unknown" }), Response.json(null), Response.json({ successors: [] })]) {
    mock.mock.mockImplementation(async () => response);
    assert.equal(await lookupPushfightAnalysis(exampleBoard(), "white"), null);
  }
  mock.mock.mockImplementation(async () => { throw new DOMException("timeout", "TimeoutError"); });
  assert.equal(await lookupPushfightAnalysis(exampleBoard(), "white"), null);
});


test("an independently hosted backup is tried only when the primary cannot supply a valid value", async t => {
  const originalPrimary = process.env.PUSHFIGHT_SOLVER_URL;
  const originalBackup = process.env.PUSHFIGHT_SOLVER_FALLBACK_URL;
  process.env.PUSHFIGHT_SOLVER_URL = "http://primary.test/lookup/";
  process.env.PUSHFIGHT_SOLVER_FALLBACK_URL = "http://backup.test/lookup/";
  t.after(() => {
    if (originalPrimary === undefined) delete process.env.PUSHFIGHT_SOLVER_URL;
    else process.env.PUSHFIGHT_SOLVER_URL = originalPrimary;
    if (originalBackup === undefined) delete process.env.PUSHFIGHT_SOLVER_FALLBACK_URL;
    else process.env.PUSHFIGHT_SOLVER_FALLBACK_URL = originalBackup;
  });
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    return url.includes("primary") ? new Response("offline", { status: 503 }) : Response.json({ status: "L5" });
  });
  assert.deepEqual(await lookupPushfightStatus(example), { status: "L5", source: "http://backup.test/lookup" });
  assert.deepEqual(urls, [`http://primary.test/lookup/perms/${example}`, `http://backup.test/lookup/perms/${example}`]);
});
