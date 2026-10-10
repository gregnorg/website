import type { PoolClient } from "pg";

export function isChatOriginAllowed(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  // The HTTPS tunnel forwards to an HTTP server on loopback. Its request URL
  // does not necessarily contain the browser's public origin.
  return origin === "https://shoveactually.com"
    || origin === "https://www.shoveactually.com"
    || origin === new URL(request.url).origin;
}

export function validateChatMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length > 0 && body.length <= 1000 ? body : null;
}

// Serialize sends per account so simultaneous requests cannot bypass the limit.
export async function saveChatMessage(client: PoolClient, gameId: string, userId: string, body: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`game-chat:${userId}`]);
  const recent = await client.query(
    "SELECT 1 FROM game_chat_messages WHERE user_id = $1 AND created_at > clock_timestamp() - interval '3 seconds' LIMIT 1",
    [userId],
  );
  if (recent.rowCount) return false;
  await client.query("INSERT INTO game_chat_messages (game_id, user_id, body) VALUES ($1, $2, $3)", [gameId, userId, body]);
  return true;
}
