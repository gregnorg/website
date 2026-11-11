ALTER TABLE tournaments
  ADD COLUMN delay_seconds INTEGER NOT NULL DEFAULT 10 CHECK (delay_seconds >= 0);
