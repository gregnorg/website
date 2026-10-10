"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RefreshOnReturn({ poll = false, automatic = true }: { poll?: boolean; automatic?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!automatic) return;

    let lastRefresh = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh < 1000) return;
      lastRefresh = now;
      router.refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const timer = poll ? window.setInterval(handleVisibilityChange, 5000) : undefined;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, poll, automatic]);

  return null;
}
