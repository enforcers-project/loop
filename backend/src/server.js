import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { EVENTS, ORGANIZERS, CATEGORIES, INTERESTS, AVATARS, POSTS } from './data/seed.js'
import adminSyncRouter from './sync/routes.js'
import adminJobsRouter from './jobs/routes.js'
import eventsRouter from './events/routes.js'
import interactionsRouter from './interactions/routes.js'
import authRouter from './auth/routes.js'
import usersRouter from './users/routes.js'
import { attachSession } from './auth/middleware.js'
import recommendationsRouter from './recommendations/routes.js'
import embeddingsRouter from './embeddings/routes.js'
import preferencesRouter from './preferences/routes.js'
import { startScheduler } from './jobs/index.js'

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Resolve the caller on every request: attach req.user from the JWT cookie, and
// upsert an anonymous user_sessions row for a first-touch client id so behavior
// signals always have a valid session_id FK (planning §6 anonymous-session fix).
app.use(attachSession)

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

// --- Recommendations (Prisma-backed affinity/popularity ranking) -------------
app.use('/api', recommendationsRouter)

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

// --- Auth (JWT HttpOnly cookie, Prisma-backed; §7.1) ------------------------
// signup / login / logout / refresh / me — see src/auth/routes.js.
app.use('/api/auth', authRouter)

// --- Users (profile: onboarding interest commit; §7, work-plan #7) ----------
app.use('/api/users', usersRouter)

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

// --- AI / Embeddings routes (§9.2B) ------------------------------------------
app.use('/api/ai', embeddingsRouter)

// --- Preference vectors (§9.2C, issue #20) -----------------------------------
app.use('/api', preferencesRouter)

// --- Admin sync routes (§7.7) ------------------------------------------------
app.use('/api/admin', adminSyncRouter)

// --- Admin job runner routes (#5b) -------------------------------------------
app.use('/api/admin', adminJobsRouter)

// --- Start --------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Loop backend listening on http://localhost:${PORT}`)
  startScheduler()
})
