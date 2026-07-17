// Profile Saved/Going lists verification, end-to-end over HTTP. Reproduces the
// reported bug: an event saved / RSVP'd that is NOT in the generic upcoming feed
// (here, a PAST event and an event beyond the feed's first page) must still show
// in the user's own /saved and /rsvps lists. Seeds its own data, drives the API,
// asserts, and cleans up.
//
// Prereq: DB reachable + backend running (this session boots it). Then:
//   node --env-file=.env scripts/verify-profile-lists.mjs
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

const created = { userIds: [], eventIds: [], categoryId: null }

try {
  const category = await prisma.category.create({
    data: {
      slug: `pl-cat-${stamp}`,
      name: 'PL Cat',
      colorHex: '#6D5EFC',
      icon: 'music',
      sortOrder: 997,
    },
  })
  created.categoryId = category.id

  const passwordHash = await bcrypt.hash(pw, 10)
  const organizer = await prisma.user.create({
    data: { email: `pl-org+${stamp}@t.co`, passwordHash, role: 'organizer' },
  })
  const alice = await prisma.user.create({
    data: { email: `pl-alice+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  created.userIds.push(organizer.id, alice.id)

  // A PAST published event — exactly what the old feed-filter dropped (the
  // generic feed only returns startsAt >= now). Saving + RSVPing it must still
  // surface it in the profile lists.
  const pastEvent = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      source: 'native',
      status: 'published',
      title: `PL Past Event ${stamp}`,
      categoryId: category.id,
      startsAt: new Date('2020-01-01T19:00:00Z'),
      timezone: 'UTC',
      city: 'Testville',
      isFree: true,
    },
  })
  // A future event too, so we exercise both.
  const futureEvent = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      source: 'native',
      status: 'published',
      title: `PL Future Event ${stamp}`,
      categoryId: category.id,
      startsAt: new Date('2030-01-01T19:00:00Z'),
      timezone: 'UTC',
      city: 'Testville',
      isFree: true,
    },
  })
  created.eventIds.push(pastEvent.id, futureEvent.id)

  const cookie = await login(`pl-alice+${stamp}@t.co`)
  assert(cookie, 'user logged in')

  // Save + RSVP BOTH events.
  for (const ev of [pastEvent, futureEvent]) {
    const s = await call(`/api/events/${ev.id}/save`, { cookie, method: 'PUT' })
    assert(s.status === 200, `save ${ev.title} → 200 (got ${s.status})`)
    const r = await call(`/api/events/${ev.id}/rsvp`, {
      cookie,
      method: 'PUT',
      body: { status: 'going' },
    })
    assert(r.status === 200, `rsvp ${ev.title} → 200 (got ${r.status})`)
  }

  // The generic feed must NOT contain the past event (baseline for the bug).
  const feed = await call(`/api/events`)
  const feedIds = new Set((feed.json.data ?? []).map((e) => e.id))
  assert(
    !feedIds.has(pastEvent.id),
    'past event is absent from the generic feed (why the old filter dropped it)',
  )

  // NEW: /saved returns BOTH events, including the past one.
  const saved = await call(`/api/users/${alice.id}/saved`, { cookie })
  assert(saved.status === 200, `GET /saved → 200 (got ${saved.status})`)
  const savedIds = new Set((saved.json.data ?? []).map((row) => row.event?.id))
  assert(savedIds.has(pastEvent.id), '/saved includes the PAST saved event')
  assert(savedIds.has(futureEvent.id), '/saved includes the future saved event')

  // NEW: /rsvps?status=going returns BOTH, including the past one.
  const going = await call(`/api/users/${alice.id}/rsvps?status=going`, { cookie })
  assert(going.status === 200, `GET /rsvps → 200 (got ${going.status})`)
  const goingIds = new Set((going.json.data ?? []).map((row) => row.event?.id))
  assert(goingIds.has(pastEvent.id), '/rsvps includes the PAST going event')
  assert(goingIds.has(futureEvent.id), '/rsvps includes the future going event')

  // Authz: another user can't read Alice's lists.
  const bob = await prisma.user.create({
    data: { email: `pl-bob+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  created.userIds.push(bob.id)
  const bobCookie = await login(`pl-bob+${stamp}@t.co`)
  const cross = await call(`/api/users/${alice.id}/saved`, { cookie: bobCookie })
  assert(cross.status === 403, `cross-user /saved is 403 (got ${cross.status})`)

  // Unsave one, confirm it drops from /saved (keeps the going list intact).
  await call(`/api/events/${pastEvent.id}/save`, { cookie, method: 'DELETE' })
  const saved2 = await call(`/api/users/${alice.id}/saved`, { cookie })
  const savedIds2 = new Set((saved2.json.data ?? []).map((row) => row.event?.id))
  assert(!savedIds2.has(pastEvent.id), 'unsaved event drops from /saved')
  assert(savedIds2.has(futureEvent.id), 'other saved event remains')

  console.log('\nALL PROFILE-LIST CHECKS PASSED')
} finally {
  for (const id of created.eventIds) {
    await prisma.rsvp.deleteMany({ where: { eventId: id } }).catch(() => {})
    await prisma.savedEvent.deleteMany({ where: { eventId: id } }).catch(() => {})
    await prisma.interactionEvent.deleteMany({ where: { eventId: id } }).catch(() => {})
    await prisma.event.delete({ where: { id } }).catch(() => {})
  }
  for (const id of created.userIds) {
    await prisma.userSession.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.interactionEvent.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  if (created.categoryId) {
    await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => {})
  }
  await prisma.$disconnect()
}
