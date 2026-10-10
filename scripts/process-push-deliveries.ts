import { pool } from "../lib/db.ts";
import { prepareTurnNotifications, deliverPendingPushes } from "../lib/push-notifications.ts";
try {
  await pool.query("UPDATE push_monitor_state SET worker_started_at=now() WHERE id=1");
  await prepareTurnNotifications();
  await deliverPendingPushes();
  // Retain a month of terminal delivery records; pending requests remain durable.
  await pool.query("DELETE FROM push_deliveries WHERE status <> 'pending' AND created_at < now() - interval '30 days'");
  await pool.query("UPDATE push_monitor_state SET worker_succeeded_at=now(),worker_error=NULL WHERE id=1");
} catch (error) {
  try {
    await pool.query("UPDATE push_monitor_state SET worker_error=$1 WHERE id=1",
      [(error instanceof Error ? error.message : "Push worker failed").slice(0, 1000)]);
  } catch { /* The separate monitor still detects a stale success heartbeat. */ }
  console.error("Push worker failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally { await pool.end(); }
