// In-memory sliding-window limiter for profanity-blocked write attempts.
//
// Called EXPLICITLY from handlers after `checkProfanity` returns 'block' —
// legit writes never touch this counter, so a chatty user isn't punished. If
// the same user racks up too many blocked attempts in a short window, the
// handler returns 429 instead of the usual 400 so they can't just spam the
// filter to probe which words leak through.
//
// Keyed by user id when authenticated, IP otherwise. In-memory is fine for a
// single-process deployment; swap for Redis when we scale out.
const WINDOW_MS = 60 * 1000
const MAX_ATTEMPTS = 5

const buckets = new Map()

/** Return the caller id used for keying the limiter. */
function keyFor(req) {
  return req.user?.id ?? req.ip ?? 'anonymous'
}

/**
 * Record a blocked attempt and return whether the caller has now exceeded the
 * limit. Returns `true` when the caller should be 429'd, `false` otherwise.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function recordProfanityBlock(req) {
  const key = keyFor(req)
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const attempts = (buckets.get(key) ?? []).filter((t) => t > cutoff)
  attempts.push(now)
  buckets.set(key, attempts)
  return attempts.length > MAX_ATTEMPTS
}

/** Best-effort cleanup: purge stale buckets every 5 minutes so the map can't
 *  grow unbounded. */
setInterval(
  () => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [key, attempts] of buckets) {
      const kept = attempts.filter((t) => t > cutoff)
      if (kept.length === 0) buckets.delete(key)
      else buckets.set(key, kept)
    }
  },
  5 * 60 * 1000,
).unref?.()

export const PROFANITY_RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a moment before trying again.'
