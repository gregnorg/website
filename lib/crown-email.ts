import { Resend } from "resend";
import { pool } from "./db.ts";

export function crownEmail(winner: string, previous: string, siteUrl: string) {
  return {
    subject: `👑 All hail ${winner} — we have a new champion!`,
    text: `The crown has changed hands!\n\n${winner} has dethroned ${previous} and is now the Shove Actually champion!\n\nCongratulations, ${winner}! And to everyone else: the throne is waiting for its next challenger. Who will take the crown next?\n\nSee the champion and rankings: ${siteUrl.replace(/\/$/, "")}/leaderboard\n\nLet the chase begin! 👑`,
  };
}

// Queue entries are committed with the crown transfer. Each batch uses private
// individual messages and a stable key; failed batches remain available to retry.
export async function sendCrownAnnouncements() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return;
  const client = await pool.connect();
  try {
    const resend = new Resend(apiKey);
    for (let count = 0; count < 10; count++) {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string; winner_name: string; previous_name: string; recipients: string[];
      }>("SELECT id, winner_name, previous_name, recipients FROM crown_announcements WHERE sent_at IS NULL ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED");
      const announcement = result.rows[0];
      if (!announcement) { await client.query("COMMIT"); break; }
      if (announcement.recipients.length) {
        const email = crownEmail(announcement.winner_name, announcement.previous_name, process.env.PUBLIC_SITE_URL ?? "https://shoveactually.com");
        const response = await resend.batch.send(
          announcement.recipients.map(to => ({ from, to, ...email })),
          { idempotencyKey: `crown/${announcement.id}`, signal: AbortSignal.timeout(15_000) },
        );
        if (response.error || response.data?.data.length !== announcement.recipients.length) {
          throw new Error(response.error?.message ?? "Crown email batch returned incomplete delivery IDs.");
        }
      }
      await client.query("UPDATE crown_announcements SET sent_at = now() WHERE id = $1", [announcement.id]);
      await client.query("COMMIT");
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Crown announcement failed:", error instanceof Error ? error.message : error);
  } finally { client.release(); }
}
