ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT false;

UPDATE "user"
SET email_notifications = false;
