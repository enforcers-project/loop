import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const router = Router()

function formatDate(dt) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const d = new Date(dt)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  const mm = m === 0 ? '' : `:${String(m).padStart(2, '0')}`
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${h12}${mm} ${ampm}`
}

function toFrontendEvent(event) {
  return {
    id: event.id,
    title: event.title,
    category: event.category.name,
    poster: event.flyerUrl,
    price: event.isFree ? 'Free' : event.priceMin ? `$${Number(event.priceMin)}` : 'Free',
    isFree: event.isFree,
    date: formatDate(event.startsAt),
    isoDate: event.startsAt.toISOString(),
    venueName: event.venueName,
    city: event.city,
    lat: event.lat,
    lng: event.lng,
    isSports: event.isSports,
    description: event.description,
    tags: event.tags?.map((t) => `#${t.label}`) ?? [],
    goingCount: event.rsvpCount,
    goingAvatars: [],
    capacity: event.capacity,
    rsvpCount: event.rsvpCount,
    saveCount: event.saveCount,
    almostFull: event.capacity ? event.rsvpCount / event.capacity > 0.85 : false,
    organizer: event.organizer
      ? {
          id: event.organizer.id,
          name: event.organizer.displayName,
          handle: event.organizer.handle ? `@${event.organizer.handle}` : null,
          avatar: event.organizer.avatarUrl,
          verified: event.organizer.isVerified,
        }
      : event.externalOrganizerName
        ? {
            id: null,
            name: event.externalOrganizerName,
            handle: null,
            avatar: null,
            verified: false,
          }
        : null,
    playersNeeded: event.sportsDetail?.playersNeeded ?? null,
    playersSignedUp: event.sportsDetail?.playersSignedUp ?? null,
  }
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 50

// POST /api/recommendations
// Body: { interests?: string[], user_id?: string, limit?: number }
router.post('/recommendations', async (req, res) => {
  try {
    const { interests = [], user_id: userId, limit: rawLimit } = req.body ?? {}

    const limit = Math.min(Math.max(Number(rawLimit) || DEFAULT_LIMIT, 1), MAX_LIMIT)

    // Fetch upcoming published events with relations
    const events = await prisma.event.findMany({
      where: {
        status: 'published',
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
      include: {
        category: true,
        organizer: true,
        sportsDetail: true,
        tags: true,
      },
    })

    if (events.length === 0) {
      return res.json({ data: [] })
    }

    // --- Strategy 1: User has affinity data (logged-in, has interactions) ---
    let affinityMap = null
    if (userId) {
      const affinities = await prisma.userCategoryAffinity.findMany({
        where: { userId },
        orderBy: { score: 'desc' },
      })
      if (affinities.length > 0) {
        affinityMap = new Map(affinities.map((a) => [a.categoryId, Number(a.score)]))
      }
    }

    // --- Strategy 2: Map interest IDs to category IDs (onboarding fallback) ---
    let interestCategoryIds = new Set()
    if (!affinityMap && Array.isArray(interests) && interests.length > 0) {
      const matched = await prisma.interest.findMany({
        where: { slug: { in: interests } },
        select: { categoryId: true },
      })
      interestCategoryIds = new Set(matched.map((i) => i.categoryId))
    }

    // --- Score & rank ---
    const maxPopularity = Math.max(1, ...events.map((e) => e.rsvpCount + 2 * e.saveCount))

    const scored = events.map((event) => {
      let affinityScore = 0
      let rationale = null

      if (affinityMap) {
        // Affinity-based ranking
        const catScore = affinityMap.get(event.categoryId) ?? 0
        affinityScore = catScore
        if (catScore > 0) {
          rationale = `Because you like ${event.category.name}`
        }
      } else if (interestCategoryIds.size > 0) {
        // Interest-based fallback
        if (interestCategoryIds.has(event.categoryId)) {
          affinityScore = 1
          rationale = `Because you like ${event.category.name}`
        }
      }

      // Popularity component (normalized 0-1)
      const popularity = (event.rsvpCount + 2 * event.saveCount) / maxPopularity

      // Recency boost: events sooner get a small bump (0-0.3)
      const daysUntil = Math.max(0, (event.startsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      const recencyBoost = Math.max(0, 0.3 - daysUntil * 0.01)

      // Combined score
      const score = affinityScore * 100 + popularity * 10 + recencyBoost

      // Assign rationale for popular events that don't match interests
      if (!rationale && popularity > 0.5) {
        rationale = 'Trending nearby'
      } else if (!rationale && popularity > 0.2) {
        rationale = 'Popular near you'
      }

      return { event, score, rationale }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    // Take top N
    const topResults = scored.slice(0, limit)

    // --- Log recommendation impressions (best-effort) ---
    if (userId && topResults.length > 0) {
      const feedRunId = randomUUID()
      const impressions = topResults.map((item, idx) => ({
        userId,
        eventId: item.event.id,
        feedRunId,
        rank: idx + 1,
        score: Math.min(item.score, 99.999999),
        rationaleText: item.rationale,
        surface: 'for_you',
      }))

      prisma.recommendationImpression.createMany({ data: impressions }).catch(() => {})
    }

    // --- Serialize response (camelCase shape matching frontend EventCard) ---
    const data = topResults.map((item) => ({
      ...toFrontendEvent(item.event),
      rationale: item.rationale,
    }))

    res.json({ data })
  } catch (err) {
    console.error('POST /api/recommendations error:', err)
    res.status(500).json({ error: { message: 'Failed to generate recommendations' } })
  }
})

export default router
