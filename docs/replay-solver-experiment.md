# Replay solver experiment

Rollback checkpoint: annotated Git tag `before-replay-solver-experiment`, at
`ebe47d6` (the deployed replay with “Turn # ended” labels). To undo the experiment,
revert its implementation commit, then use the normal build/restart deployment
procedure. The feature requires no database migration.

Only completed Push Fight game histories are analyzed, after a complete turn's
animation. Setup and unfinished turns are excluded. Terminal positions use the
winner reconstructed by our game rules; no tablebase lookup is needed.

The API reconstructs the same validated history as the replay page before
contacting the fixed upstream lookup URL. It encodes the 26 playable squares in
row order, maps the next player to `o/O`, and maps the opponent's anchor to `Y`.
`Wn` means the next player wins, `Ln` the other player wins, and `T` a draw.
The number is the winning player's remaining turns under perfect play, rather
than the combined number of turns taken by both players. See upstream
[srcs/lookup-min.cc](https://github.com/maksverver/pushfight/blob/master/srcs/lookup-min.cc)
and [html/src/board.js](https://github.com/maksverver/pushfight/blob/master/html/src/board.js).

Successful upstream fetches use Next.js's one-day data cache. Browser results
are also cached for repeat navigation (up to 200 entries). Requests time out
after eight seconds; failures show “Analysis unavailable” and do not affect
replay. No solver output is used to change the game's recorded result.

Attribution appears below the board. Its analyzer link preserves the displayed
position's original colors: our White is the analyzer's red, and Black is blue.
The analyzer's `#history=` format supports `P` for a red anchored pusher; the
lookup API uses the normalized `Y` representation instead.
