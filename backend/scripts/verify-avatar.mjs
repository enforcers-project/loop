// Avatar endpoints verification, end-to-end over HTTP. Seeds two attendees,
// drives the presigned-upload-url + save-avatar flow, and asserts authz +
// validation. Presigning is local SigV4 (no S3 network call), so placeholder
// AWS creds are enough to exercise the full endpoint surface. Cleans up after.
//
// Prereq: DB reachable. Backend is started by this script's caller with the S3_*
// env set (see the run block at the bottom of the session). Then:
//   node --env-file=.env scripts/verify-avatar.mjs
import prisma from '../src/lib/prisma.js'
import bcrypt from 'bcryptjs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const stamp = Date.now()
const pw = 'password1234'
const BUCKET = process.env.S3_AVATAR_BUCKET
const REGION = process.env.AWS_REGION

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

const created = { userIds: [] }

try {
  const passwordHash = await bcrypt.hash(pw, 10)
  const alice = await prisma.user.create({
    data: { email: `av-alice+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  const bob = await prisma.user.create({
    data: { email: `av-bob+${stamp}@t.co`, passwordHash, role: 'attendee' },
  })
  created.userIds.push(alice.id, bob.id)

  const aliceCookie = await login(`av-alice+${stamp}@t.co`)
  const bobCookie = await login(`av-bob+${stamp}@t.co`)
  assert(aliceCookie && bobCookie, 'both users logged in')

  // 1) Presign happy path.
  const presign = await call(`/api/users/${alice.id}/avatar-upload-url`, {
    cookie: aliceCookie,
    method: 'POST',
    body: { content_type: 'image/png' },
  })
  assert(presign.status === 200, `presign returns 200 (got ${presign.status})`)
  const { upload_url, public_url, key } = presign.json.data
  assert(
    upload_url.includes(`${BUCKET}.s3.`) && upload_url.includes('X-Amz-Signature'),
    'upload_url is a signed S3 PUT URL',
  )
  assert(
    public_url === `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`,
    'public_url matches the bucket + key',
  )
  assert(key.startsWith(`avatars/${alice.id}/`), 'key is namespaced per user')

  // 2) Save happy path — persists the public URL.
  const save = await call(`/api/users/${alice.id}/avatar`, {
    cookie: aliceCookie,
    method: 'PUT',
    body: { avatar_url: public_url },
  })
  assert(save.status === 200, `save returns 200 (got ${save.status})`)
  assert(save.json.data.avatar_url === public_url, 'save echoes the new avatar_url')
  const row = await prisma.user.findUnique({ where: { id: alice.id }, select: { avatarUrl: true } })
  assert(row.avatarUrl === public_url, 'avatar_url persisted to the DB')

  // 3) Authz — Bob cannot presign or save for Alice.
  const crossPresign = await call(`/api/users/${alice.id}/avatar-upload-url`, {
    cookie: bobCookie,
    method: 'POST',
    body: { content_type: 'image/png' },
  })
  assert(crossPresign.status === 403, `cross-user presign is 403 (got ${crossPresign.status})`)
  const crossSave = await call(`/api/users/${alice.id}/avatar`, {
    cookie: bobCookie,
    method: 'PUT',
    body: { avatar_url: public_url },
  })
  assert(crossSave.status === 403, `cross-user save is 403 (got ${crossSave.status})`)

  // 4) Unauthenticated is rejected.
  const anon = await call(`/api/users/${alice.id}/avatar-upload-url`, {
    method: 'POST',
    body: { content_type: 'image/png' },
  })
  assert(anon.status === 401, `anonymous presign is 401 (got ${anon.status})`)

  // 5) Validation — bad content type.
  const badType = await call(`/api/users/${alice.id}/avatar-upload-url`, {
    cookie: aliceCookie,
    method: 'POST',
    body: { content_type: 'application/pdf' },
  })
  assert(badType.status === 422, `disallowed content_type is 422 (got ${badType.status})`)

  // 6) Validation — save with a URL outside our bucket is rejected.
  const foreign = await call(`/api/users/${alice.id}/avatar`, {
    cookie: aliceCookie,
    method: 'PUT',
    body: { avatar_url: 'https://evil.example.com/pic.png' },
  })
  assert(foreign.status === 422, `foreign avatar_url is 422 (got ${foreign.status})`)

  // 7) New signup gets the default avatar seeded.
  const signup = await call('/api/auth/signup', {
    method: 'POST',
    body: { email: `av-new+${stamp}@t.co`, password: pw },
  })
  assert(signup.status === 201, `signup returns 201 (got ${signup.status})`)
  const newUser = await prisma.user.findUnique({
    where: { email: `av-new+${stamp}@t.co` },
    select: { id: true, avatarUrl: true },
  })
  created.userIds.push(newUser.id)
  assert(
    newUser.avatarUrl === process.env.DEFAULT_AVATAR_URL,
    `new signup avatar_url === DEFAULT_AVATAR_URL (got ${newUser.avatarUrl})`,
  )

  console.log('\nALL AVATAR CHECKS PASSED')
} finally {
  // Cleanup — remove the users this run created (and their sessions).
  for (const id of created.userIds) {
    await prisma.userSession.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
}
