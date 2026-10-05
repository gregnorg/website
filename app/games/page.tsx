import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { gameStatusLabel } from "@/lib/game";
import { clearFinishedGame } from "./actions";
import { currentPlayerId, type GameStatus, type GameType, type PlayerMark } from "@/lib/game-state";
import RefreshOnReturn from "@/components/refresh-on-return";
import { ChampionCrown } from "@/components/champion-crown";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const [result, championResult] = await Promise.all([pool.query<{
    game_number: string;
    id: string;
    status: GameStatus;
    winner_id: string | null;
    resigned_by_id: string | null;
    game_type: GameType;
    time_control_seconds: number | null;
    my_mark: PlayerMark;
    x_player_id: string;
    o_player_id: string;
    move_count: number;
    setup_move_count: number;
    last_turn_player_id: string | null;
    opponent_username: string;
    opponent_id: string;
  }>(
    `SELECT g.game_number, g.id, g.status, g.winner_id, g.resigned_by_id, g.game_type,
            g.time_control_seconds, me.mark AS my_mark,
            xplayer.user_id AS x_player_id, oplayer.user_id AS o_player_id,
            opponent.username AS opponent_username, opponent.id AS opponent_id,
            COUNT(m.id)::int AS move_count,
            COUNT(m.id) FILTER (WHERE m.payload->>'type' = 'setup')::int AS setup_move_count,
            (ARRAY_AGG(m.player_id ORDER BY m.move_number DESC)
              FILTER (WHERE m.payload->>'type' IN ('push', 'turn')))[1] AS last_turn_player_id
       FROM games g
       JOIN game_players me
         ON me.game_id = g.id AND me.user_id = $1
       JOIN game_players them
         ON them.game_id = g.id AND them.user_id <> $1
       JOIN "user" opponent
         ON opponent.id = them.user_id
       JOIN game_players xplayer
         ON xplayer.game_id = g.id AND xplayer.mark = 'X'
       JOIN game_players oplayer
         ON oplayer.game_id = g.id AND oplayer.mark = 'O'
       LEFT JOIN moves m
         ON m.game_id = g.id
      WHERE me.cleared_at IS NULL
      GROUP BY g.id, me.mark, xplayer.user_id, oplayer.user_id, opponent.id, opponent.username
      ORDER BY g.updated_at DESC`,
    [session.user.id],
  ), pool.query<{ user_id: string }>("SELECT user_id FROM champion_state WHERE singleton = true")]);
  const championId = championResult.rows[0]?.user_id;
  const games = result.rows
    .map((game) => ({
      ...game,
      isPlayersTurn: game.status === "active" && currentPlayerId(
        game.game_type,
        game.x_player_id,
        game.o_player_id,
        {
          moveCount: game.move_count,
          setupMoveCount: game.setup_move_count,
          lastTurnPlayerId: game.last_turn_player_id,
        },
      ) === session.user.id,
    }))
    .sort((a, b) => Number(b.isPlayersTurn) - Number(a.isPlayersTurn));

  return (
    <section className="page">
      <RefreshOnReturn />
      <div className="page-heading">
        <div><p className="kicker">Your games</p><h1>My Games</h1></div>
        <Link className="button" href="/games/new">New game</Link>
      </div>
      {games.length ? (
        <div className="game-list">
          {games.map((game) => {
            const isFinished = ["won", "draw", "cancelled"].includes(game.status);
            const timeControl = game.time_control_seconds === null
              ? "Untimed"
              : `Timed · ${game.time_control_seconds / 60} minutes per player`;

            return <article className="game-card" key={game.id}>
              <Link className="game-card-link" href={`/games/${game.id}`}>
                <div>
                  <h2 aria-label={`${session.user.username} versus ${game.opponent_username}`}>
                    <span
                      className={game.my_mark === "X" ? "player-white" : "player-black"}
                      title={game.my_mark === "X" ? "White" : "Black"}
                    >
                      {championId === session.user.id && <ChampionCrown />}{session.user.username}
                    </span>
                    <span className="versus"> vs </span>
                    <span
                      className={game.my_mark === "X" ? "player-black" : "player-white"}
                      title={game.my_mark === "X" ? "Black" : "White"}
                    >
                      {championId === game.opponent_id && <ChampionCrown />}{game.opponent_username}
                    </span>
                  </h2>
                  <p>Game #{game.game_number} · {game.game_type === "tic_tac_toe" ? `Tic-tac-toe · ${timeControl}` : timeControl}</p>
                </div>
                <span className="status">
                  {game.resigned_by_id === game.opponent_id
                    ? "Opponent resigned"
                    : game.resigned_by_id === session.user.id
                      ? "You resigned"
                      : gameStatusLabel(game.status, game.winner_id, session.user.id, game.isPlayersTurn)}
                </span>
              </Link>
              {isFinished && (
                <form action={clearFinishedGame} className="clear-game-form">
                  <input type="hidden" name="gameId" value={game.id} />
                  <button className="clear-game-button" type="submit" aria-label={`Clear game against ${game.opponent_username}`}>
                    Clear
                  </button>
                </form>
              )}
            </article>;
          })}
        </div>
      ) : (
        <div className="empty"><h2>No games yet</h2><p>Start a game and invite a friend by username.</p></div>
      )}
    </section>
  );
}
