CREATE TABLE IF NOT EXISTS crown_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_name TEXT NOT NULL,
  previous_name TEXT NOT NULL,
  recipients JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crown_announcements_pending_idx ON crown_announcements(created_at) WHERE sent_at IS NULL;
