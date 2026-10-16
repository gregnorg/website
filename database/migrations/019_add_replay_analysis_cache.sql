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
