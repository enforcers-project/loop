-- Age-restricted flag on events (age-verification feature).
-- When true, events.age_min is a HARD requirement enforced at RSVP; when false
-- (default) age_min is only a recommended age. Additive + defaulted, so existing
-- rows stay recommendations. (users.birth_date was added by a separate migration.)
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "age_restricted" BOOLEAN NOT NULL DEFAULT false;
