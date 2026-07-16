import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { toEventCard, toEventDetail, EVENT_DETAIL_INCLUDE } from './serialize.js'
import { requireAuth, fail } from '../auth/middleware.js'
import { runJob } from '../jobs/index.js'
import { notifyFollowersOfNewEvent } from '../notifications/publish.js'

const router = Router()

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const {
      category,
      source,
      q,
      nearLat,
      nearLng,
      radiusKm,
      city,
      dateFrom,
      dateTo,
      priceMin,
      priceMax,
      isFree,
      ageMax,
      isSports,
      sort,
      cursor,
      limit: rawLimit,
    } = req.query

    // --- Pagination setup ---
    const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 50)

    // --- Build the WHERE conditions ---
    const where = { status: 'published' }

    // Category filter (multi-select: ?category=music&category=nightlife)
    const categories = toArray(category)
    if (categories.length) {
      where.category = { slug: { in: categories } }
    }

    // Source filter (multi-select)
    const sources = toArray(source)
    if (sources.length) {
      where.source = { in: sources }
    }

    // City filter
    if (city) {
      where.city = { equals: city, mode: 'insensitive' }
    }

    // Date range filter. When the caller doesn't pass an explicit range we
    // hide events whose start time is already in the past — a Home/Search
    // list should only show things the user can still attend.
    if (dateFrom || dateTo) {
      where.startsAt = {}
      if (dateFrom) where.startsAt.gte = new Date(dateFrom)
      if (dateTo) where.startsAt.lte = new Date(dateTo)
    } else {
      where.startsAt = { gte: new Date() }
    }

    // Price range filter
    if (priceMin) where.priceMin = { gte: Number(priceMin) }
    if (priceMax) where.priceMax = { lte: Number(priceMax) }

    // Boolean filters
    if (isFree === 'true') where.isFree = true
    if (isSports === 'true') where.isSports = true

    // Age filter
    if (ageMax) where.ageMin = { lte: Number(ageMax) }

    // Cursor: fetch events after this ID
    if (cursor) {
      where.id = { gt: cursor }
    }

    // --- Determine sort order ---
    let orderBy = [{ startsAt: 'asc' }, { id: 'asc' }]
    if (sort === 'popularity') {
      orderBy = [{ rsvpCount: 'desc' }, { saveCount: 'desc' }, { id: 'asc' }]
    } else if (sort === 'date') {
      orderBy = [{ startsAt: 'asc' }, { id: 'asc' }]
    }

    // --- Geo filter (uses raw SQL because Prisma can't do earthdistance) ---
    const hasGeo = nearLat && nearLng && radiusKm
    let geoEventIds = null

    if (hasGeo) {
      const lat = Number(nearLat)
      const lng = Number(nearLng)
      const radius = Number(radiusKm) * 1000 // earthdistance works in meters

      const geoRows = await prisma.$queryRawUnsafe(
        `SELECT id,
                earth_distance(
                  ll_to_earth($1, $2),
                  ll_to_earth(lat, lng)
                ) AS distance_m
         FROM events
         WHERE lat IS NOT NULL
           AND lng IS NOT NULL
           AND earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lng)) <= $3
         ORDER BY distance_m ASC`,
        lat,
        lng,
        radius,
      )

      geoEventIds = new Map(geoRows.map((r) => [r.id, r.distance_m / 1000]))

      if (geoEventIds.size === 0) {
        return res.json({ data: [], nextCursor: null })
      }

      where.id = { ...(where.id || {}), in: [...geoEventIds.keys()] }
    }

    // --- Full-text search (uses the search_document tsvector column) ---
    let searchIds = null
    if (q && q.trim()) {
      const tsQuery = q
        .trim()
        .split(/\s+/)
        .map((w) => w + ':*')
        .join(' & ')

      const searchRows = await prisma.$queryRawUnsafe(
        `SELECT id FROM events
         WHERE search_document @@ to_tsquery('english', $1)`,
        tsQuery,
      )

      searchIds = searchRows.map((r) => r.id)

      if (searchIds.length === 0) {
        return res.json({ data: [], nextCursor: null })
      }

      if (where.id?.in) {
        // Intersect with geo filter
        const geoSet = new Set(where.id.in)
        where.id.in = searchIds.filter((id) => geoSet.has(id))
      } else {
        where.id = { ...(where.id || {}), in: searchIds }
      }
    }

    // --- Execute the main query ---
    const events = await prisma.event.findMany({
      where,
      orderBy,
      take: limit + 1, // fetch one extra to know if there's a next page
      include: {
        category: true,
        organizer: true,
        sportsDetail: true,
      },
    })

    // --- Pagination: determine nextCursor ---
    let nextCursor = null
    if (events.length > limit) {
      events.pop() // remove the extra row
      nextCursor = events[events.length - 1].id
    }

    // --- Serialize into EventCard shape ---
    const data = events.map((event) => {
      const distanceKm = geoEventIds?.get(event.id) ?? null
      return toEventCard(event, distanceKm)
    })

    // --- If sorting by distance, re-sort (Prisma couldn't do it) ---
    if (sort === 'distance' && hasGeo) {
      data.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))
    }

    res.json({ data, nextCursor })
  } catch (err) {
    console.error('GET /api/events error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch events' } })
  }
})

// GET /api/events/:id
// Detail read; increments view_count on each fetch (§7.3, #14). The atomic
// {increment: 1} update also returns the row + relations, so the response
// reflects the new count without a second query.
router.get('/:id', async (req, res) => {
  try {
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data: { viewCount: { increment: 1 } },
      include: {
        category: true,
        organizer: true,
        sportsDetail: true,
      },
    })

    res.json({ data: toEventCard(event) })
  } catch (err) {
    // P2025 = record to update not found → treat as 404.
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Event not found' } })
    }
    console.error('GET /api/events/:id error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch event' } })
  }
})

// GET /api/events/:id/related
router.get('/:id/related', async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true, categoryId: true },
    })

    if (!event) {
      return res.status(404).json({ error: { message: 'Event not found' } })
    }

    let related = await prisma.event.findMany({
      where: {
        categoryId: event.categoryId,
        id: { not: event.id },
        status: 'published',
        startsAt: { gte: new Date() },
      },
      take: 6,
      orderBy: { startsAt: 'asc' },
      include: {
        category: true,
        organizer: true,
        sportsDetail: true,
      },
    })

    // Fallback: if no same-category events, just grab recent ones
    if (related.length === 0) {
      related = await prisma.event.findMany({
        where: {
          id: { not: event.id },
          status: 'published',
          startsAt: { gte: new Date() },
        },
        take: 3,
        orderBy: { startsAt: 'asc' },
        include: {
          category: true,
          organizer: true,
          sportsDetail: true,
        },
      })
    }

    res.json({ data: related.map((e) => toEventCard(e)) })
  } catch (err) {
    console.error('GET /api/events/:id/related error:', err)
    res.status(500).json({ error: { message: 'Failed to fetch related events' } })
  }
})

// ===========================================================================
// Write path (§7.3 create / update / delete / publish). All gated: create
// requires organizer (+ host when is_sports); mutate requires ownership.
// ===========================================================================

const SKILL_LEVELS = new Set(['all_levels', 'beginner', 'intermediate', 'advanced'])
const VENUE_SETTINGS = new Set(['indoor', 'outdoor'])

// POST /api/events — create a native event, starts as draft.
router.post('/', requireAuth, async (req, res) => {
  const b = req.body ?? {}

  // Gate: organizers only; hosting (is_host) additionally required for sports.
  if (req.user.role !== 'organizer') {
    return fail(res, 403, 'FORBIDDEN', 'Only organizers can create events')
  }
  if (b.is_sports && !req.user.isHost) {
    return fail(res, 403, 'FORBIDDEN', 'Hosting a pickup run requires the host capability')
  }

  // Required-field validation for a draft.
  if (!b.title || !String(b.title).trim()) {
    return fail(res, 422, 'VALIDATION_ERROR', 'title is required')
  }
  if (!b.category_id) return fail(res, 422, 'VALIDATION_ERROR', 'category_id is required')
  if (!b.starts_at || isNaN(Date.parse(b.starts_at))) {
    return fail(res, 422, 'VALIDATION_ERROR', 'starts_at must be a valid date')
  }
  if (!b.timezone) return fail(res, 422, 'VALIDATION_ERROR', 'timezone is required')
  if (!b.city) return fail(res, 422, 'VALIDATION_ERROR', 'city is required')

  // Sports payload validation + the capacity invariant (Σ position.capacity = players_needed).
  let sports = null
  if (b.is_sports) {
    const sd = b.sports_details
    if (!sd) return fail(res, 422, 'VALIDATION_ERROR', 'sports_details is required for a run')
    if (!sd.sport) return fail(res, 422, 'VALIDATION_ERROR', 'sports_details.sport is required')
    if (!SKILL_LEVELS.has(sd.skill_level)) {
      return fail(res, 422, 'VALIDATION_ERROR', 'sports_details.skill_level is invalid')
    }
    if (!VENUE_SETTINGS.has(sd.venue_setting)) {
      return fail(res, 422, 'VALIDATION_ERROR', 'sports_details.venue_setting is invalid')
    }
    if (!Number.isInteger(sd.players_needed) || sd.players_needed < 1) {
      return fail(res, 422, 'VALIDATION_ERROR', 'players_needed must be a positive integer')
    }
    const capErr = validatePositions(sd.positions, sd.players_needed)
    if (capErr) return fail(res, 422, 'VALIDATION_ERROR', capErr)
    sports = sd
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          organizerId: req.user.id,
          source: 'native',
          status: 'draft',
          title: String(b.title).trim(),
          slug: b.slug ?? null,
          description: b.description ?? null,
          descriptionIsAi: b.description_is_ai ?? false,
          flyerUrl: b.flyer_url ?? null,
          categoryId: b.category_id,
          startsAt: new Date(b.starts_at),
          endsAt: b.ends_at ? new Date(b.ends_at) : null,
          timezone: b.timezone,
          venueName: b.venue_name ?? null,
          address: b.address ?? null,
          city: b.city,
          lat: b.lat ?? null,
          lng: b.lng ?? null,
          googlePlaceId: b.google_place_id ?? null,
          priceMin: b.price_min ?? null,
          priceMax: b.price_max ?? null,
          isFree: b.is_free ?? false,
          currency: b.currency ?? 'USD',
          capacity: b.capacity ?? null,
          ageMin: b.age_min ?? null,
          ageLabel: b.age_label ?? null,
          isSports: Boolean(b.is_sports),
        },
      })

      if (sports) {
        await tx.sportsDetail.create({
          data: {
            eventId: event.id,
            sport: sports.sport,
            skillLevel: sports.skill_level,
            venueSetting: sports.venue_setting,
            playersNeeded: sports.players_needed,
            durationMinutes: sports.duration_minutes ?? null,
            defaultPosition: sports.default_position ?? null,
            notes: sports.notes ?? null,
            positions: {
              create: normalizePositions(sports.positions, sports.players_needed),
            },
          },
        })
      }

      return event.id
    })

    const detail = await prisma.event.findUnique({
      where: { id: created },
      include: EVENT_DETAIL_INCLUDE,
    })
    return res.status(201).json({ data: toEventDetail(detail) })
  } catch (err) {
    if (err.code === 'P2003') {
      return fail(res, 422, 'VALIDATION_ERROR', 'category_id does not reference a real category')
    }
    console.error('POST /api/events error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to create event')
  }
})

// PATCH /api/events/:id — partial update of an owned native event.
router.patch('/:id', requireAuth, async (req, res) => {
  const b = req.body ?? {}
  try {
    const existing = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { sportsDetail: true },
    })
    if (!existing) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (existing.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'You do not own this event')
    }
    if (existing.source !== 'native') {
      return fail(res, 403, 'FORBIDDEN', 'Synced events cannot be edited')
    }

    // Only "cancelled" is a valid status transition via PATCH.
    if (b.status !== undefined && b.status !== 'cancelled') {
      return fail(res, 422, 'VALIDATION_ERROR', 'status may only be set to "cancelled" here')
    }

    const data = {}
    const scalarMap = {
      title: 'title',
      description: 'description',
      description_is_ai: 'descriptionIsAi',
      flyer_url: 'flyerUrl',
      category_id: 'categoryId',
      timezone: 'timezone',
      venue_name: 'venueName',
      address: 'address',
      city: 'city',
      lat: 'lat',
      lng: 'lng',
      google_place_id: 'googlePlaceId',
      price_min: 'priceMin',
      price_max: 'priceMax',
      is_free: 'isFree',
      currency: 'currency',
      capacity: 'capacity',
      age_min: 'ageMin',
      age_label: 'ageLabel',
      status: 'status',
    }
    for (const [key, col] of Object.entries(scalarMap)) {
      if (b[key] !== undefined) data[col] = b[key]
    }
    if (b.starts_at !== undefined) data.startsAt = new Date(b.starts_at)
    if (b.ends_at !== undefined) data.endsAt = b.ends_at ? new Date(b.ends_at) : null

    // Nested sports_details update (scalars only; positions edited via /positions later).
    let sportsUpdate = null
    if (b.sports_details && existing.isSports && existing.sportsDetail) {
      const sd = b.sports_details
      if (sd.skill_level && !SKILL_LEVELS.has(sd.skill_level)) {
        return fail(res, 422, 'VALIDATION_ERROR', 'sports_details.skill_level is invalid')
      }
      if (sd.venue_setting && !VENUE_SETTINGS.has(sd.venue_setting)) {
        return fail(res, 422, 'VALIDATION_ERROR', 'sports_details.venue_setting is invalid')
      }
      if (
        sd.players_needed !== undefined &&
        (!Number.isInteger(sd.players_needed) || sd.players_needed < 1)
      ) {
        return fail(res, 422, 'VALIDATION_ERROR', 'players_needed must be a positive integer')
      }
      sportsUpdate = {
        sport: sd.sport ?? undefined,
        skillLevel: sd.skill_level ?? undefined,
        venueSetting: sd.venue_setting ?? undefined,
        playersNeeded: sd.players_needed ?? undefined,
        durationMinutes: sd.duration_minutes ?? undefined,
        defaultPosition: sd.default_position ?? undefined,
        notes: sd.notes ?? undefined,
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: existing.id }, data })
      if (sportsUpdate) {
        await tx.sportsDetail.update({ where: { eventId: existing.id }, data: sportsUpdate })
      }
    })

    const detail = await prisma.event.findUnique({
      where: { id: existing.id },
      include: EVENT_DETAIL_INCLUDE,
    })
    return res.json({ data: toEventDetail(detail) })
  } catch (err) {
    if (err.code === 'P2003') {
      return fail(res, 422, 'VALIDATION_ERROR', 'category_id does not reference a real category')
    }
    console.error('PATCH /api/events/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to update event')
  }
})

// DELETE /api/events/:id — delete an owned native event (cascades).
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true, organizerId: true, source: true },
    })
    if (!existing) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (existing.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'You do not own this event')
    }
    if (existing.source !== 'native') {
      return fail(res, 403, 'FORBIDDEN', 'Synced events cannot be deleted')
    }
    await prisma.event.delete({ where: { id: existing.id } })
    return res.status(204).end()
  } catch (err) {
    console.error('DELETE /api/events/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to delete event')
  }
})

// POST /api/events/:id/publish — draft → published.
router.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { sportsDetail: { include: { positions: true } } },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'You do not own this event')
    }
    if (event.status !== 'draft') {
      return fail(res, 409, 'CONFLICT', `Cannot publish an event that is ${event.status}`)
    }

    // Validate the draft is complete enough to go live.
    const missing = []
    if (!event.title?.trim()) missing.push('title')
    if (!event.categoryId) missing.push('category_id')
    if (!event.startsAt) missing.push('starts_at')
    if (!event.timezone) missing.push('timezone')
    if (!event.city) missing.push('city')
    if (event.isSports) {
      const sd = event.sportsDetail
      if (!sd) missing.push('sports_details')
      else {
        const err = validatePositions(
          sd.positions.map((p) => ({ label: p.label, capacity: p.capacity })),
          sd.playersNeeded,
        )
        if (err) return fail(res, 422, 'VALIDATION_ERROR', err)
      }
    }
    if (missing.length) {
      return fail(res, 422, 'VALIDATION_ERROR', `Incomplete draft — missing: ${missing.join(', ')}`)
    }

    const published = await prisma.event.update({
      where: { id: event.id },
      data: { status: 'published', publishedAt: new Date() },
      select: { id: true, status: true, publishedAt: true },
    })

    // Enqueue the embedding-on-publish job (stub in S1/S2; real in S3). Best-effort.
    runJob('embed-pending-events').catch(() => {})

    // Fan out followed-organizer notifications (#27). Best-effort: a follower
    // notification failure must never fail the publish itself.
    notifyFollowersOfNewEvent(event.organizerId, published.id).catch((err) =>
      console.error('notifyFollowersOfNewEvent error:', err),
    )

    return res.json({
      data: { id: published.id, status: published.status, published_at: published.publishedAt },
    })
  } catch (err) {
    console.error('POST /api/events/:id/publish error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to publish event')
  }
})

// Helper: normalize query param to array (handles ?category=music&category=nightlife)
function toArray(val) {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

/**
 * Enforce the sports capacity invariant: Σ position.capacity = players_needed.
 * When no explicit positions are given we synthesize a single "Any" position
 * (§6 convention) so every claim carries a non-null sports_position_id.
 * Returns an error string, or null when valid.
 */
function validatePositions(positions, playersNeeded) {
  if (!Array.isArray(positions) || positions.length === 0) return null // synthesized later
  for (const p of positions) {
    if (!p.label) return 'each position needs a label'
    if (!Number.isInteger(p.capacity) || p.capacity < 1) {
      return 'each position capacity must be a positive integer'
    }
  }
  const sum = positions.reduce((acc, p) => acc + p.capacity, 0)
  if (sum !== playersNeeded) {
    return `Σ position.capacity (${sum}) must equal players_needed (${playersNeeded})`
  }
  return null
}

/** Build the positions create-array, synthesizing an "Any" slot when none given. */
function normalizePositions(positions, playersNeeded) {
  if (!Array.isArray(positions) || positions.length === 0) {
    return [{ label: 'Any', capacity: playersNeeded, sortOrder: 0 }]
  }
  return positions.map((p, i) => ({
    label: p.label,
    capacity: p.capacity,
    skillLevel: p.skill_level ?? null,
    sortOrder: p.sort_order ?? i,
  }))
}

export default router
