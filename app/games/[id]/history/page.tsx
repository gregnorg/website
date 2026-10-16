import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGameHistory } from "@/lib/game-history-repository";
import GameHistory from "@/components/game-history";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const history = await loadGameHistory(id);
  if (!history) notFound();
  const { game, frames } = history;
  return <section className="game-page">
    <p className="kicker"><Link href={`/games/${game.game_number}`}>← Back to game #{game.game_number}</Link></p>
    <h1>Game History</h1>
    <p><span className="player-white">{game.white_name}</span> vs <span className="player-black">{game.black_name}</span></p>
    <GameHistory frames={frames} gameId={game.id} whiteId={game.x_player_id} blackId={game.o_player_id} />
  </section>;
}
