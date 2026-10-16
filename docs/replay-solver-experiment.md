# Replay solver experiment

Rollback checkpoint: annotated Git tag `before-replay-solver-experiment`, at
`ebe47d6` (the deployed replay with “Turn # ended” labels). Revert the experiment
commits after that tag and disable `shoveactually-analysis.timer` before deploying
the old application. Also disable `shoveactually-analysis-monitor.timer`. Keep the analysis tables so saved results are not lost.

## Completed-game caching

Migration `019_add_replay_analysis_cache.sql` adds a transactional completion
trigger, a resumable job queue, a permanent position cache, and a shared provider
cooldown. Migration 020 adds the outage monitor state. Apply both with `npm run migrate` before deploying this version.
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
   caps at one attempt per day. Successful lookups reset it. New games and
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

## Admin outage alerts

`shoveactually-analysis-monitor.timer` checks the configured primary lookup API
with a known valid position every 15 minutes, even if no game needs analysis.
It bypasses the permanent cache and excludes fallback endpoints, so a working
backup cannot hide a primary outage. These low-frequency health probes are the
only regular upstream requests unrelated to newly finished games.

After more than 24 hours of consecutive failed checks, the monitor emails all
current, non-banned site admins, using the existing `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` settings. It sends one alert per outage, with no repeated
reminders. A successful check clears the incident and enables alerts for a
future outage. Changing the configured primary starts a fresh monitoring period.

Incident and sent-alert timestamps survive worker/application restarts. Failed
email delivery is retried at the next monitor check with the same idempotency
key. No email is sent merely because a single position cannot be analyzed or
because the background worker is in its retry cooldown.

For a manual probe without state changes or email:

```sh
node --env-file=.env.local scripts/check-replay-analysis.ts --dry-run
```

Inspect `journalctl -u shoveactually-analysis-monitor.service` for monitoring or
email delivery failures, and `pushfight_analysis_monitor_state` for the current
incident. The actual alert is sent at the first scheduled check after the
24-hour threshold, so detection has approximately 15-minute scheduling resolution.

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
