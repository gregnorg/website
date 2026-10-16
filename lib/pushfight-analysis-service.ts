import { solverPosition, solverVerdict, type Team } from "./pushfight-analysis.ts";
import type { Board } from "./pushfight.ts";

export type SolverValue = { status: string; source: string };
export function solverEndpoints(): string[] {
  return [...new Set([
    process.env.PUSHFIGHT_SOLVER_URL ?? "https://styx.verver.ch/pushfight/lookup",
    process.env.PUSHFIGHT_SOLVER_FALLBACK_URL,
  ].filter((url): url is string => Boolean(url)).map(url => url.replace(/\/+$/, "")))];
}

// Only the background worker calls upstream; durable PostgreSQL values are the
// authority for replay, rather than an expiring Next.js fetch cache.
export async function lookupPushfightStatus(permutation: string, endpoints: string[] = solverEndpoints()): Promise<SolverValue | null> {
  if (!/^[.oOxXY]{26}$/.test(permutation)) return null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/perms/${permutation}`, {
        signal: AbortSignal.timeout(8_000), cache: "no-store",
      });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("status" in data) ||
          solverVerdict(data.status, "white") === null) continue;
      return { status: data.status as string, source: endpoint };
    } catch {
      // Try an independently hosted backup if configured, then let the worker
      // persist a cooldown instead of turning replay visits into more requests.
    }
  }
  return null;
}

export async function lookupPushfightAnalysis(board: Board, nextPlayer: Team): Promise<string | null> {
  const position = solverPosition(board, nextPlayer);
  if (!position) return null;
  const result = await lookupPushfightStatus(position.permutation);
  return result ? solverVerdict(result.status, nextPlayer) : null;
}
