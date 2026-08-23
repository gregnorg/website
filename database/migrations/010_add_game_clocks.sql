ALTER TABLE games
  ADD COLUMN IF NOT EXISTS time_control_seconds INTEGER
  CHECK (time_control_seconds IN (300, 600, 1200));

ALTER TABLE game_players
  ADD COLUMN IF NOT EXISTS time_remaining_ms BIGINT
  CHECK (time_remaining_ms IS NULL OR time_remaining_ms >= 0);
