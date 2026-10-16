import { pool } from "../lib/db.ts";
import { processReplayAnalysis } from "../lib/replay-analysis-worker.ts";

const client = await pool.connect();
try {
  console.log(JSON.stringify(await processReplayAnalysis(client)));
} catch (error) {
  console.error("Replay analysis worker failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
