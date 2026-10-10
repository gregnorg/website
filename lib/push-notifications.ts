import webpush from "web-push";
import { pool } from "./db.ts";
import { buildPushPayload } from "./push-payload.ts";
import { currentPlayerId, summarizeTurns, type GameType, type GameMove } from "./game-state.ts";
import { gamesWaitingForMove } from "./turn-count.ts";
import { retryablePushStatus, pushRetryDelay } from "./push-delivery-policy.ts";

// Jobs are inserted by database triggers in the same transaction as the move.
// Network requests happen only after those transactions have committed.
export async function prepareTurnNotifications(gameId?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobs = await client.query<{ game_id: string }>(
      `SELECT game_id FROM turn_notification_jobs WHERE ($1::uuid IS NULL OR game_id = $1)
       ORDER BY queued_at LIMIT 100 FOR UPDATE SKIP LOCKED`, [gameId ?? null]);
    for (const job of jobs.rows) {
      const result = await client.query<{ game_type: GameType; game_number: string; status: string; x: string; o: string; x_name: string; o_name: string }>(
        `SELECT g.game_type, g.game_number, g.status, xp.user_id x, op.user_id o,
                xu.username x_name, ou.username o_name FROM games g
         JOIN game_players xp ON xp.game_id=g.id AND xp.mark='X'
         JOIN game_players op ON op.game_id=g.id AND op.mark='O'
         JOIN "user" xu ON xu.id=xp.user_id JOIN "user" ou ON ou.id=op.user_id WHERE g.id=$1`, [job.game_id]);
      const game = result.rows[0];
      const moves = await client.query<GameMove & { move_number: number }>(
        "SELECT player_id,payload,move_number FROM moves WHERE game_id=$1 ORDER BY move_number", [job.game_id]);
      const summary = summarizeTurns(moves.rows);
      const recipient = game ? currentPlayerId(game.game_type, game.x, game.o, summary) : null;
      // Piece repositioning is part of the same turn and must not send more alerts.
      const boundary = game?.game_type === "tic_tac_toe" ? moves.rows.length
        : moves.rows.filter(m => ["setup", "push", "turn"].includes(m.payload?.type ?? "")).at(-1)?.move_number ?? 0;
      const eventKey = `${boundary}/${recipient}`;
      await client.query(`UPDATE push_deliveries SET status='superseded'
        WHERE game_id=$1 AND status='pending' AND (event_key<>$2 OR $3 <> 'active')`,
      [job.game_id, eventKey, game?.status ?? "missing"]);
      if (game?.status === "active" && recipient) {
        const payload = buildPushPayload({
          title: `Your turn against ${recipient === game.x ? game.o_name : game.x_name}`,
          body: `It is your turn in ${game.game_type === "pushfight" ? "Push Fight" : "Tic-tac-toe"}.`,
          url: `/games/${game.game_number}`, tag: `turn-${job.game_id}`,
          badgeCount: await gamesWaitingForMove(recipient),
        }, process.env.PUBLIC_SITE_URL ?? "https://shoveactually.com");
        await client.query(`INSERT INTO push_deliveries(game_id,user_id,event_key,endpoint,payload)
          SELECT $1,$2,$3,endpoint,$4::jsonb FROM push_subscriptions WHERE user_id=$2
          ON CONFLICT(game_id,event_key,endpoint) DO NOTHING`, [job.game_id, recipient, eventKey, JSON.stringify(payload)]);
      }
      await client.query("DELETE FROM turn_notification_jobs WHERE game_id=$1", [job.game_id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function deliverPendingPushes(gameId?: string) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) throw new Error("Push VAPID keys are not configured.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:notifications@shoveactually.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const client = await pool.connect();
  try {
    // Session lock avoids simultaneous workers without keeping a transaction open over HTTP.
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(73401952) locked");
    if (!lock.rows[0].locked) return;
    try {
      const due = await client.query<{ id: string; endpoint: string; payload: object; attempts: number; p256dh: string | null; auth: string | null }>(
        `SELECT d.id,d.endpoint,d.payload,d.attempts,s.p256dh,s.auth FROM push_deliveries d
         LEFT JOIN push_subscriptions s ON s.endpoint=d.endpoint AND s.user_id=d.user_id
         JOIN games g ON g.id=d.game_id
         WHERE d.status='pending' AND d.next_attempt_at<=now() AND ($1::uuid IS NULL OR d.game_id=$1)
           AND NOT EXISTS (SELECT 1 FROM turn_notification_jobs j WHERE j.game_id=d.game_id)
         ORDER BY d.next_attempt_at LIMIT 50`, [gameId ?? null]);
      for (const delivery of due.rows) {
        if (!delivery.p256dh || !delivery.auth) {
          await client.query("UPDATE push_deliveries SET status='expired',last_error='Subscription unavailable' WHERE id=$1", [delivery.id]);
          continue;
        }
        try {
          const response = await webpush.sendNotification({ endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth } }, JSON.stringify(delivery.payload), { TTL: 3600, urgency: "high", timeout: 15_000 });
          await client.query(`UPDATE push_deliveries SET status='accepted',attempts=attempts+1,accepted_at=now(),last_status_code=$2,last_error=NULL WHERE id=$1`, [delivery.id, response.statusCode]);
        } catch (error) {
          const status = Number((error as { statusCode?: number }).statusCode ?? 0);
          const message = error instanceof Error ? error.message : "Push request failed";
          const expired = status === 404 || status === 410;
          const retry = retryablePushStatus(status);
          await client.query(`UPDATE push_deliveries SET status=$2,attempts=attempts+1,last_status_code=$3,last_error=$4,
            next_attempt_at=now()+($5 * interval '1 second') WHERE id=$1`,
          [delivery.id, expired ? "expired" : retry ? "pending" : "failed", status, message.slice(0, 1000), pushRetryDelay(delivery.attempts + 1)]);
          if (expired) await client.query("DELETE FROM push_subscriptions WHERE endpoint=$1", [delivery.endpoint]);
          console.error("Push delivery failed:", { deliveryId: delivery.id, status, retry, message });
        }
      }
    } finally { await client.query("SELECT pg_advisory_unlock(73401952)"); }
  } finally { client.release(); }
}
