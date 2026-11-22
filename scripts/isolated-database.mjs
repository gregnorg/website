import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { databaseConnectionConfig } from "../lib/database-config.ts";

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}).`);
  return result;
}


export async function withIsolatedDatabase(operation) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to copy the test schema.");
  // A private, disposable PostgreSQL instance has its own locks, tables, and
  // sequences. Only schema definitions and migration names are copied; no live
  // users, games, sessions, or notification destinations enter the test database.
  const root = mkdtempSync(path.join(tmpdir(), "shove-tests-"));
  const bin = process.env.TEST_POSTGRES_BIN ?? readdirSync("/usr/lib/postgresql")
    .sort((a, b) => Number(b) - Number(a)).map(version => `/usr/lib/postgresql/${version}/bin`)[0];
  const source = new Pool({ ...databaseConnectionConfig(), max: 1 });
  let isolated;
  let started = false;
  try {
    const url = new URL(process.env.DATABASE_URL);
    const dump = run("pg_dump", ["--schema-only", "--no-owner", "--no-privileges"], {
      stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
        PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)) },
    });
    const schema = path.join(root, "schema.sql");
    writeFileSync(schema, dump.stdout, { mode: 0o600 });
    run(path.join(bin, "initdb"), ["-D", path.join(root, "data"), "-U", "turntable", "--auth=trust", "--no-locale", "--encoding=UTF8", "--no-sync"], { stdio: "ignore" });
    run(path.join(bin, "pg_ctl"), ["-D", path.join(root, "data"), "-l", path.join(root, "server.log"), "-o",
      `-c listen_addresses='' -c unix_socket_directories='${root}' -p 55432 -c fsync=off -c synchronous_commit=off -c full_page_writes=off`, "-w", "start"], { stdio: "ignore" });
    started = true;
    const databaseUrl = `postgresql://turntable@localhost:55432/postgres?host=${encodeURIComponent(root)}`;
    const env = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_SSL: "false",
      RESEND_API_KEY: "", RESEND_FROM_EMAIL: "", VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: "" };
    run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", schema], {
      stdio: ["ignore", "ignore", "pipe"], env: { ...env, PGDATABASE: "postgres", PGHOST: root, PGPORT: "55432", PGUSER: "turntable", PGPASSWORD: "" },
    });
    isolated = new Pool({ connectionString: databaseUrl, max: 1 });
    const applied = await source.query("SELECT filename FROM turntable_migrations ORDER BY filename");
    for (const { filename } of applied.rows) await isolated.query("INSERT INTO turntable_migrations(filename) VALUES($1)", [filename]);
    for (const table of ["pushfight_analysis_provider_state", "pushfight_analysis_monitor_state", "push_monitor_state"]) {
      await isolated.query(`INSERT INTO ${table}(id) VALUES(1) ON CONFLICT DO NOTHING`);
    }
    run(process.execPath, ["scripts/apply-migration.js"], { env });
    console.log("Running tests against a disposable database; production receives schema reads only.");
    return await operation(env, { root });
  } finally {
    await source.end();
    await isolated?.end();
    if (started) run(path.join(bin, "pg_ctl"), ["-D", path.join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    rmSync(root, { recursive: true, force: true });
  }
}
