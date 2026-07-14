// Sprint 2 #9 verification — event CRUD + publish, end-to-end over HTTP.
// Self-contained: seeds its own category + users via Prisma (so it doesn't
// depend on #3/#4), drives the API, asserts, then cleans up.
//
// Prereq: DB up + migrated, backend running (npm run dev). Then:
//   node scripts/verify-event-crud.mjs
import prisma from '../src/lib/prisma.js'
import bcrypt from 'bcryptjs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const stamp = Date.now()
const pw = 'password1234'

function assert(cond, msg) {
  if (!cond) {
    console.error('✗ FAIL:', msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  console.log('✓', msg)
}

// Log in and return the auth cookie string for subsequent calls.
async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  })
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return cookies
}

async function call(path, { cookie = '', method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* 204 */
  }
  return { status: res.status, json }
}

const created = { userIds: [], categoryId: null }

try {
  // --- Seed a category + three users directly ---
  const category = await prisma.category.create({
    data: {
      slug: `test-cat-${stamp}`,
      name: 'Test Category',
      colorHex: '#6D5EFC',
      icon: 'music',
      sortOrder: 999,
    },
  })
  created.categoryId = category.id

  const passwordHash = await bcrypt.hash(pw, 10)
  const organizer = await prisma.user.create({
    data: { email: `org+${stamp}@t.co`, passwordHash, role: 'organizer' },
  })
  const host = await prisma.user.create({
    data: { email: `host+${stamp}@t.co`, passwordHash, role: 'organizer', isHost: true },
  })
  const attendee = await prisma.user.create({
    data: { email: `att+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  created.userIds.push(organizer.id, host.id, attendee.id)

  const orgCookie = await login(organizer.email)
  const hostCookie = await login(host.email)
  const attCookie = await login(attendee.email)

  const baseEvent = {
    title: 'Rooftop Mixer',
    category_id: category.id,
    starts_at: '2026-09-01T19:00:00Z',
    timezone: 'America/New_York',
    city: 'New York',
    venue_name: 'Sky Bar',
  }

  // 1. Gate: attendee cannot create.
  let r = await call('/api/events', { cookie: attCookie, method: 'POST', body: baseEvent })
  assert(r.status === 403, `attendee create → 403 (got ${r.status})`)

  // 2. Gate: unauthenticated cannot create.
  r = await call('/api/events', { method: 'POST', body: baseEvent })
  assert(r.status === 401, `anon create → 401 (got ${r.status})`)

  // 3. Organizer creates a draft.
  r = await call('/api/events', { cookie: orgCookie, method: 'POST', body: baseEvent })
  assert(r.status === 201, `organizer create → 201 (got ${r.status})`)
  assert(r.json.data.status === 'draft', 'new event starts as draft')
  assert(r.json.data.source === 'native', 'source = native')
  const eventId = r.json.data.id

  // 4. Validation: missing title.
  r = await call('/api/events', {
    cookie: orgCookie,
    method: 'POST',
    body: { ...baseEvent, title: '' },
  })
  assert(r.status === 422, `create without title → 422 (got ${r.status})`)

  // 5. Sports gate: organizer WITHOUT is_host can't create a run.
  r = await call('/api/events', {
    cookie: orgCookie,
    method: 'POST',
    body: {
      ...baseEvent,
      is_sports: true,
      sports_details: {
        sport: 'Basketball',
        skill_level: 'all_levels',
        venue_setting: 'indoor',
        players_needed: 10,
      },
    },
  })
  assert(r.status === 403, `non-host sports create → 403 (got ${r.status})`)

  // 6. Capacity invariant: positions must sum to players_needed.
  r = await call('/api/events', {
    cookie: hostCookie,
    method: 'POST',
    body: {
      ...baseEvent,
      is_sports: true,
      sports_details: {
        sport: 'Basketball',
        skill_level: 'all_levels',
        venue_setting: 'indoor',
        players_needed: 10,
        positions: [
          { label: 'Guard', capacity: 4 },
          { label: 'Forward', capacity: 4 }, // sums to 8, not 10
        ],
      },
    },
  })
  assert(r.status === 422, `bad capacity sum → 422 (got ${r.status})`)

  // 7. Host creates a valid run; positions sum correctly.
  r = await call('/api/events', {
    cookie: hostCookie,
    method: 'POST',
    body: {
      ...baseEvent,
      title: 'Pickup Run',
      is_sports: true,
      sports_details: {
        sport: 'Basketball',
        skill_level: 'all_levels',
        venue_setting: 'indoor',
        players_needed: 10,
        positions: [
          { label: 'Guard', capacity: 5 },
          { label: 'Forward', capacity: 5 },
        ],
      },
    },
  })
  assert(r.status === 201, `valid run create → 201 (got ${r.status})`)
  assert(r.json.data.sports_details.positions.length === 2, 'run has 2 positions')
  const runId = r.json.data.id

  // 8. Ownership: attendee cannot patch someone else's event.
  r = await call(`/api/events/${eventId}`, {
    cookie: attCookie,
    method: 'PATCH',
    body: { title: 'Hijacked' },
  })
  assert(r.status === 403, `non-owner patch → 403 (got ${r.status})`)

  // 9. Owner patches title.
  r = await call(`/api/events/${eventId}`, {
    cookie: orgCookie,
    method: 'PATCH',
    body: { title: 'Rooftop Mixer (Updated)' },
  })
  assert(r.status === 200 && r.json.data.title === 'Rooftop Mixer (Updated)', 'owner patch applies')

  // 10. Publish: owner publishes the complete draft.
  r = await call(`/api/events/${eventId}/publish`, { cookie: orgCookie, method: 'POST' })
  assert(
    r.status === 200 && r.json.data.status === 'published',
    `publish → published (got ${r.status})`,
  )
  assert(r.json.data.published_at, 'published_at is set')

  // 11. Publish again → CONFLICT.
  r = await call(`/api/events/${eventId}/publish`, { cookie: orgCookie, method: 'POST' })
  assert(r.status === 409, `re-publish → 409 (got ${r.status})`)

  // 12. Delete: non-owner blocked, owner succeeds.
  r = await call(`/api/events/${runId}`, { cookie: attCookie, method: 'DELETE' })
  assert(r.status === 403, `non-owner delete → 403 (got ${r.status})`)
  r = await call(`/api/events/${runId}`, { cookie: hostCookie, method: 'DELETE' })
  assert(r.status === 204, `owner delete → 204 (got ${r.status})`)

  console.log('\nAll event-CRUD assertions passed ✓')
} finally {
  // --- Cleanup (order respects FKs; events cascade their sports rows) ---
  await prisma.event.deleteMany({ where: { organizerId: { in: created.userIds } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  if (created.categoryId) {
    await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => {})
  }
  await prisma.$disconnect()
}
