export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { maintainTournaments, maintainTournamentHistory } = await import("./lib/tournaments");
  const { maintainGameClocks } = await import("./lib/game-clock");
  const { sendCrownAnnouncements } = await import("./lib/crown-email");

  function schedule(name: string, job: () => Promise<unknown>, intervalMs: number) {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try { await job(); }
      catch (error) { console.error(`${name} failed`, error); }
      finally { busy = false; }
    };
    const timer = setInterval(tick, intervalMs);
    timer.unref();
  }
  schedule("Tournament maintenance", maintainTournaments, 1000);
  schedule("Game clock maintenance", async () => {
    if (await maintainGameClocks()) await sendCrownAnnouncements();
  }, 1000);
  schedule("Tournament retention", maintainTournamentHistory, 60000);
}
