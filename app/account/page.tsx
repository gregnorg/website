import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ChangeUsernameForm } from "@/components/change-username-form";
import { AppIconAlerts } from "@/components/app-icon-alerts";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ saved?: string; usernameChanged?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { usernameChanged } = await searchParams;

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
      <p>Idle-game emails are always on. You receive a reminder after 3 days without a submitted move, then daily reminders on days 4, 5, and 6. At 7 idle days, the player whose turn it is forfeits: they receive a loss and their opponent receives a win. Opening the app does not reset the timer. New games and turns do not send emails.</p>
      <h2>Change password</h2>
      <p>Your password must contain at least 12 characters.</p>
      <ChangePasswordForm />
    </section>
  );
}
