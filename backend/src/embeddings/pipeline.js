import { PrismaClient } from '@prisma/client'
import {
  composeEventText,
  computeContentHash,
  generateEmbedding,
  MODEL,
  VECTOR_DIM,
} from './embed.js'

const prisma = new PrismaClient()

export async function embedEvent(eventId, { force = false } = {}) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      category: true,
      tags: true,
      sportsDetail: true,
    },
  })

  if (!event) {
    return { skipped: true, reason: 'event_not_found' }
  }

  const composedText = composeEventText(event)
  const contentHash = computeContentHash(composedText)

  if (!force) {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT content_hash, vector_version FROM event_embeddings WHERE event_id = $1::uuid`,
      eventId,
    )

    if (existing.length > 0 && existing[0].content_hash === contentHash) {
      return { skipped: true, reason: 'hash_unchanged', eventId }
    }
  }

  const startMs = Date.now()
  const vector = await generateEmbedding(composedText)
  const latencyMs = Date.now() - startMs

  const vectorLiteral = `[${vector.join(',')}]`

  const currentVersion = await prisma.$queryRawUnsafe(
    `SELECT vector_version FROM event_embeddings WHERE event_id = $1::uuid`,
    eventId,
  )
  const nextVersion = currentVersion.length > 0 ? currentVersion[0].vector_version + 1 : 1

  await prisma.$executeRawUnsafe(
    `INSERT INTO event_embeddings (event_id, embedding, model, content_hash, vector_version, updated_at)
     VALUES ($1::uuid, $2::vector, $3, $4, $5, NOW())
     ON CONFLICT (event_id)
     DO UPDATE SET embedding = $2::vector, model = $3, content_hash = $4, vector_version = $5, updated_at = NOW()`,
    eventId,
    vectorLiteral,
    MODEL,
    contentHash,
    nextVersion,
  )

  await prisma.aiGenerationLog.create({
    data: {
      type: 'event_embedding',
      eventId,
      model: MODEL,
      prompt: composedText,
      output: { dim: VECTOR_DIM, vector_version: nextVersion },
      tokensUsed: composedText.split(/\s+/).length,
      latencyMs,
    },
  })

  return { embedded: true, eventId, vectorVersion: nextVersion, latencyMs }
}

export async function embedPendingEvents() {
  const events = await prisma.$queryRawUnsafe(
    `SELECT e.id FROM events e
     LEFT JOIN event_embeddings ee ON ee.event_id = e.id
     WHERE e.status = 'published' AND ee.event_id IS NULL
     ORDER BY e.published_at DESC NULLS LAST
     LIMIT 50`,
  )

  const results = []
  for (const { id } of events) {
    const result = await embedEvent(id)
    results.push(result)
  }

  return { processed: results.length, results }
}

export async function rebuildEmbeddings({ eventIds, force = false } = {}) {
  let ids

  if (eventIds?.length) {
    ids = eventIds
  } else {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id FROM events WHERE status = 'published' ORDER BY published_at DESC NULLS LAST`,
    )
    ids = rows.map((r) => r.id)
  }

  const results = []
  for (const id of ids) {
    const result = await embedEvent(id, { force })
    results.push(result)
  }

  const embedded = results.filter((r) => r.embedded).length
  const skipped = results.filter((r) => r.skipped).length

  return { total: ids.length, embedded, skipped, results }
}
