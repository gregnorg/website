-- Provisional frames are separate from official moves and disappear with the game.
CREATE TABLE tournament_move_previews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  base_move_count INTEGER NOT NULL,
  board JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tournament_move_previews_game_idx ON tournament_move_previews(game_id,id DESC);
