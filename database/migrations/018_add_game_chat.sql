CREATE TABLE game_chat_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000 AND btrim(body) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_chat_messages_game_idx ON game_chat_messages(game_id, id DESC);
CREATE INDEX game_chat_messages_user_idx ON game_chat_messages(user_id, created_at DESC);
