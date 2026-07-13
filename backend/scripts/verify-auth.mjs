// Sprint 1 #6 verification — runs the full auth flow against a live server.
// Prereqs: DB up (docker compose up -d), migrations applied (prisma migrate dev),
// and the backend running (npm run dev). Then: node scripts/verify-auth.mjs
//
// Exercises: signup → cookie set (HttpOnly) → /me → logout → /me 401 → login →
// refresh. Exits non-zero on the first failed assertion.
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const email = `verify+${Date.now()}@loop.test`
const password = 'password1234'

let cookies = ''
function stash(res) {
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) cookies = set.map((c) => c.split(';')[0]).join('; ')
  return set
}
async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', cookie: cookies, ...(opts.headers || {}) },
  })
  return res
}
function assert(cond, msg) {
  if (!cond) {
    console.error('✗ FAIL:', msg)
    process.exit(1)
  }
  console.log('✓', msg)
}

// 1. signup
let res = await call('/api/auth/signup', {
  method: 'POST',
  body: JSON.stringify({ email, password, role: 'organizer', organizer_kind: 'promoter' }),
})
assert(res.status === 201, `signup → 201 (got ${res.status})`)
const setCookies = stash(res)
assert(
  setCookies.some((c) => c.includes('loop_token') && /HttpOnly/i.test(c)),
  'signup sets HttpOnly loop_token cookie',
)
const signupBody = await res.json()
assert(signupBody.data.user.organizer_kind === 'promoter', 'organizer_kind persisted')

// 2. /me
res = await call('/api/auth/me')
assert(res.status === 200, `me (authed) → 200 (got ${res.status})`)
const me = (await res.json()).data
assert(me.email.toLowerCase() === email.toLowerCase(), 'me returns the SelfUser email')

// 3. refresh
res = await call('/api/auth/refresh', { method: 'POST' })
assert(res.status === 200, `refresh → 200 (got ${res.status})`)
stash(res)

// 4. logout
res = await call('/api/auth/logout', { method: 'POST' })
assert(res.status === 204, `logout → 204 (got ${res.status})`)
cookies = '' // cookies cleared client-side

// 5. /me after logout
res = await call('/api/auth/me')
assert(res.status === 401, `me (logged out) → 401 (got ${res.status})`)

// 6. login
res = await call('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
assert(res.status === 200, `login → 200 (got ${res.status})`)
stash(res)

// 7. bad password
res = await call('/api/auth/login', {
  method: 'POST',
  headers: { cookie: '' },
  body: JSON.stringify({ email, password: 'wrongpass123' }),
})
assert(res.status === 401, `login (bad password) → 401 (got ${res.status})`)

console.log('\nAll auth-flow assertions passed ✓')
