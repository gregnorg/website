CREATE TABLE tournaments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL,
 created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
 minutes INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 35791394),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
 winner_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ
);
ALTER TABLE games ADD COLUMN tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
 ADD COLUMN clock_started_at TIMESTAMPTZ;
ALTER TABLE games DROP CONSTRAINT games_time_control_seconds_check;
ALTER TABLE games ADD CONSTRAINT games_time_control_seconds_check CHECK (time_control_seconds > 0);
CREATE INDEX games_tournament_idx ON games(tournament_id);
CREATE TABLE tournament_matches (
 tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
 round INTEGER NOT NULL, slot INTEGER NOT NULL,
 player1 TEXT REFERENCES "user"(id), player2 TEXT REFERENCES "user"(id),
 winner_id TEXT REFERENCES "user"(id), resolved BOOLEAN NOT NULL DEFAULT false,
 game_id UUID REFERENCES games(id) ON DELETE SET NULL,
 PRIMARY KEY(tournament_id, round, slot)
);

CREATE OR REPLACE FUNCTION queue_pushfight_analysis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tournament_id IS NULL AND NEW.game_type = 'pushfight' AND NEW.status IN ('won', 'draw', 'cancelled') THEN
    INSERT INTO pushfight_analysis_jobs(game_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
