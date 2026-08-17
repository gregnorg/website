import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const result = await pool.query<{ role: string; username: string }>(
    `SELECT role, username FROM "user" WHERE id = $1`,
    [session.user.id],
  );
  const user = result.rows[0];
  if (!user?.role.split(",").includes("admin")) redirect("/games");

  return { id: session.user.id, username: user.username };
}

export async function isAdmin(userId: string) {
  const result = await pool.query<{ role: string }>(
    `SELECT role FROM "user" WHERE id = $1`,
    [userId],
  );
  return result.rows[0]?.role.split(",").includes("admin") ?? false;
}
