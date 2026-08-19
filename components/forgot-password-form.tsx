"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (result.error) {
        setError(result.error.message || "Could not send the reset email.");
        return;
      }
      setSent(true);
    } catch {
      setError("The authentication service is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <h1>Reset password</h1>
      {sent ? (
        <>
          <p>If an account exists for that email address, a password reset link has been sent.</p>
          <p className="switch"><Link href="/login">Return to login</Link></p>
        </>
      ) : (
        <>
          <p>Enter the email address on your account.</p>
          <form onSubmit={submit}>
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="button" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </form>
          <p className="switch"><Link href="/login">Return to login</Link></p>
        </>
      )}
    </section>
  );
}
