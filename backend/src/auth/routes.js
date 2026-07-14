// Auth endpoints (planning §7.1): signup / login / logout / refresh / me.
//
// - Passwords: bcrypt-hashed into users.password_hash (never returned).
// - Sessions: a stateless JWT in an HttpOnly cookie is the credential; a
//   user_sessions row is opened at login/signup for behavior-signal grouping
//   and stamped ended_at on logout (it is NOT the credential store).
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma.js'
import { toSelfUser, toAuthUser } from './serialize.js'
import { fail, requireAuth } from './middleware.js'
import {
  setAuthCookies,
  clearAuthCookies,
  accessExpiresAt,
  verifyToken,
  REFRESH_COOKIE,
} from './jwt.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/
const BCRYPT_ROUNDS = 10

/** Open an analytics/browsing-session row for a user, return its id. */
async function openSession(userId, req) {
  const session = await prisma.userSession.create({
    data: { userId, userAgent: req.get('user-agent') ?? null },
  })
  return session.id
}

// --- POST /api/auth/signup ---------------------------------------------------
router.post('/signup', async (req, res) => {
  const { email, password, role, organizer_kind, is_host, display_name, handle } = req.body ?? {}

  if (!email || !EMAIL_RE.test(email)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'A valid email is required')
  }
  if (!password || String(password).length < 8) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Password must be at least 8 characters')
  }
  const resolvedRole = role ?? 'attendee'
  if (resolvedRole !== 'attendee' && resolvedRole !== 'organizer') {
    return fail(res, 422, 'VALIDATION_ERROR', 'role must be "attendee" or "organizer"')
  }
  // organizer_kind is only valid when role=organizer (mirrors the DB CHECK).
  if (organizer_kind && resolvedRole !== 'organizer') {
    return fail(res, 422, 'VALIDATION_ERROR', 'organizer_kind is only valid for organizers')
  }
  if (organizer_kind && organizer_kind !== 'organizer' && organizer_kind !== 'promoter') {
    return fail(res, 422, 'VALIDATION_ERROR', 'organizer_kind must be "organizer" or "promoter"')
  }
  // Hosting pickup runs is an organizer-only capability (planning §3/§10).
  if (is_host && resolvedRole !== 'organizer') {
    return fail(res, 422, 'VALIDATION_ERROR', 'is_host is only valid for organizers')
  }
  if (handle && !HANDLE_RE.test(handle)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'handle must be 3–30 chars (letters, numbers, _)')
  }

  try {
    const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: resolvedRole,
        organizerKind: resolvedRole === 'organizer' ? (organizer_kind ?? null) : null,
        isHost: resolvedRole === 'organizer' ? !!is_host : false,
        displayName: display_name ?? null,
        handle: handle ?? null,
      },
    })

    const sessionId = await openSession(user.id, req)
    setAuthCookies(res, { userId: user.id, sessionId })
    return res.status(201).json({
      data: { user: toAuthUser(user), session: { expires_at: accessExpiresAt() } },
    })
  } catch (err) {
    if (err.code === 'P2002') {
      const target = err.meta?.target?.join?.(', ') ?? 'email or handle'
      return fail(res, 409, 'CONFLICT', `That ${target} is already taken`)
    }
    console.error('POST /api/auth/signup error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not create account')
  }
})

// --- POST /api/auth/login ----------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Email and password are required')
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    // Constant-ish response: same error whether the email or password is wrong.
    const okPassword = user?.passwordHash
      ? await bcrypt.compare(String(password), user.passwordHash)
      : false
    if (!user || !okPassword) {
      return fail(res, 401, 'UNAUTHORIZED', 'Invalid email or password')
    }

    const sessionId = await openSession(user.id, req)
    setAuthCookies(res, { userId: user.id, sessionId })
    return res.json({
      data: { user: toAuthUser(user), session: { expires_at: accessExpiresAt() } },
    })
  } catch (err) {
    console.error('POST /api/auth/login error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not log in')
  }
})

// --- POST /api/auth/logout ---------------------------------------------------
router.post('/logout', requireAuth, async (req, res) => {
  // Stamp the analytics session closed (best-effort) and clear cookies.
  if (req.sessionId) {
    await prisma.userSession
      .update({ where: { id: req.sessionId }, data: { endedAt: new Date() } })
      .catch(() => {})
  }
  clearAuthCookies(res)
  return res.status(204).end()
})

// --- POST /api/auth/refresh --------------------------------------------------
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) return fail(res, 401, 'UNAUTHORIZED', 'No refresh token')

  try {
    const payload = verifyToken(token)
    if (payload.typ !== 'refresh' || !payload.sub) {
      return fail(res, 401, 'UNAUTHORIZED', 'Invalid refresh token')
    }
    // Confirm the user still exists before re-issuing.
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return fail(res, 401, 'UNAUTHORIZED', 'Invalid refresh token')

    // Rotate both cookies, preserving the browsing session for signal grouping.
    setAuthCookies(res, { userId: user.id, sessionId: payload.sid ?? null })
    return res.json({ data: { session: { expires_at: accessExpiresAt() } } })
  } catch {
    return fail(res, 401, 'UNAUTHORIZED', 'Invalid or expired refresh token')
  }
})

// --- GET /api/auth/me --------------------------------------------------------
router.get('/me', requireAuth, (req, res) => {
  return res.json({ data: toSelfUser(req.user) })
})

export default router
