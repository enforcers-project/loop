// Auth + session middleware (planning §7.1, §6 anonymous-session fix).
//
// attachSession — runs on every request. Resolves the caller:
//   1. If a valid access-token cookie is present, sets req.user + req.sessionId.
//   2. Otherwise, if the client sent a first-touch session id (cookie/header),
//      upserts an ANONYMOUS user_sessions row (user_id = NULL) for that id so
//      interaction_events.session_id / search_queries.session_id FKs always
//      resolve — the audit fix. req.user stays null.
//
// requireAuth — gate for protected routes; 401s when req.user is absent.
// requireRole / requireHost — capability gates layered on top.
import prisma from '../lib/prisma.js'
import { verifyToken, ACCESS_COOKIE } from './jwt.js'

const ANON_SESSION_COOKIE = 'loop_sid'
const ANON_SESSION_HEADER = 'x-session-id'

/** Standard error envelope (planning §7 Conventions). */
export function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } })
}

export async function attachSession(req, _res, next) {
  req.user = null
  req.sessionId = null

  // 1. Authenticated path — verify the access-token cookie.
  const token = req.cookies?.[ACCESS_COOKIE]
  if (token) {
    try {
      const payload = verifyToken(token)
      if (payload.typ === 'access' && payload.sub) {
        const user = await prisma.user.findUnique({ where: { id: payload.sub } })
        if (user) {
          req.user = user
          req.sessionId = payload.sid ?? null
          // Best-effort last-seen stamp; never blocks the request.
          prisma.user
            .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
            .catch(() => {})
          return next()
        }
      }
    } catch {
      // Invalid/expired token — fall through to anonymous handling.
    }
  }

  // 2. Anonymous first-touch — upsert a session row for the client-minted id so
  //    later interaction/search FKs hold. Client id must be a UUID.
  const clientSid = req.cookies?.[ANON_SESSION_COOKIE] || req.get(ANON_SESSION_HEADER)
  if (clientSid && isUuid(clientSid)) {
    try {
      await prisma.userSession.upsert({
        where: { id: clientSid },
        create: { id: clientSid, userId: null, userAgent: req.get('user-agent') ?? null },
        update: {},
      })
      req.sessionId = clientSid
    } catch {
      // Non-fatal: the request can proceed without a resolved session.
    }
  }

  next()
}

/** Gate: caller must be authenticated. */
export function requireAuth(req, res, next) {
  if (!req.user) return fail(res, 401, 'UNAUTHORIZED', 'Authentication required')
  next()
}

/** Gate: caller must have the given role (e.g. 'organizer'). */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, 'UNAUTHORIZED', 'Authentication required')
    if (req.user.role !== role) return fail(res, 403, 'FORBIDDEN', `Requires ${role} role`)
    next()
  }
}

/** Gate: caller must be an organizer flagged is_host (sports/roster capability). */
export function requireHost(req, res, next) {
  if (!req.user) return fail(res, 401, 'UNAUTHORIZED', 'Authentication required')
  if (!req.user.isHost) return fail(res, 403, 'FORBIDDEN', 'Requires host capability')
  next()
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s)
}
