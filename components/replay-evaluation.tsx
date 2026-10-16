"use client";

import { useEffect, useState } from "react";

const results = new Map<string, string>();

export default function ReplayEvaluation({ gameId, step }: { gameId: string; step: number }) {
  const key = `${gameId}:${step}`;
  const [label, setLabel] = useState(() => results.get(key) ?? "Analyzing position…");
  useEffect(() => {
    if (results.has(key)) return;
    const controller = new AbortController();
    async function analyze() {
      try {
        const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/analysis?step=${step}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Lookup unavailable");
        const data = await response.json();
        if (typeof data.label !== "string") throw new Error("Invalid lookup");
        if (controller.signal.aborted) return;
        if (results.size >= 200) results.clear();
        results.set(key, data.label);
        setLabel(data.label);
      } catch {
        if (!controller.signal.aborted) setLabel("Analysis unavailable");
      }
    }
    void analyze();
    return () => controller.abort();
  }, [gameId, step, key]);
  return <p className="replay-evaluation" role="status">{label}</p>;
}
