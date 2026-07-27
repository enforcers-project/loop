-- Enforce identity uniqueness (display_name + handle) and rate-limit changes.
--
-- Server-side rules (users/routes.js, auth/routes.js):
--   • display_name and handle must each be unique across users (case-insensitive).
--   • Both are required at signup — the DB stays permissive on NULL so the
--     migration can land without a backfill, but new writes must set them.
--   • Once set, each may only be changed once every 7 days. The window is
--     tracked with per-column *_changed_at timestamps and enforced in the
--     route handler (we don't push the calendar math into a CHECK because the
--     column would need a "now" and CHECK is per-row static).

-- 1) display_name — was VarChar(120); switch to citext so uniqueness is
--    case-insensitive (matches how handle already works). Dev/staging DBs
--    already have real duplicates (e.g. two "Onb Test" accounts from onboarding
--    testing), so we dedupe in-place by suffixing " (2)", " (3)" onto the older
--    rows (ordered by created_at ascending — the earliest keeps the original,
--    later ones get renumbered). The user can rename from the profile edit
--    modal; the cooldown starts from account creation via the timestamps below.
ALTER TABLE "users"
  ALTER COLUMN "display_name" TYPE citext USING "display_name"::citext;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(display_name)
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM "users"
  WHERE display_name IS NOT NULL
)
UPDATE "users" u
SET display_name = (u.display_name || ' (' || ranked.rn || ')')::citext
FROM ranked
WHERE ranked.id = u.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "users_display_name_key" ON "users" ("display_name");

-- 2) Per-column cooldown timestamps. Nullable — a NULL value means "never
--    changed" and the route treats that as immediately eligible. Set to now()
--    on every accepted change; also stamped at signup so the first change
--    still respects the 7-day window from account creation.
ALTER TABLE "users"
  ADD COLUMN "display_name_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN "handle_changed_at"       TIMESTAMPTZ(6);
