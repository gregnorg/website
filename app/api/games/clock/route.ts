import { after } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { settleGameClock } from "@/lib/game-clock";
import { currentPlayerId, isSetupPhase, summarizeTurns, type GameMove, type GameType } from "@/lib/game-state";
import { sendCrownAnnouncements } from "@/lib/crown-email";
import { isChatOriginAllowed } from "@/lib/game-chat";

export async function POST(request: Request) {
  if (!isChatOriginAllowed(request)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const gameId = body?.gameId;
  if (typeof gameId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) {
    return Response.json({ error: "Invalid game." }, { status: 400 });
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
    await settleGameClock(client, gameId);
    const game = (await client.query<{
      status: string; game_type: GameType; clock_started_at: Date | null; server_now: Date;
      my_remaining_ms: string; opponent_remaining_ms: string; x: string; o: string;
    }>(`SELECT g.status,g.game_type,g.clock_started_at,clock_timestamp() server_now,
      me.time_remaining_ms my_remaining_ms,them.time_remaining_ms opponent_remaining_ms,
      x.user_id x,o.user_id o FROM games g
      JOIN game_players me ON me.game_id=g.id AND me.user_id=$2
      JOIN game_players them ON them.game_id=g.id AND them.user_id<>$2
      JOIN game_players x ON x.game_id=g.id AND x.mark='X'
      JOIN game_players o ON o.game_id=g.id AND o.mark='O' WHERE g.id=$1`, [gameId, session.user.id])).rows[0];
    const moves = (await client.query<GameMove>("SELECT player_id,payload FROM moves WHERE game_id=$1 ORDER BY move_number", [gameId])).rows;
    await client.query("COMMIT");
    after(sendCrownAnnouncements);
    return Response.json({
      status: game.status,
      myTurn: !isSetupPhase(game.game_type, summarizeTurns(moves)) && currentPlayerId(game.game_type, game.x, game.o, summarizeTurns(moves)) === session.user.id,
      myRemainingMs: Number(game.my_remaining_ms), opponentRemainingMs: Number(game.opponent_remaining_ms),
      startedAt: game.clock_started_at?.getTime() ?? null, serverNow: game.server_now.getTime(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
