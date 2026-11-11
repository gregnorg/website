ALTER TABLE tournaments ADD COLUMN format TEXT NOT NULL DEFAULT 'single'
 CHECK (format IN ('single','double'));
ALTER TABLE tournament_matches ADD COLUMN sources JSONB,
 ADD COLUMN bracket_label TEXT,
 ADD COLUMN reset_final BOOLEAN NOT NULL DEFAULT false;
