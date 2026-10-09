import Link from "next/link";
import { pool } from "@/lib/db";
import { ChampionCrown } from "@/components/champion-crown";
import RefreshOnReturn from "@/components/refresh-on-return";
import type { GameStatus, GameType } from "@/lib/game-state";

export const dynamic = "force-dynamic";

export default async function AllGamesPage({ searchParams }: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const finished = params.status === "finished";
  const query = (params.q ?? "").trim().slice(0, 100);
  const parsedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100000) : 1;
  const [result, champion] = await Promise.all([
    pool.query<{
      game_number: string; status: GameStatus; game_type: GameType;
      white_name: string; black_name: string; white_id: string; black_id: string;
      winner_id: string | null; resigned_by_id: string | null; idle_expired: boolean; time_control_seconds: number | null;
    }>(`SELECT g.game_number, g.status, g.game_type, g.winner_id, g.resigned_by_id, g.idle_expired,
               g.time_control_seconds, w.username AS white_name, b.username AS black_name,
               w.id AS white_id, b.id AS black_id
          FROM games g
          JOIN game_players wp ON wp.game_id = g.id AND wp.mark = 'X'
          JOIN game_players bp ON bp.game_id = g.id AND bp.mark = 'O'
          JOIN "user" w ON w.id = wp.user_id
          JOIN "user" b ON b.id = bp.user_id
         WHERE (NOT g.idle_expired OR g.status = 'won') AND g.status = ANY($1::game_status[])
           AND ($2 = '' OR strpos(lower(w.username), lower($2)) > 0
                OR strpos(lower(b.username), lower($2)) > 0 OR g.game_number::text = $3)
         ORDER BY g.updated_at DESC, g.game_number DESC LIMIT 31 OFFSET $4`,
      [finished ? ["won", "draw", "cancelled"] : ["active", "waiting"], query, query.replace(/^#/, ""), (page - 1) * 30]),
    pool.query<{ user_id: string }>("SELECT user_id FROM champion_state WHERE singleton = true"),
  ]);
  const championId = champion.rows[0]?.user_id;
  const pageUrl = (nextPage: number, showFinished = finished) => `/games/all?${new URLSearchParams({ status: showFinished ? "finished" : "active", q: query, page: String(nextPage) })}`;
  return <section className="page">
    <RefreshOnReturn poll={!finished} />
    <div className="page-heading"><div><p className="kicker">Watch and explore</p><h1>All Games</h1></div></div>
    <nav className="browse-filters" aria-label="Game status">
      <Link className={`button ${!finished ? "" : "secondary"}`} aria-current={!finished ? "page" : undefined} href={pageUrl(1, false)}>Active</Link>
      <Link className={`button ${finished ? "" : "secondary"}`} aria-current={finished ? "page" : undefined} href={pageUrl(1, true)}>Finished</Link>
    </nav>
    <form className="browse-search" action="/games/all">
      <input type="hidden" name="status" value={finished ? "finished" : "active"} />
      <label htmlFor="game-search">Player or game number</label>
      <input id="game-search" name="q" defaultValue={query} placeholder="Username or #142" maxLength={100} />
      <button className="button" type="submit">Search</button>
    </form>
    {result.rows.length ? <div className="game-list">{result.rows.slice(0, 30).map(game => {
      const outcome = game.status === "won"
        ? `${game.winner_id === game.white_id ? game.white_name : game.black_name} won${game.idle_expired ? " by idle forfeit" : game.resigned_by_id ? " by resignation" : ""}`
        : game.status === "draw" ? "Draw" : game.status === "cancelled" ? "Cancelled" : game.status === "waiting" ? "Waiting" : "In progress";
      return <article className="game-card" key={game.game_number}>
        <Link className="game-card-link" href={`/games/${game.game_number}`}>
          <div><h2><span className="player-white">{championId === game.white_id && <ChampionCrown />}{game.white_name}</span><span className="versus"> vs </span><span className="player-black">{championId === game.black_id && <ChampionCrown />}{game.black_name}</span></h2>
          <p>Game #{game.game_number} · {game.game_type === "tic_tac_toe" ? "Tic-tac-toe" : "Push Fight"} · {game.time_control_seconds === null ? "Untimed" : `${game.time_control_seconds / 60} minutes per player`}</p></div>
          <span className="status">{outcome}</span>
        </Link>
      </article>;
    })}</div> : <div className="empty"><h2>No games found</h2><p>{query ? "Try another player or game number." : `No ${finished ? "finished" : "active"} games yet.`}</p></div>}
    <nav className="browse-filters" aria-label="Pagination">
      {page > 1 && <Link href={pageUrl(page - 1)}>← Previous</Link>}
      {result.rows.length > 30 && <Link href={pageUrl(page + 1)}>Next →</Link>}
    </nav>
  </section>;
}
