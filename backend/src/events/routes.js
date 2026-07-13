import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { toEventCard } from './serialize.js'

const prisma = new PrismaClient()
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

    // Date range filter
    if (dateFrom || dateTo) {
      where.startsAt = {}
      if (dateFrom) where.startsAt.gte = new Date(dateFrom)
      if (dateTo) where.startsAt.lte = new Date(dateTo)
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
router.get('/:id', async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        organizer: true,
        sportsDetail: true,
      },
    })

    if (!event) {
      return res.status(404).json({ error: { message: 'Event not found' } })
    }

    res.json({ data: toEventCard(event) })
  } catch (err) {
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
        where: { id: { not: event.id }, status: 'published' },
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

// Helper: normalize query param to array (handles ?category=music&category=nightlife)
function toArray(val) {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

export default router
