// Posses (planning/posses_feature.md) — event group coordination.
//
//   POST   /api/posses                              create (+ group thread)
//   GET    /api/posses                              my posses (active + pending)
//   GET    /api/posses/:id                          detail (roster + viewer state)
//   PATCH  /api/posses/:id                          edit (captain)
//   POST   /api/posses/:id/join                     join (open) / request (ask)
//   POST   /api/posses/:id/invite   {user_id}       DM invite card (member)
//   POST   /api/posses/:id/members/:uid/approve     approve pending (captain)
//   DELETE /api/posses/:id/members/:uid             remove (captain) / leave (self)
//   DELETE /api/posses/:id                          dissolve (captain)
//   GET    /api/events/:id/posses                   discoverable posses for event
//
// Design notes:
//   - A posse's group chat IS a MessageThread. ACTIVE members are mirrored into
//     ThreadParticipant in the same transaction, so chat access rides the
//     existing requireParticipant gate. PENDING requesters are NOT thread
//     participants until approved — they can't see the chat.
//   - Reaching `active` (create / open-join / invite-accept / approved request)
//     upserts the user's RSVP to `going` through the SAME age gate the RSVP
//     route uses. Leaving never cancels the RSVP (one-way sync).
//   - Roster changes fan out on the shared messages SSE bus as posse_* frames.
//   - Notifications use notifySelf-style `system` + metadata.kind (never a new
//     NotificationType enum value — deploys don't run enum migrations).
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { fail, requireAuth } from '../auth/middleware.js'
import { enforceProfanity } from '../lib/profanity.js'
import { publish } from '../messages/bus.js'
import { getMutualIds, isMutual } from '../recommendations/social.js'
import { POSSE_MEMBER_SELECT, toPosse } from './serialize.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)
const MAX_MEMBERS = 20 // mirror the messages MAX_GROUP ceiling
const VISIBILITIES = new Set(['private', 'mutuals', 'public'])
const JOIN_POLICIES = new Set(['open', 'ask'])

// --- shared helpers ---------------------------------------------------------

/** Whole-years age on `asOf` from a DOB (UTC-noon convention, mirrors RSVP). */
function ageFrom(birthDate, asOf = new Date()) {
  if (!birthDate) return null
  let age = asOf.getUTCFullYear() - birthDate.getUTCFullYear()
  const monthDelta = asOf.getUTCMonth() - birthDate.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1
  }
  return age
}

/**
 * Upsert the user's RSVP to `going` for a posse's event, inside the given
 * transaction, reusing the RSVP route's transition rule (rsvp_count only moves
 * on a going transition). Honors the event's age gate: if the user is too young
 * / has no DOB, we DON'T RSVP — the caller surfaces `rsvpBlocked` so the client
 * can nudge them, but the posse join still succeeds. A sports run has no RSVP
 * flow (roster only), so we skip it. Returns { rsvped, blockedCode }.
 */
async function rsvpGoingInTx(tx, userId, event) {
  if (event.isSports) return { rsvped: false, blockedCode: null }
  if (event.status === 'cancelled' || event.status === 'past') {
    return { rsvped: false, blockedCode: null }
  }
  // Age gate (mirrors engagement/routes.js checkAgeGate).
  if (event.ageRestricted && event.ageMin) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { birthDate: true } })
    const age = ageFrom(user?.birthDate)
    if (age == null) return { rsvped: false, blockedCode: 'BIRTHDATE_REQUIRED' }
    if (age < event.ageMin) return { rsvped: false, blockedCode: 'AGE_RESTRICTED' }
  }

  const prior = await tx.rsvp.findUnique({
    where: { userId_eventId: { userId, eventId: event.id } },
  })
  const wasGoing = prior?.status === 'going'
  await tx.rsvp.upsert({
    where: { userId_eventId: { userId, eventId: event.id } },
    create: { userId, eventId: event.id, status: 'going', guestsCount: 0 },
    update: { status: 'going' },
  })
  if (!wasGoing) {
    await tx.event.update({ where: { id: event.id }, data: { rsvpCount: { increment: 1 } } })
  }
  return { rsvped: true, blockedCode: null }
}

/** Ids of a posse's ACTIVE members — for SSE fan-out (they're the thread too). */
async function activeMemberIds(posseId) {
  const rows = await prisma.posseMember.findMany({
    where: { posseId, status: 'active' },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

/** Fetch a posse (with event + members) or null. */
function loadPosse(id) {
  return prisma.posse.findUnique({
    where: { id },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          flyerUrl: true,
          startsAt: true,
          venueName: true,
          city: true,
          status: true,
          isSports: true,
          ageRestricted: true,
          ageMin: true,
        },
      },
      members: { select: POSSE_MEMBER_SELECT },
    },
  })
}

/** The viewer's membership row on a posse (or null). */
function viewerMembership(posse, userId) {
  const m = (posse.members ?? []).find((x) => x.user?.id === userId)
  return m ? { role: m.role, status: m.status } : null
}

/** Best-effort posse notification via the `system` + metadata.kind pattern. */
function notifyPosse(
  userId,
  { kind, actorId = null, eventId = null, title, body = null, posseId },
) {
  if (!userId || !title) return
  prisma.notification
    .create({
      data: {
        userId,
        type: 'system',
        channel: 'in_app',
        actorId,
        eventId,
        title,
        body,
        metadata: { kind, posse_id: posseId },
      },
    })
    .catch(() => {})
}

// --- POST /api/posses -------------------------------------------------------
// Body: { event_id, name, note?, visibility?, join_policy? }. Creates the posse
// + a named group thread, makes the caller captain/active + thread participant,
// and RSVPs them going (through the age gate).
router.post('/posses', requireAuth, async (req, res) => {
  const me = req.user.id
  const eventId = req.body?.event_id
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 280) : null
  const visibility = VISIBILITIES.has(req.body?.visibility) ? req.body.visibility : 'private'
  const joinPolicy = JOIN_POLICIES.has(req.body?.join_policy) ? req.body.join_policy : 'ask'

  if (!isUuid(eventId)) return fail(res, 422, 'VALIDATION_ERROR', 'event_id must be a UUID')
  if (!name) return fail(res, 422, 'VALIDATION_ERROR', 'A posse needs a name')
  if (enforceProfanity(req, res, [name, note ?? '']).blocked) return

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        isSports: true,
        ageRestricted: true,
        ageMin: true,
      },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.status === 'cancelled' || event.status === 'past') {
      return fail(res, 409, 'CONFLICT', `Cannot start a posse for a ${event.status} event`)
    }

    const result = await prisma.$transaction(async (tx) => {
      const thread = await tx.messageThread.create({
        data: {
          name: name.slice(0, 80),
          participants: { createMany: { data: [{ userId: me }] } },
        },
      })
      const posse = await tx.posse.create({
        data: {
          eventId,
          threadId: thread.id,
          creatorId: me,
          name,
          note,
          visibility,
          joinPolicy,
          members: { create: { userId: me, role: 'captain', status: 'active' } },
        },
      })
      const rsvp = await rsvpGoingInTx(tx, me, event)
      return { posse, rsvp }
    })

    const posse = await loadPosse(result.posse.id)
    return res.status(201).json({
      data: {
        ...toPosse(posse, {
          members: posse.members,
          viewer: { role: 'captain', status: 'active' },
        }),
        rsvp_blocked: result.rsvp.blockedCode,
      },
    })
  } catch (err) {
    console.error('POST /api/posses error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not create posse')
  }
})

// --- GET /api/posses --------------------------------------------------------
// My posses (any membership status), newest first.
router.get('/posses', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const memberships = await prisma.posseMember.findMany({
      where: { userId: me },
      select: { posseId: true, role: true, status: true },
    })
    if (memberships.length === 0) return res.json({ data: [] })

    const byId = new Map(memberships.map((m) => [m.posseId, m]))
    const posses = await prisma.posse.findMany({
      where: { id: { in: [...byId.keys()] } },
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            flyerUrl: true,
            startsAt: true,
            venueName: true,
            city: true,
          },
        },
        members: { select: POSSE_MEMBER_SELECT },
      },
    })

    const data = posses.map((p) => {
      const mine = byId.get(p.id)
      return toPosse(p, { viewer: { role: mine.role, status: mine.status } })
    })
    return res.json({ data })
  } catch (err) {
    console.error('GET /api/posses error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load posses')
  }
})

// --- GET /api/posses/discover -----------------------------------------------
// Cross-event discovery feed: public posses + mutuals posses created by a
// reciprocal follow, for upcoming events, excluding ones I'm already in.
// Registered BEFORE /posses/:id so "discover" isn't captured as an id.
router.get('/posses/discover', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    // Resolve my reciprocal-follow set once (batch), rather than per-posse.
    const mutualIds = new Set(await getMutualIds(me))

    const posses = await prisma.posse.findMany({
      where: {
        visibility: { in: ['public', 'mutuals'] },
        event: { status: 'published', startsAt: { gt: new Date() } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            flyerUrl: true,
            startsAt: true,
            venueName: true,
            city: true,
          },
        },
        members: { select: POSSE_MEMBER_SELECT },
      },
    })

    const data = []
    for (const p of posses) {
      const viewer = viewerMembership(p, me)
      if (viewer) continue // skip ones I'm already in / requested
      if (p.visibility === 'public' || mutualIds.has(p.creatorId)) {
        data.push(toPosse(p, { viewer: null }))
      }
    }
    return res.json({ data })
  } catch (err) {
    console.error('GET /api/posses/discover error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load posses')
  }
})

// --- GET /api/posses/:id ----------------------------------------------------
// Detail with the full roster. Visible to members; also to eligible discoverers
// (mutuals/public) so they can see who's going before joining. Private posses
// are 404 to non-members (existence-hiding, like requireParticipant).
router.get('/posses/:id', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')

    const viewer = viewerMembership(posse, me)
    if (!viewer) {
      const eligible = await canDiscover(posse, me)
      if (!eligible) return fail(res, 404, 'NOT_FOUND', 'Posse not found')
    }
    return res.json({ data: toPosse(posse, { members: posse.members, viewer }) })
  } catch (err) {
    console.error('GET /api/posses/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load posse')
  }
})

/** Can `userId` discover a posse they're not in? Gated by visibility. */
async function canDiscover(posse, userId) {
  if (posse.visibility === 'public') return true
  if (posse.visibility === 'mutuals') return isMutual(userId, posse.creatorId)
  return false // private
}

// --- PATCH /api/posses/:id --------------------------------------------------
// Captain edits name / note / visibility / join_policy.
router.patch('/posses/:id', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')
    const viewer = viewerMembership(posse, me)
    if (viewer?.role !== 'captain') return fail(res, 403, 'FORBIDDEN', 'Only the captain can edit')

    const data = {}
    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim().slice(0, 80)
      if (!name) return fail(res, 422, 'VALIDATION_ERROR', 'Name cannot be empty')
      data.name = name
    }
    if ('note' in (req.body ?? {})) {
      data.note =
        typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 280) || null : null
    }
    if (req.body?.visibility != null) {
      if (!VISIBILITIES.has(req.body.visibility)) {
        return fail(res, 422, 'VALIDATION_ERROR', 'Invalid visibility')
      }
      data.visibility = req.body.visibility
    }
    if (req.body?.join_policy != null) {
      if (!JOIN_POLICIES.has(req.body.join_policy)) {
        return fail(res, 422, 'VALIDATION_ERROR', 'Invalid join_policy')
      }
      data.joinPolicy = req.body.join_policy
    }
    if (enforceProfanity(req, res, [data.name ?? '', data.note ?? '']).blocked) return
    if (Object.keys(data).length === 0)
      return fail(res, 422, 'VALIDATION_ERROR', 'Nothing to update')

    await prisma.posse.update({ where: { id: posse.id }, data })
    // Keep the group thread name in step with the posse name.
    if (data.name) {
      await prisma.messageThread.update({
        where: { id: posse.threadId },
        data: { name: data.name },
      })
    }
    const fresh = await loadPosse(posse.id)
    return res.json({ data: toPosse(fresh, { members: fresh.members, viewer }) })
  } catch (err) {
    console.error('PATCH /api/posses/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not update posse')
  }
})

// --- POST /api/posses/:id/join ----------------------------------------------
// open policy → become active immediately (+ thread + RSVP going).
// ask policy  → create a pending member; captain gets a request notification.
// Invitees never hit `ask` friction — an invite pre-approves (they arrive via
// the DM card which routes here, but their pending row is pre-approved when the
// captain isn't required; see below).
router.post('/posses/:id/join', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')

    const existing = viewerMembership(posse, me)
    if (existing?.status === 'active') {
      return fail(res, 409, 'CONFLICT', 'You are already in this posse')
    }
    if (existing?.status === 'pending') {
      return fail(res, 409, 'CONFLICT', 'Your request is already pending')
    }

    // Eligibility: private posses can't be self-joined (invite only).
    const eligible = await canDiscover(posse, me)
    if (!eligible) return fail(res, 403, 'FORBIDDEN', 'This posse is invite-only')

    const activeCount = posse.members.filter((m) => m.status === 'active').length
    if (activeCount >= MAX_MEMBERS) {
      return fail(res, 409, 'CONFLICT', `This posse is full (${MAX_MEMBERS} people)`)
    }

    // ask → request (pending, no thread, no RSVP yet).
    if (posse.joinPolicy === 'ask') {
      await prisma.posseMember.create({
        data: { posseId: posse.id, userId: me, status: 'pending' },
      })
      notifyPosse(posse.creatorId, {
        kind: 'posse_join_request',
        actorId: me,
        eventId: posse.eventId,
        posseId: posse.id,
        title: `${req.user.displayName || 'Someone'} asked to join "${posse.name}"`,
      })
      publish([posse.creatorId], { type: 'posse_request', posseId: posse.id, userId: me })
      return res.status(202).json({ data: { posse_id: posse.id, status: 'pending' } })
    }

    // open → active now: add member + thread participant + RSVP going.
    const result = await prisma.$transaction(async (tx) => {
      await tx.posseMember.create({ data: { posseId: posse.id, userId: me, status: 'active' } })
      await tx.threadParticipant.create({ data: { threadId: posse.threadId, userId: me } })
      const rsvp = await rsvpGoingInTx(tx, me, posse.event)
      return { rsvp }
    })

    const ids = await activeMemberIds(posse.id)
    publish(ids, { type: 'posse_join', posseId: posse.id, userId: me })

    const fresh = await loadPosse(posse.id)
    return res.status(201).json({
      data: {
        ...toPosse(fresh, { members: fresh.members, viewer: { role: 'member', status: 'active' } }),
        rsvp_blocked: result.rsvp.blockedCode,
      },
    })
  } catch (err) {
    if (err.code === 'P2002') return fail(res, 409, 'CONFLICT', 'You are already in this posse')
    console.error('POST /api/posses/:id/join error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not join posse')
  }
})

// --- POST /api/posses/:id/invite --------------------------------------------
// Body: { user_id }. Any active member can invite. Creates an `invited`
// membership the invitee must accept (→ active + thread + RSVP) or decline
// (→ removed); it does NOT add them to the posse, the thread, or RSVP them yet.
// Re-inviting someone who already has a pending join request just leaves their
// request as-is (the captain still decides that one).
router.post('/posses/:id/invite', requireAuth, async (req, res) => {
  const me = req.user.id
  const inviteeId = req.body?.user_id
  if (!isUuid(inviteeId)) return fail(res, 422, 'VALIDATION_ERROR', 'user_id must be a UUID')
  if (inviteeId === me) return fail(res, 422, 'VALIDATION_ERROR', "You can't invite yourself")

  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')
    const inviter = viewerMembership(posse, me)
    if (inviter?.status !== 'active') {
      return fail(res, 403, 'FORBIDDEN', 'Only members can invite')
    }

    const invitee = await prisma.user.findUnique({ where: { id: inviteeId }, select: { id: true } })
    if (!invitee) return fail(res, 404, 'NOT_FOUND', 'User not found')

    const already = viewerMembership(posse, inviteeId)
    if (already?.status === 'active') {
      return fail(res, 409, 'CONFLICT', 'They are already in this posse')
    }
    if (already?.status === 'invited') {
      return fail(res, 409, 'CONFLICT', "They've already been invited")
    }
    if (already?.status === 'pending') {
      // They asked to join first — leave that for the captain to approve rather
      // than converting it to an invite.
      return fail(res, 409, 'CONFLICT', "They've already asked to join — approve their request")
    }

    // Capacity is checked against active members; an invite doesn't consume a
    // seat until accepted, so we don't count invited/pending here.
    const activeCount = posse.members.filter((m) => m.status === 'active').length
    if (activeCount >= MAX_MEMBERS) {
      return fail(res, 409, 'CONFLICT', `This posse is full (${MAX_MEMBERS} people)`)
    }

    await prisma.posseMember.create({
      data: { posseId: posse.id, userId: inviteeId, status: 'invited' },
    })

    notifyPosse(inviteeId, {
      kind: 'posse_invite',
      actorId: me,
      eventId: posse.eventId,
      posseId: posse.id,
      title: `${req.user.displayName || 'Someone'} invited you to "${posse.name}"`,
    })
    // Tell the invitee's other sessions to refresh (the invite shows under their
    // posses); active members don't see the pending invitee, so no fan-out yet.
    publish([inviteeId], { type: 'posse_invited', posseId: posse.id, userId: inviteeId })

    return res.status(201).json({
      data: { posse_id: posse.id, user_id: inviteeId, status: 'invited' },
    })
  } catch (err) {
    if (err.code === 'P2002') return fail(res, 409, 'CONFLICT', 'They already have an invite')
    console.error('POST /api/posses/:id/invite error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not invite to posse')
  }
})

// --- POST /api/posses/:id/accept --------------------------------------------
// The invitee accepts their own invite → active + thread participant + RSVP
// going (through the age gate). 404 if they have no outstanding invite.
router.post('/posses/:id/accept', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')

    const mine = viewerMembership(posse, me)
    if (mine?.status === 'active') {
      return fail(res, 409, 'CONFLICT', 'You are already in this posse')
    }
    if (mine?.status !== 'invited') {
      return fail(res, 404, 'NOT_FOUND', 'You have no invite to this posse')
    }

    const activeCount = posse.members.filter((m) => m.status === 'active').length
    if (activeCount >= MAX_MEMBERS) {
      return fail(res, 409, 'CONFLICT', `This posse is full (${MAX_MEMBERS} people)`)
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.posseMember.update({
        where: { posseId_userId: { posseId: posse.id, userId: me } },
        data: { status: 'active' },
      })
      await tx.threadParticipant.upsert({
        where: { threadId_userId: { threadId: posse.threadId, userId: me } },
        create: { threadId: posse.threadId, userId: me },
        update: {},
      })
      const rsvp = await rsvpGoingInTx(tx, me, posse.event)
      return { rsvp }
    })

    const ids = await activeMemberIds(posse.id)
    publish(ids, { type: 'posse_join', posseId: posse.id, userId: me })

    const fresh = await loadPosse(posse.id)
    return res.json({
      data: {
        ...toPosse(fresh, { members: fresh.members, viewer: { role: 'member', status: 'active' } }),
        rsvp_blocked: result.rsvp.blockedCode,
      },
    })
  } catch (err) {
    console.error('POST /api/posses/:id/accept error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not accept invite')
  }
})

// --- POST /api/posses/:id/decline -------------------------------------------
// The invitee declines their own invite → the invited row is removed. No RSVP,
// no thread. 404 if they have no outstanding invite.
router.post('/posses/:id/decline', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')

    const mine = viewerMembership(posse, me)
    if (mine?.status !== 'invited') {
      return fail(res, 404, 'NOT_FOUND', 'You have no invite to this posse')
    }

    await prisma.posseMember.delete({
      where: { posseId_userId: { posseId: posse.id, userId: me } },
    })
    return res.json({ data: { posse_id: posse.id, declined: true } })
  } catch (err) {
    console.error('POST /api/posses/:id/decline error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not decline invite')
  }
})

// --- POST /api/posses/:id/members/:uid/approve ------------------------------
// Captain approves a pending request → active + thread + RSVP going.
router.post('/posses/:id/members/:uid/approve', requireAuth, async (req, res) => {
  const me = req.user.id
  const targetId = req.params.uid
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')
    const viewer = viewerMembership(posse, me)
    if (viewer?.role !== 'captain')
      return fail(res, 403, 'FORBIDDEN', 'Only the captain can approve')

    const target = viewerMembership(posse, targetId)
    if (!target || target.status !== 'pending') {
      return fail(res, 404, 'NOT_FOUND', 'No pending request from that user')
    }

    const activeCount = posse.members.filter((m) => m.status === 'active').length
    if (activeCount >= MAX_MEMBERS) {
      return fail(res, 409, 'CONFLICT', `This posse is full (${MAX_MEMBERS} people)`)
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.posseMember.update({
        where: { posseId_userId: { posseId: posse.id, userId: targetId } },
        data: { status: 'active' },
      })
      await tx.threadParticipant.upsert({
        where: { threadId_userId: { threadId: posse.threadId, userId: targetId } },
        create: { threadId: posse.threadId, userId: targetId },
        update: {},
      })
      const rsvp = await rsvpGoingInTx(tx, targetId, posse.event)
      return { rsvp }
    })

    notifyPosse(targetId, {
      kind: 'posse_request_approved',
      actorId: me,
      eventId: posse.eventId,
      posseId: posse.id,
      title: `You're in — "${posse.name}"`,
    })
    const ids = await activeMemberIds(posse.id)
    publish(ids, { type: 'posse_join', posseId: posse.id, userId: targetId })

    return res.json({
      data: {
        posse_id: posse.id,
        user_id: targetId,
        status: 'active',
        rsvp_blocked: result.rsvp.blockedCode,
      },
    })
  } catch (err) {
    console.error('POST /api/posses/:id/members/:uid/approve error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not approve request')
  }
})

// --- DELETE /api/posses/:id/members/:uid ------------------------------------
// Leave (self) or remove (captain removing someone else). Removes the posse
// member + thread participant. Does NOT cancel the user's RSVP. When the
// captain leaves, transfer to the oldest remaining active member; if none
// remain, dissolve the posse (thread cascades).
router.delete('/posses/:id/members/:uid', requireAuth, async (req, res) => {
  const me = req.user.id
  const targetId = req.params.uid
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')
    const viewer = viewerMembership(posse, me)
    if (!viewer) return fail(res, 404, 'NOT_FOUND', 'Posse not found')

    const isSelf = targetId === me
    if (!isSelf && viewer.role !== 'captain') {
      return fail(res, 403, 'FORBIDDEN', 'Only the captain can remove others')
    }
    const target = viewerMembership(posse, targetId)
    if (!target) return fail(res, 404, 'NOT_FOUND', 'Not a member')

    // Captain leaving → transfer or dissolve.
    const captainLeaving = isSelf && viewer.role === 'captain'
    const otherActive = posse.members
      .filter((m) => m.status === 'active' && m.user?.id !== me)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    if (captainLeaving && otherActive.length === 0) {
      // Last one out — dissolve. Deleting the posse cascades the members;
      // deleting the thread cascades participants + messages.
      await prisma.$transaction([
        prisma.posse.delete({ where: { id: posse.id } }),
        prisma.messageThread.delete({ where: { id: posse.threadId } }),
      ])
      return res.json({ data: { posse_id: posse.id, dissolved: true } })
    }

    await prisma.$transaction(async (tx) => {
      await tx.posseMember.delete({
        where: { posseId_userId: { posseId: posse.id, userId: targetId } },
      })
      await tx.threadParticipant
        .delete({ where: { threadId_userId: { threadId: posse.threadId, userId: targetId } } })
        .catch(() => {}) // pending members have no thread row
      if (captainLeaving) {
        const heir = otherActive[0].user.id
        await tx.posseMember.update({
          where: { posseId_userId: { posseId: posse.id, userId: heir } },
          data: { role: 'captain' },
        })
      }
    })

    const ids = await activeMemberIds(posse.id)
    publish([...ids, targetId], { type: 'posse_leave', posseId: posse.id, userId: targetId })
    return res.json({ data: { posse_id: posse.id, user_id: targetId, removed: true } })
  } catch (err) {
    console.error('DELETE /api/posses/:id/members/:uid error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not update posse membership')
  }
})

// --- DELETE /api/posses/:id -------------------------------------------------
// Captain dissolves the whole posse (thread + messages cascade).
router.delete('/posses/:id', requireAuth, async (req, res) => {
  const me = req.user.id
  try {
    const posse = await loadPosse(req.params.id)
    if (!posse) return fail(res, 404, 'NOT_FOUND', 'Posse not found')
    const viewer = viewerMembership(posse, me)
    if (viewer?.role !== 'captain')
      return fail(res, 403, 'FORBIDDEN', 'Only the captain can dissolve')

    const memberIds = await activeMemberIds(posse.id)
    await prisma.$transaction([
      prisma.posse.delete({ where: { id: posse.id } }),
      prisma.messageThread.delete({ where: { id: posse.threadId } }),
    ])
    publish(memberIds, { type: 'posse_dissolved', posseId: posse.id })
    return res.json({ data: { posse_id: posse.id, dissolved: true } })
  } catch (err) {
    console.error('DELETE /api/posses/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not dissolve posse')
  }
})

// --- GET /api/events/:id/posses ---------------------------------------------
// Discoverable posses for an event: ones I'm already in, plus public ones, plus
// mutuals ones created by a reciprocal follow. Private posses I'm not in never
// appear.
router.get('/events/:id/posses', requireAuth, async (req, res) => {
  const me = req.user.id
  const eventId = req.params.id
  if (!isUuid(eventId)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const posses = await prisma.posse.findMany({
      where: { eventId, visibility: { in: ['public', 'mutuals'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            flyerUrl: true,
            startsAt: true,
            venueName: true,
            city: true,
          },
        },
        members: { select: POSSE_MEMBER_SELECT },
      },
    })

    // Filter mutuals-visibility posses down to reciprocal follows of the creator
    // (or ones I'm already in). Public ones always pass.
    const visible = []
    for (const p of posses) {
      const viewer = viewerMembership(p, me)
      if (p.visibility === 'public' || viewer) {
        visible.push(toPosse(p, { viewer }))
        continue
      }
      if (await isMutual(me, p.creatorId)) visible.push(toPosse(p, { viewer }))
    }
    return res.json({ data: visible })
  } catch (err) {
    console.error('GET /api/events/:id/posses error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load posses')
  }
})

export default router
