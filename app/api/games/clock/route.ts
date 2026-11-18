import { after } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { loadGameMoves } from "@/lib/game-moves";
import { settleGameClock } from "@/lib/game-clock";
import { currentPlayerId, isSetupPhase, summarizeTurns, type GameType } from "@/lib/game-state";
import { sendCrownAnnouncements } from "@/lib/crown-email";
import { isChatOriginAllowed } from "@/lib/game-chat";
import { readJsonObject, RequestBodyError } from "@/lib/request-body";

export async function POST(request: Request) {
  if (!isChatOriginAllowed(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); }
  catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const gameId = body.gameId;
  if (typeof gameId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) {
    return Response.json({ error: "Invalid game." }, { status: 400 });
  }
  const { moveCount, elapsedMs } = body;
  if (typeof moveCount !== "number" || !Number.isSafeInteger(moveCount) || moveCount < 0 ||
      typeof elapsedMs !== "number" || !Number.isSafeInteger(elapsedMs) || elapsedMs <= 0 || elapsedMs > 1500) {
    return Response.json({ error: "Invalid clock sample." }, { status: 400 });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const membership = await client.query(`SELECT 1 FROM games g JOIN game_players p ON p.game_id=g.id
      WHERE g.id=$1 AND p.user_id=$2 AND g.tournament_id IS NULL`, [gameId, session.user.id]);
    if (!membership.rowCount) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Game not found." }, { status: 404 });
    }
    const timedOut = await settleGameClock(client, gameId, { userId: session.user.id, moveCount, elapsedMs });
    const game = (await client.query<{
      status: string; game_type: GameType; clock_delay_remaining_ms: number;
      my_remaining_ms: string; opponent_remaining_ms: string; x: string; o: string;
    }>(`SELECT g.status,g.game_type,g.clock_delay_remaining_ms,
      me.time_remaining_ms my_remaining_ms,them.time_remaining_ms opponent_remaining_ms,
      x.user_id x,o.user_id o FROM games g
      JOIN game_players me ON me.game_id=g.id AND me.user_id=$2
      JOIN game_players them ON them.game_id=g.id AND them.user_id<>$2
      JOIN game_players x ON x.game_id=g.id AND x.mark='X'
      JOIN game_players o ON o.game_id=g.id AND o.mark='O' WHERE g.id=$1`, [gameId, session.user.id])).rows[0];
    const summary = summarizeTurns(await loadGameMoves(client, gameId));
    await client.query("COMMIT");
    if (timedOut) after(sendCrownAnnouncements);
    return Response.json({
      status: game.status,
      myTurn: !isSetupPhase(game.game_type, summary) && currentPlayerId(game.game_type, game.x, game.o, summary) === session.user.id,
      myRemainingMs: Number(game.my_remaining_ms), opponentRemainingMs: Number(game.opponent_remaining_ms),
      moveCount: summary.moveCount, delayRemainingMs: game.clock_delay_remaining_ms,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
