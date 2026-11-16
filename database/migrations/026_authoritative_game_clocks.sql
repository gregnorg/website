-- A deadline lets maintenance find expired ordinary games without replaying
-- every active game each second. Existing games begin on their next interaction.
ALTER TABLE games ADD COLUMN clock_expires_at TIMESTAMPTZ;
CREATE INDEX games_clock_expiry_idx ON games(clock_expires_at)
  WHERE status='active' AND tournament_id IS NULL AND clock_expires_at IS NOT NULL;
