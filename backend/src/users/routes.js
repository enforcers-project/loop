// User profile routes (planning §7). Onboarding interest commit, plus the
// public profile + follow graph (work-plan #26):
//   GET    /api/users/:id            public profile (viewer-relative is_following)
//   GET    /api/users/:id/events     an organizer's published events (profile tabs)
//   POST   /api/users/:id/follow     follow (bumps both denormalized counts)
//   DELETE /api/users/:id/follow     unfollow (decrements; leaves an unfollow signal)
//   GET    /api/users/:id/followers  paginated followers list
//   GET    /api/users/:id/following  paginated following list
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { fail, requireAuth } from '../auth/middleware.js'
import { toPublicUser, PUBLIC_USER_SELECT } from './serialize.js'
import { toSelfUser } from '../auth/serialize.js'
import { toEventCard } from '../events/serialize.js'

const router = Router()

// Onboarding picks are explicit, so they carry full weight. The recommender's
// vector work (later) can down-weight; a hand-picked interest starts at 1.0.
const ONBOARDING_WEIGHT = 1.0

// Follow/unfollow interaction weights (mirror §9.2A / the engagement route).
const FOLLOW_WEIGHT = 0.5
const UNFOLLOW_WEIGHT = -0.25

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

/** Does the viewer (if any) follow `targetId`? null when logged out. */
async function resolveIsFollowing(viewerId, targetId) {
  if (!viewerId) return null
  const row = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
    select: { followerId: true },
  })
  return !!row
}

// --- PUT /api/users/:id/interests -------------------------------------------
// Body: { interest_ids: string[] } — each id may be an Interest UUID or its
// slug (the seed lookup at GET /api/interests exposes slug ids to the client).
router.put('/:id/interests', requireAuth, async (req, res) => {
  // Authz: a user may only edit their own interests.
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own interests')
  }

  const raw = req.body?.interest_ids
  if (!Array.isArray(raw)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'interest_ids must be an array')
  }

  // De-dupe and split submitted ids into UUIDs vs slugs so the id filter never
  // receives a non-UUID string (Postgres would reject it).
  const ids = [...new Set(raw.filter((v) => typeof v === 'string' && v.length))]
  const uuids = ids.filter(isUuid)
  const slugs = ids.filter((v) => !isUuid(v))

  try {
    // Resolve to real, active interests; silently drop anything unrecognized.
    const interests = await prisma.interest.findMany({
      where: {
        isActive: true,
        OR: [{ id: { in: uuids } }, { slug: { in: slugs } }],
      },
      select: { id: true, slug: true },
    })
    const interestIds = interests.map((i) => i.id)

    await prisma.$transaction([
      // Drop onboarding picks the user has now deselected (leave inferred/
      // user_added rows untouched — those come from other sources).
      prisma.userInterest.deleteMany({
        where: {
          userId: req.user.id,
          source: 'onboarding',
          interestId: {
            notIn: interestIds.length ? interestIds : ['00000000-0000-0000-0000-000000000000'],
          },
        },
      }),
      // Upsert each selected pick as an onboarding-sourced interest.
      ...interestIds.map((interestId) =>
        prisma.userInterest.upsert({
          where: { userId_interestId: { userId: req.user.id, interestId } },
          create: {
            userId: req.user.id,
            interestId,
            source: 'onboarding',
            weight: ONBOARDING_WEIGHT,
          },
          update: { source: 'onboarding', weight: ONBOARDING_WEIGHT },
        }),
      ),
      // Mark onboarding complete on first commit (idempotent thereafter).
      prisma.user.update({
        where: { id: req.user.id },
        data: { onboardingCompletedAt: new Date() },
      }),
    ])

    return res.json({
      data: {
        interest_ids: interests.map((i) => i.slug),
        count: interests.length,
      },
    })
  } catch (err) {
    console.error('PUT /api/users/:id/interests error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save interests')
  }
})

// --- PUT /api/users/:id/location --------------------------------------------
// Body: { city: string, lat?: number, lng?: number, place_id?: string }
// Persists the caller's home location so the recommender's geo pre-filter
// (recommendations/engine.js: earth_distance radius when lat/lng present,
// else city ILIKE) actually has something to filter on. Onboarding calls this;
// a user can update it later from their profile.
router.put('/:id/location', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own location')
  }

  const { city, lat, lng, place_id } = req.body ?? {}
  if (typeof city !== 'string' || !city.trim()) {
    return fail(res, 422, 'VALIDATION_ERROR', 'city is required')
  }
  if (city.length > 120) {
    return fail(res, 422, 'VALIDATION_ERROR', 'city too long (max 120 chars)')
  }

  // Coords are optional but must arrive as a valid pair — storing one without
  // the other would leave the geo pre-filter unable to build a radius clause.
  const hasLat = lat != null
  const hasLng = lng != null
  if (hasLat !== hasLng) {
    return fail(res, 422, 'VALIDATION_ERROR', 'lat and lng must be provided together')
  }
  let latNum = null
  let lngNum = null
  if (hasLat) {
    latNum = Number(lat)
    lngNum = Number(lng)
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      return fail(res, 422, 'VALIDATION_ERROR', 'lat must be a number between -90 and 90')
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      return fail(res, 422, 'VALIDATION_ERROR', 'lng must be a number between -180 and 180')
    }
  }

  const placeId = typeof place_id === 'string' && place_id.trim() ? place_id.trim() : null

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        homeCity: city.trim(),
        homeLat: latNum,
        homeLng: lngNum,
        homePlaceId: placeId,
      },
    })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/location error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save location')
  }
})

// --- GET /api/users/:id — public profile ------------------------------------
// Powers OrganizerProfile. Public; `is_following` is viewer-relative (null when
// logged out). 400 for a non-UUID id so a stray mock `org-*` id 404s cleanly.
router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return fail(res, 404, 'NOT_FOUND', 'User not found')
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: PUBLIC_USER_SELECT,
    })
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found')

    const isFollowing = await resolveIsFollowing(req.user?.id, user.id)
    return res.json({ data: toPublicUser(user, isFollowing) })
  } catch (err) {
    console.error('GET /api/users/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load user')
  }
})

// --- GET /api/users/:id/events — an organizer's events ----------------------
// ?status=upcoming|past (default upcoming), cursor-paginated. Public.
router.get('/:id/events', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return fail(res, 404, 'NOT_FOUND', 'User not found')
  }
  try {
    const status = req.query.status === 'past' ? 'past' : 'upcoming'
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const now = new Date()

    const where = {
      organizerId: req.params.id,
      status: 'published',
      startsAt: status === 'past' ? { lt: now } : { gte: now },
    }
    if (req.query.cursor) where.id = { gt: req.query.cursor }

    const events = await prisma.event.findMany({
      where,
      orderBy:
        status === 'past'
          ? [{ startsAt: 'desc' }, { id: 'asc' }]
          : [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { category: true, organizer: true, sportsDetail: true },
    })

    let nextCursor = null
    if (events.length > limit) {
      events.pop()
      nextCursor = events[events.length - 1].id
    }
    return res.json({ data: events.map((e) => toEventCard(e)), nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/events error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load events')
  }
})

// --- GET /api/users/:id/rsvps — a user's own RSVPs --------------------------
// Owner-only (self); optional ?status= filter, cursor-paginated by created_at.
// Powers RSVP-state hydration on the client (the "Going" highlight after a
// reload) and the UserProfile "Going" tab. Each item is { rsvp, event:EventCard }.
const RSVP_STATUSES = new Set(['going', 'interested', 'waitlisted', 'cancelled'])

router.get('/:id/rsvps', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only view your own RSVPs')
  }
  const { status } = req.query
  if (status != null && !RSVP_STATUSES.has(status)) {
    return fail(
      res,
      422,
      'VALIDATION_ERROR',
      'status must be going/interested/waitlisted/cancelled',
    )
  }

  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const where = { userId: req.params.id }
    // Default to active RSVPs only — a cancelled RSVP shouldn't light up "Going".
    if (status) where.status = status
    else where.status = { not: 'cancelled' }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const rows = await prisma.rsvp.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { event: { include: { category: true, organizer: true, sportsDetail: true } } },
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    const data = rows.map((r) => ({
      rsvp: {
        id: r.id,
        status: r.status,
        guests_count: r.guestsCount,
        attended: r.attended,
        created_at: r.createdAt,
      },
      event: toEventCard(r.event),
    }))
    return res.json({ data, nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/rsvps error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load RSVPs')
  }
})

// --- POST /api/users/:id/follow — follow ------------------------------------
// Inserts follows(follower=me, followee=:id), bumps follower_count on the
// followee and following_count on me, and appends a `follow` interaction signal.
// Idempotent: already-following returns 409. Self-follow is 422.
router.post('/:id/follow', requireAuth, async (req, res) => {
  const followeeId = req.params.id
  const followerId = req.user.id

  if (!isUuid(followeeId)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (followeeId === followerId) {
    return fail(res, 422, 'VALIDATION_ERROR', 'You cannot follow yourself')
  }

  try {
    const followee = await prisma.user.findUnique({
      where: { id: followeeId },
      select: { id: true },
    })
    if (!followee) return fail(res, 404, 'NOT_FOUND', 'User not found')

    const existing = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
      select: { createdAt: true },
    })
    if (existing) {
      return fail(res, 409, 'CONFLICT', 'You already follow this user')
    }

    const { follow, followerCount } = await prisma.$transaction(async (tx) => {
      const follow = await tx.follow.create({
        data: { followerId, followeeId },
      })
      const updatedFollowee = await tx.user.update({
        where: { id: followeeId },
        data: { followerCount: { increment: 1 } },
        select: { followerCount: true },
      })
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      })
      await tx.interactionEvent.create({
        data: {
          userId: followerId,
          sessionId: req.sessionId ?? null,
          targetUserId: followeeId,
          interactionType: 'follow',
          surface: 'organizer_profile',
          weight: FOLLOW_WEIGHT,
        },
      })
      return { follow, followerCount: updatedFollowee.followerCount }
    })

    return res.status(201).json({
      data: {
        follower_id: follow.followerId,
        followee_id: follow.followeeId,
        created_at: follow.createdAt,
        is_following: true,
        followee: { id: followeeId, follower_count: followerCount },
      },
    })
  } catch (err) {
    // Concurrent double-follow can still lose the race to the unique PK.
    if (err.code === 'P2002') {
      return fail(res, 409, 'CONFLICT', 'You already follow this user')
    }
    console.error('POST /api/users/:id/follow error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not follow user')
  }
})

// --- DELETE /api/users/:id/follow — unfollow --------------------------------
// Deletes the follows row, decrements both counts, and appends an `unfollow`
// signal (reversal = supersede, §10). 404 if not currently following.
router.delete('/:id/follow', requireAuth, async (req, res) => {
  const followeeId = req.params.id
  const followerId = req.user.id

  if (!isUuid(followeeId)) return fail(res, 404, 'NOT_FOUND', 'User not found')

  try {
    const existing = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
      select: { followerId: true },
    })
    if (!existing) return fail(res, 404, 'NOT_FOUND', 'You do not follow this user')

    await prisma.$transaction(async (tx) => {
      await tx.follow.delete({
        where: { followerId_followeeId: { followerId, followeeId } },
      })
      await tx.user.update({
        where: { id: followeeId },
        data: { followerCount: { decrement: 1 } },
      })
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      })
      await tx.interactionEvent.create({
        data: {
          userId: followerId,
          sessionId: req.sessionId ?? null,
          targetUserId: followeeId,
          interactionType: 'unfollow',
          surface: 'organizer_profile',
          weight: UNFOLLOW_WEIGHT,
        },
      })
    })

    return res.status(204).end()
  } catch (err) {
    console.error('DELETE /api/users/:id/follow error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not unfollow user')
  }
})

// --- GET /api/users/:id/followers | /following — paginated lists ------------
// Shared handler; `edge` picks which side of the follow graph to walk. Public.
// Each item is a PublicUser + { is_following, followed_at } relative to the
// viewer. Cursor is the follow row's created_at (ISO) for stable ordering.
function followListHandler(edge) {
  return async (req, res) => {
    const id = req.params.id
    if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'User not found')

    try {
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true } })
      if (!target) return fail(res, 404, 'NOT_FOUND', 'User not found')

      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
      // followers: rows where this user is the followee, return the follower.
      // following: rows where this user is the follower, return the followee.
      const where = edge === 'followers' ? { followeeId: id } : { followerId: id }
      if (req.query.cursor) {
        const cur = new Date(req.query.cursor)
        if (!isNaN(cur)) where.createdAt = { lt: cur }
      }

      const rows = await prisma.follow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: {
          [edge === 'followers' ? 'follower' : 'followee']: { select: PUBLIC_USER_SELECT },
        },
      })

      let nextCursor = null
      if (rows.length > limit) {
        rows.pop()
        nextCursor = rows[rows.length - 1].createdAt.toISOString()
      }

      // Resolve the viewer's follow state against everyone in the page in one query.
      const people = rows.map((r) => (edge === 'followers' ? r.follower : r.followee))
      let followedSet = new Set()
      if (req.user?.id && people.length) {
        const mine = await prisma.follow.findMany({
          where: { followerId: req.user.id, followeeId: { in: people.map((p) => p.id) } },
          select: { followeeId: true },
        })
        followedSet = new Set(mine.map((m) => m.followeeId))
      }

      const data = rows.map((r) => {
        const person = edge === 'followers' ? r.follower : r.followee
        const isFollowing = req.user?.id ? followedSet.has(person.id) : null
        return { user: toPublicUser(person, isFollowing), followed_at: r.createdAt }
      })
      return res.json({ data, nextCursor })
    } catch (err) {
      console.error(`GET /api/users/:id/${edge} error:`, err)
      return fail(res, 500, 'INTERNAL', 'Could not load list')
    }
  }
}

router.get('/:id/followers', followListHandler('followers'))
router.get('/:id/following', followListHandler('following'))

export default router
