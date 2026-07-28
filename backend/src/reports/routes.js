// Content reports — viewer flags a post/comment/story they don't want to see.
//
//   POST   /api/reports  { target_type, target_id, reason, note? }
//     -> 201 { data: { hidden: true } }
//   DELETE /api/reports  { target_type, target_id }
//     -> 200 { data: { hidden: false } }   // "unhide" — Instagram-style undo
//
// A row is unique on (reporter, target_type, target_id) so a repeat report is
// idempotent (upsert, never 409). The same key doubles as the hide index that
// social/routes.js subtracts from list responses (see reports/hidden.js).
//
// Self-reports are rejected (400 SELF_REPORT) — the author's affordance is
// Delete, not Report. The `flagged` column on posts/comments/stories is left
// alone; that meaning belongs to the profanity filter.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

const TARGET_TYPES = new Set(['post', 'comment', 'story'])
const REASONS = new Set([
  'spam',
  'harassment',
  'hate',
  'nudity',
  'violence',
  'self_harm',
  'misinfo',
  'other',
])

// Adding a new reportable target = one line here. Each maps to a Prisma model
// with an `authorId` (checked below for the self-report guard).
const REPORTABLE = { post: () => prisma.post, comment: () => prisma.comment, story: () => prisma.story }
const loadTarget = (type, id) =>
  REPORTABLE[type]?.().findUnique({ where: { id }, select: { id: true, authorId: true } }) ?? null

router.post('/reports', requireAuth, async (req, res) => {
  const { target_type, target_id, reason, note } = req.body ?? {}

  if (!TARGET_TYPES.has(target_type)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'target_type must be post/comment/story')
  }
  if (!isUuid(target_id)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'target_id must be a valid id')
  }
  if (!REASONS.has(reason)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'reason is invalid')
  }
  if (note != null && (typeof note !== 'string' || note.length > 500)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'note must be ≤500 characters')
  }

  try {
    const target = await loadTarget(target_type, target_id)
    if (!target) return fail(res, 404, 'NOT_FOUND', 'Target not found')
    if (target.authorId === req.user.id) {
      return fail(res, 400, 'SELF_REPORT', 'You cannot report your own content')
    }

    const cleanNote = note?.trim() || null

    // Upsert on the composite unique key so a re-report is idempotent.
    await prisma.contentReport.upsert({
      where: {
        reporterId_targetType_targetId: {
          reporterId: req.user.id,
          targetType: target_type,
          targetId: target_id,
        },
      },
      create: {
        reporterId: req.user.id,
        targetType: target_type,
        targetId: target_id,
        reason,
        note: cleanNote,
      },
      // Keep the row fresh on re-report so the mod queue sees the latest reason.
      update: { reason, note: cleanNote },
    })

    return res.status(201).json({ data: { hidden: true } })
  } catch (err) {
    console.error('POST /api/reports error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not submit report')
  }
})

// Undo: remove this reporter's report on a target. Idempotent — a missing row
// still resolves 200 so a double-tap Undo doesn't 404.
router.delete('/reports', requireAuth, async (req, res) => {
  const { target_type, target_id } = req.body ?? {}
  if (!TARGET_TYPES.has(target_type)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'target_type must be post/comment/story')
  }
  if (!isUuid(target_id)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'target_id must be a valid id')
  }
  try {
    await prisma.contentReport
      .delete({
        where: {
          reporterId_targetType_targetId: {
            reporterId: req.user.id,
            targetType: target_type,
            targetId: target_id,
          },
        },
      })
      .catch((err) => {
        // P2025 = record not found; that's fine — the caller's intent is
        // "make sure this isn't hidden anymore", already true.
        if (err?.code !== 'P2025') throw err
      })
    return res.json({ data: { hidden: false } })
  } catch (err) {
    console.error('DELETE /api/reports error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not remove report')
  }
})

export default router
