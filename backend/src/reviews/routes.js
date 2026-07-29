// Community ratings + reviews.
//
// A single row in event_reviews captures BOTH scores an attendee can leave for
// a single event: the event's own rating (required) and a rating for its
// organizer (optional; nullable when the event has no organizerId or the user
// only wants to rate the event). An optional body carries the review text.
//
// Endpoints:
//   GET    /api/events/:id/reviews         list a page of reviews for the event
//   GET    /api/events/:id/reviews/summary aggregate + eligibility + my review
//   PUT    /api/events/:id/reviews         create/update the caller's review
//   DELETE /api/events/:id/reviews         soft-delete the caller's review
//   GET    /api/organizers/:id/reviews     list a page of reviews for the org
//   GET    /api/organizers/:id/reviews/summary aggregate reviews for the org
//
// Eligibility rule (per the product spec): a user may leave a review only if
// they RSVP'd to the event AND the organizer marked them attended=true. The
// event must also be past (starts_at < now) — a stray forgotten check-in on a
// still-upcoming event shouldn't unlock a review.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'
import { enforceProfanity } from '../lib/profanity.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)
const clampLimit = (raw, def = 20, max = 50) => Math.min(Math.max(Number(raw) || def, 1), max)

const BODY_MAX = 2000

const REVIEWER_SELECT = {
  id: true,
  displayName: true,
  handle: true,
  avatarUrl: true,
  isVerified: true,
}

function toReviewer(u) {
  if (!u) return null
  return {
    id: u.id,
    display_name: u.displayName,
    handle: u.handle,
    avatar_url: u.avatarUrl,
    is_verified: u.isVerified,
  }
}

function toReview(r) {
  return {
    id: r.id,
    user: toReviewer(r.user),
    event_id: r.eventId,
    organizer_id: r.organizerId,
    event_rating: r.eventRating,
    organizer_rating: r.organizerRating,
    body: r.body ?? '',
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }
}

/**
 * Load the small event footprint the review routes need: organizerId (so we
 * copy it into the review row without a second query) and startsAt (so we can
 * gate on the event being past). Returns null when the id doesn't exist.
 */
async function loadEventForReview(id) {
  if (!isUuid(id)) return null
  return prisma.event.findUnique({
    where: { id },
    select: { id: true, organizerId: true, startsAt: true, status: true },
  })
}

/**
 * Can this user leave a review for this event? Returns:
 *   { eligible: true }
 *   { eligible: false, reason: 'not_past' | 'not_attended' }
 * The definitive "attended" signal is rsvps.attended = true, set only when the
 * organizer checks the user in (see src/engagement/routes.js PATCH
 * :id/rsvps/:userId). A past + attended pair unlocks review write.
 */
async function checkEligibility(userId, event) {
  if (!event.startsAt || event.startsAt.getTime() > Date.now()) {
    return { eligible: false, reason: 'not_past' }
  }
  const rsvp = await prisma.rsvp.findUnique({
    where: { userId_eventId: { userId, eventId: event.id } },
    select: { attended: true },
  })
  if (!rsvp?.attended) return { eligible: false, reason: 'not_attended' }
  return { eligible: true }
}

/**
 * Validate the ratings + body payload. Returns { ok: true, data } on success,
 * or { ok: false, message } for a 422. `organizerRating` is only accepted when
 * the event actually has an organizer — a null organizerId means the value
 * would have nowhere to attach, so we reject it up-front instead of silently
 * dropping.
 */
function validateReviewInput(body, hasOrganizer) {
  const eventRating = Number(body?.event_rating)
  if (!Number.isInteger(eventRating) || eventRating < 1 || eventRating > 5) {
    return { ok: false, message: 'event_rating must be an integer 1-5' }
  }
  let organizerRating = null
  if (body?.organizer_rating != null) {
    if (!hasOrganizer) {
      return { ok: false, message: 'This event has no organizer to rate' }
    }
    const n = Number(body.organizer_rating)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { ok: false, message: 'organizer_rating must be an integer 1-5' }
    }
    organizerRating = n
  }
  let review = null
  if (body?.body != null) {
    if (typeof body.body !== 'string') {
      return { ok: false, message: 'body must be a string' }
    }
    review = body.body.trim()
    if (review.length > BODY_MAX) {
      return { ok: false, message: `body too long (max ${BODY_MAX} chars)` }
    }
    if (review.length === 0) review = null
  }
  return { ok: true, data: { eventRating, organizerRating, body: review } }
}

// --- GET /api/events/:id/reviews --------------------------------------------
// Public. Paginated by createdAt desc. Soft-deleted rows are hidden.
router.get('/events/:id/reviews', async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const limit = clampLimit(req.query.limit)
    const where = { eventId: id, deletedAt: null }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }
    const rows = await prisma.eventReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { user: { select: REVIEWER_SELECT } },
    })
    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }
    return res.json({ data: rows.map(toReview), nextCursor })
  } catch (err) {
    console.error('GET /api/events/:id/reviews error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load reviews')
  }
})

// --- GET /api/events/:id/reviews/summary -------------------------------------
// Public. Returns the event's aggregate rating (avg + count + histogram) plus,
// for a signed-in caller, whether they're eligible to review and their current
// review row if one exists. Powers the ratings header + the composer visibility.
router.get('/events/:id/reviews/summary', async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const event = await loadEventForReview(id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')

    const [agg, buckets, myReview] = await Promise.all([
      prisma.eventReview.aggregate({
        where: { eventId: id, deletedAt: null },
        _avg: { eventRating: true, organizerRating: true },
        _count: { _all: true },
      }),
      prisma.eventReview.groupBy({
        by: ['eventRating'],
        where: { eventId: id, deletedAt: null },
        _count: { _all: true },
      }),
      req.user?.id
        ? prisma.eventReview.findUnique({
            where: { userId_eventId: { userId: req.user.id, eventId: id } },
            include: { user: { select: REVIEWER_SELECT } },
          })
        : Promise.resolve(null),
    ])

    // Histogram is always 1..5 keys so the client renders every bar even when
    // the count is zero — a missing bar reads as a bug.
    const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const b of buckets) histogram[b.eventRating] = b._count._all

    let eligibility = { eligible: false, reason: 'not_authenticated' }
    if (req.user?.id) {
      eligibility = await checkEligibility(req.user.id, event)
    }

    const mine = myReview && !myReview.deletedAt ? toReview(myReview) : null

    return res.json({
      data: {
        event_id: id,
        organizer_id: event.organizerId,
        count: agg._count._all,
        event_avg: agg._avg.eventRating != null ? Number(agg._avg.eventRating) : null,
        organizer_avg: agg._avg.organizerRating != null ? Number(agg._avg.organizerRating) : null,
        histogram,
        eligibility,
        my_review: mine,
      },
    })
  } catch (err) {
    console.error('GET /api/events/:id/reviews/summary error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load review summary')
  }
})

// --- PUT /api/events/:id/reviews --------------------------------------------
// Auth-only. Create or edit the caller's review. Enforces the attended+past
// gate and per-review uniqueness (one row per (user,event)). The body carries
// event_rating (required 1-5), organizer_rating (optional 1-5), and body
// (optional text). The organizer of the event cannot review themselves.
router.put('/events/:id/reviews', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const event = await loadEventForReview(id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.organizerId && event.organizerId === req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'You cannot review your own event')
    }

    const eligibility = await checkEligibility(req.user.id, event)
    if (!eligibility.eligible) {
      const message =
        eligibility.reason === 'not_past'
          ? 'You can only review an event once it has happened'
          : 'Only checked-in attendees can review this event'
      return fail(res, 403, 'NOT_ELIGIBLE', message, { reason: eligibility.reason })
    }

    const validated = validateReviewInput(req.body ?? {}, Boolean(event.organizerId))
    if (!validated.ok) return fail(res, 422, 'VALIDATION_ERROR', validated.message)

    // Hard-block profanity in the review body so a slur can't ride into the
    // public listing (identity-style enforcement, mirroring users PATCH).
    if (enforceProfanity(req, res, [validated.data.body]).blocked) return

    const upserted = await prisma.eventReview.upsert({
      where: { userId_eventId: { userId: req.user.id, eventId: id } },
      create: {
        userId: req.user.id,
        eventId: id,
        organizerId: event.organizerId ?? null,
        eventRating: validated.data.eventRating,
        organizerRating: validated.data.organizerRating,
        body: validated.data.body,
      },
      update: {
        eventRating: validated.data.eventRating,
        organizerRating: validated.data.organizerRating,
        body: validated.data.body,
        // Un-delete on re-write so a user who removed their review can post
        // again through the same unique row instead of hitting a P2002.
        deletedAt: null,
      },
      include: { user: { select: REVIEWER_SELECT } },
    })

    return res.json({ data: toReview(upserted) })
  } catch (err) {
    console.error('PUT /api/events/:id/reviews error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save review')
  }
})

// --- DELETE /api/events/:id/reviews -----------------------------------------
// Auth-only. Soft-delete the caller's review. Idempotent — a second call on an
// already-deleted (or non-existent) review returns 200 with a null body so the
// UI never has to reason about a 404 from an undo.
router.delete('/events/:id/reviews', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const existing = await prisma.eventReview.findUnique({
      where: { userId_eventId: { userId: req.user.id, eventId: id } },
      select: { id: true, deletedAt: true },
    })
    if (!existing || existing.deletedAt) {
      return res.json({ data: null })
    }
    await prisma.eventReview.update({
      where: { userId_eventId: { userId: req.user.id, eventId: id } },
      data: { deletedAt: new Date() },
    })
    return res.json({ data: null })
  } catch (err) {
    console.error('DELETE /api/events/:id/reviews error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not remove review')
  }
})

// --- GET /api/organizers/:id/reviews ----------------------------------------
// Public. Newest-first list of reviews left for events this organizer ran.
// Includes the event's title so the row can display "for {event}".
router.get('/organizers/:id/reviews', async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Organizer not found')

  try {
    const limit = clampLimit(req.query.limit)
    const where = { organizerId: id, deletedAt: null, organizerRating: { not: null } }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }
    const rows = await prisma.eventReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: REVIEWER_SELECT },
        event: { select: { id: true, title: true, startsAt: true } },
      },
    })
    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }
    const data = rows.map((r) => ({
      ...toReview(r),
      event: r.event ? { id: r.event.id, title: r.event.title, starts_at: r.event.startsAt } : null,
    }))
    return res.json({ data, nextCursor })
  } catch (err) {
    console.error('GET /api/organizers/:id/reviews error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load reviews')
  }
})

// --- GET /api/organizers/:id/reviews/summary --------------------------------
// Public. Three aggregates for the organizer profile header:
//   - event_avg  : average of every event_rating across all events they've run
//                  (the "how are their events?" signal — always populated once
//                  any event has been reviewed).
//   - organizer_avg : average of every organizer_rating — nullable, since
//                     rating the organizer is optional and may be sparse.
//   - combined_avg : the profile's headline star rating. ONE data point per
//                    reviewer: reviewers who rated both axes contribute the
//                    mean of their two stars; reviewers who rated only the
//                    event contribute their event star. combined_count is
//                    therefore the number of distinct reviewers, not the
//                    number of stars — a single user never counts twice.
// Both aggregates read from event_reviews via `organizer_id` (populated at
// review-write time), so a review left for an event they organized is scored
// against them even after the event itself is deleted.
router.get('/organizers/:id/reviews/summary', async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Organizer not found')

  try {
    // Pull every non-deleted review this organizer received. We need the raw
    // pair (eventRating, organizerRating) per row to compute a per-reviewer
    // combined score, which groupBy on either column alone can't give us.
    // The row shape is tiny (two smallints per review) so this is cheap.
    const rows = await prisma.eventReview.findMany({
      where: { organizerId: id, deletedAt: null },
      select: { eventRating: true, organizerRating: true },
    })

    const eventHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const organizerHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const combinedHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

    let eventTotal = 0
    let eventCount = 0
    let orgTotal = 0
    let orgCount = 0
    let combinedTotal = 0
    let combinedCount = 0

    for (const r of rows) {
      eventHistogram[r.eventRating] += 1
      eventTotal += r.eventRating
      eventCount += 1

      if (r.organizerRating != null) {
        organizerHistogram[r.organizerRating] += 1
        orgTotal += r.organizerRating
        orgCount += 1
      }

      // Combined = mean of the two stars when both were given, else just the
      // event star. One reviewer → one data point. The histogram bucket rounds
      // to the nearest whole star so the profile's distribution bar still lines
      // up on integer keys.
      const pair =
        r.organizerRating != null ? (r.eventRating + r.organizerRating) / 2 : r.eventRating
      combinedTotal += pair
      combinedCount += 1
      const bucket = Math.max(1, Math.min(5, Math.round(pair)))
      combinedHistogram[bucket] += 1
    }

    const eventAvg = eventCount > 0 ? eventTotal / eventCount : null
    const organizerAvg = orgCount > 0 ? orgTotal / orgCount : null
    const combinedAvg = combinedCount > 0 ? combinedTotal / combinedCount : null

    return res.json({
      data: {
        organizer_id: id,
        // Backwards-compat: `count` is the count of reviews that fed
        // organizer_avg (unchanged shape for callers that only read the
        // organizer score).
        count: orgCount,
        // How many event ratings feed event_avg. May be > `count` since
        // organizer_rating is optional but event_rating is required.
        event_count: eventCount,
        event_avg: eventAvg,
        organizer_avg: organizerAvg,
        // Headline stat for the profile: one data point per reviewer.
        // combined_count is the distinct reviewer count.
        combined_avg: combinedAvg,
        combined_count: combinedCount,
        event_histogram: eventHistogram,
        combined_histogram: combinedHistogram,
        // Backwards-compat: keep the old `histogram` key aliased to the
        // organizer histogram so existing consumers don't break.
        histogram: organizerHistogram,
        organizer_histogram: organizerHistogram,
      },
    })
  } catch (err) {
    console.error('GET /api/organizers/:id/reviews/summary error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load review summary')
  }
})

export default router
