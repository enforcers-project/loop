// Sprint 2 #15 verification — save + RSVP endpoints, end-to-end over HTTP.
// Self-contained: seeds a category + a published event + two attendees, drives
// the API asserting the audit fixes, then cleans up.
//
// Prereq: DB up + migrated, backend running (npm run dev). Then:
//   node scripts/verify-save-rsvp.mjs
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

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  })
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
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

const created = { userIds: [], eventId: null, categoryId: null }

try {
  const category = await prisma.category.create({
    data: {
      slug: `sr-cat-${stamp}`,
      name: 'SR Cat',
      colorHex: '#6D5EFC',
      icon: 'music',
      sortOrder: 998,
    },
  })
  created.categoryId = category.id

  const passwordHash = await bcrypt.hash(pw, 10)
  const organizer = await prisma.user.create({
    data: { email: `sr-org+${stamp}@t.co`, passwordHash, role: 'organizer' },
  })
  const alice = await prisma.user.create({
    data: { email: `sr-alice+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  const bob = await prisma.user.create({
    data: { email: `sr-bob+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  created.userIds.push(organizer.id, alice.id, bob.id)

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      source: 'native',
      status: 'published',
      title: 'Save/RSVP Test Event',
      categoryId: category.id,
      startsAt: new Date('2026-10-01T19:00:00Z'),
      timezone: 'America/New_York',
      city: 'New York',
      publishedAt: new Date(),
    },
  })
  created.eventId = event.id

  const aCookie = await login(alice.email)
  const bCookie = await login(bob.email)
  const E = `/api/events/${event.id}`

  // --- SAVE ---
  // 1. auth required
  let r = await call(`${E}/save`, { method: 'PUT' })
  assert(r.status === 401, `save without auth → 401 (got ${r.status})`)

  // 2. save increments save_count
  r = await call(`${E}/save`, { cookie: aCookie, method: 'PUT' })
  assert(
    r.status === 200 && r.json.data.save_count === 1,
    `save → save_count 1 (got ${r.json?.data?.save_count})`,
  )

  // 3. idempotent: second save does NOT double-count
  r = await call(`${E}/save`, { cookie: aCookie, method: 'PUT' })
  assert(r.json.data.save_count === 1, `re-save stays at 1 (got ${r.json?.data?.save_count})`)

  // 4. a second user's save → 2
  r = await call(`${E}/save`, { cookie: bCookie, method: 'PUT' })
  assert(r.json.data.save_count === 2, `bob save → 2 (got ${r.json?.data?.save_count})`)

  // 5. unsave decrements; idempotent unsave stays put
  r = await call(`${E}/save`, { cookie: bCookie, method: 'DELETE' })
  assert(
    r.json.data.save_count === 1 && r.json.data.saved === false,
    `unsave → 1 (got ${r.json?.data?.save_count})`,
  )
  r = await call(`${E}/save`, { cookie: bCookie, method: 'DELETE' })
  assert(
    r.json.data.save_count === 1,
    `idempotent unsave stays 1 (got ${r.json?.data?.save_count})`,
  )

  // --- RSVP (the count-only-on-going audit fix) ---
  // 6. interested does NOT touch rsvp_count
  r = await call(`${E}/rsvp`, { cookie: aCookie, method: 'PUT', body: { status: 'interested' } })
  assert(
    r.status === 200 && r.json.data.event_rsvp_count === 0,
    `interested → count 0 (got ${r.json?.data?.event_rsvp_count})`,
  )

  // 7. going increments to 1
  r = await call(`${E}/rsvp`, { cookie: aCookie, method: 'PUT', body: { status: 'going' } })
  assert(
    r.json.data.event_rsvp_count === 1,
    `going → count 1 (got ${r.json?.data?.event_rsvp_count})`,
  )

  // 8. going → interested decrements back to 0 (left going)
  r = await call(`${E}/rsvp`, { cookie: aCookie, method: 'PUT', body: { status: 'interested' } })
  assert(
    r.json.data.event_rsvp_count === 0,
    `going→interested → count 0 (got ${r.json?.data?.event_rsvp_count})`,
  )

  // 9. two going users → count 2
  await call(`${E}/rsvp`, { cookie: aCookie, method: 'PUT', body: { status: 'going' } })
  r = await call(`${E}/rsvp`, { cookie: bCookie, method: 'PUT', body: { status: 'going' } })
  assert(
    r.json.data.event_rsvp_count === 2,
    `two going → count 2 (got ${r.json?.data?.event_rsvp_count})`,
  )

  // 10. cancel a going RSVP → count 1
  r = await call(`${E}/rsvp`, { cookie: bCookie, method: 'DELETE' })
  assert(
    r.json.data.event_rsvp_count === 1,
    `cancel going → count 1 (got ${r.json?.data?.event_rsvp_count})`,
  )

  // 11. cancel is idempotent (no negative count)
  r = await call(`${E}/rsvp`, { cookie: bCookie, method: 'DELETE' })
  assert(
    r.json.data.event_rsvp_count === 1,
    `idempotent cancel stays 1 (got ${r.json?.data?.event_rsvp_count})`,
  )

  // 12. validation: bad status
  r = await call(`${E}/rsvp`, { cookie: aCookie, method: 'PUT', body: { status: 'maybe' } })
  assert(r.status === 422, `bad status → 422 (got ${r.status})`)

  // --- PERSISTENCE: counts match the DB, and interaction rows were written ---
  const dbEvent = await prisma.event.findUnique({
    where: { id: event.id },
    select: { rsvpCount: true, saveCount: true },
  })
  assert(
    dbEvent.rsvpCount === 1 && dbEvent.saveCount === 1,
    `DB persists rsvp=1 save=1 (got rsvp=${dbEvent.rsvpCount} save=${dbEvent.saveCount})`,
  )

  const signalCount = await prisma.interactionEvent.count({ where: { eventId: event.id } })
  assert(signalCount > 0, `interaction_events written (${signalCount})`)

  console.log('\nAll save/RSVP assertions passed ✓')
} finally {
  await prisma.interactionEvent.deleteMany({ where: { eventId: created.eventId } }).catch(() => {})
  await prisma.event.deleteMany({ where: { organizerId: { in: created.userIds } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  if (created.categoryId)
    await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => {})
  await prisma.$disconnect()
}
