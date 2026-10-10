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
      <div className="home-pushfight pf-board" role="img" aria-label="Pushfight board with black and white pieces">
        {pushfightPreview.flatMap((row, rowIndex) => row.map((cell, colIndex) => (
          <span key={`${rowIndex}-${colIndex}`} className={`pf-cell${cell === "invalid" ? " pf-hole" : ""}`}>
            {cell !== "empty" && cell !== "invalid" ? (
              <span className={`pf-piece ${cell.endsWith("circle") ? "circle-piece" : "square-piece"} ${cell.startsWith("white") ? "white-piece" : "black-piece"}${cell.endsWith("anchor") ? " anchor-piece" : ""}`} />
            ) : null}
          </span>
        )))}
        <div className="pf-rails" aria-hidden="true" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gridTemplateRows: "repeat(4, minmax(0, 1fr))" }}>
          <span className="pf-rail up" style={{ gridRow: "1 / 2", gridColumn: "3 / 8" }} />
          <span className="pf-rail down" style={{ gridRow: "4 / 5", gridColumn: "2 / 7" }} />
        </div>
      </div>
      <h1>It’s okay to be pushy.</h1>
      <section className="home-leaders" aria-label="Leaders">
        <div className="home-leader-grid">
          <article><span>Win percentage</span><strong>{percentageLeader?.username ?? "—"}</strong><small>{percentageLeader ? `${(percentageLeader.winPercentage * 100).toFixed(1)}%` : "No games yet"}</small></article>
          <article><span>Most wins</span><strong>{winsLeader?.username ?? "—"}</strong><small>{winsLeader ? `${winsLeader.wins} ${winsLeader.wins === 1 ? "win" : "wins"}` : "No games yet"}</small></article>
          <article><span>Winning streak</span><strong>{streakLeader?.username ?? "—"}</strong><small>{streakLeader ? `${streakLeader.currentStreak} ${streakLeader.currentStreak === 1 ? "game" : "games"}` : "No games yet"}</small></article>
          <article className="home-champion"><span>Champion</span><strong>{boards.champion?.username ?? "Uncrowned"}</strong><small>Beat them to take the crown</small></article>
        </div>
        <Link className="home-leaders-link" href="/leaderboard">View leaderboards →</Link>
      </section>
      <PwaControls />
    </section>
  );
}
