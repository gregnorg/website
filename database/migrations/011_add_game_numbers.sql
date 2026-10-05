ALTER TABLE games ADD COLUMN game_number BIGINT;
CREATE SEQUENCE games_game_number_seq OWNED BY games.game_number;
WITH numbered AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS number FROM games) UPDATE games SET game_number = numbered.number FROM numbered WHERE games.id = numbered.id;
SELECT setval('games_game_number_seq', COALESCE(MAX(game_number), 0) + 1, false) FROM games;
ALTER TABLE games ALTER COLUMN game_number SET DEFAULT nextval('games_game_number_seq'), ALTER COLUMN game_number SET NOT NULL;
ALTER TABLE games ADD CONSTRAINT games_game_number_key UNIQUE (game_number);
