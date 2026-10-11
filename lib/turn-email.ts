import { prepareTurnNotifications, deliverPendingPushes } from "@/lib/push-notifications";

export async function sendTurnNotification(gameId: string, _recipientId: string) {
  try {
    await prepareTurnNotifications(gameId);
    await deliverPendingPushes(gameId);
  } catch (error) {
    // The durable job remains available for the independent retry worker.
    console.error("Turn notification failed:", error instanceof Error ? error.message : error);
  }
}
