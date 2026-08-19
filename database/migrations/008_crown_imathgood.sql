INSERT INTO champion_state (singleton, user_id, crowned_at)
SELECT true, id, now()
FROM "user"
WHERE lower(username) = lower('IMathGood')
LIMIT 1
ON CONFLICT (singleton) DO UPDATE
SET user_id = EXCLUDED.user_id,
    crowned_at = EXCLUDED.crowned_at;
