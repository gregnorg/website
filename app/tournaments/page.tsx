import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { pool } from "@/lib/db";
import { TournamentCard, type Tournament, type TournamentMatch } from "@/components/tournament-card";
export const dynamic = "force-dynamic";
export default async function TournamentsPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session)
        redirect("/login");
    const admin = await isAdmin(session.user.id);
    const tournaments = await pool.query<Tournament>("SELECT * FROM tournaments WHERE status='active' OR finished_at>now()-interval '24 hours' ORDER BY created_at DESC");
    const matches = await pool.query<TournamentMatch>(`SELECT m.*,a.username p1,b.username p2,w.username winner,g.status FROM tournament_matches m JOIN tournaments t ON t.id=m.tournament_id LEFT JOIN "user" a ON a.id=m.player1 LEFT JOIN "user" b ON b.id=m.player2 LEFT JOIN "user" w ON w.id=m.winner_id LEFT JOIN games g ON g.id=m.game_id WHERE t.status='active' OR t.finished_at>now()-interval '24 hours' ORDER BY m.round,m.slot`);
    const byTournament = new Map<string, TournamentMatch[]>();
    for (const match of matches.rows) {
        const group = byTournament.get(match.tournament_id) ?? [];
        group.push(match);
        byTournament.set(match.tournament_id, group);
    }
    return (
        <section className="page">
            <h1>Live tournaments</h1>
            <p>Single or double elimination · Clocks start after both players finish setup</p>
            {!tournaments.rows.length && <p>No live tournaments right now.</p>}
            {tournaments.rows.map(tournament => (
                <TournamentCard key={tournament.id} tournament={tournament}
                    matches={byTournament.get(tournament.id) ?? []} admin={admin} />
            ))}
            <p>Games remain available for 24 hours after the tournament ends. Winners appear on the leaderboard for 30 days.</p>
        </section>
    );
}
