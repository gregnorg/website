-- purge_all_games.sql
-- Permanently deletes all game data (moves, game_players, games) but leaves user accounts intact.
-- Run this inside psql connected to your application's database.

BEGIN;

-- Delete moves for all games
DELETE FROM moves;

-- Delete game_players (associations of users to games)
DELETE FROM game_players;

-- Delete games themselves
DELETE FROM games;

COMMIT;

-- Note: this is destructive. Make a backup before running.
