"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { pool } from "@/lib/db";

export async function deleteAccount(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!userId || userId === admin.id) redirect("/admin?error=That+account+cannot+be+deleted.");

  const client = await pool.connect();
  let confirmationFailed = false;
  let hasGameHistory = false;
  try {
    await client.query("BEGIN");
    const target = await client.query<{ username: string }>(
      `SELECT username FROM "user" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const username = target.rows[0]?.username;
    if (!username || confirmation !== username) {
      await client.query("ROLLBACK");
      confirmationFailed = true;
    } else {
      const games = await client.query(
        `SELECT 1 FROM games g
         WHERE g.created_by = $1 OR g.winner_id = $1 OR g.resigned_by_id = $1
            OR EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = g.id AND gp.user_id = $1)
            OR EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id AND m.player_id = $1)
         LIMIT 1`,
        [userId],
      );
      if (games.rows.length > 0) {
        await client.query("ROLLBACK");
        hasGameHistory = true;
      } else {
        await client.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
        await client.query(
          `INSERT INTO admin_audit_log
            (admin_id, admin_username, action, target_type, target_id, target_label, details)
           VALUES ($1, $2, 'delete', 'user', $3, $4, '{}'::jsonb)`,
          [admin.id, admin.username, userId, username],
        );
        await client.query("COMMIT");
      }
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (hasGameHistory) redirect("/admin?error=Accounts+with+game+history+cannot+be+deleted.+Game+history+is+retained+permanently.");
  if (confirmationFailed) redirect("/admin?error=Enter+the+exact+username+to+confirm+deletion.");
  revalidatePath("/admin");
  redirect("/admin?success=Account+deleted.");
}
