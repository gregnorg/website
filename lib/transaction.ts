import type { PoolClient } from "pg";
import { pool } from "./db.ts";

// Keep redirects and response work outside the callback: resolving it commits,
// throwing rolls back, and the connection is always released before returning.
export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch (rollbackError) { console.error("Transaction rollback failed", rollbackError); }
    throw error;
  } finally { client.release(); }
}
