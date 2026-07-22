/**
 * Post-autotag re-embed. Walks every published event and calls embedEvent()
 * with force=false — the pipeline's content_hash guard naturally re-embeds
 * only events whose composed text actually changed (which is exactly the set
 * that just got new auto-tags via backfill-autotags.js).
 *
 * Run AFTER backfill-autotags.js:
 *   node --env-file=.env backend/scripts/reembed-after-autotag.js
 *
 * Not `force: true` — that would re-embed every event and burn Cloudflare
 * calls on events whose tags didn't change. The hash guard is what makes this
 * cheap.
 */
import { PrismaClient } from '@prisma/client'
import { embedEvent } from '../src/embeddings/pipeline.js'

const prisma = new PrismaClient()

async function main() {
  console.log('== Loop post-autotag re-embed ==')

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id FROM events WHERE status = 'published' ORDER BY published_at DESC NULLS LAST`,
  )
  const total = rows.length
  console.log(`Scanning ${total} published events...`)

  let embedded = 0
  let skipped = 0
  let errors = 0
  const started = Date.now()

  for (let i = 0; i < rows.length; i++) {
    try {
      const result = await embedEvent(rows[i].id)
      if (result.embedded) embedded++
      else skipped++
    } catch (err) {
      errors++
      console.error(`  error on ${rows[i].id}:`, err.message)
    }
    if ((i + 1) % 100 === 0) {
      console.log(`  ${i + 1}/${total} — embedded=${embedded} skipped=${skipped} errors=${errors}`)
    }
  }

  const ms = Date.now() - started
  console.log(
    `\nDone in ${(ms / 1000).toFixed(1)}s — embedded=${embedded} skipped=${skipped} errors=${errors}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
