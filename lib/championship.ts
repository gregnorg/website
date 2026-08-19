import type { PoolClient } from "pg";

export async function transferChampionship(
  client: PoolClient,
  winnerId: string,
  loserId: string,
) {
  const transferred = await client.query(
    `UPDATE champion_state
        SET user_id = $1, crowned_at = now()
      WHERE singleton = true AND user_id = $2`,
    [winnerId, loserId],
  );

  if (transferred.rowCount === 0) {
    await client.query(
      `INSERT INTO champion_state (singleton, user_id)
       VALUES (true, $1)
       ON CONFLICT (singleton) DO NOTHING`,
      [winnerId],
    );
  }
}
