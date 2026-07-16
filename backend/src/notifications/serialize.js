// Serializer for the bell feed (planning §7.5 GET /api/notifications).

/**
 * Columns a notification row needs to serialize, including the actor's public
 * bits. Use as a Prisma `select` so we never over-fetch the recipient's rows.
 */
export const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  channel: true,
  eventId: true,
  title: true,
  body: true,
  metadata: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  actor: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
}

/**
 * Map a Prisma notification row (selected with NOTIFICATION_SELECT) to the
 * snake_case bell-feed item the client renders. `actor` is null for
 * system notifications with no acting user.
 */
export function toNotification(n) {
  return {
    id: n.id,
    type: n.type,
    channel: n.channel,
    actor: n.actor
      ? { id: n.actor.id, display_name: n.actor.displayName, avatar_url: n.actor.avatarUrl }
      : null,
    event_id: n.eventId,
    title: n.title,
    body: n.body,
    metadata: n.metadata ?? null,
    is_read: n.isRead,
    read_at: n.readAt,
    created_at: n.createdAt,
  }
}
