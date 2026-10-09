import { Resend } from "resend";
import { pool } from "../lib/db.ts";
import { processIdleGame, type IdleReminder } from "../lib/idle-games.ts";

const dryRun = process.argv.includes("--dry-run");
const siteUrl = process.env.PUBLIC_SITE_URL ?? "https://shoveactually.com";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendReminder(email: IdleReminder) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resend || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are required for idle reminders.");
  const { idempotencyKey, ...payload } = email;
  const options = { idempotencyKey, signal: AbortSignal.timeout(15_000) };
  const response = await resend.emails.send({ from, ...payload }, options);
  if (response.error) throw new Error(`Reminder email failed: ${response.error.message}`);
  if (!response.data?.id) throw new Error("Reminder email returned no delivery ID.");
}

const client = await pool.connect();
try {
  const candidates = await client.query<{ id: string }>(
    `SELECT g.id FROM games g
      WHERE g.status = 'active'
        AND COALESCE((SELECT m.created_at FROM moves m WHERE m.game_id = g.id
                       ORDER BY m.move_number DESC LIMIT 1), g.created_at) <= now() - interval '3 days'
      ORDER BY g.created_at, g.id`,
  );
  const counts = { skipped: 0, reminded: 0, forfeited: 0, failed: 0 };
  for (const game of candidates.rows) {
    try {
      await client.query("BEGIN");
      const result = await processIdleGame(client, game.id, { sendReminder, siteUrl, dryRun });
      await client.query(dryRun ? "ROLLBACK" : "COMMIT");
      counts[result]++;
    } catch (error) {
      await client.query("ROLLBACK");
      counts.failed++;
      console.error(`Idle game ${game.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(JSON.stringify({ dryRun, ...counts }));
  if (counts.failed) process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
