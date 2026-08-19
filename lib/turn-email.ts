import { Resend } from "resend";
import { pool } from "@/lib/db";
import { sendPushNotification } from "@/lib/push-notifications";
import { gamesWaitingForMove } from "@/lib/turn-count";

export async function sendTurnEmail(gameId: string, recipientId: string, turnKey: string) {
  try {
    await sendTurnEmailUnsafe(gameId, recipientId, turnKey);
  } catch (error) {
    console.error("Turn email failed:", error instanceof Error ? error.message : error);
  }
}

async function sendTurnEmailUnsafe(gameId: string, recipientId: string, turnKey: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const siteUrl = process.env.PUBLIC_SITE_URL ?? "https://shoveactually.com";

  const result = await pool.query<{ email: string; username: string; opponent: string; game_type: string; email_notifications: boolean }>(
    `SELECT me.email, me.username, me.email_notifications, opponent.username AS opponent, g.game_type
       FROM games g
       JOIN game_players mine ON mine.game_id = g.id AND mine.user_id = $2
       JOIN "user" me ON me.id = mine.user_id
       JOIN game_players theirs ON theirs.game_id = g.id AND theirs.user_id <> mine.user_id
       JOIN "user" opponent ON opponent.id = theirs.user_id
      WHERE g.id = $1 AND g.status = 'active'`,
    [gameId, recipientId],
  );
  const recipient = result.rows[0];
  if (!recipient) return;

  const gameName = recipient.game_type === "pushfight" ? "Push Fight" : "Tic-tac-toe";
  const gameUrl = `${siteUrl.replace(/\/$/, "")}/games/${gameId}`;
  await sendPushNotification(recipientId, {
    title: `Your turn against ${recipient.opponent}`,
    body: `It is your turn in ${gameName}.`,
    url: `/games/${gameId}`,
    tag: `turn-${gameId}`,
    badgeCount: await gamesWaitingForMove(recipientId),
  });
  if (!recipient.email_notifications) return;
  if (!apiKey || !from) {
    console.warn("Turn email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.");
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send(
      {
        from,
        to: recipient.email,
        subject: `Your turn against ${recipient.opponent}`,
        text: `Hi ${recipient.username},\n\nIt is your turn in ${gameName} against ${recipient.opponent}.\n\nPlay your turn: ${gameUrl}\n`,
        html: `<p>Hi ${escapeHtml(recipient.username)},</p><p>It is your turn in ${gameName} against ${escapeHtml(recipient.opponent)}.</p><p><a href="${gameUrl}">Play your turn</a></p>`,
      },
      { idempotencyKey: `turn/${gameId}/${turnKey}/${recipientId}` },
    );
    if (response.error) console.error("Resend turn email failed:", response.error.message);
  } catch (error) {
    console.error("Resend turn email failed:", error instanceof Error ? error.message : error);
  }
}

export async function sendGameEndedEmail(gameId: string, eventKey: string) {
  try {
    await sendGameEndedEmailUnsafe(gameId, eventKey);
  } catch (error) {
    console.error("Game-ended email failed:", error instanceof Error ? error.message : error);
  }
}

async function sendGameEndedEmailUnsafe(gameId: string, eventKey: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const siteUrl = process.env.PUBLIC_SITE_URL ?? "https://shoveactually.com";

  const result = await pool.query<{
    user_id: string;
    email: string;
    username: string;
    opponent: string;
    game_type: string;
    status: string;
    winner_id: string | null;
  }>(
    `SELECT me.id AS user_id, me.email, me.username, opponent.username AS opponent,
            g.game_type, g.status, g.winner_id
       FROM games g
       JOIN game_players mine ON mine.game_id = g.id
       JOIN "user" me ON me.id = mine.user_id
       JOIN game_players theirs ON theirs.game_id = g.id AND theirs.user_id <> mine.user_id
       JOIN "user" opponent ON opponent.id = theirs.user_id
      WHERE g.id = $1 AND g.status = 'won' AND mine.user_id <> g.winner_id
        AND me.email_notifications = true`,
    [gameId],
  );
  if (result.rows.length === 0) return;

  const resend = apiKey && from ? new Resend(apiKey) : null;
  const gameUrl = `${siteUrl.replace(/\/$/, "")}/games/${gameId}`;
  for (const recipient of result.rows) {
    const gameName = recipient.game_type === "pushfight" ? "Push Fight" : "Tic-tac-toe";
    const outcome = `${recipient.opponent} won.`;
    if (!resend || !from) {
      console.warn("Game-ended email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.");
      continue;
    }
    try {
      const response = await resend.emails.send(
        {
          from,
          to: recipient.email,
          subject: `${gameName} against ${recipient.opponent} has ended`,
          text: `Hi ${recipient.username},\n\n${outcome}\n\nView the finished game: ${gameUrl}\n`,
          html: `<p>Hi ${escapeHtml(recipient.username)},</p><p><strong>${escapeHtml(outcome)}</strong></p><p><a href="${gameUrl}">View the finished game</a></p>`,
        },
        { idempotencyKey: `game-ended/${gameId}/${eventKey}/${recipient.user_id}` },
      );
      if (response.error) console.error("Resend game-ended email failed:", response.error.message);
    } catch (error) {
      console.error("Resend game-ended email failed:", error instanceof Error ? error.message : error);
    }
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}
