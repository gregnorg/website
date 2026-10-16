"use client";

import { useEffect, useState } from "react";

const results = new Map<string, string>();

export default function ReplayEvaluation({ gameId, step }: { gameId: string; step: number }) {
  const key = `${gameId}:${step}`;
  const [label, setLabel] = useState(() => results.get(key) ?? "Loading analysis…");
  useEffect(() => {
    if (results.has(key)) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function analyze() {
      try {
        const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/analysis?step=${step}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Lookup unavailable");
        const data = await response.json();
        if (typeof data.label !== "string") throw new Error("Invalid lookup");
        if (controller.signal.aborted) return;
        if (data.pending === true) {
          setLabel(data.label);
          retry = setTimeout(() => { void analyze(); }, 30_000);
          return;
        }
        if (results.size >= 200) results.clear();
        results.set(key, data.label);
        setLabel(data.label);
      } catch {
        if (!controller.signal.aborted) setLabel("Analysis unavailable");
      }
    }
    void analyze();
    return () => { controller.abort(); clearTimeout(retry); };
  }, [gameId, step, key]);
  return <p className="replay-evaluation" role="status">{label}</p>;
}
