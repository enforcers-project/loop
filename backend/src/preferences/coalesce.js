import { buildUserVector } from './builder.js'

// Per-user rebuild coalescer. Guarantees at most 2 rebuilds in flight per user
// (one running, one queued) so rapid interactions can't fan out unbounded work,
// while ensuring signals landing during a rebuild are still reflected.
const inFlight = new Map()

export function scheduleRebuild(userId) {
  if (!userId) return Promise.resolve(null)

  const existing = inFlight.get(userId)
  if (existing) {
    existing.queued = true
    return existing.promise
  }

  const entry = { queued: false, promise: null }
  entry.promise = run(userId, entry)
  inFlight.set(userId, entry)
  return entry.promise
}

async function run(userId, entry) {
  try {
    let result = await buildUserVector(userId)
    while (entry.queued) {
      entry.queued = false
      result = await buildUserVector(userId)
    }
    return result
  } catch (err) {
    console.error(`[preferences:coalesce] rebuild failed for user ${userId}:`, err)
    return { error: err.message, userId }
  } finally {
    inFlight.delete(userId)
  }
}
