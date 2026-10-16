import { pool } from "../lib/db.ts";
import { checkReplaySolverHealth } from "../lib/replay-analysis-monitor.ts";

try {
  console.log(JSON.stringify(await checkReplaySolverHealth({ dryRun: process.argv.includes("--dry-run") })));
} catch (error) {
  console.error("Solver outage monitoring failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
