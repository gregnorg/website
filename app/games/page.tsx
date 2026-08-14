import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { gameStatusLabel } from "@/lib/game";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const result = await pool.query<{
    id: string;
    status: string;
    winner_id: string | null;
    opponent_username: string;
    updated_at: Date;
  }>(
    `SELECT g.id, g.status, g.winner_id,
            opponent.username AS opponent_username, g.updated_at
       FROM games g
       JOIN game_players me
         ON me.game_id = g.id AND me.user_id = $1
       JOIN game_players them
         ON them.game_id = g.id AND them.user_id <> $1
       JOIN "user" opponent
         ON opponent.id = them.user_id
      ORDER BY g.updated_at DESC`,
    [session.user.id],
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="kicker">Your games</p><h1>Games</h1></div>
        <Link className="button" href="/games/new">New game</Link>
      </div>
      {result.rows.length ? (
        <div className="game-list">
          {result.rows.map((game) => (
            <Link className="game-card" href={`/games/${game.id}`} key={game.id}>
              <div>
                <h2>vs. {game.opponent_username}</h2>
                <p>Updated {game.updated_at.toLocaleString()}</p>
              </div>
              <span className="status">
                {gameStatusLabel(game.status, game.winner_id, session.user.id)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty"><h2>No games yet</h2><p>Start a game and invite a friend by username.</p></div>
      )}
    </section>
  );
}
