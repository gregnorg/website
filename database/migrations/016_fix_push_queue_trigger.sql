CREATE OR REPLACE FUNCTION queue_turn_notification() RETURNS trigger LANGUAGE plpgsql AS $$
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
