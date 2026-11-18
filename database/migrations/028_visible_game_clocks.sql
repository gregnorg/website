ALTER TABLE games ADD COLUMN clock_delay_remaining_ms INTEGER NOT NULL DEFAULT 10000;

UPDATE games
SET clock_started_at = NULL, clock_expires_at = NULL
WHERE tournament_id IS NULL AND (clock_started_at IS NOT NULL OR clock_expires_at IS NOT NULL);
