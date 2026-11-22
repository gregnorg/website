import { readdirSync } from "node:fs";
import { run, withIsolatedDatabase } from "./isolated-database.mjs";

const tests = readdirSync("tests").filter(name => name.endsWith(".test.ts")).map(name => `tests/${name}`);
const testArgs = ["--test", "--test-timeout=30000", ...tests];
if (process.env.DATABASE_URL) {
  await withIsolatedDatabase(env => run(process.execPath, testArgs, { env }));
} else {
  run(process.execPath, testArgs);
}
