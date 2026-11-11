import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db.ts";
import { seedBracket } from "../lib/tournament-bracket.ts";
import { settleTournament, settleTournamentClock, lockTournamentGame, cleanupTournamentHistory } from "../lib/tournaments.ts";
import { resignGameForPlayer } from "../lib/game-repository.ts";
import { getLeaderboards } from "../lib/leaderboard.ts";
test("tournament lifecycle: brackets, rematches, server clocks, rankings, and retention", async (t) => {
    if (!process.env.DATABASE_URL) {
        t.skip("DATABASE_URL is not configured");
        return;
    }
    const client = await pool.connect();
    await client.query("BEGIN");
    t.after(async () => { await client.query("ROLLBACK"); client.release(); await pool.end(); });
    const ids = Array.from({ length: 8 }, () => randomUUID());
    for (const id of ids)
        await client.query('INSERT INTO "user"(id,name,email,username,"createdAt","updatedAt","emailVerified","displayUsername") VALUES($1,$1,$1,$1,now(),now(),false,$1)', [id]);
    const create = async (count: number) => {
        const id = (await client.query<{
            id: string;
        }>("INSERT INTO tournaments(name,minutes,created_by) VALUES('Test',7,$1) RETURNING id", [ids[0]])).rows[0].id;
        const pairs = seedBracket(ids.slice(0, count));
        for (let round = 0, n = pairs.length; n >= 1; round++, n /= 2)
            for (let slot = 0; slot < n; slot++)
                await client.query("INSERT INTO tournament_matches(tournament_id,round,slot,player1,player2) VALUES($1,$2,$3,$4,$5)", [id, round, slot, round === 0 ? pairs[slot][0] : null, round === 0 ? pairs[slot][1] : null]);
        await settleTournament(client, id);
        return id;
    };
    const id = await create(5);
    const other = await create(8);
    assert.equal((await client.query("SELECT id FROM tournaments WHERE status='active' AND id IN($1,$2)", [id, other])).rowCount, 2);
    const game = (await client.query("SELECT game_id FROM tournament_matches WHERE tournament_id=$1 AND game_id IS NOT NULL ORDER BY round,slot LIMIT 1", [id])).rows[0].game_id;
    assert.equal((await client.query("SELECT time_control_seconds,clock_started_at FROM games WHERE id=$1", [game])).rows[0].time_control_seconds, 420);
    assert.equal((await client.query("SELECT clock_started_at FROM games WHERE id=$1", [game])).rows[0].clock_started_at, null);
    await settleTournamentClock(client, game);
    assert.equal((await client.query("SELECT clock_started_at FROM games WHERE id=$1", [game])).rows[0].clock_started_at, null);
    const players = (await client.query("SELECT user_id,mark FROM game_players WHERE game_id=$1 ORDER BY mark", [game])).rows;
    for (let i = 0; i < 2; i++) {
        await client.query("INSERT INTO moves(game_id,player_id,move_number,payload) VALUES($1,$2,$3,'{\"type\":\"setup\"}')", [game, players[i].user_id, i + 1]);
        await settleTournamentClock(client, game);
        assert.equal(Boolean((await client.query("SELECT clock_started_at FROM games WHERE id=$1", [game])).rows[0].clock_started_at), i === 1);
    }
    await client.query("UPDATE games SET clock_started_at=clock_timestamp()-interval '20 seconds' WHERE id=$1", [game]);
    await settleTournamentClock(client, game, true);
    const remaining = Number((await client.query("SELECT time_remaining_ms FROM game_players WHERE game_id=$1 AND mark='X'", [game])).rows[0].time_remaining_ms);
    assert.ok(remaining > 409000 && remaining <= 410000);
    await settleTournamentClock(client, game);
    // A draw makes a new game for the same two members without advancing anyone.
    await client.query("UPDATE games SET status='draw' WHERE id=$1", [game]);
    await settleTournament(client, id);
    const rematch = (await client.query("SELECT game_id,resolved FROM tournament_matches WHERE tournament_id=$1 AND round=0 AND game_id IS NOT NULL", [id])).rows[0];
    assert.notEqual(rematch.game_id, game);
    assert.equal(rematch.resolved, false);
    assert.deepEqual((await client.query("SELECT user_id FROM game_players WHERE game_id=$1 ORDER BY user_id", [rematch.game_id])).rows, (await client.query("SELECT user_id FROM game_players WHERE game_id=$1 ORDER BY user_id", [game])).rows);
    assert.equal((await client.query("SELECT clock_started_at FROM games WHERE id=$1", [rematch.game_id])).rows[0].clock_started_at, null);
    // Server timestamps expire a clock without any browser heartbeat.
    for (let i = 0; i < 2; i++)
        await client.query("INSERT INTO moves(game_id,player_id,move_number,payload) VALUES($1,$2,$3,'{\"type\":\"setup\"}')", [rematch.game_id, players[i].user_id, i + 1]);
    await client.query("UPDATE games SET clock_started_at=clock_timestamp()-interval '1000 seconds' WHERE id=$1", [rematch.game_id]);
    await lockTournamentGame(client, rematch.game_id);
    assert.equal((await client.query("SELECT status FROM games WHERE id=$1", [rematch.game_id])).rows[0].status, 'won');
    assert.equal((await client.query("SELECT time_remaining_ms FROM game_players WHERE game_id=$1 AND mark='X'", [rematch.game_id])).rows[0].time_remaining_ms, '0');
    // Finish all bracket sizes and verify exactly N-1 decisive matches and one winner.
    for (const count of [4, 5, 6, 7, 8]) {
        const tid = await create(count);
        for (let round = 0; round < 4; round++) {
            await client.query("UPDATE games SET status='won',winner_id=gp.user_id FROM game_players gp WHERE games.id=gp.game_id AND gp.mark='X' AND games.tournament_id=$1 AND games.status='active'", [tid]);
            await settleTournament(client, tid);
        }
        const result = (await client.query("SELECT status,winner_name FROM tournaments WHERE id=$1", [tid])).rows[0];
        assert.equal(result.status, 'completed');
        assert.ok(result.winner_name);
        assert.equal(Number((await client.query("SELECT count(*) n FROM games WHERE tournament_id=$1", [tid])).rows[0].n), count - 1);
    }
    const boards = await getLeaderboards(client);
    for (const user of ids)
        assert.equal(boards.byWins.find(p => p.id === user)?.wins, 0);
    assert.equal((await client.query("SELECT 1 FROM pushfight_analysis_jobs j JOIN games g ON g.id=j.game_id WHERE g.tournament_id IS NOT NULL")).rowCount, 0);
    // Resignation must never transfer the ordinary championship.
    const active = (await client.query("SELECT id FROM games WHERE tournament_id=$1 AND status='active' LIMIT 1", [other])).rows[0].id;
    const loser = (await client.query("SELECT user_id FROM game_players WHERE game_id=$1 LIMIT 1", [active])).rows[0].user_id;
    await client.query("INSERT INTO champion_state(singleton,user_id) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET user_id=$1", [loser]);
    await resignGameForPlayer(client, active, loser);
    assert.equal((await client.query("SELECT user_id FROM champion_state")).rows[0].user_id, loser);
    await client.query("UPDATE tournaments SET status='cancelled',finished_at=now()-interval '25 hours' WHERE id=$1", [other]);
    await cleanupTournamentHistory(client);
    assert.equal((await client.query("SELECT 1 FROM games WHERE tournament_id=$1", [other])).rowCount, 0);
    assert.equal((await client.query("SELECT 1 FROM tournament_matches WHERE tournament_id=$1", [other])).rowCount, 0);
    assert.equal((await client.query("SELECT 1 FROM tournaments WHERE id=$1", [other])).rowCount, 1);
    await client.query("UPDATE tournaments SET finished_at=now()-interval '31 days' WHERE id=$1", [other]);
    await cleanupTournamentHistory(client);
    assert.equal((await client.query("SELECT 1 FROM tournaments WHERE id=$1", [other])).rowCount, 0);
});
