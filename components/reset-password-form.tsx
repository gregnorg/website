"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token, invalid }: { token?: string; invalid?: boolean }) {
  const [error, setError] = useState(invalid ? "This password reset link is invalid or has expired." : "");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirmation") ?? "")) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message || "Could not reset your password.");
        return;
      }
      setComplete(true);
    } catch {
      setError("The authentication service is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <h1>Choose a new password</h1>
      {complete ? (
        <><p>Your password has been reset.</p><p className="switch"><Link href="/login">Log in</Link></p></>
      ) : (
        <>
          <p>Your new password must contain at least 12 characters.</p>
          <form onSubmit={submit}>
            <label>New password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required disabled={!token} /></label>
            <label>Confirm password<input name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" required disabled={!token} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="button" disabled={busy || !token}>{busy ? "Resetting…" : "Reset password"}</button>
          </form>
          <p className="switch"><Link href="/forgot-password">Request a new link</Link></p>
        </>
      )}
    </section>
  );
}
