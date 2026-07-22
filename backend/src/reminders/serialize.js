// Serializer for event reminders (planning §7.5). Maps a Prisma EventReminder
// row to the snake_case shape the client renders, matching the envelope
// conventions used across the API.

/** Columns a reminder response needs. */
export const REMINDER_SELECT = {
  id: true,
  userId: true,
  eventId: true,
  offsetMinutes: true,
  remindAt: true,
  channel: true,
  status: true,
  sentAt: true,
  createdAt: true,
}

/** Map a Prisma reminder row (selected with REMINDER_SELECT) to client shape. */
export function toReminder(r) {
  return {
    id: r.id,
    user_id: r.userId,
    event_id: r.eventId,
    offset_minutes: r.offsetMinutes,
    remind_at: r.remindAt,
    channel: r.channel,
    status: r.status,
    sent_at: r.sentAt ?? null,
    created_at: r.createdAt,
  }
}
