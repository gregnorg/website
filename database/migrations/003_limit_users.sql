CREATE OR REPLACE FUNCTION enforce_user_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Serialize user creation so simultaneous signups cannot exceed the cap.
  PERFORM pg_advisory_xact_lock(736829501);

  IF (SELECT count(*) FROM "user") >= 50 THEN
    RAISE EXCEPTION 'Shove Actually has reached its 50-player limit.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_user_limit_before_insert ON "user";
CREATE TRIGGER enforce_user_limit_before_insert
BEFORE INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION enforce_user_limit();
