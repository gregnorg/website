import { solverPosition, solverVerdict, type Team } from "./pushfight-analysis.ts";
import type { Board } from "./pushfight.ts";

export async function lookupPushfightAnalysis(board: Board, nextPlayer: Team): Promise<string | null> {
  const position = solverPosition(board, nextPlayer);
  if (!position) return null;
  try {
    const response = await fetch(`https://styx.verver.ch/pushfight/lookup/perms/${position.permutation}`, {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("status" in data)) return null;
    return solverVerdict(data.status, nextPlayer);
  } catch {
    return null;
  }
}
