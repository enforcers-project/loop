// Save + RSVP endpoints (planning §7.4, work-plan #15).
//
// Key audit fix (§7.4, §10): events.rsvp_count changes ONLY on transitions
// into/out of status='going' — never for interested/waitlisted — so the
// "+N going" count and GoingStack aren't inflated. save_count is maintained
// idempotently. Every mutation appends an interaction_events row (the single
// replay source for the recommender), reusing the caller's browsing session.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'
import { scheduleRebuild } from '../preferences/coalesce.js'

const router = Router()

// Canonical per-type weights (mirror src/interactions DEFAULT_WEIGHTS / §9.2A).
const WEIGHTS = { save: 0.6, unsave: -0.3, rsvp: 0.8, rsvp_cancel: -0.35 }

const RSVP_STATUSES = new Set(['going', 'interested', 'waitlisted', 'cancelled'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)
const clampLimit = (raw, def = 20, max = 50) => Math.min(Math.max(Number(raw) || def, 1), max)

// Compact attendee ref for the organizer's RSVP list (planning §7.4) — never
// over-fetch a user into this list.
const ATTENDEE_SELECT = {
  id: true,
  displayName: true,
  handle: true,
  avatarUrl: true,
  isVerified: true,
}
const toAttendee = (u) => ({
  id: u.id,
  display_name: u.displayName,
  handle: u.handle,
  avatar_url: u.avatarUrl,
  is_verified: u.isVerified,
})

/** Append an interaction_events row (best-effort — never blocks the mutation). */
async function emitInteraction(tx, { type, req, event }) {
  await tx.interactionEvent.create({
    data: {
      userId: req.user.id,
      sessionId: req.sessionId ?? null,
      eventId: event.id,
      categoryId: event.categoryId,
      interactionType: type,
      surface: 'event_detail',
      weight: WEIGHTS[type] ?? 0,
    },
  })
}

/** Load an event or 404; returns the minimal columns the handlers need. */
async function loadEvent(id) {
  return prisma.event.findUnique({
    where: { id },
    select: { id: true, categoryId: true, status: true, isSports: true },
  })
}

// --- PUT /api/events/:id/save — idempotent bookmark --------------------------
router.put('/:id/save', requireAuth, async (req, res) => {
  try {
    const event = await loadEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')

    const existing = await prisma.savedEvent.findUnique({
      where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
    })

    // Idempotent: if already saved, return current state without double-counting.
    if (existing) {
      const fresh = await prisma.event.findUnique({
        where: { id: event.id },
        select: { saveCount: true },
      })
      return res.json({
        data: {
          user_id: req.user.id,
          event_id: event.id,
          saved_at: existing.savedAt,
          save_count: fresh.saveCount,
          saved: true,
        },
      })
    }

    const { saved, updated } = await prisma.$transaction(async (tx) => {
      const saved = await tx.savedEvent.create({
        data: { userId: req.user.id, eventId: event.id },
      })
      const updated = await tx.event.update({
        where: { id: event.id },
        data: { saveCount: { increment: 1 } },
        select: { saveCount: true },
      })
      await emitInteraction(tx, { type: 'save', req, event })
      return { saved, updated }
    })

    await scheduleRebuild(req.user.id)

    return res.json({
      data: {
        user_id: req.user.id,
        event_id: event.id,
        saved_at: saved.savedAt,
        save_count: updated.saveCount,
        saved: true,
      },
    })
  } catch (err) {
    console.error('PUT /api/events/:id/save error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to save event')
  }
})

// --- DELETE /api/events/:id/save — remove bookmark ---------------------------
router.delete('/:id/save', requireAuth, async (req, res) => {
  try {
    const event = await loadEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')

    const existing = await prisma.savedEvent.findUnique({
      where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
    })

    // Idempotent: nothing to remove.
    if (!existing) {
      const fresh = await prisma.event.findUnique({
        where: { id: event.id },
        select: { saveCount: true },
      })
      return res.json({ data: { save_count: fresh.saveCount, saved: false } })
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.savedEvent.delete({
        where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
      })
      const updated = await tx.event.update({
        where: { id: event.id },
        data: { saveCount: { decrement: 1 } },
        select: { saveCount: true },
      })
      await emitInteraction(tx, { type: 'unsave', req, event })
      return updated
    })

    await scheduleRebuild(req.user.id)

    return res.json({ data: { save_count: updated.saveCount, saved: false } })
  } catch (err) {
    console.error('DELETE /api/events/:id/save error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to unsave event')
  }
})

// --- PUT /api/events/:id/rsvp — upsert RSVP ----------------------------------
router.put('/:id/rsvp', requireAuth, async (req, res) => {
  const { status, guests_count } = req.body ?? {}

  if (!RSVP_STATUSES.has(status)) {
    return fail(
      res,
      422,
      'VALIDATION_ERROR',
      'status must be going/interested/waitlisted/cancelled',
    )
  }
  if (guests_count != null && (!Number.isInteger(guests_count) || guests_count < 0)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'guests_count must be a non-negative integer')
  }

  try {
    const event = await loadEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    // Sports runs use the roster, not the RSVP flow (§7.4).
    if (event.isSports) {
      return fail(res, 409, 'CONFLICT', 'Sports runs use the roster — claim a spot instead')
    }
    if (event.status === 'cancelled' || event.status === 'past') {
      return fail(res, 409, 'CONFLICT', `Cannot RSVP to a ${event.status} event`)
    }

    const prior = await prisma.rsvp.findUnique({
      where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
    })
    const wasGoing = prior?.status === 'going'
    const nowGoing = status === 'going'
    // rsvp_count only moves on going transitions (the audit fix).
    const delta = nowGoing && !wasGoing ? 1 : !nowGoing && wasGoing ? -1 : 0

    const { rsvp, eventRow } = await prisma.$transaction(async (tx) => {
      const rsvp = await tx.rsvp.upsert({
        where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
        create: {
          userId: req.user.id,
          eventId: event.id,
          status,
          guestsCount: guests_count ?? 0,
        },
        update: { status, ...(guests_count != null ? { guestsCount: guests_count } : {}) },
      })
      let eventRow
      if (delta !== 0) {
        eventRow = await tx.event.update({
          where: { id: event.id },
          data: { rsvpCount: { increment: delta } },
          select: { rsvpCount: true },
        })
      } else {
        eventRow = await tx.event.findUnique({
          where: { id: event.id },
          select: { rsvpCount: true },
        })
      }
      // A move to cancelled is a cancel signal; anything else is an rsvp signal.
      await emitInteraction(tx, {
        type: status === 'cancelled' ? 'rsvp_cancel' : 'rsvp',
        req,
        event,
      })
      return { rsvp, eventRow }
    })

    await scheduleRebuild(req.user.id)

    return res.json({
      data: {
        id: rsvp.id,
        user_id: rsvp.userId,
        event_id: rsvp.eventId,
        status: rsvp.status,
        guests_count: rsvp.guestsCount,
        attended: rsvp.attended,
        checked_in_at: rsvp.checkedInAt,
        created_at: rsvp.createdAt,
        updated_at: rsvp.updatedAt,
        event_rsvp_count: eventRow.rsvpCount,
      },
    })
  } catch (err) {
    console.error('PUT /api/events/:id/rsvp error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to RSVP')
  }
})

// --- DELETE /api/events/:id/rsvp — cancel RSVP -------------------------------
router.delete('/:id/rsvp', requireAuth, async (req, res) => {
  try {
    const event = await loadEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')

    const prior = await prisma.rsvp.findUnique({
      where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
    })
    // Idempotent: no active RSVP, or already cancelled.
    if (!prior || prior.status === 'cancelled') {
      const fresh = await prisma.event.findUnique({
        where: { id: event.id },
        select: { rsvpCount: true },
      })
      return res.json({ data: { status: 'cancelled', event_rsvp_count: fresh.rsvpCount } })
    }

    const delta = prior.status === 'going' ? -1 : 0

    const eventRow = await prisma.$transaction(async (tx) => {
      await tx.rsvp.update({
        where: { userId_eventId: { userId: req.user.id, eventId: event.id } },
        data: { status: 'cancelled' },
      })
      let eventRow
      if (delta !== 0) {
        eventRow = await tx.event.update({
          where: { id: event.id },
          data: { rsvpCount: { decrement: 1 } },
          select: { rsvpCount: true },
        })
      } else {
        eventRow = await tx.event.findUnique({
          where: { id: event.id },
          select: { rsvpCount: true },
        })
      }
      await emitInteraction(tx, { type: 'rsvp_cancel', req, event })
      return eventRow
    })

    await scheduleRebuild(req.user.id)

    return res.json({ data: { status: 'cancelled', event_rsvp_count: eventRow.rsvpCount } })
  } catch (err) {
    console.error('DELETE /api/events/:id/rsvp error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to cancel RSVP')
  }
})

// --- GET /api/events/:id/rsvps — organizer view of who RSVP'd ----------------
// Owner (event organizer) only. Optional ?status= filter; paginated by
// created_at. Always returns going/interested/waitlisted counts for the whole
// event (independent of the page or status filter) so the dashboard header is
// accurate. Powers the OrganizerDashboard attendee list (#32, story 13).
router.get('/:id/rsvps', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'Only the organizer can view RSVPs')
    }

    const limit = clampLimit(req.query.limit)
    const where = { eventId: id }
    if (req.query.status) {
      if (!RSVP_STATUSES.has(req.query.status)) {
        return fail(res, 422, 'VALIDATION_ERROR', 'invalid status filter')
      }
      where.status = req.query.status
    }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const rows = await prisma.rsvp.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        status: true,
        guestsCount: true,
        attended: true,
        checkedInAt: true,
        createdAt: true,
        user: { select: ATTENDEE_SELECT },
      },
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    // Whole-event counts (not page-scoped) for the dashboard header.
    const grouped = await prisma.rsvp.groupBy({
      by: ['status'],
      where: { eventId: id },
      _count: { _all: true },
    })
    const counts = { going: 0, interested: 0, waitlisted: 0 }
    for (const g of grouped) {
      if (g.status in counts) counts[g.status] = g._count._all
    }

    return res.json({
      data: rows.map((r) => ({
        id: r.id,
        user: toAttendee(r.user),
        status: r.status,
        guests_count: r.guestsCount,
        attended: r.attended,
        checked_in_at: r.checkedInAt,
        created_at: r.createdAt,
      })),
      nextCursor,
      counts,
    })
  } catch (err) {
    console.error('GET /api/events/:id/rsvps error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load RSVPs')
  }
})

// --- PATCH /api/events/:id/rsvps/:userId — organizer check-in ----------------
// Owner (organizer) marks an attendee attended=true, checked_in_at=now(). This
// is the ONLY non-sports surface that fires the ranker's top-weight `attend`
// signal (§7.4 attendance note), so we emit an interaction_events row for the
// attendee (not the organizer) on the transition into attended. Idempotent: a
// repeat check-in keeps the original checked_in_at and doesn't re-emit.
router.patch('/:id/rsvps/:userId', requireAuth, async (req, res) => {
  const { id, userId } = req.params
  if (!isUuid(id) || !isUuid(userId)) return fail(res, 404, 'NOT_FOUND', 'RSVP not found')

  const { attended } = req.body ?? {}
  if (attended !== true) {
    return fail(res, 422, 'VALIDATION_ERROR', 'attended must be true')
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, categoryId: true, organizerId: true },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'Only the organizer can check attendees in')
    }

    const rsvp = await prisma.rsvp.findUnique({
      where: { userId_eventId: { userId, eventId: id } },
      select: { id: true, attended: true },
    })
    if (!rsvp) return fail(res, 404, 'NOT_FOUND', 'RSVP not found')

    // Idempotent: already checked in — return current state, no re-emit.
    if (rsvp.attended) {
      const fresh = await prisma.rsvp.findUnique({
        where: { userId_eventId: { userId, eventId: id } },
        select: { checkedInAt: true },
      })
      return res.json({
        data: { user_id: userId, event_id: id, attended: true, checked_in_at: fresh.checkedInAt },
      })
    }

    const now = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.rsvp.update({
        where: { userId_eventId: { userId, eventId: id } },
        data: { attended: true, checkedInAt: now },
        select: { checkedInAt: true },
      })
      // The `attend` signal is attributed to the ATTENDEE (weight 1.0 — the
      // ranker's top non-sports signal), not the organizer doing the check-in.
      await tx.interactionEvent.create({
        data: {
          userId,
          eventId: id,
          categoryId: event.categoryId,
          interactionType: 'attend',
          surface: 'event_detail',
          weight: 1.0,
        },
      })
      return u
    })

    // The attendee's preference vector should reflect the new top-weight signal.
    await scheduleRebuild(userId)

    return res.json({
      data: { user_id: userId, event_id: id, attended: true, checked_in_at: updated.checkedInAt },
    })
  } catch (err) {
    console.error('PATCH /api/events/:id/rsvps/:userId error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not check attendee in')
  }
})

export default router
