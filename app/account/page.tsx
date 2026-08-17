import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <section className="panel account-panel">
      <h1>Account</h1>
      <p>Signed in as {session.user.username}.</p>
      <h2>Change password</h2>
      <p>Your password must contain at least 12 characters.</p>
      <ChangePasswordForm />
    </section>
  );
}
