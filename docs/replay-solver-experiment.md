# Replay solver experiment

Rollback checkpoint: annotated Git tag `before-replay-solver-experiment`, at
`ebe47d6` (the deployed replay with “Turn # ended” labels). Revert the experiment
commits after that tag and disable `shoveactually-analysis.timer` before deploying
the old application. Also disable `shoveactually-analysis-monitor.timer`. Keep the analysis tables so saved results are not lost.

## Completed-game caching

Migration `019_add_replay_analysis_cache.sql` adds a transactional completion
trigger, a resumable job queue, a permanent position cache, and a shared provider
cooldown. Migration 020 adds outage monitor state, and 021 adds the durable one-week stop. Apply all three with `npm run migrate` before deploying this version.
Every Push Fight win, resignation, timeout, agreed draw, or cancellation queues
one game. The trigger covers every ending path without putting network requests
inside gameplay transactions. Existing finished games are backfilled gradually.

The separate `shoveactually-analysis.timer` runs a worker every minute. After the
usual build/restart deployment, install it with:

```sh
sudo bash deploy/install-analysis.sh
```

The installer enables both the analysis worker and its independent outage monitor.
For fresh installations, `deploy/install-production.sh` also installs both timers.
A manual batch is `npm run games:analyze`. The worker makes at most 20 position
lookups per batch, waits at least one second between them, and stops starting new
lookups after 45 seconds. An advisory lock prevents overlapping invocations.
Each position is saved before its game's cursor advances. A crash or a later
batch resumes without requesting previously saved positions.

Exact `Wn`, `Ln`, and `T` results never expire and are shared across games using
the normalized board as a key. Raw results are stored instead of White/Black
labels so color-swapped positions reuse the same value correctly. Source and
fetch time are preserved. The existing PostgreSQL backups include these tables.

Replay's API reads PostgreSQL only; it never contacts a solver. Pending turns
show “Analysis pending” or “Analysis temporarily unavailable; retry scheduled.”
The displayed pending turn checks our own API again every 30 seconds. Once a
value exists, it remains available through upstream outages, server restarts,
and application deployments. Setup and unfinished turns are excluded; terminal
positions display the winner reconstructed by our game rules.

## Outage and fallback options

1. **Saved results plus automatic retry (default).** On failure, a persistent,
   shared cooldown starts at five minutes, triples on consecutive failures, and
   caps at one attempt per day. After a week of continuous outage, all automatic
   requests stop until an administrator explicitly resumes them. Successful
   lookups before the cutoff reset the outage and retry delay. New games and
   replay visits cannot bypass the cooldown. Saved values are never deleted or
   replaced by a failure. Uncached positions receive no invented prediction.
2. **Independent backup server.** Set `PUSHFIGHT_SOLVER_FALLBACK_URL` to another
   server running Maks Verver's lookup API. The worker tries it when the primary
   times out, errors, or returns an invalid result. Public aliases of the same
   host are not independent backups. Only configure a provider you control or
   have arranged to use.
3. **Self-host the exact solver.** Run Maks Verver's lookup service with his
   tablebase, then set `PUSHFIGHT_SOLVER_URL` to that API root (or use it as the
   fallback). The compact tablebase is about 86 GB, excluding runtime and backup
   overhead. This removes dependence on the public service for new positions.
   Downloading or operating that tablebase is not part of this change.

The default API root is `https://styx.verver.ch/pushfight/lookup`.
Configured roots must omit the trailing `/perms/<position>` portion. For example:

```dotenv
PUSHFIGHT_SOLVER_FALLBACK_URL=http://127.0.0.1:8003
```

Requests time out after eight seconds per configured endpoint. Worker failures
are visible in `journalctl -u shoveactually-analysis.service`; pending game and
provider details are in `pushfight_analysis_jobs` and
`pushfight_analysis_provider_state`.

## Admin outage alerts and the one-week stop

`shoveactually-analysis-monitor.timer` wakes every minute to inspect local state.
When healthy, it probes the configured primary with a known valid position every
15 minutes, even if no game needs analysis. During outages, both the monitor and
analysis worker share the increasing retry delay: five minutes, 15 minutes,
45 minutes, and so on, capped at one day. A common session lock prevents duplicate
attempts from the two processes. Worker observations update the same outage
clock, and successful primary lookups reset it. Cached reads never reset it.

After more than 24 hours of consecutive failures, the monitor emails all current,
non-banned site admins using the existing `RESEND_API_KEY` and
`RESEND_FROM_EMAIL`. This warning is sent once per outage.

At seven days from the first failure, the worker or monitor persists a stop
**before making another request**. Both automatic analysis requests and health
probes stop. The monitor sends a separate, one-time admin email saying requests
have stopped. Failed delivery retries with the same idempotency key, without
resuming solver queries. No extra 24-hour warning is sent if monitoring first
catches up after the week-long cutoff.

Saved results keep working. Unfinished jobs and newly finished games stay queued;
uncached turns display “Analysis unavailable; automatic retries stopped” and
stop polling. App restarts, deployments, new games, and endpoint changes do not
clear the stop. Check the service manually, then explicitly resume with:

```sh
npm run games:analysis:resume
```

This resets the outage, warning/stop email acknowledgments, and retry cooldown
atomically, keeping cached values and pending jobs. The next worker/monitor tick
can try again. Revisit or refresh a paused replay turn to load its new state.

The default configuration uses only the public server and automatic retries;
backup hosting and self-hosting remain optional capabilities, not active options.
Before a stop, the monitor checks the primary directly instead of the cache or
fallback so a backup cannot hide a primary outage. Once stopped, no configured
endpoint is queried automatically.

For a manual state check without changing state or sending email:

```sh
node --env-file=.env.local scripts/check-replay-analysis.ts --dry-run
```

A dry run honors cooldowns and the stopped state; it does not override them.
Inspect `journalctl -u shoveactually-analysis-monitor.service` for monitoring or
email delivery failures, and `pushfight_analysis_monitor_state` for the outage,
next check, and stop timestamps. Threshold decisions run at roughly one-minute
resolution, independently of whether a new upstream request is due.

## Solver conventions and attribution

The 26 playable squares are encoded in row order, with the next player mapped
to `o/O` and the opponent's anchor mapped to `Y`. `Wn` means the next player
wins, `Ln` the other player wins, and `T` a draw. The number is the winning
player's remaining turns under perfect play, rather than the combined number
of turns taken by both players. No solver output changes a recorded game result.
See upstream [lookup-min.cc](https://github.com/maksverver/pushfight/blob/master/srcs/lookup-min.cc),
[board.js](https://github.com/maksverver/pushfight/blob/master/html/src/board.js),
and [tablebase documentation](https://github.com/maksverver/pushfight#data-files).

Attribution remains below the board. Its analyzer link preserves the original
colors: our White is the analyzer's red, and Black is blue. The `#history=` link
supports `P` for a red anchored pusher; the lookup API uses normalized `Y`.
