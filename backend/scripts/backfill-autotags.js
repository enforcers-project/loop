/**
 * One-shot backfill: run the rule-based auto-tagger over every existing event
 * that doesn't already have AI/system tags. Organizer-typed tags are left
 * alone. Safe to re-run — tagAndPersist() deletes the event's ai/system tags
 * before inserting fresh ones, so running twice is idempotent.
 *
 * Run:
 *   node --env-file=.env backend/scripts/backfill-autotags.js
 *
 * Rationale: the tagger is now wired into the POST/PATCH write path, but the
 * catalog was seeded before that existed. Without this backfill, seeded events
 * would silently disappear from the "user picked Afrobeats" cold-start feed
 * because their EventTag rows are empty.
 */
import { PrismaClient } from '@prisma/client'
import { tagAndPersist } from '../src/ai/autotag.persist.js'

const prisma = new PrismaClient()

async function main() {
  console.log('== Loop auto-tag backfill ==')

  const events = await prisma.event.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      isFree: true,
      priceMin: true,
    },
  })

  console.log(`Found ${events.length} events. Tagging...`)

  let tagged = 0
  let empty = 0
  const started = Date.now()

  for (const e of events) {
    const { written } = await tagAndPersist({
      eventId: e.id,
      event: {
        title: e.title,
        description: e.description,
        isFree: e.isFree,
        priceMin: e.priceMin != null ? Number(e.priceMin) : null,
      },
    })
    if (written > 0) tagged++
    else empty++
  }

  const ms = Date.now() - started
  console.log(`Done in ${ms}ms — tagged=${tagged} empty=${empty}`)

  const dist = await prisma.$queryRawUnsafe(`
    SELECT source, count(*)::int AS n
    FROM event_tags
    GROUP BY source
    ORDER BY source
  `)
  console.log('\nTag distribution by source:')
  for (const row of dist) console.log(` - ${row.source}: ${row.n}`)

  const top = await prisma.$queryRawUnsafe(`
    SELECT slug, count(*)::int AS n
    FROM event_tags
    WHERE source = 'ai'
    GROUP BY slug
    ORDER BY n DESC
    LIMIT 15
  `)
  console.log('\nTop AI-tagged interest slugs:')
  for (const row of top) console.log(` - ${row.slug}: ${row.n}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
