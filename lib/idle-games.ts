import { transferChampionship } from "./championship.ts";
import type { PoolClient } from "pg";
import { currentPlayerId, summarizeTurns, type GameMove, type GameType } from "./game-state.ts";

export const IDLE_DAY_MS = 24 * 60 * 60 * 1000;
export const IDLE_TIMEOUT_DAYS = 7;

export type IdleReminder = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};
export type IdleGameResult = "skipped" | "reminded" | "forfeited";

// The caller owns the transaction. Locking the game serializes this job with
// moves, clock updates, resignations, and draw acceptance.
export async function processIdleGame(
  client: PoolClient,
  gameId: string,
  options: {
    sendReminder: (email: IdleReminder) => Promise<void>;
    siteUrl: string;
    now?: Date;
    dryRun?: boolean;
  },
): Promise<IdleGameResult> {
  const result = await client.query<{
    game_number: string; game_type: GameType; created_at: Date;
    idle_reminder_at: Date | null; idle_reminder_move_count: number | null;
    x_id: string; x_name: string; x_email: string;
    o_id: string; o_name: string; o_email: string;
  }>(`SELECT g.game_number, g.game_type, g.created_at, g.idle_reminder_at, g.idle_reminder_move_count,
             x.id AS x_id, x.username AS x_name, x.email AS x_email,
             o.id AS o_id, o.username AS o_name, o.email AS o_email
        FROM games g
        JOIN game_players xp ON xp.game_id = g.id AND xp.mark = 'X'
        JOIN game_players op ON op.game_id = g.id AND op.mark = 'O'
        JOIN "user" x ON x.id = xp.user_id
        JOIN "user" o ON o.id = op.user_id
       WHERE g.id = $1 AND g.status = 'active'
       FOR UPDATE OF g SKIP LOCKED`, [gameId]);
  const game = result.rows[0];
  if (!game) return "skipped";

  const moves = await client.query<GameMove & { created_at: Date }>(
    `SELECT player_id, payload, created_at FROM moves WHERE game_id = $1 ORDER BY move_number`, [gameId],
  );
  const now = options.now ?? new Date();
  const idleSince = moves.rows.at(-1)?.created_at ?? game.created_at;
  const idleMs = now.getTime() - idleSince.getTime();
  if (idleMs < 3 * IDLE_DAY_MS) return "skipped";
  const playerId = currentPlayerId(game.game_type, game.x_id, game.o_id, summarizeTurns(moves.rows));
  const isWhite = playerId === game.x_id;

  // Forfeits count as normal wins and losses, including championship transfer.
  if (idleMs >= IDLE_TIMEOUT_DAYS * IDLE_DAY_MS) {
    if (!options.dryRun) {
      await client.query(
        `UPDATE games SET status = 'won', winner_id = $3, idle_expired = true,
                resigned_by_id = NULL, draw_offered_by_id = NULL, draw_offer_id = NULL, updated_at = $2
          WHERE id = $1`, [gameId, now, isWhite ? game.o_id : game.x_id],
      );
      await transferChampionship(client, isWhite ? game.o_id : game.x_id, playerId);
    }
    return "forfeited";
  }

  if (game.idle_reminder_move_count === moves.rows.length && game.idle_reminder_at
      && now.getTime() - game.idle_reminder_at.getTime() < IDLE_DAY_MS) return "skipped";

  // If the machine was offline, send one current reminder rather than a backlog.
  const reminderDay = Math.floor(idleMs / IDLE_DAY_MS);
  const name = isWhite ? game.x_name : game.o_name;
  const opponent = isWhite ? game.o_name : game.x_name;
  const deadline = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Denver",
  }).format(new Date(idleSince.getTime() + IDLE_TIMEOUT_DAYS * IDLE_DAY_MS));
  if (!options.dryRun) {
    await options.sendReminder({
      to: isWhite ? game.x_email : game.o_email,
      subject: `Reminder: your turn against ${opponent} in Game #${game.game_number}`,
      text: `Hi ${name},\n\nGame #${game.game_number} against ${opponent} has been idle for at least ${reminderDay} days, and it is your turn.\n\nPlay your turn: ${options.siteUrl.replace(/\/$/, "")}/games/${game.game_number}\n\nIf no move is submitted before ${deadline} Mountain time (7 days without a move), you will forfeit the game. This counts as a loss for you and a win for your opponent. We will remind you daily until you move or the game ends.\n`,
      idempotencyKey: `idle/${gameId}/${moves.rows.length}/${reminderDay}/${playerId}`,
    });
    await client.query(
      `UPDATE games SET idle_reminder_at = $2, idle_reminder_move_count = $3 WHERE id = $1`,
      [gameId, now, moves.rows.length],
    );
  }
  return "reminded";
}
