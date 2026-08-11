import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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

const migrationPath = path.resolve(process.cwd(), "database/migrate_add_game_type.sql");
if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

console.log(`Applying migration ${migrationPath} to ${databaseUrl}`);
try {
  execSync(`psql \"${databaseUrl}\" -f \"${migrationPath}\"`, { stdio: "inherit" });
  console.log("Migration applied successfully.");
} catch (error) {
  console.error("Migration failed.");
  process.exit(1);
}
