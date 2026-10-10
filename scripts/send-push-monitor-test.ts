import { sendMonitoringEmail } from "../lib/push-monitor.ts";
const recipients = process.env.PUSH_MONITOR_EMAIL?.split(",").map(value => value.trim()).filter(Boolean);
if (!recipients?.length) throw new Error("Run scripts/configure-push-monitor.ts first.");
await sendMonitoringEmail({
  to: recipients,
  subject: "Shove Actually notification monitoring: test email",
  text: "This is a test of the admin email channel for notification monitoring. No notification failure is being reported.\n\nThe monitor checks for permanent push failures, delayed queues, and a retry worker that stops running. It uses email so alerts do not depend on push delivery.\n\nProvider acceptance of a push still does not confirm that a phone displayed it.",
  idempotencyKey: "push-monitor/channel-test/v1",
});
console.log("Monitoring test email accepted by the email provider.");
