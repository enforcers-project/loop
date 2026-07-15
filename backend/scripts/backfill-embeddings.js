/**
 * One-shot backfill: re-embed every published event with the current MODEL
 * (Cloudflare BGE), then rebuild every user preference vector so the two
 * vector spaces stay aligned.
 *
 * Run:
 *   node --env-file=.env backend/scripts/backfill-embeddings.js
 *
 * Safe to re-run — the pipeline's content_hash guard skips events whose
 * (composed_text + model) hash already matches what's stored.
 */
import { PrismaClient } from '@prisma/client'
import { rebuildEmbeddings } from '../src/embeddings/pipeline.js'
import { rebuildAllVectors } from '../src/preferences/builder.js'
import { MODEL } from '../src/embeddings/embed.js'

const prisma = new PrismaClient()

async function main() {
  console.log('== Loop embeddings backfill ==')
  console.log('active MODEL:', MODEL)

  const before = await prisma.$queryRawUnsafe(`
    SELECT model, count(*)::int AS n
    FROM event_embeddings
    GROUP BY model
    ORDER BY model
  `)
  console.log('\nBefore:')
  for (const row of before) console.log(` - ${row.model}: ${row.n}`)

  const startEvents = Date.now()
  console.log('\nRe-embedding all published events (force=true) ...')
  const eventsResult = await rebuildEmbeddings({ force: true })
  const eventsMs = Date.now() - startEvents
  console.log(
    ` events: total=${eventsResult.total} embedded=${eventsResult.embedded} skipped=${eventsResult.skipped} in ${eventsMs}ms`,
  )

  const startUsers = Date.now()
  console.log('\nRebuilding user preference vectors ...')
  const usersResult = await rebuildAllVectors()
  const usersMs = Date.now() - startUsers
  console.log(
    ` users: processed=${usersResult.processed} built=${usersResult.built} skipped=${usersResult.skipped} errors=${usersResult.errors} in ${usersMs}ms`,
  )

  const after = await prisma.$queryRawUnsafe(`
    SELECT model, count(*)::int AS n
    FROM event_embeddings
    GROUP BY model
    ORDER BY model
  `)
  console.log('\nAfter:')
  for (const row of after) console.log(` - ${row.model}: ${row.n}`)

  const userModels = await prisma.$queryRawUnsafe(`
    SELECT model, count(*)::int AS n
    FROM user_preference_vectors
    GROUP BY model
    ORDER BY model
  `)
  console.log('\nUser preference vectors:')
  for (const row of userModels) console.log(` - ${row.model}: ${row.n}`)
}

main()
  .catch((err) => {
    console.error('\nBackfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
