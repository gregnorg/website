import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createGame } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { error } = await searchParams;
  const players = await pool.query<{ username: string }>(
    `SELECT username
       FROM "user"
      WHERE id <> $1 AND username IS NOT NULL
      ORDER BY lower(username), username`,
    [session.user.id],
  );
  const hasOpponents = players.rows.length > 0;

  return (
    <section className="panel">
      <p className="kicker">New game</p>
      <h1>Create a match</h1>
      <p>Choose a game and the registered player you want to play.</p>
      <form action={createGame}>
        <label>
          Game
          <select name="game_type" defaultValue="pushfight">
            <option value="tic_tac_toe">Tic-tac-toe</option>
            <option value="pushfight">Pushfight</option>
          </select>
        </label>
        <label>
          Opponent
          <select name="username" defaultValue="" required autoFocus>
            <option value="" disabled>{hasOpponents ? "Select a player" : "No other players registered"}</option>
            {players.rows.map((player) => (
              <option key={player.username} value={player.username}>{player.username}</option>
            ))}
          </select>
        </label>
        {!hasOpponents && <p className="error">Another player must register before you can create a game.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="button" type="submit" disabled={!hasOpponents}>Create game</button>
          <Link href="/games">Cancel</Link>
        </div>
      </form>
    </section>
  );
}
