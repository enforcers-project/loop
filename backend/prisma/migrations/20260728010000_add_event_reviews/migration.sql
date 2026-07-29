-- Community ratings + reviews. One row per (user, event) captures the event
-- score plus an optional score for the event's organizer, so a single write
-- from the reviewer feeds both aggregates (see the AVG(...) queries in
-- src/reviews/routes.js). Eligibility (RSVP attended=true, event past) is
-- enforced in the route on write; the schema only guards uniqueness and shape.

CREATE TABLE "event_reviews" (
  "id"               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          UUID           NOT NULL REFERENCES "users"("id")   ON DELETE CASCADE,
  "event_id"         UUID           NOT NULL REFERENCES "events"("id")  ON DELETE CASCADE,
  "organizer_id"     UUID                    REFERENCES "users"("id")   ON DELETE SET NULL,
  "event_rating"     SMALLINT       NOT NULL,
  "organizer_rating" SMALLINT,
  "body"             VARCHAR(2000),
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "deleted_at"       TIMESTAMPTZ(6),
  CONSTRAINT event_reviews_event_rating_range     CHECK (event_rating BETWEEN 1 AND 5),
  CONSTRAINT event_reviews_organizer_rating_range CHECK (organizer_rating IS NULL OR organizer_rating BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "event_reviews_user_event_key"        ON "event_reviews"("user_id", "event_id");
CREATE        INDEX "event_reviews_event_deleted_idx"     ON "event_reviews"("event_id", "deleted_at");
CREATE        INDEX "event_reviews_organizer_deleted_idx" ON "event_reviews"("organizer_id", "deleted_at");
