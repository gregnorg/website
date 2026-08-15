"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function clearFinishedGame(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const gameId = String(formData.get("gameId") ?? "").trim();
  if (!gameId) redirect("/games");

  await pool.query(
    `UPDATE game_players AS gp
        SET cleared_at = now()
       FROM games AS g
      WHERE gp.game_id = g.id
        AND gp.game_id = $1
        AND gp.user_id = $2
        AND g.status IN ('won', 'draw', 'cancelled')`,
    [gameId, session.user.id],
  );

  revalidatePath("/games");
  redirect("/games");
}
