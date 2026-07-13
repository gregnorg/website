CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE game_status AS ENUM ('waiting', 'active', 'won', 'draw', 'cancelled');
CREATE TYPE player_mark AS ENUM ('X', 'O');

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by TEXT NOT NULL REFERENCES "user"(id),
  status game_status NOT NULL DEFAULT 'waiting',
  winner_id TEXT REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  mark player_mark NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id),
  UNIQUE (game_id, mark)
);

CREATE TABLE moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES "user"(id),
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 8),
  move_number SMALLINT NOT NULL CHECK (move_number BETWEEN 1 AND 9),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, position),
  UNIQUE (game_id, move_number)
);

CREATE INDEX games_created_by_idx ON games(created_by);
CREATE INDEX game_players_user_id_idx ON game_players(user_id);
CREATE INDEX moves_game_id_idx ON moves(game_id);
