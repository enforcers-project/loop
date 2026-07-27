// Direct messaging routes (§NEW):
//
//   POST /api/threads/dm                {partner_id}         idempotent by dmKey
//   POST /api/threads/group             {participant_ids[], name?}
//   GET  /api/threads                                        my threads + unread
//   GET  /api/threads/:id/messages                           cursor-paginated
//   POST /api/threads/:id/messages      {text?, event_id?, client_id?}
//   POST /api/threads/:id/read                               bump lastReadAt
//   POST /api/threads/:id/typing                             fan-out only
//   GET  /api/messages/stream                                SSE for req.user
//
// Design notes:
//   - Thread "kind" is derived from participant count: 2 → DM, 3+ → group.
//     No separate enum, no ambiguity between them.
//   - `dm_key` is the sorted "<uuidA>:<uuidB>" pair, uniqueness index enforced;
//     opposite-side races collapse to one row via the unique upsert.
//   - Every :id route runs `requireParticipant` — the 404-on-not-a-member trick
//     keeps thread existence private (a stranger can't probe ids).
//   - `attached_event` snapshots the shared event's slim fields at send-time so
//     a later delete/edit of the source event doesn't change what the bubble
//     showed.
//   - Realtime fan-out via bus.publish() — every route that mutates state also
//     wakes every subscriber for the affected participants.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { fail, requireAuth } from '../auth/middleware.js'
import { publish, subscribe } from './bus.js'
import { PARTICIPANT_SELECT, toMessage, toThread } from './serialize.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)
const MAX_TEXT_LEN = 4000
const MAX_GROUP = 20 // cap group size so a bad actor can't fan out to thousands

/** Sorted-pair key so opposite-side calls collapse to one dmKey. */
function dmKeyFor(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * Verify the caller is a member of `threadId`. Returns the participant row on
 * success, or ends the response with 404 (never leak that the thread exists).
 */
async function requireParticipant(threadId, userId, res) {
  if (!isUuid(threadId)) {
    fail(res, 404, 'NOT_FOUND', 'Thread not found')
    return null
  }
  const row = await prisma.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId } },
    select: { threadId: true, userId: true, lastReadAt: true },
  })
  if (!row) {
    fail(res, 404, 'NOT_FOUND', 'Thread not found')
    return null
  }
  return row
}

/** All participant user_ids on a thread (for realtime fan-out). */
async function participantIds(threadId) {
  const rows = await prisma.threadParticipant.findMany({
    where: { threadId },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

/** Slim projection of an event so the bubble can render standalone. */
function slimEventFromRow(event, category) {
  if (!event) return null
  const priceMin = event.priceMin != null ? Number(event.priceMin) : null
  return {
    id: event.id,
    title: event.title || 'Event',
    poster: event.flyerUrl || '',
    date: event.startsAt ? new Date(event.startsAt).toISOString() : '',
    venueName: event.venueName || '',
    city: event.city || '',
    price: event.isFree || priceMin === 0 ? 'Free' : priceMin != null ? `$${priceMin}` : '',
    isFree: !!event.isFree,
    isSports: !!event.isSports,
    categorySlug: category?.slug ?? null,
  }
}

// --- POST /api/threads/dm ---------------------------------------------------
// Body: { partner_id }. Idempotent — a second call from either side returns
// the same thread row.
router.post('/threads/dm', requireAuth, async (req, res) => {
  const me = req.user.id
  const partnerId = req.body?.partner_id
  if (!isUuid(partnerId)) return fail(res, 422, 'VALIDATION_ERROR', 'partner_id must be a UUID')
  if (partnerId === me) return fail(res, 422, 'VALIDATION_ERROR', "You can't message yourself")

  try {
    // Ensure the partner exists before we materialize a thread against a bogus id.
    const partner = await prisma.user.findUnique({ where: { id: partnerId }, select: { id: true } })
    if (!partner) return fail(res, 404, 'NOT_FOUND', 'User not found')

    const key = dmKeyFor(me, partnerId)

    // Upsert is atomic on dmKey; both sides can call this in parallel and one
    // of the two conflict retries returns the row the other one just made.
    const thread = await prisma.$transaction(async (tx) => {
      const existing = await tx.messageThread.findUnique({
        where: { dmKey: key },
        include: { participants: { select: PARTICIPANT_SELECT } },
      })
      if (existing) return existing
      const created = await tx.messageThread.create({
        data: {
          dmKey: key,
          participants: {
            createMany: { data: [{ userId: me }, { userId: partnerId }] },
          },
        },
        include: { participants: { select: PARTICIPANT_SELECT } },
      })
      return created
    })

    return res.status(201).json({ data: toThread(thread, thread.participants, null, 0) })
  } catch (err) {
    // Another parallel request won the unique-index race; re-read and return it.
    if (err.code === 'P2002') {
      const key = dmKeyFor(me, partnerId)
      const existing = await prisma.messageThread.findUnique({
        where: { dmKey: key },
        include: { participants: { select: PARTICIPANT_SELECT } },
      })
      if (existing) return res.json({ data: toThread(existing, existing.participants, null, 0) })
    }
    console.error('POST /api/threads/dm error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not create thread')
  }
})

// --- POST /api/threads/group ------------------------------------------------
// Body: { participant_ids[], name? }. Requires ≥2 distinct non-self ids.
router.post('/threads/group', requireAuth, async (req, res) => {
  const me = req.user.id
  const raw = req.body?.participant_ids
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : null
  if (!Array.isArray(raw)) return fail(res, 422, 'VALIDATION_ERROR', 'participant_ids required')

  const uniq = [...new Set(raw.filter(isUuid))].filter((id) => id !== me)
  if (uniq.length < 2) {
    return fail(res, 422, 'VALIDATION_ERROR', 'A group needs at least two other people')
  }
  if (uniq.length > MAX_GROUP) {
    return fail(res, 422, 'VALIDATION_ERROR', `Groups are capped at ${MAX_GROUP} people`)
  }

  try {
    // Verify every participant exists — silently drops nothing so the caller
    // learns about a bad id rather than getting a half-populated group.
    const users = await prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true },
    })
    if (users.length !== uniq.length)
      return fail(res, 404, 'NOT_FOUND', 'One or more users not found')

    const thread = await prisma.messageThread.create({
      data: {
        name: name || null,
        participants: {
          createMany: { data: [{ userId: me }, ...uniq.map((id) => ({ userId: id }))] },
        },
      },
      include: { participants: { select: PARTICIPANT_SELECT } },
    })

    return res.status(201).json({ data: toThread(thread, thread.participants, null, 0) })
  } catch (err) {
    console.error('POST /api/threads/group error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not create group')
  }
})

// --- GET /api/threads -------------------------------------------------------
// My threads, most-recent-message first. Includes participants, the latest
// message preview, and my unread count (messages after my lastReadAt from
// someone other than me).
router.get('/threads', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    // Which threads I'm in.
    const memberships = await prisma.threadParticipant.findMany({
      where: { userId: me },
      select: { threadId: true, lastReadAt: true },
    })
    if (memberships.length === 0) return res.json({ data: [] })

    const threadIds = memberships.map((m) => m.threadId)

    const threads = await prisma.messageThread.findMany({
      where: { id: { in: threadIds } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        participants: { select: PARTICIPANT_SELECT },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    })

    // One unread aggregate for the whole set — no N+1.
    const unreadRows = await prisma.$queryRawUnsafe(
      `SELECT thread_id, COUNT(*)::int AS n
         FROM messages m
        WHERE m.thread_id = ANY($1::uuid[])
          AND m.sender_id <> $2::uuid
          AND (
            (SELECT last_read_at FROM thread_participants
              WHERE thread_id = m.thread_id AND user_id = $2::uuid) IS NULL
            OR m.created_at > (SELECT last_read_at FROM thread_participants
                                WHERE thread_id = m.thread_id AND user_id = $2::uuid)
          )
        GROUP BY thread_id`,
      threadIds,
      me,
    )
    const unreadByThread = new Map(unreadRows.map((r) => [r.thread_id, r.n]))

    const data = threads.map((t) =>
      toThread(t, t.participants, t.messages[0] ?? null, unreadByThread.get(t.id) ?? 0),
    )
    // Also emit a per-participant lastReadAt map so the client can compute
    // Delivered/Read status without a second fetch.
    return res.json({ data })
  } catch (err) {
    console.error('GET /api/threads error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load threads')
  }
})

// --- GET /api/threads/:id/messages ------------------------------------------
// Cursor is `<createdAt_ISO>_<id>` so two messages sharing a millisecond still
// paginate cleanly.
router.get('/threads/:id/messages', requireAuth, async (req, res) => {
  const me = req.user.id
  const threadId = req.params.id
  const member = await requireParticipant(threadId, me, res)
  if (!member) return

  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100)
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : ''

  const where = { threadId }
  if (cursor) {
    const [iso, id] = cursor.split('_')
    const at = new Date(iso)
    if (!isNaN(at.getTime()) && isUuid(id)) {
      // (createdAt, id) < (cursor) — compound tiebreaker for stable pagination.
      where.OR = [{ createdAt: { lt: at } }, { AND: [{ createdAt: at }, { id: { lt: id } }] }]
    }
  }

  try {
    const rows = await prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { reactions: { select: { userId: true, emoji: true } } },
    })
    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      const last = rows[rows.length - 1]
      nextCursor = `${last.createdAt.toISOString()}_${last.id}`
    }
    // Return in chronological order so the client's `[...prev, ...next]` prepend
    // is a straight concat.
    const data = rows.reverse().map((m) => toMessage(m))
    return res.json({ data, nextCursor })
  } catch (err) {
    console.error('GET /api/threads/:id/messages error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load messages')
  }
})

// --- POST /api/threads/:id/messages -----------------------------------------
// Body: { text?, event_id?, client_id? }. Either text or event_id is required.
router.post('/threads/:id/messages', requireAuth, async (req, res) => {
  const me = req.user.id
  const threadId = req.params.id
  const member = await requireParticipant(threadId, me, res)
  if (!member) return

  const rawText = typeof req.body?.text === 'string' ? req.body.text : ''
  const text = rawText.trim().slice(0, MAX_TEXT_LEN)
  const eventId =
    typeof req.body?.event_id === 'string' && isUuid(req.body.event_id) ? req.body.event_id : null
  const clientId = typeof req.body?.client_id === 'string' ? req.body.client_id.slice(0, 80) : null

  if (!text && !eventId) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Message must have text or an event')
  }

  try {
    let attachedEvent = null
    if (eventId) {
      const ev = await prisma.event.findUnique({
        where: { id: eventId },
        include: { category: { select: { slug: true } } },
      })
      // Silent slim-and-drop-on-miss — the sender chose the flyer explicitly, so
      // we won't reject the whole message if the event has since been deleted.
      attachedEvent = slimEventFromRow(ev, ev?.category)
    }

    const now = new Date()
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { threadId, senderId: me, text: text || null, attachedEvent, createdAt: now },
      }),
      prisma.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: now } }),
      prisma.threadParticipant.update({
        where: { threadId_userId: { threadId, userId: me } },
        data: { lastReadAt: now },
      }),
    ])

    const ids = await participantIds(threadId)
    const payload = { type: 'message', threadId, message: toMessage(message, clientId) }
    publish(ids, payload)
    // Bump my own lastReadAt in the frame so a second tab of mine sees it.
    publish(ids, { type: 'read', threadId, userId: me, lastReadAt: now })

    return res.status(201).json({ data: toMessage(message, clientId) })
  } catch (err) {
    console.error('POST /api/threads/:id/messages error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not send message')
  }
})

// --- POST /api/threads/:id/read ---------------------------------------------
router.post('/threads/:id/read', requireAuth, async (req, res) => {
  const me = req.user.id
  const threadId = req.params.id
  const member = await requireParticipant(threadId, me, res)
  if (!member) return

  try {
    const now = new Date()
    await prisma.threadParticipant.update({
      where: { threadId_userId: { threadId, userId: me } },
      data: { lastReadAt: now },
    })
    const ids = await participantIds(threadId)
    publish(ids, { type: 'read', threadId, userId: me, lastReadAt: now })
    return res.json({ data: { thread_id: threadId, last_read_at: now } })
  } catch (err) {
    console.error('POST /api/threads/:id/read error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not mark read')
  }
})

// --- POST /api/threads/:id/typing -------------------------------------------
// Ephemeral — no DB write. Publishes a `typing` event to everyone else.
router.post('/threads/:id/typing', requireAuth, async (req, res) => {
  const me = req.user.id
  const threadId = req.params.id
  const member = await requireParticipant(threadId, me, res)
  if (!member) return

  try {
    const ids = (await participantIds(threadId)).filter((id) => id !== me)
    publish(ids, { type: 'typing', threadId, userId: me })
    return res.status(204).end()
  } catch (err) {
    console.error('POST /api/threads/:id/typing error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not send typing signal')
  }
})

// --- POST /api/threads/:id/messages/:mid/react ------------------------------
// Body: { emoji }. Toggles: if the (message, user, emoji) row exists we remove
// it; otherwise we insert. Idempotent per-tap. Publishes a `reaction` frame
// with the resulting op ('added' | 'removed') so peers can flip the badge.
const REACTION_EMOJIS = new Set(['❤️', '👍', '😂', '😮', '😢', '🔥'])
router.post('/threads/:id/messages/:mid/react', requireAuth, async (req, res) => {
  const me = req.user.id
  const threadId = req.params.id
  const messageId = req.params.mid
  const member = await requireParticipant(threadId, me, res)
  if (!member) return
  if (!isUuid(messageId)) return fail(res, 404, 'NOT_FOUND', 'Message not found')

  const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji : '❤️'
  if (!REACTION_EMOJIS.has(emoji)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Unsupported emoji')
  }

  try {
    // Confirm the message belongs to this thread (prevents cross-thread reacts).
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, threadId: true },
    })
    if (!msg || msg.threadId !== threadId) {
      return fail(res, 404, 'NOT_FOUND', 'Message not found')
    }

    const key = { messageId_userId_emoji: { messageId, userId: me, emoji } }
    const existing = await prisma.messageReaction.findUnique({ where: key })
    let op
    if (existing) {
      await prisma.messageReaction.delete({ where: key })
      op = 'removed'
    } else {
      await prisma.messageReaction.create({ data: { messageId, userId: me, emoji } })
      op = 'added'
    }

    const ids = await participantIds(threadId)
    publish(ids, { type: 'reaction', threadId, messageId, userId: me, emoji, op })

    return res.json({ data: { message_id: messageId, user_id: me, emoji, op } })
  } catch (err) {
    console.error('POST /api/threads/:id/messages/:mid/react error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not toggle reaction')
  }
})

// --- GET /api/messages/stream -----------------------------------------------
// Server-Sent Events endpoint. Emits framed JSON payloads for the caller's
// message/typing/read fan-outs. Keepalive comment every 15s.
router.get('/messages/stream', requireAuth, (req, res) => {
  const me = req.user.id

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx / other proxies: don't buffer the response.
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  // Named `hello` event so the client can flip connection state on first byte
  // rather than waiting for the first message. Also flushes the response so
  // proxies don't sit on the headers.
  res.write(`event: hello\ndata: ${JSON.stringify({ userId: me })}\n\n`)

  const listener = (payload) => {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    } catch {
      // Broken pipe — the `close` handler will clean up.
    }
  }
  const unsubscribe = subscribe(me, listener)
  if (unsubscribe == null) {
    // Too many concurrent streams for this user.
    res.write(`event: error\ndata: ${JSON.stringify({ code: 'RATE_LIMIT' })}\n\n`)
    return res.end()
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n')
    } catch {
      /* client gone */
    }
  }, 15000)

  const close = () => {
    clearInterval(heartbeat)
    unsubscribe()
  }
  req.on('close', close)
  req.on('aborted', close)
})

export default router
