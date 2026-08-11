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
      <p className="kicker">New game</p>
      <h1>Create a match</h1>
      <p>Choose a game and enter the username of the person you want to play.</p>
      <form action={createGame}>
        <label>
          Game
          <select name="game_type" defaultValue="tic_tac_toe">
            <option value="tic_tac_toe">Tic-tac-toe</option>
            <option value="pushfight">Pushfight</option>
          </select>
        </label>
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
