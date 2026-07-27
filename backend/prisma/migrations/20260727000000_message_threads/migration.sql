-- Direct messaging tables. A thread's "kind" is derived from participant
-- count (2 → DM, 3+ → group). `dm_key` is the sorted pair "<uuidA>:<uuidB>"
-- for DMs — unique so a double-tap-create by opposite sides collapses to
-- one row. Groups leave dm_key NULL.

CREATE TABLE "message_threads" (
  "id"               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  "dm_key"           VARCHAR(80),
  "name"             VARCHAR(80),
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "last_message_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "message_threads_dm_key_key" ON "message_threads"("dm_key");
CREATE INDEX "message_threads_last_message_at_idx" ON "message_threads"("last_message_at");

CREATE TABLE "thread_participants" (
  "thread_id"    UUID           NOT NULL REFERENCES "message_threads"("id") ON DELETE CASCADE,
  "user_id"      UUID           NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_at" TIMESTAMPTZ(6),
  "joined_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("thread_id", "user_id")
);
CREATE INDEX "thread_participants_user_id_thread_id_idx"
  ON "thread_participants"("user_id", "thread_id");

CREATE TABLE "messages" (
  "id"             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  "thread_id"      UUID           NOT NULL REFERENCES "message_threads"("id") ON DELETE CASCADE,
  "sender_id"      UUID           NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "text"           VARCHAR(4000),
  "attached_event" JSONB,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "messages_thread_id_created_at_id_idx"
  ON "messages"("thread_id", "created_at", "id");
