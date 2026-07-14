import prisma from '../lib/prisma.js'
import { MODEL, VECTOR_DIM } from '../embeddings/embed.js'

const DECAY_HALF_LIFE_DAYS = 30
const SEED_BLEND_THRESHOLD = 8

const REVERSAL_PAIRS = {
  unsave: 'save',
  rsvp_cancel: 'rsvp',
  unfollow: 'follow',
  release_spot: 'claim_spot',
}

function applySupersede(signals) {
  const reversalTypes = new Set(Object.keys(REVERSAL_PAIRS))
  const positiveTypes = new Map(Object.entries(REVERSAL_PAIRS).map(([r, p]) => [p, r]))

  const eventSignals = new Map()

  for (const signal of signals) {
    const key = signal.eventId || signal.targetUserId || signal.categoryId || '__global__'
    if (!eventSignals.has(key)) eventSignals.set(key, [])
    eventSignals.get(key).push(signal)
  }

  const surviving = []

  for (const [, group] of eventSignals) {
    const pending = []

    for (const signal of group) {
      if (reversalTypes.has(signal.interactionType)) {
        const originalType = REVERSAL_PAIRS[signal.interactionType]
        const idx = pending.findIndex((s) => s.interactionType === originalType)
        if (idx !== -1) {
          pending.splice(idx, 1)
        }
      } else {
        const reversalType = positiveTypes.get(signal.interactionType)
        if (reversalType) {
          pending.push(signal)
        } else {
          pending.push(signal)
        }
      }
    }

    surviving.push(...pending)
  }

  return surviving
}

function computeDecay(signalDate, now) {
  const ageMs = now.getTime() - new Date(signalDate).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS)
}

function weightedAverageVector(vectors, weights) {
  const dim = vectors[0].length
  const result = new Float64Array(dim)
  let totalWeight = 0

  for (let i = 0; i < vectors.length; i++) {
    const w = Math.abs(weights[i])
    totalWeight += w
    for (let d = 0; d < dim; d++) {
      result[d] += vectors[i][d] * weights[i]
    }
  }

  if (totalWeight === 0) return Array.from(result)

  for (let d = 0; d < dim; d++) {
    result[d] /= totalWeight
  }

  return normalizeVector(Array.from(result))
}

function normalizeVector(vec) {
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

function blendVectors(realVector, seedVector, alpha) {
  const dim = realVector.length
  const blended = new Array(dim)
  for (let d = 0; d < dim; d++) {
    blended[d] = alpha * realVector[d] + (1 - alpha) * seedVector[d]
  }
  return normalizeVector(blended)
}

async function computeSeedVector(userId) {
  const userInterests = await prisma.userInterest.findMany({
    where: { userId },
    include: { interest: true },
  })

  if (userInterests.length === 0) return null

  const categoryIds = [...new Set(userInterests.map((ui) => ui.interest.categoryId))]

  const embeddings = await prisma.$queryRawUnsafe(
    `SELECT ee.embedding::text as embedding_text
     FROM event_embeddings ee
     JOIN events e ON e.id = ee.event_id
     WHERE e.category_id = ANY($1::uuid[])
     AND e.status = 'published'
     ORDER BY e.published_at DESC NULLS LAST
     LIMIT 50`,
    categoryIds,
  )

  if (embeddings.length === 0) return null

  const vectors = embeddings.map((row) => JSON.parse(row.embedding_text))
  const uniformWeights = vectors.map(() => 1)
  return weightedAverageVector(vectors, uniformWeights)
}

export async function buildUserVector(userId) {
  const now = new Date()

  const signals = await prisma.interactionEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      eventId: true,
      categoryId: true,
      targetUserId: true,
      interactionType: true,
      weight: true,
      createdAt: true,
    },
  })

  if (signals.length === 0) {
    const seedVector = await computeSeedVector(userId)
    if (!seedVector) return { skipped: true, reason: 'no_signals_no_seed', userId }

    await upsertVector(userId, seedVector, 0, now)
    await rebuildCategoryAffinities(userId, [], now)
    return { built: true, userId, signalCount: 0, source: 'seed_only' }
  }

  const surviving = applySupersede(signals)

  const decayedSignals = surviving.map((s) => ({
    ...s,
    decayedWeight: Number(s.weight) * computeDecay(s.createdAt, now),
  }))

  await rebuildCategoryAffinities(userId, decayedSignals, now)

  const eventSignals = decayedSignals.filter((s) => s.eventId)

  if (eventSignals.length === 0) {
    const seedVector = await computeSeedVector(userId)
    if (!seedVector) return { skipped: true, reason: 'no_event_signals_no_seed', userId }

    const alpha = Math.min(1, surviving.length / SEED_BLEND_THRESHOLD)
    const zeroVec = new Array(VECTOR_DIM).fill(0)
    const finalVector = blendVectors(zeroVec, seedVector, alpha)
    await upsertVector(userId, finalVector, surviving.length, now)
    return { built: true, userId, signalCount: surviving.length, source: 'seed_dominant' }
  }

  const eventIds = [...new Set(eventSignals.map((s) => s.eventId))]

  const embeddingRows = await prisma.$queryRawUnsafe(
    `SELECT event_id, embedding::text as embedding_text
     FROM event_embeddings
     WHERE event_id = ANY($1::uuid[])`,
    eventIds,
  )

  const embeddingMap = new Map(
    embeddingRows.map((row) => [row.event_id, JSON.parse(row.embedding_text)]),
  )

  const vectors = []
  const weights = []

  for (const signal of eventSignals) {
    const emb = embeddingMap.get(signal.eventId)
    if (!emb) continue
    vectors.push(emb)
    weights.push(signal.decayedWeight)
  }

  if (vectors.length === 0) {
    const seedVector = await computeSeedVector(userId)
    if (!seedVector) return { skipped: true, reason: 'no_embedded_events', userId }

    await upsertVector(userId, seedVector, surviving.length, now)
    return { built: true, userId, signalCount: surviving.length, source: 'seed_fallback' }
  }

  const realVector = weightedAverageVector(vectors, weights)

  const alpha = Math.min(1, surviving.length / SEED_BLEND_THRESHOLD)
  let finalVector

  if (alpha < 1) {
    const seedVector = await computeSeedVector(userId)
    if (seedVector) {
      finalVector = blendVectors(realVector, seedVector, alpha)
    } else {
      finalVector = realVector
    }
  } else {
    finalVector = realVector
  }

  await upsertVector(userId, finalVector, surviving.length, now)
  return { built: true, userId, signalCount: surviving.length, alpha, source: 'behavioral' }
}

async function upsertVector(userId, vector, signalCount, now) {
  const vectorLiteral = `[${vector.join(',')}]`

  const existing = await prisma.$queryRawUnsafe(
    `SELECT vector_version FROM user_preference_vectors WHERE user_id = $1::uuid`,
    userId,
  )
  const nextVersion = existing.length > 0 ? existing[0].vector_version + 1 : 1

  await prisma.$executeRawUnsafe(
    `INSERT INTO user_preference_vectors (user_id, embedding, model, vector_version, signal_count, decay_half_life_days, last_built_from, last_computed_at)
     VALUES ($1::uuid, $2::vector, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (user_id)
     DO UPDATE SET embedding = $2::vector, model = $3, vector_version = $4, signal_count = $5, decay_half_life_days = $6, last_built_from = $7, last_computed_at = $7`,
    userId,
    vectorLiteral,
    MODEL,
    nextVersion,
    signalCount,
    DECAY_HALF_LIFE_DAYS,
    now,
  )
}

async function rebuildCategoryAffinities(userId, decayedSignals, now) {
  const categoryScores = new Map()

  const signalsWithCategory = decayedSignals.filter((s) => s.categoryId)

  const signalsNeedingCategory = decayedSignals.filter((s) => s.eventId && !s.categoryId)
  if (signalsNeedingCategory.length > 0) {
    const eventIds = [...new Set(signalsNeedingCategory.map((s) => s.eventId))]
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, categoryId: true },
    })
    const eventCategoryMap = new Map(events.map((e) => [e.id, e.categoryId]))

    for (const signal of signalsNeedingCategory) {
      const catId = eventCategoryMap.get(signal.eventId)
      if (catId) {
        signalsWithCategory.push({ ...signal, categoryId: catId })
      }
    }
  }

  for (const signal of signalsWithCategory) {
    if (!signal.categoryId) continue
    if (!categoryScores.has(signal.categoryId)) {
      categoryScores.set(signal.categoryId, { score: 0, positive: 0, total: 0, lastAt: null })
    }
    const entry = categoryScores.get(signal.categoryId)
    entry.score += signal.decayedWeight
    entry.total += 1
    if (signal.decayedWeight > 0) entry.positive += 1
    const sigDate = new Date(signal.createdAt)
    if (!entry.lastAt || sigDate > entry.lastAt) entry.lastAt = sigDate
  }

  await prisma.userCategoryAffinity.deleteMany({ where: { userId } })

  const rows = []
  for (const [categoryId, data] of categoryScores) {
    if (data.score === 0 && data.total === 0) continue
    rows.push({
      userId,
      categoryId,
      score: Math.round(data.score * 10000) / 10000,
      positiveSignals: data.positive,
      impressionCount: data.total,
      lastSignalAt: data.lastAt || now,
    })
  }

  if (rows.length > 0) {
    await prisma.userCategoryAffinity.createMany({ data: rows })
  }
}

export async function rebuildAllVectors({ since } = {}) {
  let userIds

  if (since) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT user_id FROM interaction_events
       WHERE user_id IS NOT NULL AND created_at > $1
       ORDER BY user_id`,
      since,
    )
    userIds = rows.map((r) => r.user_id)
  } else {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT user_id FROM interaction_events
       WHERE user_id IS NOT NULL
       ORDER BY user_id`,
    )
    userIds = rows.map((r) => r.user_id)
  }

  if (userIds.length === 0) return { processed: 0, results: [] }

  const results = []
  for (const userId of userIds) {
    try {
      const result = await buildUserVector(userId)
      results.push(result)
    } catch (err) {
      results.push({ userId, error: err.message })
    }
  }

  const built = results.filter((r) => r.built).length
  const skipped = results.filter((r) => r.skipped).length
  const errors = results.filter((r) => r.error).length

  return { processed: userIds.length, built, skipped, errors, results }
}

export async function rebuildStaleVectors() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ie.user_id
     FROM interaction_events ie
     LEFT JOIN user_preference_vectors upv ON upv.user_id = ie.user_id
     WHERE ie.user_id IS NOT NULL
       AND (upv.last_computed_at IS NULL OR ie.created_at > upv.last_computed_at)
     ORDER BY ie.user_id
     LIMIT 100`,
  )

  const userIds = rows.map((r) => r.user_id)
  if (userIds.length === 0) return { processed: 0, results: [] }

  const results = []
  for (const userId of userIds) {
    try {
      const result = await buildUserVector(userId)
      results.push(result)
    } catch (err) {
      results.push({ userId, error: err.message })
    }
  }

  const built = results.filter((r) => r.built).length
  const skipped = results.filter((r) => r.skipped).length
  const errors = results.filter((r) => r.error).length

  return { processed: userIds.length, built, skipped, errors, results }
}
