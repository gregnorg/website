import Link from "next/link";
import { PwaControls } from "@/components/pwa-controls";
import { getLeaderboards } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

const pushfightPreview = [
  ["invalid", "invalid", "empty", "empty", "black-square", "empty", "empty", "invalid"],
  ["empty", "empty", "white-anchor", "white-circle", "white-square", "black-circle", "empty", "empty"],
  ["empty", "empty", "empty", "white-circle", "black-circle", "empty", "empty", "black-square"],
  ["invalid", "empty", "empty", "white-square", "black-square", "empty", "invalid", "invalid"],
];

export default async function Home() {
  const boards = await getLeaderboards();
  const percentageLeader = boards.byPercentage[0];
  const winsLeader = boards.byWins[0];
  const streakLeader = boards.byStreak[0];

  return (
    <section className="center hero">
      <h1>It’s okay to be pushy.</h1>
      <div className="actions">
        <Link className="button" href="/signup">Create an account</Link>
        <Link href="/login">Log in</Link>
      </div>
      <PwaControls />
      <section className="home-leaders" aria-labelledby="home-leaders-title">
        <div className="home-leaders-heading">
          <div><h2 id="home-leaders-title">Current leaders</h2><p>Based on the last 30 days</p></div>
          <Link href="/leaderboard">View all leaderboards →</Link>
        </div>
        <div className="home-leader-grid">
          <article><span>Win percentage</span><strong>{percentageLeader?.username ?? "—"}</strong><small>{percentageLeader ? `${(percentageLeader.winPercentage * 100).toFixed(1)}%` : "No games yet"}</small></article>
          <article><span>Most wins</span><strong>{winsLeader?.username ?? "—"}</strong><small>{winsLeader ? `${winsLeader.wins} ${winsLeader.wins === 1 ? "win" : "wins"}` : "No games yet"}</small></article>
          <article><span>Winning streak</span><strong>{streakLeader?.username ?? "—"}</strong><small>{streakLeader ? `${streakLeader.currentStreak} ${streakLeader.currentStreak === 1 ? "game" : "games"}` : "No games yet"}</small></article>
          <article className="home-champion"><span>Champion</span><strong>{boards.champion?.username ?? "Uncrowned"}</strong><small>Defeat them to take the title</small></article>
        </div>
      </section>
      <div className="home-pushfight" role="img" aria-label="Pushfight board with black and white pieces">
        {pushfightPreview.flatMap((row, rowIndex) => row.map((cell, colIndex) => (
          <span key={`${rowIndex}-${colIndex}`} className={`home-pf-cell${cell === "invalid" ? " home-pf-hole" : ""}`}>
            {cell !== "empty" && cell !== "invalid" ? (
              <span className={`pf-piece ${cell.endsWith("circle") ? "circle-piece" : "square-piece"} ${cell.startsWith("white") ? "white-piece" : "black-piece"}${cell.endsWith("anchor") ? " anchor-piece" : ""}`} />
            ) : null}
          </span>
        )))}
      </div>
    </section>
  );
}
