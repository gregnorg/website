DO $$
BEGIN
  CREATE TYPE game_type AS ENUM ('tic_tac_toe', 'pushfight');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_type game_type NOT NULL DEFAULT 'tic_tac_toe';
