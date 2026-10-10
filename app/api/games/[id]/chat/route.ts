import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { saveChatMessage, validateChatMessage } from "@/lib/game-chat";

type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store" };
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

async function findGame(id: string) {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM games WHERE (id::text = $1 OR game_number::text = $1) AND (NOT idle_expired OR status = 'won')",
    [id],
  );
  return result.rows[0]?.id;
}

export async function GET(_request: Request, context: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return reply({ error: "Sign in to read chat." }, 401);
  const gameId = await findGame((await context.params).id);
  if (!gameId) return reply({ error: "Game not found." }, 404);
  const messages = await pool.query(
    `SELECT m.id::text, m.body, m.created_at, u.username
       FROM game_chat_messages m JOIN "user" u ON u.id = m.user_id
      WHERE m.game_id = $1 ORDER BY m.id DESC LIMIT 100`,
    [gameId],
  );
  return reply({ messages: messages.rows.reverse() });
}

export async function POST(request: Request, context: Context) {
  // Reject cross-site form submissions as well as cross-origin fetches.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid origin." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Invalid request." }, 400);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return reply({ error: "Sign in to post in chat." }, 401);
  let body: string | null;
  try {
    body = validateChatMessage((await request.json())?.body);
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  if (!body) return reply({ error: "Enter a message of up to 1,000 characters." }, 400);
  const gameId = await findGame((await context.params).id);
  if (!gameId) return reply({ error: "Game not found." }, 404);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await saveChatMessage(client, gameId, session.user.id, body);
    await client.query("COMMIT");
    return saved ? reply({ ok: true }, 201) : reply({ error: "Wait a few seconds before sending another message." }, 429);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
