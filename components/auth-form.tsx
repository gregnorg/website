"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    const result = signup
      ? await authClient.signUp.email({ email, password, name: String(data.get("username")), username: String(data.get("username")) })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) return setError(result.error.message || "Something went wrong.");
    router.push("/games");
    router.refresh();
  }

  return (
    <section className="panel auth-panel">
      <h1>{signup ? "Create account" : "Log in"}</h1>
      <p>{signup ? "Make an account to start playing." : "Welcome back."}</p>
      <form onSubmit={submit}>
        {signup && <label>Username<input name="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" minLength={8} autoComplete={signup ? "new-password" : "current-password"} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Log in"}</button>
      </form>
      <p className="switch">{signup ? "Already have an account?" : "Need an account?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link></p>
    </section>
  );
}
