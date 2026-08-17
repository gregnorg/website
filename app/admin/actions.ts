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
        `DELETE FROM games g
         WHERE g.created_by = $1 OR g.winner_id = $1
            OR EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = g.id AND gp.user_id = $1)`,
        [userId],
      );
      await client.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
      await client.query(
        `INSERT INTO admin_audit_log
          (admin_id, admin_username, action, target_type, target_id, target_label, details)
         VALUES ($1, $2, 'delete', 'user', $3, $4, jsonb_build_object('games_deleted', $5::int))`,
        [admin.id, admin.username, userId, username, games.rowCount ?? 0],
      );
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (confirmationFailed) redirect("/admin?error=Enter+the+exact+username+to+confirm+deletion.");
  revalidatePath("/admin");
  redirect("/admin?success=Account+deleted.");
}

export async function deleteIdleGames(formData: FormData) {
  const admin = await requireAdmin();
  const days = Number(formData.get("days"));
  const includeActive = formData.get("includeActive") === "on";
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    redirect("/admin?error=Choose+an+idle+period+between+1+and+365+days.");
  }

  const client = await pool.connect();
  let deletedCount = 0;
  try {
    await client.query("BEGIN");
    const deleted = await client.query(
      `DELETE FROM games
       WHERE updated_at < now() - ($1 * interval '1 day')
         AND ($2::boolean OR status <> 'active')`,
      [days, includeActive],
    );
    deletedCount = deleted.rowCount ?? 0;
    await client.query(
      `INSERT INTO admin_audit_log
        (admin_id, admin_username, action, target_type, target_label, details)
       VALUES ($1, $2, 'delete_idle', 'game', $3,
         jsonb_build_object('days', $4::int, 'include_active', $5::boolean, 'games_deleted', $6::int))`,
      [admin.id, admin.username, `Games idle ${days}+ days`, days, includeActive, deleted.rowCount ?? 0],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  revalidatePath("/admin");
  redirect(`/admin?success=${encodeURIComponent(`${deletedCount} idle games deleted.`)}`);
}
