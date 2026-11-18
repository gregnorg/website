export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { maintainTournaments, maintainTournamentHistory } = await import("./lib/tournaments");

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
    schedule("Tournament retention", maintainTournamentHistory, 60000);
  }
}
