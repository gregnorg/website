-- Purge all games and related rows (moves, game_players, games)
-- Run this inside psql connected to your application's database.

BEGIN;
DELETE FROM moves;
DELETE FROM game_players;
DELETE FROM games;
COMMIT;

-- Note: this deletes all game-related data. Back up your DB before running.
