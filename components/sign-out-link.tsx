"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutLink() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const result = await authClient.signOut();
    if (result.error) {
      setBusy(false);
      return;
    }
    window.location.replace("/login");
  }

  return (
    <button className="signout-link" type="button" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
