-- Record when a published event is cancelled and (optionally) why. The
-- `cancelled` enum value on event_status already exists; these columns
-- back the dedicated POST /api/events/:id/cancel route so the organizer's
-- action bar can show a banner and fan out notifications to attendees.
ALTER TABLE "events" ADD COLUMN "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "events" ADD COLUMN "cancel_reason" TEXT;
