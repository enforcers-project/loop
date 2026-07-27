-- Message reactions. Composite PK on (message_id, user_id, emoji) so tapping
-- the same emoji twice by the same user is a toggle (insert on first, delete
-- on second). Cascade cleans up when the message or user goes away.

CREATE TABLE "message_reactions" (
  "message_id" UUID           NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "user_id"    UUID           NOT NULL REFERENCES "users"("id")    ON DELETE CASCADE,
  "emoji"      VARCHAR(8)     NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("message_id", "user_id", "emoji")
);
CREATE INDEX "message_reactions_user_id_idx" ON "message_reactions"("user_id");
