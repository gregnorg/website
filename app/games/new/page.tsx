import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createGame } from "./actions";

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { error } = await searchParams;

  return (
    <section className="panel">
      <p className="kicker">Tic-tac-toe</p>
      <h1>New game</h1>
      <p>Enter the username of the person you want to play.</p>
      <form action={createGame}>
        <label>
          Opponent username
          <input
            name="username"
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            autoComplete="off"
            required
            autoFocus
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="button" type="submit">Create game</button>
          <Link href="/games">Cancel</Link>
        </div>
      </form>
    </section>
  );
}
