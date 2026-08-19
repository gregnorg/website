import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ChangeUsernameForm } from "@/components/change-username-form";
import { AppIconAlerts } from "@/components/app-icon-alerts";
import { pool } from "@/lib/db";
import { updateEmailNotifications } from "./actions";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; usernameChanged?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const [{ saved, usernameChanged }, preference] = await Promise.all([
    searchParams,
    pool.query<{ email_notifications: boolean }>(
      `SELECT email_notifications FROM "user" WHERE id = $1`,
      [session.user.id],
    ),
  ]);
  const emailNotifications = preference.rows[0]?.email_notifications ?? false;

  return (
    <section className="panel account-panel">
      <h1>Account</h1>
      <p>Signed in as {session.user.username}.</p>
      <h2>Username</h2>
      <p>Choose the name other players see. Use 3–24 letters, numbers, or underscores.</p>
      <ChangeUsernameForm currentUsername={session.user.username ?? ""} />
      {usernameChanged && <p className="success account-setting-success" role="status">Username changed.</p>}
      <h2>App icon alerts</h2>
      <p>Show when a game is waiting for your move. Requires the installed app and notification permission.</p>
      <AppIconAlerts />
      <h2>Email notifications</h2>
      <p>Receive an email when a game is waiting for your move or when an opponent wins.</p>
      <form action={updateEmailNotifications} className="notification-settings-form">
        <label className="checkbox-label">
          <input name="emailNotifications" type="checkbox" defaultChecked={emailNotifications} />
          Email me about my games
        </label>
        <button className="button" type="submit">Save notification settings</button>
        {saved && <p className="success" role="status">Email notifications turned {saved}.</p>}
      </form>
      <h2>Change password</h2>
      <p>Your password must contain at least 12 characters.</p>
      <ChangePasswordForm />
    </section>
  );
}
