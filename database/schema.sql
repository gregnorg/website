CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE game_status AS ENUM ('waiting', 'active', 'won', 'draw', 'cancelled');
CREATE TYPE player_mark AS ENUM ('X', 'O');

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE game_type AS ENUM ('tic_tac_toe', 'pushfight');

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  status game_status NOT NULL DEFAULT 'waiting',
  game_type game_type NOT NULL DEFAULT 'tic_tac_toe',
  winner_id TEXT REFERENCES "user"(id),
  resigned_by_id TEXT REFERENCES "user"(id),
  draw_offered_by_id TEXT REFERENCES "user"(id),
  draw_offer_id UUID,
  CONSTRAINT games_draw_offer_pair CHECK ((draw_offered_by_id IS NULL) = (draw_offer_id IS NULL)),
  idle_reminder_at TIMESTAMPTZ,
  idle_reminder_move_count INTEGER,
  idle_expired BOOLEAN NOT NULL DEFAULT false,
  time_control_seconds INTEGER CHECK (time_control_seconds IN (300, 600, 1200)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  mark player_mark NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at TIMESTAMPTZ,
  time_remaining_ms BIGINT CHECK (time_remaining_ms IS NULL OR time_remaining_ms >= 0),
  PRIMARY KEY (game_id, user_id),
  UNIQUE (game_id, mark)
);

CREATE TABLE moves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES "user"(id),
  position SMALLINT,
  move_number SMALLINT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, position),
  UNIQUE (game_id, move_number)
);

CREATE INDEX games_created_by_idx ON games(created_by);
CREATE INDEX game_players_user_id_idx ON game_players(user_id);
CREATE INDEX moves_game_id_idx ON moves(game_id);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions(user_id);

CREATE TABLE champion_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  crowned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE crown_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_name TEXT NOT NULL,
  previous_name TEXT NOT NULL,
  recipients JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX crown_announcements_pending_idx ON crown_announcements(created_at) WHERE sent_at IS NULL;

CREATE TABLE game_chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000 AND btrim(body) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_chat_messages_game_idx ON game_chat_messages(game_id, id DESC);
CREATE INDEX game_chat_messages_user_idx ON game_chat_messages(user_id, created_at DESC);

-- Exact solved values have no expiry and are shared across games and colors.
CREATE TABLE IF NOT EXISTS pushfight_position_analysis (
  permutation TEXT PRIMARY KEY CHECK (permutation ~ '^[.oOxXY]{26}$'),
  outcome TEXT NOT NULL CHECK (outcome ~ '^(T|W[1-9][0-9]*|L(0|[1-9][0-9]*))$'),
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pushfight_analysis_jobs (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed', 'invalid')),
  cursor_step INTEGER NOT NULL DEFAULT 0 CHECK (cursor_step >= 0),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS pushfight_analysis_pending_idx ON pushfight_analysis_jobs(queued_at) WHERE state = 'pending';
-- One durable cooldown protects the hobby site, even across worker restarts.
CREATE TABLE IF NOT EXISTS pushfight_analysis_provider_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  failures INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  worker_succeeded_at TIMESTAMPTZ
);
INSERT INTO pushfight_analysis_provider_state(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION queue_pushfight_analysis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.game_type = 'pushfight' AND NEW.status IN ('won', 'draw', 'cancelled') THEN
    INSERT INTO pushfight_analysis_jobs(game_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS games_queue_pushfight_analysis ON games;
CREATE TRIGGER games_queue_pushfight_analysis
  AFTER INSERT OR UPDATE OF status ON games FOR EACH ROW EXECUTE FUNCTION queue_pushfight_analysis();
-- Existing completed games are also processed gradually by the bounded worker.
INSERT INTO pushfight_analysis_jobs(game_id)
  SELECT id FROM games WHERE game_type = 'pushfight' AND status IN ('won', 'draw', 'cancelled') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS pushfight_analysis_monitor_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  endpoint TEXT,
  incident_started_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_alert_at TIMESTAMPTZ,
  last_error TEXT
);
INSERT INTO pushfight_analysis_monitor_state(id) VALUES (1) ON CONFLICT DO NOTHING;
