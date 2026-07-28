-- Reverse the display_name-uniqueness experiment from
-- 20260727200000_unique_identity_cooldowns. Product decision: display_name is
-- free-form and shared (two accounts can be "Ada Lovelace"); the @-mention
-- identity is `handle`, which stays unique + rate-limited.
--
-- Restores display_name to VarChar(120), drops its unique index and
-- change-timestamp column. Rows that got " (2)", " (3)" suffixed during the
-- previous migration keep those suffixes — the values are now valid again but
-- no longer forced apart. Users can rename freely from the profile editor.

DROP INDEX IF EXISTS "users_display_name_key";

ALTER TABLE "users"
  ALTER COLUMN "display_name" TYPE VARCHAR(120) USING "display_name"::text::varchar(120);

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "display_name_changed_at";
