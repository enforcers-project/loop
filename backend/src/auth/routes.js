// Auth endpoints (planning §7.1): signup / login / logout / refresh / me.
//
// - Passwords: bcrypt-hashed into users.password_hash (never returned).
// - Sessions: a stateless JWT in an HttpOnly cookie is the credential; a
//   user_sessions row is opened at login/signup for behavior-signal grouping
//   and stamped ended_at on logout (it is NOT the credential store).
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
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
import { DEFAULT_AVATAR_URL } from '../lib/s3.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/
const BCRYPT_ROUNDS = 10

// Google Identity: the client sends an id_token (a Google-signed JWT). We verify
// it against Google's public keys — no network call to Google's API, and the
// audience MUST equal our own client id so a token minted for another app is
// rejected. One shared client; verifyIdToken fetches + caches Google's certs.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

// Thrown inside the Google OAuth transaction when a login-only request finds no
// existing account, so we roll back instead of creating one. Mapped to 404.
class NoAccountError extends Error {}

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
        // Every new account starts with the shared default silhouette (on S3);
        // the user can replace it later from their profile.
        avatarUrl: DEFAULT_AVATAR_URL,
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

// --- POST /api/auth/oauth/google ---------------------------------------------
// Body: { id_token, intent?, role?, organizer_kind?, is_host? } — role/kind/host
// apply ONLY when creating a brand-new user (ignored for returning/linked
// accounts). Verifies the Google id_token, then resolves to a user one of three
// ways:
//   1. an oauth_accounts(google, sub) row exists   → returning user, log in
//   2. no oauth row but users.email matches         → link Google to that user
//   3. neither                                      → create the user (no password)
// `intent` gates case 3: 'login' means "sign me in to an existing account", so a
// brand-new Google identity is rejected 404 NO_ACCOUNT instead of auto-creating —
// the client then steers them to Sign up. 'signup' (the default) allows creation.
// Either way it issues the SAME cookies + session as email login, and returns
// is_new so the client can route first-timers to onboarding.
router.post('/oauth/google', async (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return fail(res, 503, 'NOT_CONFIGURED', 'Google sign-in is not configured')
  }

  const { id_token, intent, role, organizer_kind, is_host } = req.body ?? {}
  if (!id_token || typeof id_token !== 'string') {
    return fail(res, 422, 'VALIDATION_ERROR', 'id_token is required')
  }
  // Default to signup semantics when the client sends no intent (back-compat).
  const isLoginOnly = intent === 'login'

  // 1) Verify the token's signature + audience with Google. Throws on a forged,
  //    expired, or wrong-audience token.
  let payload
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID,
    })
    payload = ticket.getPayload()
  } catch {
    return fail(res, 401, 'UNAUTHORIZED', 'Invalid Google token')
  }

  const providerUid = payload?.sub
  const email = payload?.email
  if (!providerUid || !email) {
    return fail(res, 401, 'UNAUTHORIZED', 'Google token missing required claims')
  }
  // Only trust a Google-verified email — an unverified one could be spoofed and
  // would let a Google account hijack an existing password account by email match.
  if (payload.email_verified === false) {
    return fail(res, 401, 'UNAUTHORIZED', 'Google email is not verified')
  }

  // Validate the new-user role knobs up front (same rules as signup), so we
  // don't create a user in a state the DB CHECKs would reject.
  const resolvedRole = role ?? 'attendee'
  if (resolvedRole !== 'attendee' && resolvedRole !== 'organizer') {
    return fail(res, 422, 'VALIDATION_ERROR', 'role must be "attendee" or "organizer"')
  }
  if (organizer_kind && resolvedRole !== 'organizer') {
    return fail(res, 422, 'VALIDATION_ERROR', 'organizer_kind is only valid for organizers')
  }
  if (organizer_kind && organizer_kind !== 'organizer' && organizer_kind !== 'promoter') {
    return fail(res, 422, 'VALIDATION_ERROR', 'organizer_kind must be "organizer" or "promoter"')
  }
  if (is_host && resolvedRole !== 'organizer') {
    return fail(res, 422, 'VALIDATION_ERROR', 'is_host is only valid for organizers')
  }

  try {
    // 2) Resolve to a user + decide whether they're new. Wrapped in a
    //    transaction so the create+link (case 3) and the link (case 2) are atomic.
    const { user, isNew } = await prisma.$transaction(async (tx) => {
      // Case 1: already linked → returning user.
      const linked = await tx.oauthAccount.findUnique({
        where: { provider_providerUid: { provider: 'google', providerUid } },
        include: { user: true },
      })
      if (linked) return { user: linked.user, isNew: false }

      // Case 2: an email account exists → link Google to it (account merge).
      const existing = await tx.user.findUnique({ where: { email } })
      if (existing) {
        await tx.oauthAccount.create({
          data: { userId: existing.id, provider: 'google', providerUid },
        })
        return { user: existing, isNew: false }
      }

      // Case 3: brand-new Google identity. In login-only mode there's nothing to
      // sign into — refuse rather than silently create, so "Log in with Google"
      // can't become a backdoor signup. The catch below maps this to 404.
      if (isLoginOnly) {
        throw new NoAccountError()
      }

      // Otherwise create the user. password_hash stays null (social-only account);
      // seed profile fields from the Google payload where we have them.
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: null,
          role: resolvedRole,
          organizerKind: resolvedRole === 'organizer' ? (organizer_kind ?? null) : null,
          isHost: resolvedRole === 'organizer' ? !!is_host : false,
          displayName: payload.name ?? null,
          // Prefer the Google profile photo; fall back to our default silhouette.
          avatarUrl: payload.picture ?? DEFAULT_AVATAR_URL,
          isVerified: true, // Google-verified email
          oauthAccounts: {
            create: { provider: 'google', providerUid },
          },
        },
      })
      return { user: created, isNew: true }
    })

    const sessionId = await openSession(user.id, req)
    setAuthCookies(res, { userId: user.id, sessionId })
    return res.status(isNew ? 201 : 200).json({
      data: {
        user: toAuthUser(user),
        session: { expires_at: accessExpiresAt() },
        is_new: isNew,
      },
    })
  } catch (err) {
    // Login-only mode with no matching account: tell the client to sign up.
    if (err instanceof NoAccountError) {
      return fail(res, 404, 'NO_ACCOUNT', 'No Loop account found. Sign up to get started.')
    }
    // A concurrent first-login for the same account can collide on the unique
    // (provider, provider_uid) / email index — surface as a retryable conflict.
    if (err.code === 'P2002') {
      return fail(res, 409, 'CONFLICT', 'Account already exists; please try again')
    }
    console.error('POST /api/auth/oauth/google error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not sign in with Google')
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
