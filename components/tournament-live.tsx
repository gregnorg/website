"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function TournamentLive() {
    const router = useRouter();
    useEffect(() => {
        const events = new EventSource("/api/tournaments/live");
        events.onmessage = () => router.refresh();
        return () => events.close();
    }, [router]);
    return null;
}
