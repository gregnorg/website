ALTER TABLE games
  ADD COLUMN idle_reminder_at TIMESTAMPTZ,
  ADD COLUMN idle_reminder_move_count INTEGER,
  ADD COLUMN idle_expired BOOLEAN NOT NULL DEFAULT false;
