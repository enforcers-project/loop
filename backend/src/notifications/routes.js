// Notification bell feed (planning §7.5, work-plan #27):
//   GET  /api/notifications           caller's feed (cursor-paginated) + unread_count
//   PATCH /api/notifications/:id/read mark one read (owner only)
//   POST /api/notifications/read-all  mark all the caller's unread read
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { fail, requireAuth } from '../auth/middleware.js'
import { toNotification, NOTIFICATION_SELECT } from './serialize.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

// --- GET /api/notifications -------------------------------------------------
// ?is_read=false filters to unread; ?cursor=<ISO created_at>&limit=<1..50>.
// Ordered created_at DESC (newest first). Response always carries the caller's
// live unread_count so the TopNav bell dot can reconcile after a read.
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const where = { userId: req.user.id }
    if (req.query.is_read === 'false') where.isRead = false
    else if (req.query.is_read === 'true') where.isRead = true
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: NOTIFICATION_SELECT,
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
    ])

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    return res.json({
      data: rows.map(toNotification),
      nextCursor,
      unread_count: unreadCount,
    })
  } catch (err) {
    console.error('GET /api/notifications error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load notifications')
  }
})

// --- PATCH /api/notifications/:id/read — mark one read ----------------------
// Owner-only: a notification the caller doesn't own reads as 404 (never leak
// that it exists). Already-read is a no-op that still returns 200.
router.patch('/:id/read', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Notification not found')

  try {
    const existing = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, isRead: true, readAt: true },
    })
    if (!existing || existing.userId !== req.user.id) {
      return fail(res, 404, 'NOT_FOUND', 'Notification not found')
    }

    let readAt = existing.readAt
    if (!existing.isRead) {
      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
        select: { readAt: true },
      })
      readAt = updated.readAt
    }

    return res.json({ data: { id, is_read: true, read_at: readAt } })
  } catch (err) {
    console.error('PATCH /api/notifications/:id/read error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not update notification')
  }
})

// --- POST /api/notifications/read-all — mark all unread read ----------------
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
    return res.json({ data: { updated: result.count, unread_count: 0 } })
  } catch (err) {
    console.error('POST /api/notifications/read-all error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not update notifications')
  }
})

export default router
