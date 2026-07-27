-- Posses (planning/posses_feature.md). A posse is an event-scoped, named group
-- thread + a membership policy. Its group chat IS a message_threads row
-- (thread_id, unique). Active members are mirrored into thread_participants so
-- chat access rides the existing participant gate; pending requesters (join
-- policy = ask) are NOT thread participants until a captain approves.

CREATE TYPE "posse_visibility" AS ENUM ('private', 'mutuals', 'public');
CREATE TYPE "posse_join_policy" AS ENUM ('open', 'ask');
CREATE TYPE "posse_role" AS ENUM ('captain', 'member');
CREATE TYPE "posse_member_status" AS ENUM ('active', 'pending');

CREATE TABLE "posses" (
  "id"          UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id"    UUID                NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "thread_id"   UUID                NOT NULL REFERENCES "message_threads"("id") ON DELETE CASCADE,
  "creator_id"  UUID                NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"        VARCHAR(80)         NOT NULL,
  "note"        VARCHAR(280),
  "visibility"  "posse_visibility"  NOT NULL DEFAULT 'private',
  "join_policy" "posse_join_policy" NOT NULL DEFAULT 'ask',
  "created_at"  TIMESTAMPTZ(6)      NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "posses_thread_id_key" ON "posses"("thread_id");
CREATE INDEX "posses_event_id_visibility_idx" ON "posses"("event_id", "visibility");

CREATE TABLE "posse_members" (
  "posse_id"   UUID                  NOT NULL REFERENCES "posses"("id") ON DELETE CASCADE,
  "user_id"    UUID                  NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"       "posse_role"          NOT NULL DEFAULT 'member',
  "status"     "posse_member_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6)        NOT NULL DEFAULT now(),
  PRIMARY KEY ("posse_id", "user_id")
);
CREATE INDEX "posse_members_user_id_status_idx" ON "posse_members"("user_id", "status");
