"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TournamentLive() {
  const router = useRouter();
  useEffect(() => {
    const events = new EventSource("/api/tournaments/live");
    let refreshAfter = 0;
    let timer: ReturnType<typeof setTimeout>;
    events.addEventListener("preview", (event) => {
      const frames = JSON.parse(event.data);
      // Give viewers time to display each intermediate frame before an official
      // turn refresh replaces the board. Draft events do not refresh the page.
      refreshAfter = Date.now() + Math.min(2000, Math.max(300, frames.length * 180));
      window.dispatchEvent(new CustomEvent("tournament-preview", {detail:frames}));
    });
    events.onmessage = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), Math.max(0, refreshAfter - Date.now()));
    };
    return () => { clearTimeout(timer); events.close(); };
  }, [router]);
  return null;
}
