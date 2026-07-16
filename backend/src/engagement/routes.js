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

export default router
