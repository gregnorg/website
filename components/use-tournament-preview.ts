"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, MovePayload } from "@/lib/pushfight";

type Frame = {id: string; game_id: string; base_move_count: number; board: Board};

export function useTournamentPreview(gameId: string, enabled: boolean, baseMoveCount: number, canMove: boolean) {
  const outgoing = useRef<Promise<void>>(Promise.resolve());
  const [incoming, setIncoming] = useState<Frame | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || canMove) return;
    const queue: Frame[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastId = BigInt(0);
    const showNext = () => {
      const frame = queue.shift();
      if (frame) setIncoming(frame);
      timer = setTimeout(() => { timer=undefined; if (queue.length) showNext(); }, 160);
    };
    const receive = (event: Event) => {
      for (const frame of (event as CustomEvent<Frame[]>).detail) {
        if (frame.game_id !== gameId || frame.base_move_count !== baseMoveCount || BigInt(frame.id) <= lastId) continue;
        lastId = BigInt(frame.id);
        queue.push(frame);
      }
      if (!timer && queue.length) showNext();
    };
    window.addEventListener("tournament-preview", receive);
    return () => { if(timer) clearTimeout(timer); window.removeEventListener("tournament-preview", receive); };
  }, [gameId, enabled, baseMoveCount, canMove]);

  const share = useCallback((draft: MovePayload) => {
    if (!enabled || !canMove) return;
    // Serialize snapshots rather than coalescing them: even a fast move + push
    // reaches viewers in the order the player performed it.
    outgoing.current = outgoing.current.then(async () => {
      for (let attempt=0;attempt<2;attempt++) {
        try {
          const response = await fetch(`/api/games/${gameId}/preview`, {
            method:"POST", headers:{"content-type":"application/json"},
            body:JSON.stringify({baseMoveCount,draft}), keepalive:true, signal:AbortSignal.timeout(5000),
          });
          if (response.ok) {setError("");return;}
          if (response.status < 500) break;
        } catch { /* Retry a transient network failure once. */ }
      }
      setError("Live preview could not be shared. You can still submit your turn.");
    });
  }, [gameId, enabled, baseMoveCount, canMove]);

  return {
    board: enabled && !canMove && incoming?.base_move_count === baseMoveCount ? incoming.board : null,
    share, error,
    flush: () => outgoing.current,
  };
}
