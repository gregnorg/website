import { Pool } from "pg";
import { checkPushHealth, sendMonitoringEmail } from "../lib/push-monitor.ts";

// A separate connection and timeout allow alerting even when the application or
// its database connections are stuck. Email uses a different provider from push.
const monitorPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 1, connectionTimeoutMillis: 10_000, query_timeout: 10_000,
});
const dryRun = process.argv.includes("--dry-run");
let client;
try {
  client = await monitorPool.connect();
  console.log(JSON.stringify(await checkPushHealth({ client, dryRun })));
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown monitoring error";
  console.error("Push monitoring failed:", message);
  process.exitCode = 1;
  const recipients = process.env.PUSH_MONITOR_EMAIL?.split(",").map(value => value.trim()).filter(Boolean);
  if (!dryRun && recipients?.length) {
    try {
      await sendMonitoringEmail({
        to: recipients,
        subject: "Shove Actually notification monitor cannot complete its checks",
        text: `The independent notification monitor failed: ${message}\n\nCheck PostgreSQL and journalctl -u shoveactually-push-monitor.service. This alert repeats at most hourly while checks keep failing.`,
        idempotencyKey: `push-monitor/check-error/${Math.floor(Date.now() / 3_600_000)}`,
      });
    } catch (emailError) { console.error("Monitoring error email failed:", emailError instanceof Error ? emailError.message : emailError); }
  }
} finally { client?.release(); await monitorPool.end(); }
