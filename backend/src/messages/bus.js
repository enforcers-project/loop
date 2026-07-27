// In-memory pub/sub for realtime message fan-out. One EventEmitter per Node
// process, keyed by user id. Any SSE stream (`GET /api/messages/stream`)
// subscribes for req.user.id; every message/typing/read handler publishes to
// the participant ids of the affected thread.
//
// Single-process by design — demo scale runs on one Render dyno. If we ever
// horizontally scale, swap this file for a Redis pub/sub client with the same
// two-function surface.
import { EventEmitter } from 'node:events'

const emitter = new EventEmitter()
// Default 10 listeners per event is enough for a user with a few tabs open;
// beyond that we return an error rather than balloon memory silently.
emitter.setMaxListeners(20)

const MAX_LISTENERS_PER_USER = 10
const listenerCounts = new Map()

function bump(userId, delta) {
  const next = (listenerCounts.get(userId) ?? 0) + delta
  if (next <= 0) listenerCounts.delete(userId)
  else listenerCounts.set(userId, next)
  return next
}

/**
 * Subscribe `listener` to events for `userId`. Returns an unsubscribe fn.
 * Refuses to add a subscription past MAX_LISTENERS_PER_USER — caller should
 * treat that as "you already have enough tabs open, retry later" and close
 * the stream.
 */
export function subscribe(userId, listener) {
  if (!userId || typeof listener !== 'function') return () => {}
  const current = listenerCounts.get(userId) ?? 0
  if (current >= MAX_LISTENERS_PER_USER) {
    return null
  }
  emitter.on(userId, listener)
  bump(userId, 1)
  return () => {
    emitter.off(userId, listener)
    bump(userId, -1)
  }
}

/**
 * Fan `payload` out to every listener for each of `userIds`. Duplicate ids are
 * de-duped so a self-emit ({sender, recipient} where sender=recipient) fires
 * once, not twice.
 */
export function publish(userIds, payload) {
  if (!Array.isArray(userIds) || !payload) return
  const seen = new Set()
  for (const id of userIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    // setImmediate breaks the sync stack so a slow listener can't back-pressure
    // the emitter (or the current request handler).
    setImmediate(() => emitter.emit(id, payload))
  }
}
