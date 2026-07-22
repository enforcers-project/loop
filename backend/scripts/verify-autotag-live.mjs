// End-to-end verification for the auto-tagger against a live backend.
// Creates a real organizer + category, POSTs an event, then reads the event
// tags via the DB (source-of-truth) to confirm AI/system tags actually got
// written. Also exercises the PATCH re-tag path (text change → new tags) and
// the preview endpoint.
//
// Prereq: DB up, backend running on $BASE_URL (default http://localhost:3000).
// Run:
//   node --env-file=.env backend/scripts/verify-autotag-live.mjs

import prisma from '../src/lib/prisma.js'
import bcrypt from 'bcryptjs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const stamp = Date.now()
const pw = 'password1234'

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
    throw new Error(msg)
  }
  console.log('OK', msg)
}

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

const created = { userIds: [], categoryId: null, eventId: null }

try {
  // === 1. Preview endpoint (no auth needed, no DB write) ==============
  console.log('\n== POST /api/ai/autotag (preview) ==')
  {
    const r = await call('/api/ai/autotag', {
      method: 'POST',
      body: {
        title: 'Rooftop Afrobeats & Amapiano Night',
        description: 'Skyline views, live percussion, DJ set. Dress to impress. 21+.',
        is_free: false,
        price_min: 25,
      },
    })
    assert(r.status === 200, `preview status 200 (got ${r.status})`)
    const slugs = r.json.data.interests.map((i) => i.slug)
    assert(slugs.includes('afrobeats'), 'preview returns afrobeats interest')
    assert(slugs.includes('rooftop'), 'preview returns rooftop interest')
    assert(
      r.json.data.vibe?.slug === 'upscale',
      `preview vibe = upscale (got ${r.json.data.vibe?.slug})`,
    )
    assert(
      r.json.data.price_tier === '$$',
      `preview price_tier = $$ (got ${r.json.data.price_tier})`,
    )
  }

  // Empty body → 400
  {
    const r = await call('/api/ai/autotag', { method: 'POST', body: {} })
    assert(r.status === 400, `preview empty body → 400 (got ${r.status})`)
  }

  // === 2. Seed a category + organizer directly in the DB ===============
  console.log('\n== Setup ==')
  const category = await prisma.category.create({
    data: {
      slug: `autotag-test-${stamp}`,
      name: 'Autotag Test',
      colorHex: '#6D5EFC',
      icon: 'music',
      sortOrder: 999,
    },
  })
  created.categoryId = category.id
  console.log('  created category', category.slug)

  const passwordHash = await bcrypt.hash(pw, 10)
  const organizer = await prisma.user.create({
    data: {
      email: `autotag+${stamp}@t.co`,
      passwordHash,
      role: 'organizer',
    },
  })
  created.userIds.push(organizer.id)
  const cookie = await login(organizer.email)
  console.log('  logged in organizer')

  // === 3. POST /api/events — auto-tags on create =======================
  console.log('\n== POST /api/events (auto-tag on create) ==')
  const baseBody = {
    title: 'Rooftop Afrobeats & Amapiano Night',
    category_id: category.id,
    starts_at: '2026-09-01T22:00:00Z',
    timezone: 'America/Los_Angeles',
    city: 'Oakland',
    description:
      'Skyline views, Amapiano and Afrobeats all night. Dress to impress. Live percussion.',
    price_min: 25,
    is_free: false,
  }
  const create = await call('/api/events', {
    cookie,
    method: 'POST',
    body: baseBody,
  })
  assert(create.status === 201, `create status 201 (got ${create.status})`)
  const eventId = create.json.data.id
  created.eventId = eventId

  // Read the AI tags directly from the DB (source of truth). Bypassing the
  // API here on purpose — a serializer bug shouldn't hide a tag-write bug.
  const tagsAfterCreate = await prisma.eventTag.findMany({
    where: { eventId },
    orderBy: { slug: 'asc' },
  })
  const bySlug = Object.fromEntries(tagsAfterCreate.map((t) => [t.slug, t]))
  console.log('  tags written:', tagsAfterCreate.map((t) => `${t.slug}(${t.source})`).join(', '))

  assert(bySlug['afrobeats'], 'afrobeats tag written on create')
  assert(bySlug['afrobeats']?.source === 'ai', 'afrobeats tag source = ai')
  assert(bySlug['afrobeats']?.confidence != null, 'afrobeats tag has confidence score')
  assert(bySlug['rooftop'], 'rooftop tag written on create')
  assert(bySlug['vibe:upscale'], 'vibe:upscale tag written on create')
  assert(bySlug['tier:$$'], 'tier:$$ tag written on create')
  assert(bySlug['tier:$$']?.source === 'system', 'tier tag source = system (not ai)')

  // === 4. PATCH — re-tag when title + description change ===============
  // Change BOTH so the tagger has no residual keywords to hit. If only the
  // description changed, tags matching the original title would (correctly)
  // still fire — the tagger reads title + description, not one or the other.
  console.log('\n== PATCH /api/events/:id (re-tag on text change) ==')
  const patch = await call(`/api/events/${eventId}`, {
    cookie,
    method: 'PATCH',
    body: {
      title: 'Bottomless Brunch & Beats',
      description:
        'Two hours of bottomless mimosas, a live sax player and a menu of brunch classics. 21+.',
      is_free: true,
      price_min: null,
    },
  })
  assert(patch.status === 200, `patch status 200 (got ${patch.status})`)

  const tagsAfterPatch = await prisma.eventTag.findMany({
    where: { eventId },
    orderBy: { slug: 'asc' },
  })
  const patchBySlug = Object.fromEntries(tagsAfterPatch.map((t) => [t.slug, t]))
  console.log('  tags after patch:', tagsAfterPatch.map((t) => `${t.slug}(${t.source})`).join(', '))

  assert(!patchBySlug['afrobeats'], 'stale afrobeats tag removed after full text change')
  assert(!patchBySlug['rooftop'], 'stale rooftop tag removed after full text change')
  assert(patchBySlug['brunch'], 'brunch tag added from new description')
  assert(patchBySlug['tier:free'], 'tier:free tag written after is_free flip')
  assert(!patchBySlug['tier:$$'], 'stale tier:$$ tag cleared')

  // === 5. PATCH that doesn't touch title/description → no retag ========
  console.log('\n== PATCH unrelated field (no retag) ==')
  const beforeUnrelated = await prisma.eventTag.findMany({
    where: { eventId },
    select: { id: true, slug: true, createdAt: true },
    orderBy: { slug: 'asc' },
  })
  const patch2 = await call(`/api/events/${eventId}`, {
    cookie,
    method: 'PATCH',
    body: { venue_name: 'Some Different Venue' },
  })
  assert(patch2.status === 200, `unrelated patch status 200 (got ${patch2.status})`)
  const afterUnrelated = await prisma.eventTag.findMany({
    where: { eventId },
    select: { id: true, slug: true, createdAt: true },
    orderBy: { slug: 'asc' },
  })
  assert(
    beforeUnrelated.length === afterUnrelated.length &&
      beforeUnrelated.every((t, i) => t.id === afterUnrelated[i].id),
    'unrelated patch did NOT re-tag (same row ids after)',
  )

  // === 6. Preserve organizer-typed tags across re-tag ==================
  console.log('\n== PATCH preserves organizer tags ==')
  await prisma.eventTag.create({
    data: {
      eventId,
      slug: 'organizer-picked',
      label: 'Organizer Picked',
      source: 'organizer',
      confidence: null,
    },
  })
  await call(`/api/events/${eventId}`, {
    cookie,
    method: 'PATCH',
    body: {
      title: 'Sunday Pickup Soccer 7v7',
      description: 'Casual 7v7 run every Sunday morning. All skill levels welcome. Free.',
      is_free: true,
    },
  })
  const finalTags = await prisma.eventTag.findMany({ where: { eventId } })
  const finalBySlug = Object.fromEntries(finalTags.map((t) => [t.slug, t]))
  console.log('  final tags:', finalTags.map((t) => `${t.slug}(${t.source})`).join(', '))
  assert(finalBySlug['organizer-picked'], 'organizer-typed tag survived the retag')
  assert(finalBySlug['soccer'], 'new soccer tag added after third change')
  assert(!finalBySlug['brunch'], 'stale brunch tag cleared after third change')

  console.log('\n✓ All auto-tag verifications passed.')
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  // === Cleanup ==========================================================
  console.log('\n== Cleanup ==')
  if (created.eventId) {
    await prisma.eventTag.deleteMany({ where: { eventId: created.eventId } }).catch(() => {})
    await prisma.event.delete({ where: { id: created.eventId } }).catch(() => {})
  }
  for (const uid of created.userIds) {
    await prisma.user.delete({ where: { id: uid } }).catch(() => {})
  }
  if (created.categoryId) {
    await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => {})
  }
  await prisma.$disconnect()
  console.log('done')
}
