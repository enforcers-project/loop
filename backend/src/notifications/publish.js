// Followed-organizer new-event fan-out (planning §6, work-plan #27).
//
// When an organizer publishes an event, every follower gets an in-app
// `followed_new_event` notification. Called best-effort from the publish
// handler — a failure here must never fail the publish itself.
import prisma from '../lib/prisma.js'

// Insert followers in batches so a very-followed organizer never builds one
// enormous createMany payload. Demo scale is tiny; this is just a safety cap.
const BATCH_SIZE = 500

/**
 * Create a `followed_new_event` notification for each follower of `organizerId`
 * about the newly published `eventId`. Returns the number of rows created.
 * Idempotency is intentionally NOT enforced here: publish is already guarded
 * (draft→published is a one-way transition), so this runs at most once per event.
 */
export async function notifyFollowersOfNewEvent(organizerId, eventId) {
  if (!organizerId || !eventId) return 0

  const [organizer, event] = await Promise.all([
    prisma.user.findUnique({
      where: { id: organizerId },
      select: { id: true, displayName: true },
    }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true },
    }),
  ])
  if (!organizer || !event) return 0

  const name = organizer.displayName || 'An organizer you follow'
  const title = `${name} posted a new event`
  const body = event.title || null

  let created = 0
  let cursor = null
  // Walk the follower list in id-ordered pages so the batch stays bounded.
  for (;;) {
    const followers = await prisma.follow.findMany({
      where: { followeeId: organizerId },
      select: { followerId: true },
      orderBy: { followerId: 'asc' },
      take: BATCH_SIZE,
      ...(cursor
        ? {
            skip: 1,
            cursor: { followerId_followeeId: { followerId: cursor, followeeId: organizerId } },
          }
        : {}),
    })
    if (followers.length === 0) break

    const rows = followers.map((f) => ({
      userId: f.followerId,
      type: 'followed_new_event',
      channel: 'in_app',
      actorId: organizerId,
      eventId,
      title,
      body,
    }))
    const result = await prisma.notification.createMany({ data: rows })
    created += result.count

    if (followers.length < BATCH_SIZE) break
    cursor = followers[followers.length - 1].followerId
  }

  return created
}
