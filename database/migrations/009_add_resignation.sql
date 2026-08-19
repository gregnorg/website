ALTER TABLE games
  ADD COLUMN IF NOT EXISTS resigned_by_id TEXT REFERENCES "user"(id);
