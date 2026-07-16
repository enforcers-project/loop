// Sprint 3 #23 verification — sports roster, end-to-end over HTTP.
// Reproduces the acceptance test: two users claim, a third waitlists at
// capacity, a release auto-promotes the waitlister, the host marks attended.
// Self-contained: seeds a host + a 2-player run + three players, then cleans up.
//
// Prereq: DB up + migrated, backend running. Then:
//   node scripts/verify-roster.mjs
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
      slug: `rost-${stamp}`,
      name: 'Sports',
      colorHex: '#22C55E',
      icon: 'dribbble',
      sortOrder: 996,
    },
  })
  created.categoryId = category.id

  const passwordHash = await bcrypt.hash(pw, 10)
  const host = await prisma.user.create({
    data: { email: `host+${stamp}@t.co`, passwordHash, role: 'organizer', isHost: true },
  })
  const p1 = await prisma.user.create({
    data: { email: `p1+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  const p2 = await prisma.user.create({
    data: { email: `p2+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  const p3 = await prisma.user.create({
    data: { email: `p3+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  created.userIds.push(host.id, p1.id, p2.id, p3.id)

  // A 2-player run with one synthetic "Any" position (capacity == players_needed).
  const event = await prisma.event.create({
    data: {
      organizerId: host.id,
      source: 'native',
      status: 'published',
      title: 'Pickup Basketball',
      categoryId: category.id,
      startsAt: new Date('2026-11-01T18:00:00Z'),
      timezone: 'UTC',
      city: 'NYC',
      isSports: true,
      publishedAt: new Date(),
      sportsDetail: {
        create: {
          sport: 'Basketball',
          skillLevel: 'all_levels',
          venueSetting: 'indoor',
          playersNeeded: 2,
          positions: { create: [{ label: 'Any', capacity: 2, sortOrder: 0 }] },
        },
      },
    },
  })
  created.eventId = event.id
  const E = `/api/events/${event.id}`

  const c1 = await login(p1.email)
  const c2 = await login(p2.email)
  const c3 = await login(p3.email)
  const hostCookie = await login(host.email)

  // 1. positions grid is public and shows 2 open slots
  let r = await call(`${E}/positions`)
  assert(
    r.status === 200 && r.json.data.positions[0].open_slots === 2,
    `positions → 2 open (got ${r.json?.data?.positions?.[0]?.open_slots})`,
  )

  // 2. player 1 claims → claimed
  r = await call(`${E}/roster`, { cookie: c1, method: 'POST', body: {} })
  assert(
    r.status === 201 && r.json.data.status === 'claimed',
    `p1 claim → claimed (got ${r.json?.data?.status})`,
  )

  // 3. player 2 claims → claimed (run now full)
  r = await call(`${E}/roster`, { cookie: c2, method: 'POST', body: {} })
  assert(
    r.status === 201 && r.json.data.status === 'claimed',
    `p2 claim → claimed (got ${r.json?.data?.status})`,
  )

  // 4. player 3 claims at capacity → the trigger waitlists them
  r = await call(`${E}/roster`, { cookie: c3, method: 'POST', body: {} })
  assert(
    r.status === 201 && r.json.data.status === 'waitlisted',
    `p3 at capacity → waitlisted (got ${r.json?.data?.status})`,
  )
  assert(
    r.json.data.waitlist_position === 1,
    `p3 waitlist_position = 1 (got ${r.json?.data?.waitlist_position})`,
  )

  // 5. can't double-claim
  r = await call(`${E}/roster`, { cookie: c1, method: 'POST', body: {} })
  assert(r.status === 409, `p1 double-claim → 409 (got ${r.status})`)

  // 6. roster view: 2 claimed, 1 waitlisted, players_signed_up = 2
  r = await call(`${E}/roster`, { cookie: hostCookie })
  assert(
    r.json.data.claimed.length === 2 && r.json.data.waitlist.length === 1,
    `roster: 2 claimed / 1 waitlist (got ${r.json?.data?.claimed?.length}/${r.json?.data?.waitlist?.length})`,
  )
  assert(
    r.json.data.sports_detail.players_signed_up === 2,
    `players_signed_up = 2 (got ${r.json?.data?.sports_detail?.players_signed_up})`,
  )

  // 7. player 1 releases → p3 auto-promotes from waitlist to claimed
  r = await call(`${E}/roster`, { cookie: c1, method: 'DELETE' })
  assert(r.status === 204, `p1 release → 204 (got ${r.status})`)
  r = await call(`${E}/roster`, { cookie: hostCookie })
  const p3Claimed = r.json.data.claimed.some((c) => c.user.id === p3.id)
  assert(p3Claimed, 'p3 auto-promoted to claimed after p1 release')
  assert(
    r.json.data.waitlist.length === 0,
    `waitlist now empty (got ${r.json?.data?.waitlist?.length})`,
  )
  assert(
    r.json.data.claimed.length === 2,
    `still 2 claimed after promote (got ${r.json?.data?.claimed?.length})`,
  )

  // 8. host marks p2 attended
  const p2Entry = r.json.data.claimed.find((c) => c.user.id === p2.id)
  r = await call(`${E}/roster/${p2Entry.id}`, {
    cookie: hostCookie,
    method: 'PATCH',
    body: { status: 'attended' },
  })
  assert(
    r.status === 200 && r.json.data.status === 'attended' && r.json.data.checked_in_at,
    `host marks attended (got ${r.json?.data?.status})`,
  )

  // 9. non-host cannot manage the roster
  r = await call(`${E}/roster/${p2Entry.id}`, {
    cookie: c2,
    method: 'PATCH',
    body: { status: 'no_show' },
  })
  assert(r.status === 403, `non-host PATCH → 403 (got ${r.status})`)

  console.log('\nAll roster assertions passed ✓')
} finally {
  await prisma.interactionEvent.deleteMany({ where: { eventId: created.eventId } }).catch(() => {})
  await prisma.event.deleteMany({ where: { organizerId: { in: created.userIds } } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => {})
  if (created.categoryId)
    await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => {})
  await prisma.$disconnect()
}
