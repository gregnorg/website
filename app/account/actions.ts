"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function updateEmailNotifications(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const enabled = formData.get("emailNotifications") === "on";
  await pool.query(
    `UPDATE "user" SET email_notifications = $2, "updatedAt" = now() WHERE id = $1`,
    [session.user.id, enabled],
  );

  revalidatePath("/account");
  redirect(`/account?saved=${enabled ? "on" : "off"}`);
}
