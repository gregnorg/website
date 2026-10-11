import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import GameHistory from "@/components/game-history";
import { completeGameHistory, type HistoryGame, type HistoryMove } from "@/lib/game-history";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await pool.query<HistoryGame & { id: string; game_number: string; white_name: string; black_name: string }>(
    `SELECT g.id, g.game_number, g.game_type, g.status, g.winner_id,
            w.user_id AS x_player_id, b.user_id AS o_player_id,
            wu.username AS white_name, bu.username AS black_name,
            (g.resigned_by_id IS NOT NULL OR g.idle_expired OR
             (g.time_control_seconds IS NOT NULL AND (w.time_remaining_ms = 0 OR b.time_remaining_ms = 0))) AS "externalEnding"
       FROM games g
       JOIN game_players w ON w.game_id = g.id AND w.mark = 'X'
       JOIN game_players b ON b.game_id = g.id AND b.mark = 'O'
       JOIN "user" wu ON wu.id = w.user_id
       JOIN "user" bu ON bu.id = b.user_id
      WHERE (g.id::text = $1 OR g.game_number::text = $1) AND (NOT g.idle_expired OR g.status = 'won')`, [id],
  );
  const game = result.rows[0];
  if (!game) notFound();
  const moves = await pool.query<HistoryMove>(
    `SELECT m.move_number, m.position, m.payload, m.player_id, gp.mark FROM moves m
     LEFT JOIN game_players gp ON gp.game_id = m.game_id AND gp.user_id = m.player_id
     WHERE m.game_id = $1 ORDER BY m.move_number`, [game.id],
  );
  const frames = completeGameHistory(game, moves.rows);
  if (!frames) notFound();
  const outcome = game.status === "won"
    ? `${game.winner_id === game.x_player_id ? game.white_name : game.black_name} won`
    : game.status === "draw" ? "Draw" : game.status === "active" ? "Current position · game in progress" : "Cancelled";
  return <section className="game-page">
    <p className="kicker"><Link href={`/games/${game.game_number}`}>← Back to game #{game.game_number}</Link></p>
    <h1>Game History</h1>
    <p><span className="player-white">{game.white_name}</span> vs <span className="player-black">{game.black_name}</span></p>
    <GameHistory frames={frames} gameId={game.id} whiteId={game.x_player_id} blackId={game.o_player_id} outcome={outcome} />
  </section>;
}
