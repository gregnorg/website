CREATE TABLE turn_notification_jobs (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE push_deliveries (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','failed','superseded')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  last_status_code INTEGER,
  last_error TEXT,
  UNIQUE(game_id, event_key, endpoint)
);
CREATE INDEX push_deliveries_due_idx ON push_deliveries(next_attempt_at) WHERE status = 'pending';
CREATE FUNCTION queue_turn_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'moves' THEN
    INSERT INTO turn_notification_jobs(game_id) VALUES (NEW.game_id)
      ON CONFLICT(game_id) DO UPDATE SET queued_at = now();
  ELSE
    INSERT INTO turn_notification_jobs(game_id) VALUES (NEW.id)
      ON CONFLICT(game_id) DO UPDATE SET queued_at = now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER games_queue_turn AFTER INSERT OR UPDATE ON games FOR EACH ROW EXECUTE FUNCTION queue_turn_notification();
CREATE TRIGGER moves_queue_turn AFTER INSERT ON moves FOR EACH ROW EXECUTE FUNCTION queue_turn_notification();
INSERT INTO turn_notification_jobs(game_id) SELECT id FROM games WHERE status = 'active';
