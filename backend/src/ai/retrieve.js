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

// ---------------------------------------------------------------------------
// Controlled vocabulary — the ONLY values the parse (LLM or regex) may emit.
// This is the safety boundary of #22: the model chooses a label from a fixed
// menu, and *code* turns that label into a DB constraint. A hallucinating model
// can at worst pick the wrong safe label; it can never widen a query, invent a
// category, or leak a paid event past a `free` constraint. The LLM decides
// intent; the SQL enforces the constraint.
// ---------------------------------------------------------------------------
const CATEGORY_SLUGS = ['music', 'nightlife', 'sports', 'networking', 'food', 'campus']
const DATE_TOKENS = ['tonight', 'tomorrow', 'weekend']

// Regex hints for the offline/fallback parse — a superset of phrasings that map
// onto each category slug. Only used when the LLM is unavailable.
const CATEGORY_KEYWORDS = {
  music: ['music', 'concert', 'gig', 'dj', 'show'],
  nightlife: ['nightlife', 'party', 'club', 'afrobeats', 'rooftop', 'lounge'],
  sports: ['sports', 'soccer', 'football', 'basketball', 'run', 'pickup', 'game'],
  networking: ['networking', 'meetup', 'career', 'startup', 'mixer'],
  food: ['food', 'brunch', 'dinner', 'tasting', 'restaurant'],
  campus: ['campus', 'college', 'student', 'university'],
}

const DAY_MS = 1000 * 60 * 60 * 24
const PARSE_MODEL = 'llama-3.1-8b-instant' // fast + cheap; plan §Sprint-0 for parse/tagging
const PARSE_TIMEOUT_MS = 6000

/**
 * Turn a date token ('tonight' | 'tomorrow' | 'weekend') into a concrete
 * { from, to, label } window. Returns null for an unknown token. Shared by both
 * the LLM and regex parse so the date math lives in exactly one place.
 */
function dateRange(token) {
  const now = new Date()
  if (token === 'weekend') {
    const daysUntilFri = (5 - now.getUTCDay() + 7) % 7
    const from = new Date(now.getTime() + daysUntilFri * DAY_MS)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: new Date(from.getTime() + 3 * DAY_MS), label: 'This weekend' }
  }
  if (token === 'tonight') {
    return { from: now, to: new Date(now.getTime() + DAY_MS), label: 'Tonight' }
  }
  if (token === 'tomorrow') {
    const from = new Date(now.getTime() + DAY_MS)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: new Date(from.getTime() + DAY_MS), label: 'Tomorrow' }
  }
  return null
}

/**
 * Regex parse — the offline/fallback path. Evidence-only (planning §9.3 / audit
 * fix): only asserts what's literally in the query string, no city guessing or
 * fabricated dates. Emits the same label-shape the LLM does:
 *   { isFree?: true, category?: slug, date?: token }
 */
export function parseFiltersRegex(rawQuery) {
  const q = String(rawQuery ?? '').toLowerCase()
  const label = {}

  if (/\bfree\b/.test(q)) label.isFree = true

  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => q.includes(kw))) {
      label.category = slug
      break
    }
  }

  if (/\b(this )?weekend\b/.test(q)) label.date = 'weekend'
  else if (/\btonight\b/.test(q)) label.date = 'tonight'
  else if (/\btomorrow\b/.test(q)) label.date = 'tomorrow'

  return label
}

const PARSE_SYSTEM_PROMPT = `You extract structured search filters from a short natural-language events query.
Return ONLY a JSON object with these keys (omit a key when it does not apply):
- "isFree": true  — only if the user asks for free / no-cost events
- "category": one of ["music","nightlife","sports","networking","food","campus"] — the single best fit, or omit
- "date": one of ["tonight","tomorrow","weekend"] — only if the user names that timeframe, or omit
Extract ONLY what the user actually said. Never guess a city, price, or date that isn't asked for.
Example: "something cheap to do saturday night" -> {"isFree":true,"date":"weekend"}
Example: "afrobeats party" -> {"category":"nightlife"}`

/** Coerce arbitrary parsed JSON down to the controlled vocabulary. Anything
 *  outside the allowed enums is dropped — the safety boundary in code form. */
function sanitizeLabel(raw) {
  const label = {}
  if (raw && typeof raw === 'object') {
    if (raw.isFree === true) label.isFree = true
    if (typeof raw.category === 'string' && CATEGORY_SLUGS.includes(raw.category)) {
      label.category = raw.category
    }
    if (typeof raw.date === 'string' && DATE_TOKENS.includes(raw.date)) {
      label.date = raw.date
    }
  }
  return label
}

/**
 * LLM parse via Groq JSON mode. Returns the sanitized label-shape, or null when
 * Groq is unset / times out / errors — the caller then falls back to regex.
 * Backend-only: the LLM key never reaches the browser.
 */
async function parseFiltersLLM(rawQuery) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PARSE_MODEL,
        max_tokens: 100,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PARSE_SYSTEM_PROMPT },
          { role: 'user', content: String(rawQuery ?? '').slice(0, 300) },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.warn(`[ai/retrieve] Groq parse ${res.status}`)
      return null
    }
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null
    return sanitizeLabel(JSON.parse(content))
  } catch (err) {
    console.warn('[ai/retrieve] LLM parse fallback:', err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve the label-shape into the internal filter object the SQL layer uses:
 *   { isFree?, categorySlug?, dateFrom?, dateTo?, dateLabel? }
 * Date tokens become concrete windows here (via dateRange).
 */
export function resolveFilters(label = {}) {
  const filters = {}
  if (label.isFree) filters.isFree = true
  if (label.category && CATEGORY_SLUGS.includes(label.category)) {
    filters.categorySlug = label.category
  }
  if (label.date) {
    const range = dateRange(label.date)
    if (range) {
      filters.dateFrom = range.from
      filters.dateTo = range.to
      filters.dateLabel = range.label
    }
  }
  return filters
}

const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The removable-pill list the UI renders — one chip per active constraint.
 * `key` is what the client drops from the label-shape to remove a pill and
 * re-run the search.
 */
export function filtersToPills(filters = {}) {
  const pills = []
  if (filters.isFree) pills.push({ key: 'isFree', label: 'Free' })
  if (filters.categorySlug) pills.push({ key: 'category', label: CAP(filters.categorySlug) })
  if (filters.dateLabel) pills.push({ key: 'date', label: filters.dateLabel })
  return pills
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
 * Parse a query into the controlled label-shape: LLM first (Groq JSON mode),
 * regex fallback when Groq is unset / errors. Callers that already have a label
 * (e.g. a client that removed a pill) pass `labelOverride` to SKIP the parse —
 * otherwise the LLM would just re-add the filter the user meant to drop.
 * Returns { label, parse } where parse is 'llm' | 'regex' | 'override'.
 */
export async function parseQuery(rawQuery, labelOverride = null) {
  if (labelOverride) return { label: sanitizeLabel(labelOverride), parse: 'override' }
  const llm = await parseFiltersLLM(rawQuery)
  if (llm) return { label: llm, parse: 'llm' }
  return { label: parseFiltersRegex(rawQuery), parse: 'regex' }
}

/**
 * Retrieve up to TOP_K events matching a natural-language query. Parses the
 * query into hard constraints (LLM → regex), pre-filters events by those
 * constraints in SQL, then re-ranks the survivors by pgvector cosine distance
 * (keyword fallback when embeddings are unavailable). Returns the hit events,
 * the parsed `filters`, the `pills` the UI renders, the query embedding, and
 * `retrieval`/`parse` provenance tags. Never throws.
 *
 * `opts.labelOverride` bypasses the parse and applies the given label directly
 * (pill-removal re-runs).
 */
export async function retrieveEvents(rawQuery, opts = {}) {
  const { label, parse } = await parseQuery(rawQuery, opts.labelOverride)
  const filters = resolveFilters(label)
  const pills = filtersToPills(filters)
  const candidates = await candidateEvents(filters)

  if (!candidates.length) {
    return { events: [], filters, label, pills, queryVector: null, retrieval: 'empty', parse }
  }

  let queryVector = null
  let events = []
  if (embeddingsConfigured()) {
    try {
      const vec = await generateEmbedding(rawQuery)
      queryVector = `[${vec.join(',')}]`
      events = await knnRerank(queryVector, candidates)
      if (events.length) {
        return { events, filters, label, pills, queryVector, retrieval: 'pgvector', parse }
      }
    } catch (err) {
      console.warn('[ai/retrieve] embedding fallback:', err.message)
    }
  }

  events = keywordRerank(rawQuery, candidates)
  if (!events.length) events = candidates.slice(0, TOP_K)
  return {
    events,
    filters,
    label,
    pills,
    queryVector,
    retrieval: queryVector ? 'keyword_fallback' : 'keyword',
    parse,
  }
}

/** Serialize a Prisma event row for the drawer response (EventCard shape). */
export function serializeHits(events) {
  return events.map((ev) => toEventCard(ev))
}
