"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ChangeUsernameForm({ currentUsername }: { currentUsername: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const username = String(new FormData(event.currentTarget).get("username") ?? "").trim();

    try {
      const result = await authClient.updateUser({ username, displayUsername: username });
      if (result.error) {
        setError(result.error.message || "Could not change your username.");
        return;
      }
      window.location.replace("/account?usernameChanged=1");
    } catch {
      setError("The authentication service is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Username
        <input
          name="username"
          defaultValue={currentUsername}
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_]+"
          autoComplete="username"
          required
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? "Saving…" : "Change username"}</button>
    </form>
  );
}
