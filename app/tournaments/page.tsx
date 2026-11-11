import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { pool } from "@/lib/db";
import { cancelTournament } from "./actions";
export const dynamic = "force-dynamic";
export default async function TournamentsPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session)
        redirect("/login");
    const admin = await isAdmin(session.user.id);
    const tournaments = await pool.query<{
        id: string;
        name: string;
        minutes: number;
        format: string;
        delay_seconds: number;
        status: string;
        winner_name: string | null;
    }>("SELECT * FROM tournaments WHERE status='active' OR finished_at>now()-interval '24 hours' ORDER BY created_at DESC");
    const matches = await pool.query<{
        tournament_id: string;
        round: number;
        slot: number;
        bracket_label: string | null;
        game_id: string | null;
        resolved: boolean;
        p1: string | null;
        p2: string | null;
        winner: string | null;
        status: string | null;
    }>(`SELECT m.*,a.username p1,b.username p2,w.username winner,g.status FROM tournament_matches m JOIN tournaments t ON t.id=m.tournament_id LEFT JOIN "user" a ON a.id=m.player1 LEFT JOIN "user" b ON b.id=m.player2 LEFT JOIN "user" w ON w.id=m.winner_id LEFT JOIN games g ON g.id=m.game_id WHERE t.status='active' OR t.finished_at>now()-interval '24 hours' ORDER BY m.round,m.slot`);
    return <section className="page"><h1>Live tournaments</h1><p>Single or double elimination · Clocks start after both players finish setup</p>
    {!tournaments.rows.length && <p>No live tournaments right now.</p>}
    {tournaments.rows.map(t => <article className="tournament-card" key={t.id}><div className="page-heading"><div><h2>{t.name}</h2><p>{t.format === "double" ? "Double elimination" : "Single elimination"} · {t.minutes} minutes per player · {t.delay_seconds}-second delay per turn · {t.status}{t.winner_name && ` · Winner: ${t.winner_name}`}</p></div>{admin && t.status === 'active' && <form action={cancelTournament}><input type="hidden" name="tournamentId" value={t.id}/><button className="danger-button">Cancel tournament</button></form>}</div>
      <div className="tournament-bracket">{[...new Set(matches.rows.filter(m => m.tournament_id === t.id).map(m => m.round))].map(round => <section key={round}><h3>{matches.rows.find(m => m.tournament_id === t.id && m.round === round)?.bracket_label ?? `Round ${round + 1}`}</h3>{matches.rows.filter(m => m.tournament_id === t.id && m.round === round).map(m => <article className="admin-card" key={m.slot}><div><strong>{m.p1 ?? 'Awaiting player'} vs {m.p2 ?? (m.resolved ? 'Bye' : 'Awaiting player')}</strong><p>{m.resolved ? `Winner: ${m.winner}` : m.status === 'active' ? 'Ready to play / watch live' : t.status === 'cancelled' ? 'Cancelled' : 'Waiting for opponents'}</p>{m.game_id && <Link className="button secondary small" href={`/games/${m.game_id}`}>Enter game / watch live</Link>}</div></article>)}</section>)}</div>
    </article>)}<p>Games remain available for 24 hours after the tournament ends. Winners appear on the leaderboard for 30 days.</p></section>;
}
