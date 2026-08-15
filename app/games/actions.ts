"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { clearFinishedGameForPlayer } from "@/lib/game-repository";

export async function clearFinishedGame(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const gameId = String(formData.get("gameId") ?? "").trim();
  if (!gameId) redirect("/games");

  const client = await pool.connect();
  try {
    await clearFinishedGameForPlayer(client, gameId, session.user.id);
  } finally {
    client.release();
  }

  revalidatePath("/games");
  redirect("/games");
}
