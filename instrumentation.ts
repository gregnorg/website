export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build")
        return;
    const { maintainTournaments } = await import("./lib/tournaments");
    let busy = false;
    const tick = async () => {
        if (busy)
            return;
        busy = true;
        try {
            await maintainTournaments();
        }
        catch (error) {
            console.error("Tournament maintenance failed", error);
        }
        finally {
            busy = false;
        }
    };
    const timer = setInterval(tick, 1000);
    timer.unref();
}
