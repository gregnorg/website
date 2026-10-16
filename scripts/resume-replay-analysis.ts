import { pool } from "../lib/db.ts";
import { resumeReplayAnalysis } from "../lib/replay-analysis-resume.ts";
const client = await pool.connect();
try {
  await resumeReplayAnalysis(client);
  console.log("Automatic solver requests resumed. Existing results and unfinished jobs have been preserved.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }
