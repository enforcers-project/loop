// Verify the follower/following contract the profile UI depends on, against a
// running server:
//   1. a brand-new user's signup response AND /me both report 0 / 0
//   2. when user B follows user A, A's follower_count and B's following_count
//      both increment (and /me reflects it) — the numbers the UI now renders
//   3. unfollow decrements both back to 0
// Cleans up both users afterward.
//
//   BASE_URL=https://loop-server-2r77.onrender.com node --env-file=.env scripts/verify-follow-counts.mjs
import prisma from '../src/lib/prisma.js'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const stamp = Date.now()

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
  const setCookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return { status: res.status, json, cookie: setCookie }
}

async function signup(tag) {
  const email = `follow-verify+${tag}-${stamp}@t.co`
  const r = await call('/api/auth/signup', {
    method: 'POST',
    body: { email, password: 'password1234', display_name: `Verify ${tag}` },
  })
  return { email, user: r.json?.data?.user, cookie: r.cookie }
}

const ids = []
let pass = 0
let fail = 0
const check = (label, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  PASS  ${label}${extra ? ' — ' + extra : ''}`)
  } else {
    fail++
    console.log(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`)
  }
}

try {
  const A = await signup('A')
  const B = await signup('B')
  ids.push(A.user?.id, B.user?.id)

  // 1) Brand-new users start at 0 / 0 — in the signup response...
  check(
    'A signup follower_count === 0',
    A.user?.follower_count === 0,
    `got ${A.user?.follower_count}`,
  )
  check(
    'A signup following_count === 0',
    A.user?.following_count === 0,
    `got ${A.user?.following_count}`,
  )

  // ...and via /me (what AppContext hydrates on refresh).
  const meA0 = await call('/api/auth/me', { cookie: A.cookie })
  check('A /me follower_count === 0', meA0.json?.data?.follower_count === 0)
  check('A /me following_count === 0', meA0.json?.data?.following_count === 0)

  // 2) B follows A.
  const follow = await call(`/api/users/${A.user.id}/follow`, { method: 'POST', cookie: B.cookie })
  check('follow returns 201', follow.status === 201, `status ${follow.status}`)
  check(
    'follow response A.follower_count === 1',
    follow.json?.data?.followee?.follower_count === 1,
    `got ${follow.json?.data?.followee?.follower_count}`,
  )

  const meA1 = await call('/api/auth/me', { cookie: A.cookie })
  check(
    'A /me follower_count === 1 after being followed',
    meA1.json?.data?.follower_count === 1,
    `got ${meA1.json?.data?.follower_count}`,
  )

  const meB1 = await call('/api/auth/me', { cookie: B.cookie })
  check(
    'B /me following_count === 1 after following',
    meB1.json?.data?.following_count === 1,
    `got ${meB1.json?.data?.following_count}`,
  )

  // 3) B unfollows A → both back to 0.
  const unfollow = await call(`/api/users/${A.user.id}/follow`, {
    method: 'DELETE',
    cookie: B.cookie,
  })
  check(
    'unfollow returns 2xx',
    unfollow.status >= 200 && unfollow.status < 300,
    `status ${unfollow.status}`,
  )

  const meA2 = await call('/api/auth/me', { cookie: A.cookie })
  const meB2 = await call('/api/auth/me', { cookie: B.cookie })
  check(
    'A /me follower_count back to 0',
    meA2.json?.data?.follower_count === 0,
    `got ${meA2.json?.data?.follower_count}`,
  )
  check(
    'B /me following_count back to 0',
    meB2.json?.data?.following_count === 0,
    `got ${meB2.json?.data?.following_count}`,
  )

  console.log(`\n=== ${pass} passed, ${fail} failed ===`)
} finally {
  for (const id of ids.filter(Boolean)) {
    await prisma.follow
      .deleteMany({ where: { OR: [{ followerId: id }, { followeeId: id }] } })
      .catch(() => {})
    await prisma.userSession.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.interactionEvent.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
}
