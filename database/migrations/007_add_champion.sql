CREATE TABLE champion_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  crowned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO champion_state (singleton, user_id)
SELECT true, u.id
FROM "user" u
LEFT JOIN game_players gp ON gp.user_id = u.id
LEFT JOIN games g ON g.id = gp.game_id AND g.status = 'won' AND g.winner_id = u.id
GROUP BY u.id, u."createdAt"
ORDER BY count(g.id) DESC, u."createdAt", u.id
LIMIT 1
ON CONFLICT (singleton) DO NOTHING;
