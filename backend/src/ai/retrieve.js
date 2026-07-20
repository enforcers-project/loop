// Retrieve events for a natural-language query. Same pgvector layer the
// recommender rides (see recommendations/engine.js knnRank): embed the query
// with the same 384-d Cloudflare model events use (embeddings/embed.js), do a
// SQL-side pre-filter over published/future events, then rank by cosine
// distance. Degrades to a keyword-only path when embedding keys are missing,
// so local dev still returns something useful.
import prisma from '../lib/prisma.js'
import { generateEmbedding } from '../embeddings/embed.js'
import { toEventCard } from '../events/serialize.js'

const TOP_K = 5
const PRE_FILTER_LIMIT = 200

const EVENT_INCLUDE = {
  category: true,
  organizer: true,
  sportsDetail: true,
}

const CATEGORY_KEYWORDS = {
  music: ['music', 'concert', 'gig', 'dj', 'show'],
  nightlife: ['nightlife', 'party', 'club', 'afrobeats', 'rooftop', 'lounge'],
  sports: ['sports', 'soccer', 'football', 'basketball', 'run', 'pickup', 'game'],
  networking: ['networking', 'meetup', 'career', 'startup', 'mixer'],
  food: ['food', 'brunch', 'dinner', 'tasting', 'restaurant'],
  campus: ['campus', 'college', 'student', 'university'],
}

const WEEKEND_MS = 1000 * 60 * 60 * 24

// Cheap, evidence-only NL parse (planning §9.3 / audit fix): only assert what's
// literally in the query string — no city guessing, no fabricated dates.
export function parseFilters(rawQuery) {
  const q = String(rawQuery ?? '').toLowerCase()
  const filters = {}

  if (/\bfree\b/.test(q)) filters.isFree = true

  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => q.includes(kw))) {
      filters.categorySlug = slug
      break
    }
  }

  if (/\b(this )?weekend\b/.test(q)) {
    const now = new Date()
    const day = now.getUTCDay()
    const daysUntilFri = (5 - day + 7) % 7
    const from = new Date(now.getTime() + daysUntilFri * WEEKEND_MS)
    from.setUTCHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + 3 * WEEKEND_MS)
    filters.dateFrom = from
    filters.dateTo = to
  } else if (/\btonight\b/.test(q)) {
    const from = new Date()
    const to = new Date(from.getTime() + WEEKEND_MS)
    filters.dateFrom = from
    filters.dateTo = to
  } else if (/\btomorrow\b/.test(q)) {
    const from = new Date(Date.now() + WEEKEND_MS)
    from.setUTCHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + WEEKEND_MS)
    filters.dateFrom = from
    filters.dateTo = to
  }

  return filters
}

function buildWhere(filters) {
  const where = { status: 'published' }
  const now = new Date()

  if (filters.dateFrom || filters.dateTo) {
    where.startsAt = {}
    if (filters.dateFrom) where.startsAt.gte = filters.dateFrom
    if (filters.dateTo) where.startsAt.lte = filters.dateTo
  } else {
    where.startsAt = { gte: now }
  }

  if (filters.isFree) where.isFree = true
  if (filters.categorySlug) where.category = { slug: filters.categorySlug }

  return where
}

async function candidateEvents(filters) {
  return prisma.event.findMany({
    where: buildWhere(filters),
    include: EVENT_INCLUDE,
    orderBy: [{ rsvpCount: 'desc' }, { startsAt: 'asc' }],
    take: PRE_FILTER_LIMIT,
  })
}

async function knnRerank(queryVector, candidates) {
  if (!candidates.length) return []
  const ids = candidates.map((c) => c.id)
  const rows = await prisma.$queryRawUnsafe(
    `SELECT event_id, (embedding <=> $1::vector) AS cos_dist
     FROM event_embeddings
     WHERE event_id = ANY($2::uuid[])
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    queryVector,
    ids,
    TOP_K,
  )
  const distMap = new Map(rows.map((r) => [r.event_id, Number(r.cos_dist)]))
  return candidates
    .map((ev) => ({ ev, dist: distMap.get(ev.id) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.dist - b.dist)
    .filter((r) => r.dist !== Number.POSITIVE_INFINITY)
    .slice(0, TOP_K)
    .map((r) => r.ev)
}

// Keyword scoring fallback for when embedding keys aren't set or pgvector
// returns nothing (e.g. no events embedded yet). Ranks by simple token overlap
// with title/description/tags/city so the drawer still surfaces relevant events.
function keywordRerank(rawQuery, candidates) {
  const tokens = String(rawQuery ?? '')
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2)
  if (!tokens.length) return candidates.slice(0, TOP_K)
  const scored = candidates.map((ev) => {
    const haystack = [ev.title, ev.description ?? '', ev.city ?? '', ev.venueName ?? '']
      .join(' ')
      .toLowerCase()
    const score = tokens.reduce((s, t) => (haystack.includes(t) ? s + 1 : s), 0)
    return { ev, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored
    .filter((r) => r.score > 0)
    .slice(0, TOP_K)
    .map((r) => r.ev)
}

function embeddingsConfigured() {
  return !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN)
}

/**
 * Retrieve up to TOP_K events matching a natural-language query. Returns the
 * hit events (Prisma rows w/ includes), the parsed filters, and the query
 * embedding (or null if the fallback path was taken). Never throws — a bad
 * embedding call falls through to keyword ranking.
 */
export async function retrieveEvents(rawQuery) {
  const filters = parseFilters(rawQuery)
  const candidates = await candidateEvents(filters)

  if (!candidates.length) {
    return { events: [], filters, queryVector: null, retrieval: 'empty' }
  }

  let queryVector = null
  let events = []
  if (embeddingsConfigured()) {
    try {
      const vec = await generateEmbedding(rawQuery)
      queryVector = `[${vec.join(',')}]`
      events = await knnRerank(queryVector, candidates)
      if (events.length) {
        return { events, filters, queryVector, retrieval: 'pgvector' }
      }
    } catch (err) {
      console.warn('[ai/retrieve] embedding fallback:', err.message)
    }
  }

  events = keywordRerank(rawQuery, candidates)
  if (!events.length) events = candidates.slice(0, TOP_K)
  return { events, filters, queryVector, retrieval: queryVector ? 'keyword_fallback' : 'keyword' }
}

/** Serialize a Prisma event row for the drawer response (EventCard shape). */
export function serializeHits(events) {
  return events.map((ev) => toEventCard(ev))
}
