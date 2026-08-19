import webpush from "web-push";
import { pool } from "@/lib/db";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:notifications@shoveactually.com",
    publicKey,
    privateKey,
  );
  return true;
}

export async function sendPushNotification(userId: string, payload: PushPayload) {
  try {
    await sendPushNotificationUnsafe(userId, payload);
  } catch (error) {
    console.error("Push notification failed:", error instanceof Error ? error.message : error);
  }
}

async function sendPushNotificationUnsafe(userId: string, payload: PushPayload) {
  if (!configureWebPush()) {
    console.warn("Push notification skipped: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not configured.");
    return;
  }

  const result = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
    [userId],
  );

  await Promise.allSettled(result.rows.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" });
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [subscription.endpoint]);
        return;
      }
      console.error("Push notification failed:", error instanceof Error ? error.message : error);
    }
  }));
}
