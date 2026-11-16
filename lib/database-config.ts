import type { PoolConfig } from "pg";

export function databaseConnectionConfig(env: Record<string, string | undefined> = process.env): PoolConfig {
  if (env.DATABASE_SSL !== "true") return { connectionString: env.DATABASE_URL };
  const url = env.DATABASE_URL ? new URL(env.DATABASE_URL) : undefined;
  // pg parses these URL options after explicit config and can replace the SSL
  // object. Remove them so sslmode=no-verify cannot disable verification.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) url?.searchParams.delete(key);
  return {
    connectionString: url?.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}),
    },
  };
}
