import express from 'express'
import cors from 'cors'
import { EVENTS, ORGANIZERS, CATEGORIES, INTERESTS, AVATARS, POSTS } from './data/seed.js'
import adminSyncRouter from './sync/routes.js'
import adminJobsRouter from './jobs/routes.js'
import eventsRouter from './events/routes.js'
import interactionsRouter from './interactions/routes.js'
import { startScheduler } from './jobs/index.js'

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// Standard error/response envelope (planning §7 Conventions).
function ok(res, data) {
  res.json({ data })
}
function fail(res, status, message) {
  res.status(status).json({ error: { message } })
}

/** Join an event with its organizer for the EventCard shape the frontend expects. */
function withOrganizer(ev) {
  const organizer = ORGANIZERS.find((o) => o.id === ev.organizerId) ?? null
  return { ...ev, organizer }
}

// --- Health -----------------------------------------------------------------
app.get('/api/health', (_req, res) => ok(res, { status: 'up', service: 'loop-backend' }))

// --- Lookups ----------------------------------------------------------------
app.get('/api/categories', (_req, res) => ok(res, CATEGORIES))
app.get('/api/interests', (_req, res) => ok(res, INTERESTS))
app.get('/api/avatars', (_req, res) => ok(res, AVATARS))

// --- Events (Prisma-backed, cursor-paginated) --------------------------------
app.use('/api/events', eventsRouter)

// --- Recommendations (basic fallback path, planning §9.1 #1–2) --------------
// POST /api/recommendations { interests?: string[] }
app.post('/api/recommendations', (req, res) => {
  const interests = Array.isArray(req.body?.interests) ? req.body.interests : []
  const interestCats = new Set(
    INTERESTS.filter((i) => interests.includes(i.id)).map((i) => i.category),
  )

  const scored = EVENTS.map(withOrganizer)
    .map((e) => {
      const affinity = interestCats.has(e.category) ? 1 : 0
      const popularity = e.rsvpCount + 2 * e.saveCount
      return { e, score: affinity * 100000 + popularity }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ e }) =>
      interestCats.size && !interestCats.has(e.category)
        ? { ...e, rationale: 'Popular near you' }
        : e,
    )

  ok(res, scored)
})

// --- Organizers -------------------------------------------------------------
app.get('/api/organizers/:id', (req, res) => {
  const org = ORGANIZERS.find((o) => o.id === req.params.id)
  if (!org) return fail(res, 404, 'Organizer not found')
  const events = EVENTS.filter((e) => e.organizerId === org.id).map(withOrganizer)
  ok(res, { ...org, events })
})

// --- Social feed ------------------------------------------------------------
app.get('/api/posts', (_req, res) => {
  const list = POSTS.map((p) => ({
    ...p,
    organizer: ORGANIZERS.find((o) => o.id === p.organizerId) ?? null,
    event: EVENTS.find((e) => e.id === p.eventId) ?? null,
  }))
  ok(res, list)
})

// --- Auth stub (session lives client-side in this build) --------------------
// The Figma prototype uses local state; this returns a plausible SelfUser so
// the frontend can flip to a logged-in shell without a real password store.
app.post('/api/auth/signup', (req, res) => {
  const { email, name, role } = req.body ?? {}
  if (!email) return fail(res, 400, 'Email is required')
  ok(res, {
    id: 'user-demo',
    email,
    name: name || 'New User',
    role: role || 'attendee',
    handle: '@' + String(email).split('@')[0],
    avatar: AVATARS[0],
  })
})
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body ?? {}
  if (!email) return fail(res, 400, 'Email is required')
  ok(res, {
    id: 'user-demo',
    email,
    name: 'Demo User',
    role: 'attendee',
    handle: '@' + String(email).split('@')[0],
    avatar: AVATARS[0],
  })
})

// --- AI assistant / NL search stub (grounded in real events) ----------------
// POST /api/ai/search { q } -> { reply, events: Event[] }
app.post('/api/ai/search', (req, res) => {
  const q = String(req.body?.q ?? '').toLowerCase()
  let matches = EVENTS.map(withOrganizer)
  if (q) {
    // Evidence-only lightweight parse: free, weekend, category/tag keywords.
    if (q.includes('free')) matches = matches.filter((e) => e.isFree)
    const catHit = CATEGORIES.find((c) => q.includes(c.name.toLowerCase()))
    if (catHit) matches = matches.filter((e) => e.category === catHit.name)
    const kw = matches.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q.replace('#', ''))),
    )
    if (kw.length) matches = kw
  }
  const events = matches.slice(0, 3)
  const reply = events.length
    ? `I found ${events.length} event${events.length > 1 ? 's' : ''} that match. Here are the top picks:`
    : `I couldn't find an exact match, but here are some popular events near you:`
  ok(res, { reply, events: events.length ? events : EVENTS.slice(0, 3).map(withOrganizer) })
})

// --- Interactions (behavior-signal beacon, §7.7) -----------------------------
app.use('/api', interactionsRouter)

// --- Admin sync routes (§7.7) ------------------------------------------------
app.use('/api/admin', adminSyncRouter)

// --- Admin job runner routes (#5b) -------------------------------------------
app.use('/api/admin', adminJobsRouter)

// --- Start --------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Loop backend listening on http://localhost:${PORT}`)
  startScheduler()
})
