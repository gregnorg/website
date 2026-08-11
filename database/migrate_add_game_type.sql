CREATE TYPE IF NOT EXISTS game_type AS ENUM ('tic_tac_toe', 'pushfight');

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_type game_type NOT NULL DEFAULT 'tic_tac_toe';
