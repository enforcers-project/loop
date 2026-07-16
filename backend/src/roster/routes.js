// Sports roster (planning §7.4, work-plan #23).
//
// Design notes worth knowing:
// - The DB is the capacity bouncer. A BEFORE-INSERT trigger (Sprint 1 migration
//   trg_enforce_roster_capacity) atomically demotes a `claimed` insert to
//   `waitlisted` when the run is already at players_needed — so these handlers
//   never race on capacity; they insert `claimed` and trust the trigger.
// - Two more DB guards back us up: CHECK(status<>'claimed' OR slot_number NOT
//   NULL) and a partial UNIQUE(sports_position_id, slot_number) WHERE claimed.
//   A concurrent claim that steals our slot surfaces as P2002 → 409 CONFLICT.
// - players_signed_up is denormalized on sports_details; we RECOMPUTE it from
//   count(claimed) after each mutation rather than +1/-1, so it can't drift.
// - Auto-promotion (release frees a slot → next waitlister claims) lives here,
//   in the endpoint, not a trigger — the "who's next" rule is product logic.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'
import { toPositionsView, toRosterView, toRosterEntry } from './serialize.js'

const router = Router()

const CLAIM_WEIGHT = 0.75
const RELEASE_WEIGHT = -0.3

// --- helpers ----------------------------------------------------------------

/** Load a sports event with its positions, or return null. */
async function loadSportsEvent(id) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { sportsDetail: { include: { positions: true } } },
  })
  if (!event || !event.isSports || !event.sportsDetail) return null
  return event
}

/**
 * Find the lowest unclaimed slot number (1..capacity) in a position, or null if
 * the position is full. The claimed CHECK requires every claim to sit in a slot.
 */
async function lowestFreeSlot(tx, positionId, capacity) {
  const taken = await tx.rosterEntry.findMany({
    where: { sportsPositionId: positionId, status: 'claimed' },
    select: { slotNumber: true },
  })
  const takenSet = new Set(taken.map((r) => r.slotNumber))
  for (let n = 1; n <= capacity; n++) {
    if (!takenSet.has(n)) return n
  }
  return null
}

/** Recompute sports_details.players_signed_up from the live claimed count. */
async function syncSignedUp(tx, eventId) {
  const count = await tx.rosterEntry.count({ where: { eventId, status: 'claimed' } })
  await tx.sportsDetail.update({
    where: { eventId },
    data: { playersSignedUp: count },
  })
  return count
}

/** Append a behavior signal for the recommender (best-effort, in-tx). */
async function emitInteraction(tx, { type, weight, req, event }) {
  await tx.interactionEvent.create({
    data: {
      userId: req.user.id,
      sessionId: req.sessionId ?? null,
      eventId: event.id,
      categoryId: event.categoryId,
      interactionType: type,
      surface: 'event_detail',
      weight,
    },
  })
}

// --- GET /api/events/:id/positions — picker grid (public) -------------------
router.get('/:id/positions', async (req, res) => {
  try {
    const event = await loadSportsEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Sports run not found')

    const claimed = await prisma.rosterEntry.findMany({
      where: { eventId: event.id, status: 'claimed' },
      select: { sportsPositionId: true, slotNumber: true },
    })
    const byPosition = new Map()
    for (const r of claimed) {
      const list = byPosition.get(r.sportsPositionId) ?? []
      list.push(r)
      byPosition.set(r.sportsPositionId, list)
    }

    return res.json({ data: toPositionsView(event, byPosition) })
  } catch (err) {
    console.error('GET /positions error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to load positions')
  }
})

// --- GET /api/events/:id/roster — claimed + FIFO waitlist (auth) ------------
router.get('/:id/roster', requireAuth, async (req, res) => {
  try {
    const event = await loadSportsEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Sports run not found')

    const entries = await prisma.rosterEntry.findMany({
      where: { eventId: event.id, status: { in: ['claimed', 'waitlisted'] } },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        sportsPosition: { select: { label: true } },
      },
    })

    return res.json({ data: toRosterView(event, entries) })
  } catch (err) {
    console.error('GET /roster error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to load roster')
  }
})

// --- POST /api/events/:id/roster — join + claim a spot (auth) ---------------
router.post('/:id/roster', requireAuth, async (req, res) => {
  const { sports_position_id, slot_number } = req.body ?? {}
  try {
    const event = await loadSportsEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Sports run not found')

    // Resolve the target position. Omitted → the synthetic "Any" position
    // (simple runs seed one whose capacity == players_needed, §6 convention).
    let position
    if (sports_position_id) {
      position = event.sportsDetail.positions.find((p) => p.id === sports_position_id)
      if (!position) return fail(res, 404, 'NOT_FOUND', 'Position not found on this run')
    } else {
      position = event.sportsDetail.positions.find((p) => p.label === 'Any')
      if (!position) {
        return fail(res, 422, 'VALIDATION_ERROR', 'sports_position_id is required for this run')
      }
    }

    // One live claim per user per run (also guarded by a partial unique index).
    const live = await prisma.rosterEntry.findFirst({
      where: {
        eventId: event.id,
        userId: req.user.id,
        status: { in: ['claimed', 'waitlisted'] },
      },
    })
    if (live) return fail(res, 409, 'CONFLICT', 'You already have a spot on this run')

    const result = await prisma.$transaction(async (tx) => {
      // Pick the slot: caller-requested (if free) else lowest free.
      let slot = slot_number ?? (await lowestFreeSlot(tx, position.id, position.capacity))

      // Position full → create a waitlist entry directly (no slot). The trigger
      // only demotes `claimed`, so for a full *position* we waitlist explicitly.
      if (slot == null) {
        const nextPos = await tx.rosterEntry.aggregate({
          where: { eventId: event.id, status: 'waitlisted' },
          _max: { waitlistPosition: true },
        })
        const entry = await tx.rosterEntry.create({
          data: {
            eventId: event.id,
            sportsDetailId: event.id,
            sportsPositionId: position.id,
            userId: req.user.id,
            status: 'waitlisted',
            waitlistPosition: (nextPos._max.waitlistPosition ?? 0) + 1,
          },
        })
        await emitInteraction(tx, { type: 'claim_spot', weight: CLAIM_WEIGHT, req, event })
        await syncSignedUp(tx, event.id)
        return entry
      }

      // Try to claim the slot. The capacity trigger may demote us to waitlisted
      // if the RUN (not just the position) is already at players_needed.
      const entry = await tx.rosterEntry.create({
        data: {
          eventId: event.id,
          sportsDetailId: event.id,
          sportsPositionId: position.id,
          userId: req.user.id,
          slotNumber: slot,
          status: 'claimed',
        },
      })
      await emitInteraction(tx, { type: 'claim_spot', weight: CLAIM_WEIGHT, req, event })
      await syncSignedUp(tx, event.id)
      return entry
    })

    return res.status(201).json({ data: toRosterEntry(result) })
  } catch (err) {
    // Partial unique index (slot taken) or one-live-claim → CONFLICT.
    if (err.code === 'P2002') {
      return fail(res, 409, 'CONFLICT', 'That spot was just taken — pick another')
    }
    console.error('POST /roster error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to claim spot')
  }
})

// --- DELETE /api/events/:id/roster — release + auto-promote (auth) ----------
router.delete('/:id/roster', requireAuth, async (req, res) => {
  try {
    const event = await loadSportsEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Sports run not found')

    const live = await prisma.rosterEntry.findFirst({
      where: {
        eventId: event.id,
        userId: req.user.id,
        status: { in: ['claimed', 'waitlisted'] },
      },
    })
    if (!live) return fail(res, 404, 'NOT_FOUND', 'You have no active spot to release')

    await prisma.$transaction(async (tx) => {
      const wasClaimed = live.status === 'claimed'
      await tx.rosterEntry.update({
        where: { id: live.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      })

      // If a CLAIMED spot opened up, promote the head of the FIFO waitlist into
      // the freed slot. (Releasing a waitlist entry frees nothing to promote.)
      if (wasClaimed) {
        const next = await tx.rosterEntry.findFirst({
          where: { eventId: event.id, status: 'waitlisted' },
          orderBy: { waitlistPosition: 'asc' },
        })
        if (next) {
          await tx.rosterEntry.update({
            where: { id: next.id },
            data: {
              status: 'claimed',
              slotNumber: live.slotNumber, // reuse the freed slot
              sportsPositionId: live.sportsPositionId,
              waitlistPosition: null,
            },
          })
        }
      }

      await emitInteraction(tx, { type: 'release_spot', weight: RELEASE_WEIGHT, req, event })
      await syncSignedUp(tx, event.id)
    })

    return res.status(204).end()
  } catch (err) {
    console.error('DELETE /roster error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to release spot')
  }
})

// --- PATCH /api/events/:id/roster/:entryId — host management (host) ---------
const HOST_STATUSES = new Set(['claimed', 'waitlisted', 'cancelled', 'no_show', 'attended'])

router.patch('/:id/roster/:entryId', requireAuth, async (req, res) => {
  const { status, sports_position_id, slot_number } = req.body ?? {}
  try {
    const event = await loadSportsEvent(req.params.id)
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Sports run not found')
    // Only the run's organizer/host may manage the roster.
    if (event.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'Only the host can manage the roster')
    }
    if (status !== undefined && !HOST_STATUSES.has(status)) {
      return fail(res, 422, 'VALIDATION_ERROR', 'invalid roster status')
    }

    const entry = await prisma.rosterEntry.findFirst({
      where: { id: req.params.entryId, eventId: event.id },
    })
    if (!entry) return fail(res, 404, 'NOT_FOUND', 'Roster entry not found')

    const data = {}
    if (sports_position_id !== undefined) data.sportsPositionId = sports_position_id
    if (slot_number !== undefined) data.slotNumber = slot_number
    if (status !== undefined) {
      data.status = status
      // attended/no_show are check-in outcomes; stamp the time on attended.
      if (status === 'attended') data.checkedInAt = new Date()
      if (status === 'cancelled') data.cancelledAt = new Date()
      // Promoting from waitlist → claimed needs a slot; assign lowest free if none given.
      if (status === 'claimed' && slot_number === undefined && entry.slotNumber == null) {
        const posId = sports_position_id ?? entry.sportsPositionId
        const pos = event.sportsDetail.positions.find((p) => p.id === posId)
        if (pos) {
          const slot = await lowestFreeSlot(prisma, pos.id, pos.capacity)
          if (slot == null) return fail(res, 409, 'CONFLICT', 'That position is full')
          data.slotNumber = slot
        }
      }
      if (status === 'claimed') data.waitlistPosition = null
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.rosterEntry.update({ where: { id: entry.id }, data })
      await syncSignedUp(tx, event.id)
      return u
    })

    return res.json({ data: toRosterEntry(updated) })
  } catch (err) {
    if (err.code === 'P2002') {
      return fail(res, 409, 'CONFLICT', 'That slot is already taken')
    }
    console.error('PATCH /roster/:entryId error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to update roster entry')
  }
})

export default router
