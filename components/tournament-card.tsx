import Link from "next/link";
import { cancelTournament } from "@/app/tournaments/actions";

export type Tournament = {
  id: string;
  name: string;
  minutes: number;
  format: string;
  delay_seconds: number;
  status: string;
  winner_name: string | null;
};

export type TournamentMatch = {
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
};

function MatchCard({ match, tournamentStatus }: { match: TournamentMatch; tournamentStatus: string }) {
  const description = match.resolved ? `Winner: ${match.winner}`
    : match.status === "active" ? "Ready to play / watch live"
    : tournamentStatus === "cancelled" ? "Cancelled" : "Waiting for opponents";
  return (
    <article className="admin-card">
      <div>
        <strong>{match.p1 ?? "Awaiting player"} vs {match.p2 ?? (match.resolved ? "Bye" : "Awaiting player")}</strong>
        <p>{description}</p>
        {match.game_id && <Link className="button secondary small" href={`/games/${match.game_id}`}>Enter game / watch live</Link>}
      </div>
    </article>
  );
}

function TournamentBracket({ matches, status }: { matches: TournamentMatch[]; status: string }) {
  const rounds = new Map<number, TournamentMatch[]>();
  for (const match of matches) {
    const group = rounds.get(match.round) ?? [];
    group.push(match);
    rounds.set(match.round, group);
  }
  return (
    <div className="tournament-bracket">
      {[...rounds].map(([round, group]) => (
        <section key={round}>
          <h3>{group[0].bracket_label ?? `Round ${round + 1}`}</h3>
          {group.map(match => <MatchCard key={match.slot} match={match} tournamentStatus={status} />)}
        </section>
      ))}
    </div>
  );
}

export function TournamentCard({ tournament: t, matches, admin }: {
  tournament: Tournament; matches: TournamentMatch[]; admin: boolean;
}) {
  return (
    <article className="tournament-card">
      <div className="page-heading">
        <div>
          <h2>{t.name}</h2>
          <p>{t.format === "double" ? "Double elimination" : "Single elimination"} · {t.minutes} minutes per player · {t.delay_seconds}-second delay per turn · {t.status}{t.winner_name && ` · Winner: ${t.winner_name}`}</p>
        </div>
        {admin && t.status === "active" && (
          <form action={cancelTournament}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <button className="danger-button">Cancel tournament</button>
          </form>
        )}
      </div>
      <TournamentBracket matches={matches} status={t.status} />
    </article>
  );
}
