// JWT + auth-cookie helpers (planning §7.1, §10 Decisions).
//
// Auth is a STATELESS signed JWT carried in an HTTP-only, Secure, SameSite
// cookie — never localStorage (XSS-safe posture for mobile web). Expiry is
// encoded in the token, not persisted; `user_sessions` is the analytics/
// browsing-session row, NOT the credential store.
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me'

// Access token: short-lived, sent on every request. Refresh token: longer-
// lived, used only by POST /api/auth/refresh to mint a fresh access token.
export const ACCESS_TTL_SECONDS = 60 * 60 // 1 hour
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export const ACCESS_COOKIE = 'loop_token'
export const REFRESH_COOKIE = 'loop_refresh'

const isProd = process.env.NODE_ENV === 'production'

/** Sign an access token embedding the user id + session id. */
export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sub: userId, sid: sessionId, typ: 'access' }, JWT_SECRET, {
    expiresIn: ACCESS_TTL_SECONDS,
  })
}

/** Sign a refresh token (carries the session so refresh can keep grouping signals). */
export function signRefreshToken({ userId, sessionId }) {
  return jwt.sign({ sub: userId, sid: sessionId, typ: 'refresh' }, JWT_SECRET, {
    expiresIn: REFRESH_TTL_SECONDS,
  })
}

/** Verify + decode a token; throws on invalid/expired. */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

/** Shared cookie options — HttpOnly + Secure(prod) + SameSite=Lax. */
function cookieOpts(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  }
}

/** Set both auth cookies on the response. */
export function setAuthCookies(res, { userId, sessionId }) {
  res.cookie(ACCESS_COOKIE, signAccessToken({ userId, sessionId }), cookieOpts(ACCESS_TTL_SECONDS))
  res.cookie(
    REFRESH_COOKIE,
    signRefreshToken({ userId, sessionId }),
    cookieOpts(REFRESH_TTL_SECONDS),
  )
}

/** Clear both auth cookies (logout). */
export function clearAuthCookies(res) {
  const base = { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' }
  res.clearCookie(ACCESS_COOKIE, base)
  res.clearCookie(REFRESH_COOKIE, base)
}

/** ISO expiry timestamp for the access token, for the `session.expires_at` field. */
export function accessExpiresAt() {
  return new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString()
}
