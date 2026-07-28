-- Content reports. A viewer flags a post/comment/story they don't want to see.
-- The row (reporter_id, target_type, target_id) is unique per reporter so a
-- re-report is idempotent; the same key doubles as a per-user hide index so
-- list endpoints subtract this set from what they return to the reporter.

CREATE TYPE "content_report_target" AS ENUM ('post', 'comment', 'story');
CREATE TYPE "content_report_reason" AS ENUM (
  'spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm', 'misinfo', 'other'
);

CREATE TABLE "content_reports" (
  "id"          UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" UUID                    NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_type" "content_report_target" NOT NULL,
  "target_id"   UUID                    NOT NULL,
  "reason"      "content_report_reason" NOT NULL,
  "note"        VARCHAR(500),
  "created_at"  TIMESTAMPTZ(6)          NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "content_reports_reporter_id_target_type_target_id_key"
  ON "content_reports"("reporter_id", "target_type", "target_id");
CREATE INDEX "content_reports_target_type_target_id_created_at_idx"
  ON "content_reports"("target_type", "target_id", "created_at");
