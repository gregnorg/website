import { getLeaderboards, type LeaderboardPlayer } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

function Ranking({ players, value }: {
  players: LeaderboardPlayer[];
  value: (player: LeaderboardPlayer) => string;
}) {
  return (
    <ol className="ranking-list">
      {players.map((player, index) => (
        <li key={player.id}>
          <span className="rank-number">{index + 1}</span>
          <strong>{player.username}</strong>
          <span>{value(player)}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function LeaderboardPage() {
  const boards = await getLeaderboards();

  return (
    <section className="page leaderboard-page">
      <p className="kicker">Hall of push</p>
      <h1>Leaderboards</h1>
      <p className="leaderboard-window-note">Rankings reflect completed games from the last 30 days only. Older results automatically fall out of the rankings.</p>
      <div className="leaderboard-grid">
        <article className="leaderboard-card">
          <h2>Winning percentage</h2>
          <p>Wins divided by completed games.</p>
          <Ranking players={boards.byPercentage} value={(player) => `${(player.winPercentage * 100).toFixed(1)}% (${player.wins}/${player.completedGames})`} />
        </article>
        <article className="leaderboard-card">
          <h2>Most wins</h2>
          <p>Total games won.</p>
          <Ranking players={boards.byWins} value={(player) => `${player.wins} ${player.wins === 1 ? "win" : "wins"}`} />
        </article>
        <article className="leaderboard-card">
          <h2>Winning streak</h2>
          <p>Current consecutive wins.</p>
          <Ranking players={boards.byStreak} value={(player) => `${player.currentStreak} ${player.currentStreak === 1 ? "game" : "games"}`} />
        </article>
        <article className="leaderboard-card champion-card">
          <p className="champion-crown" aria-hidden="true">👑</p>
          <h2>Champion</h2>
          {boards.champion ? (
            <><strong className="champion-name">{boards.champion.username}</strong><p>Defeat the champion to claim the title.</p></>
          ) : <p>No champion has been crowned yet.</p>}
        </article>
      </div>
    </section>
  );
}
