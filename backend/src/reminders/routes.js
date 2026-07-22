// Event reminders (planning §7.5, work-plan #28, story 7):
//   POST   /api/events/:id/reminders   schedule a pre-event reminder (auth)
//   GET    /api/users/:id/reminders    list a user's reminders (owner only)
//   DELETE /api/reminders/:id          cancel a scheduled reminder (owner)
//
// The server computes remind_at = starts_at − offset_minutes and stores the
// reminder as 'scheduled'; the dispatch-reminders job (reminders/dispatch.js)
// later scans due rows and emits notifications. Mirrors the codebase's
// conventions: requireAuth + fail(), snake_case envelopes, owner checks.
//
// Mounted THREE ways in server.js because the paths live under different bases:
//   app.use('/api/events', eventReminderRouter)   -> POST /:id/reminders
//   app.use('/api/users',  userReminderRouter)    -> GET  /:id/reminders
//   app.use('/api',        reminderRouter)         -> DELETE /reminders/:id
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'
import { REMINDER_SELECT, toReminder } from './serialize.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

const CHANNELS = new Set(['in_app', 'push', 'email'])
const REMINDER_STATUSES = new Set(['scheduled', 'sent', 'cancelled'])
// Bound the lead time to something sane: 5 minutes .. 30 days before start.
const MIN_OFFSET = 5
const MAX_OFFSET = 30 * 24 * 60

const clampLimit = (raw, def = 20, max = 50) => Math.min(Math.max(Number(raw) || def, 1), max)

// --- POST /api/events/:id/reminders — schedule a reminder --------------------
export const eventReminderRouter = Router()

eventReminderRouter.post('/:id/reminders', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  const { offset_minutes, channel = 'in_app' } = req.body ?? {}
  if (
    !Number.isInteger(offset_minutes) ||
    offset_minutes < MIN_OFFSET ||
    offset_minutes > MAX_OFFSET
  ) {
    return fail(
      res,
      422,
      'VALIDATION_ERROR',
      `offset_minutes must be an integer between ${MIN_OFFSET} and ${MAX_OFFSET}`,
    )
  }
  if (!CHANNELS.has(channel)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'channel must be in_app/push/email')
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, startsAt: true, status: true },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.status === 'cancelled' || event.status === 'past') {
      return fail(res, 409, 'CONFLICT', `Cannot set a reminder for a ${event.status} event`)
    }

    const remindAt = new Date(event.startsAt.getTime() - offset_minutes * 60 * 1000)
    // A reminder whose fire time is already in the past is useless — the
    // dispatcher would send it on the next tick. Reject so the picker can nudge
    // the user toward a shorter lead time instead of a silent instant-fire.
    if (remindAt.getTime() <= Date.now()) {
      return fail(res, 422, 'VALIDATION_ERROR', 'That reminder time has already passed')
    }

    const created = await prisma.eventReminder.create({
      data: {
        userId: req.user.id,
        eventId: id,
        offsetMinutes: offset_minutes,
        remindAt,
        channel,
      },
      select: REMINDER_SELECT,
    })

    return res.status(201).json({ data: toReminder(created) })
  } catch (err) {
    // Unique (user_id, event_id, remind_at) — same reminder already scheduled.
    if (err?.code === 'P2002') {
      return fail(res, 409, 'CONFLICT', 'You already have a reminder at that time')
    }
    console.error('POST /api/events/:id/reminders error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not schedule reminder')
  }
})

// --- GET /api/users/:id/reminders — list a user's reminders (owner) ----------
export const userReminderRouter = Router()

userReminderRouter.get('/:id/reminders', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (id !== req.user.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only view your own reminders')
  }

  try {
    const limit = clampLimit(req.query.limit)
    const where = { userId: id }
    if (req.query.status) {
      if (!REMINDER_STATUSES.has(req.query.status)) {
        return fail(res, 422, 'VALIDATION_ERROR', 'status must be scheduled/sent/cancelled')
      }
      where.status = req.query.status
    }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.remindAt = { gt: cur }
    }

    const rows = await prisma.eventReminder.findMany({
      where,
      orderBy: { remindAt: 'asc' },
      take: limit + 1,
      select: REMINDER_SELECT,
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].remindAt.toISOString()
    }

    return res.json({ data: rows.map(toReminder), nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/reminders error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load reminders')
  }
})

// --- DELETE /api/reminders/:id — cancel a scheduled reminder (owner) ---------
export const reminderRouter = Router()

reminderRouter.delete('/reminders/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Reminder not found')

  try {
    const reminder = await prisma.eventReminder.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    })
    if (!reminder) return fail(res, 404, 'NOT_FOUND', 'Reminder not found')
    if (reminder.userId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'Not your reminder')
    }

    // Idempotent: already cancelled (or sent) — nothing to change.
    if (reminder.status === 'scheduled') {
      await prisma.eventReminder.update({ where: { id }, data: { status: 'cancelled' } })
    }

    return res.status(204).end()
  } catch (err) {
    console.error('DELETE /api/reminders/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not cancel reminder')
  }
})
