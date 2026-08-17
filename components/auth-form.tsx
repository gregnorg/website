"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode, allowSignup = false }: { mode: "login" | "signup"; allowSignup?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const signup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData(event.currentTarget);
      const password = String(data.get("password"));
      const identifier = String(data.get("identifier")).trim();
      const result = signup
        ? await authClient.signUp.email({
            email: identifier,
            password,
            name: String(data.get("username")),
            username: String(data.get("username")),
            callbackURL: "/games",
          })
        : identifier.includes("@")
          ? await authClient.signIn.email({ email: identifier, password, callbackURL: "/games" })
          : await authClient.signIn.username({ username: identifier, password, callbackURL: "/games" });
      if (result.error) {
        setError(result.error.message || "Something went wrong.");
        return;
      }

      // Use a full navigation so the protected server page receives the newly
      // issued session cookie on its first request.
      window.location.replace("/games");
    } catch {
      setError("The authentication service is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <h1>{signup ? "Create account" : "Log in"}</h1>
      <p>{signup ? "Make an account to start playing." : "Welcome back."}</p>
      <form onSubmit={submit}>
        {signup && <label>Username<input name="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required /></label>}
        <label>
          {signup ? "Email" : "Username or email"}
          <input
            name="identifier"
            type={signup ? "email" : "text"}
            autoComplete={signup ? "email" : "username"}
            required
          />
        </label>
        <label>
          Password
          <span className="password-field">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              minLength={signup ? 12 : 8}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
            <button
              className="password-toggle"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Log in"}</button>
      </form>
      {(signup || allowSignup) && (
        <p className="switch">{signup ? "Already have an account?" : "Need an account?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Log in" : "Sign up"}</Link></p>
      )}
    </section>
  );
}
