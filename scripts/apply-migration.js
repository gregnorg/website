import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const envPath = path.resolve(process.cwd(), ".env.local");
let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && fs.existsSync(envPath)) {
  const envContents = fs.readFileSync(envPath, "utf8");
  for (const line of envContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key === "DATABASE_URL") {
      databaseUrl = rest.join("=").trim();
      break;
    }
  }
}

if (!databaseUrl) {
  console.error("DATABASE_URL is not set in the environment or .env.local.");
  process.exit(1);
}

const migrationsDirectory = path.resolve(process.cwd(), "database/migrations");
if (!fs.existsSync(migrationsDirectory)) {
  console.error(`Migrations directory not found: ${migrationsDirectory}`);
  process.exit(1);
}

const migrationFiles = fs.readdirSync(migrationsDirectory)
  .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
  .sort();

const bootstrap = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-c", `
    CREATE TABLE IF NOT EXISTS turntable_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`],
  { stdio: "inherit" },
);
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);

for (const filename of migrationFiles) {
  const alreadyApplied = spawnSync(
    "psql",
    [databaseUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", `SELECT 1 FROM turntable_migrations WHERE filename = '${filename}'`],
    { encoding: "utf8" },
  );
  if (alreadyApplied.status !== 0) {
    process.stderr.write(alreadyApplied.stderr);
    process.exit(alreadyApplied.status ?? 1);
  }
  if (alreadyApplied.stdout.trim() === "1") continue;

  const migrationPath = path.join(migrationsDirectory, filename);
  console.log(`Applying ${filename}`);
  const applied = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-1", "-f", migrationPath, "-c", `INSERT INTO turntable_migrations (filename) VALUES ('${filename}')`],
    { stdio: "inherit" },
  );
  if (applied.status !== 0) process.exit(applied.status ?? 1);
}

if (migrationFiles.length === 0) {
  console.log("No migration files found.");
} else {
  console.log("Database migrations are up to date.");
}
