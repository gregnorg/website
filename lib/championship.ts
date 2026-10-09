import type { PoolClient } from "pg";

export async function transferChampionship(
  client: PoolClient,
  winnerId: string,
  loserId: string,
) {
  const transferred = await client.query(
    `UPDATE champion_state
        SET user_id = $1, crowned_at = now()
      WHERE singleton = true AND user_id = $2 AND user_id <> $1`,
    [winnerId, loserId],
  );

  if (transferred.rowCount === 1) {
    await client.query(
      `INSERT INTO crown_announcements (winner_name, previous_name, recipients)
       SELECT winner.username, previous.username,
              COALESCE((SELECT jsonb_agg(email ORDER BY id) FROM "user"), '[]'::jsonb)
         FROM "user" winner, "user" previous
        WHERE winner.id = $1 AND previous.id = $2`,
      [winnerId, loserId],
    );
  }

  if (transferred.rowCount === 0) {
    await client.query(
      `INSERT INTO champion_state (singleton, user_id)
       VALUES (true, $1)
       ON CONFLICT (singleton) DO NOTHING`,
      [winnerId],
    );
  }
}
