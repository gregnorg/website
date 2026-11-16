import { Pool } from "pg";
import { databaseConnectionConfig } from "./database-config.ts";

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool = globalForDb.pool ?? new Pool({
  ...databaseConnectionConfig(),
  max: 5,
});

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
