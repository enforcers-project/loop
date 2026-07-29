-- Sharing a social post into a DM. Analogous to `attached_event`: at send time
-- we snapshot a slim view of the post (image, caption, author, event link) as
-- JSON so a later delete/edit of the source post doesn't change what the
-- bubble showed.

ALTER TABLE "messages" ADD COLUMN "attached_post" JSONB;
