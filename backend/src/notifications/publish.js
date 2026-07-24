// Followed-organizer new-event fan-out (planning §6, work-plan #27) plus the
// two attendee-side fan-outs: `event_updated` when the organizer edits a
// meaningful field, `event_cancelled` when they cancel outright. All three are
// called best-effort from their route handler — a failure here must never fail
// the underlying write.
import prisma from '../lib/prisma.js'

// Insert notification rows in batches so a very-attended or very-followed
// event never builds one enormous createMany payload. Demo scale is tiny;
// this is just a safety cap.
const BATCH_SIZE = 500

// Map a MEANINGFUL_FIELDS diff key onto the human label an attendee sees in
// the notification body. Multiple keys collapse onto one label (Time covers
// starts_at + ends_at + timezone, Venue covers venue_name + address + city +
// coords) so a single "starts_at + timezone" edit reads as one "Time" change.
const CHANGE_LABEL = {
  startsAt: 'Time',
  endsAt: 'Time',
  timezone: 'Time',
  venueName: 'Venue',
  address: 'Venue',
  city: 'Venue',
  lat: 'Venue',
  lng: 'Venue',
  priceMin: 'Price',
  priceMax: 'Price',
  isFree: 'Price',
  capacity: 'Capacity',
  ageMin: 'Age policy',
  ageLabel: 'Age policy',
}

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

// --- Attendee fan-outs -----------------------------------------------------
//
// Recipients of edit / cancel notifications are the union of:
//   - `rsvps` rows with status ∈ {going, interested, waitlisted}
//   - `roster_entries` rows with status ∈ {claimed, waitlisted} (sports only —
//     these are the committed states; cancelled/no_show/attended are excluded)
//   - `saved_events` rows (users who bookmarked the event without RSVPing)
// Deduplicated by user_id so a user who's in multiple tables only gets one row.
// The organizer themselves is always excluded.
async function fetchAttendeeIdsPage(eventId, organizerId, cursorId) {
  // We page by ordered user_id and a cursor rather than OFFSET so a very
  // popular event doesn't force the DB to re-scan already-notified users on
  // each page. Postgres UUID sort is total, so this is a stable pagination.
  const params = [eventId]
  let organizerClause = ''
  if (organizerId) {
    params.push(organizerId)
    organizerClause = `AND user_id <> $${params.length}::uuid`
  }
  let cursorClause = ''
  if (cursorId) {
    params.push(cursorId)
    cursorClause = `AND user_id > $${params.length}::uuid`
  }
  params.push(BATCH_SIZE)
  const limitParam = `$${params.length}`
  const sql = `
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM rsvps
        WHERE event_id = $1::uuid AND status IN ('going','interested','waitlisted')
      UNION
      SELECT user_id FROM roster_entries
        WHERE event_id = $1::uuid AND status IN ('claimed','waitlisted')
      UNION
      SELECT user_id FROM saved_events
        WHERE event_id = $1::uuid
    ) t
    WHERE TRUE ${organizerClause} ${cursorClause}
    ORDER BY user_id
    LIMIT ${limitParam}
  `
  const rows = await prisma.$queryRawUnsafe(sql, ...params)
  return rows.map((r) => r.user_id)
}

// Build a "Time and Venue changed" (or "Time changed") summary from the
// MEANINGFUL_FIELDS diff. Caps at two distinct labels so the body stays short.
function summariseChanges(changedFields) {
  const labels = []
  const seen = new Set()
  for (const key of changedFields || []) {
    const label = CHANGE_LABEL[key]
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
    if (labels.length === 2) break
  }
  if (!labels.length) return 'Event details changed'
  return `${labels.join(' and ')} changed`
}

async function fanoutToAttendees(eventId, organizerId, buildRow) {
  if (!eventId) return 0
  let created = 0
  let cursor = null
  for (;;) {
    const userIds = await fetchAttendeeIdsPage(eventId, organizerId, cursor)
    if (userIds.length === 0) break
    const rows = userIds.map((userId) => buildRow(userId))
    const result = await prisma.notification.createMany({ data: rows })
    created += result.count
    if (userIds.length < BATCH_SIZE) break
    cursor = userIds[userIds.length - 1]
  }
  return created
}

/**
 * Notify every attendee (rsvp + roster) that an event they're committed to
 * had one or more meaningful fields change. Called fire-and-forget from the
 * PATCH handler after the write commits.
 */
export async function notifyAttendeesOfEventUpdate(eventId, changedFields) {
  if (!eventId || !changedFields || changedFields.length === 0) return 0

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, organizerId: true },
  })
  if (!event) return 0

  const title = `"${event.title || 'Event'}" was updated`
  const body = summariseChanges(changedFields)

  return fanoutToAttendees(event.id, event.organizerId, (userId) => ({
    userId,
    type: 'event_updated',
    channel: 'in_app',
    actorId: event.organizerId,
    eventId: event.id,
    title,
    body,
    metadata: { changed: changedFields },
  }))
}

/**
 * Notify every attendee (rsvp + roster) that an event they're committed to
 * has been cancelled by the organizer. Called fire-and-forget from the
 * dedicated cancel route.
 */
export async function notifyAttendeesOfEventCancel(eventId, reason) {
  if (!eventId) return 0

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, organizerId: true },
  })
  if (!event) return 0

  const trimmed = typeof reason === 'string' ? reason.trim() : ''
  const title = `"${event.title || 'Event'}" was cancelled`
  const body = trimmed || null

  return fanoutToAttendees(event.id, event.organizerId, (userId) => ({
    userId,
    type: 'event_cancelled',
    channel: 'in_app',
    actorId: event.organizerId,
    eventId: event.id,
    title,
    body,
    metadata: trimmed ? { reason: trimmed } : null,
  }))
}

/**
 * Create a milestone notification for a user about their OWN action — e.g.
 * "Your event is live", "Your post is published". Unlike the social
 * notifications (a like/comment/follow, which have an `actor` and land in
 * someone else's feed), these are self-addressed confirmations that persist in
 * the bell so the user has a durable record + a tap-through to what they made.
 * The transient toast still fires in the UI for instant feedback; this is the
 * lasting copy.
 *
 * Deliberately uses the existing `system` NotificationType (a catch-all with no
 * acting user) tagged with `metadata.kind` rather than adding new enum values —
 * new Postgres enum values need a migration, and deploys here don't run
 * `migrate deploy`, so a fresh enum value would 500 every insert until the DB
 * was hand-migrated. `metadata.kind` gives the client everything it needs to
 * pick an icon without touching the schema.
 *
 * Best-effort by contract: callers invoke this fire-and-forget (never awaited in
 * the request path), so a notification failure can't fail the mutation that
 * triggered it. Returns the created row (or null on any failure).
 */
export async function notifySelf(userId, { kind, title, body = null, eventId = null }) {
  if (!userId || !kind || !title) return null
  try {
    return await prisma.notification.create({
      data: {
        userId,
        type: 'system',
        channel: 'in_app',
        // actorId stays null — the user IS the actor, so there's no "someone
        // else did this" avatar to show; the client renders a milestone icon.
        eventId,
        title,
        body,
        metadata: { kind },
      },
    })
  } catch (err) {
    console.error('notifySelf error:', err)
    return null
  }
}
