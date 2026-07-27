-- Moderation flag for user-authored text.
--
-- The profanity filter's "flag" verdict (mild profanity) publishes the write
-- normally but sets flagged = true so a future mod queue can surface it for
-- staff review. Author-facing UX is unchanged; block-verdicts short-circuit
-- earlier and never reach the create.

ALTER TABLE "comments" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "posts"    ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stories"  ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
