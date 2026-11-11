import type { PoolClient } from "pg";
import { pool } from "./db.ts";
import { createGameRecord } from "./game-repository.ts";
import { currentPlayerId, summarizeTurns, isSetupPhase, type GameMove } from "./game-state.ts";
import { tournamentRemaining, type BracketSource } from "./tournament-bracket.ts";
// All tournament writers lock the tournament before its games, including moves.
export async function lockTournamentGame(client: PoolClient, gameId: string) {
    const result = await client.query<{
        tournament_id: string | null;
    }>("SELECT tournament_id FROM games WHERE id = $1", [gameId]);
    const id = result.rows[0]?.tournament_id;
    if (id) {
        await client.query("SELECT id FROM tournaments WHERE id = $1 FOR UPDATE", [id]);
        await settleTournament(client, id);
    }
    return id;
}
export async function settleTournament(client: PoolClient, id: string) {
    const tournament = (await client.query<{
        minutes: number;
        status: string;
        created_by: string;
        format: string;
    }>("SELECT * FROM tournaments WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!tournament || tournament.status !== "active")
        return;
    const matches = await client.query<{
        sources: BracketSource[] | null;
        reset_final: boolean;
        round: number;
        slot: number;
        player1: string | null;
        player2: string | null;
        resolved: boolean;
        winner_id: string | null;
        game_id: string | null;
    }>("SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY round, slot", [id]);
    for (const match of matches.rows) {
        if (match.resolved)
            continue;
        let { player1, player2, game_id } = match;
        if (match.sources) {
            const players: (string | null)[] = [];
            let ready = true;
            let skipReset = false;
            for (const source of match.sources) {
                const feeder = (await client.query<{
                    resolved: boolean; winner_id: string | null; player1: string | null; player2: string | null;
                }>("SELECT resolved,winner_id,player1,player2 FROM tournament_matches WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, source.round, source.slot])).rows[0];
                if (!feeder?.resolved) { ready = false; break; }
                players.push(source.outcome === "winner" ? feeder.winner_id :
                    feeder.winner_id === feeder.player1 ? feeder.player2 : feeder.player1);
                if (match.reset_final && feeder.winner_id === feeder.player1) skipReset = true;
            }
            if (!ready) continue;
            [player1, player2] = players;
            // The undefeated finalist needs only one grand-final win.
            if (skipReset) player2 = null;
            await client.query("UPDATE tournament_matches SET player1=$4, player2=$5 WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, match.round, match.slot, player1, player2]);
        }
        else if (match.round > 0 && tournament.format !== "double") {
            const feeders = await client.query<{
                resolved: boolean;
                winner_id: string | null;
            }>("SELECT resolved, winner_id FROM tournament_matches WHERE tournament_id=$1 AND round=$2 AND slot IN ($3,$4) ORDER BY slot", [id, match.round - 1, match.slot * 2, match.slot * 2 + 1]);
            if (feeders.rows.length !== 2 || feeders.rows.some(m => !m.resolved))
                continue;
            player1 = feeders.rows[0].winner_id;
            player2 = feeders.rows[1].winner_id;
            await client.query("UPDATE tournament_matches SET player1=$4, player2=$5 WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, match.round, match.slot, player1, player2]);
        }
        if (!player1 || !player2) {
            await client.query("UPDATE tournament_matches SET resolved=true, winner_id=$4 WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, match.round, match.slot, player1 ?? player2]);
            continue;
        }
        if (!game_id) {
            game_id = await createTournamentGame(client, id, player1, player2, tournament.minutes);
            await client.query("UPDATE tournament_matches SET game_id=$4 WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, match.round, match.slot, game_id]);
        }
        await settleTournamentClock(client, game_id);
        const game = (await client.query<{
            status: string;
            winner_id: string | null;
        }>("SELECT status, winner_id FROM games WHERE id=$1", [game_id])).rows[0];
        if (game.status === "draw") {
            const rematch = await createTournamentGame(client, id, player1, player2, tournament.minutes);
            await client.query("UPDATE tournament_matches SET game_id=$4 WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, match.round, match.slot, rematch]);
        }
        else if (game.status === "won") {
            await client.query("UPDATE tournament_matches SET resolved=true, winner_id=$4 WHERE tournament_id=$1 AND round=$2 AND slot=$3", [id, match.round, match.slot, game.winner_id]);
        }
    }
    await client.query(`UPDATE tournaments SET status='completed', finished_at=now(), winner_name=u.username
    FROM tournament_matches m JOIN "user" u ON u.id=m.winner_id
    WHERE tournaments.id=$1 AND m.tournament_id=tournaments.id AND m.resolved
    AND m.round=(SELECT max(round) FROM tournament_matches WHERE tournament_id=$1)`, [id]);
}
async function createTournamentGame(client: PoolClient, id: string, p1: string, p2: string, minutes: number) {
    const gameId = await createGameRecord(client, p1, p2, "pushfight", undefined, minutes * 60, id);
    return gameId;
}
export async function settleTournamentClock(client: PoolClient, gameId: string, finishTurn = false) {
    const game = (await client.query<{
        status: string;
        clock_started_at: Date | null;
        delay_seconds: number;
        tournament_id: string | null;
    }>("SELECT g.status, g.clock_started_at, g.tournament_id, t.delay_seconds FROM games g LEFT JOIN tournaments t ON t.id=g.tournament_id WHERE g.id=$1 FOR UPDATE OF g", [gameId])).rows[0];
    if (!game?.tournament_id || game.status !== "active")
        return;
    const players = (await client.query<{
        user_id: string;
        mark: string;
        time_remaining_ms: string;
    }>("SELECT * FROM game_players WHERE game_id=$1", [gameId])).rows;
    const x = players.find(p => p.mark === "X")!, o = players.find(p => p.mark === "O")!;
    const moves = (await client.query<GameMove>("SELECT player_id, payload FROM moves WHERE game_id=$1 ORDER BY move_number", [gameId])).rows;
    const summary = summarizeTurns(moves);
    if (isSetupPhase("pushfight", summary))
        return;
    const active = currentPlayerId("pushfight", x.user_id, o.user_id, summary);
    const player = players.find(p => p.user_id === active)!;
    const remaining = tournamentRemaining(Number(player.time_remaining_ms), game.clock_started_at, Date.now(), game.delay_seconds);
    if (remaining === 0 || finishTurn) {
        await client.query("UPDATE game_players SET time_remaining_ms=$3 WHERE game_id=$1 AND user_id=$2", [gameId, active, remaining]);
        await client.query("UPDATE games SET clock_started_at=NULL WHERE id=$1", [gameId]);
    }
    if (remaining === 0)
        await client.query("UPDATE games SET status='won', winner_id=$2, draw_offered_by_id=NULL, draw_offer_id=NULL, updated_at=now() WHERE id=$1", [gameId, active === x.user_id ? o.user_id : x.user_id]);
    else if (!game.clock_started_at && !finishTurn)
        await client.query("UPDATE games SET clock_started_at=clock_timestamp() WHERE id=$1", [gameId]);
}
export async function maintainTournaments() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // A transaction advisory lock allows multiple server processes without duplicate work.
        const lock = await client.query<{
            locked: boolean;
        }>("SELECT pg_try_advisory_xact_lock(829173) AS locked");
        if (!lock.rows[0].locked) {
            await client.query("ROLLBACK");
            return;
        }
        const active = await client.query<{
            id: string;
        }>("SELECT id FROM tournaments WHERE status='active' ORDER BY id FOR UPDATE");
        for (const t of active.rows)
            await settleTournament(client, t.id);
        await cleanupTournamentHistory(client);
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function cleanupTournamentHistory(client: PoolClient) {
    await client.query(`DELETE FROM tournament_move_previews p USING games g
      WHERE p.game_id=g.id AND p.created_at<now()-interval '2 minutes'
      AND (g.status<>'active' OR p.base_move_count<(SELECT count(*) FROM moves WHERE game_id=g.id))`);
    await client.query("DELETE FROM games g USING tournaments t WHERE g.tournament_id=t.id AND t.finished_at < now()-interval '24 hours'");
    await client.query("DELETE FROM tournament_matches m USING tournaments t WHERE m.tournament_id=t.id AND t.finished_at < now()-interval '24 hours'");
    await client.query("DELETE FROM tournaments WHERE finished_at < now()-interval '30 days'");
}
