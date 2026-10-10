import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: SubscriptionInput;
  try {
    input = await request.json() as SubscriptionInput;
  } catch {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  const p256dh = typeof input.keys?.p256dh === "string" ? input.keys.p256dh : "";
  const authKey = typeof input.keys?.auth === "string" ? input.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !authKey || endpoint.length > 2048) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  await pool.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           updated_at = now()`,
    [endpoint, session.user.id, p256dh, authKey],
  );
  // New or restored devices receive the current turn even if its original job
  // ran while there was no subscription. Delivery uniqueness prevents repeats.
  await pool.query(`INSERT INTO turn_notification_jobs(game_id)
    SELECT g.id FROM games g JOIN game_players p ON p.game_id=g.id
    WHERE g.status='active' AND p.user_id=$1
    ON CONFLICT(game_id) DO NOTHING`, [session.user.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { endpoint?: unknown };
  const endpoint = typeof input.endpoint === "string" ? input.endpoint : "";
  if (!endpoint) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint, session.user.id]);
  return NextResponse.json({ ok: true });
}
