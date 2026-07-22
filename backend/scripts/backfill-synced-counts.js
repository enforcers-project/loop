/**
 * One-shot backfill: seed plausible mock RSVP + save counts on synced
 * (Ticketmaster / SeatGeek) events that were inserted before the sync path
 * started seeding counts on create. Only touches rows where BOTH counts are
 * still 0, so an event that has since accumulated real RSVPs is left alone.
 *
 * Run:
 *   node --env-file=.env backend/scripts/backfill-synced-counts.js
 *
 * Native (organizer-created) events keep the schema default of 0 — a brand-new
 * event should legitimately start at 0 going.
 */
import { PrismaClient } from '@prisma/client'
import { mockSocialCounts } from '../src/sync/mock-counts.js'

const prisma = new PrismaClient()

async function main() {
  console.log('== Loop synced-event counts backfill ==')

  const rows = await prisma.event.findMany({
    where: {
      source: { in: ['ticketmaster', 'seatgeek'] },
      rsvpCount: 0,
      saveCount: 0,
    },
    select: { id: true, source: true, externalId: true, isFree: true },
  })

  console.log(`Found ${rows.length} synced events with zero counts. Seeding...`)

  let updated = 0
  const started = Date.now()

  for (const row of rows) {
    const { rsvpCount, saveCount } = mockSocialCounts({
      source: row.source,
      externalId: row.externalId,
      isFree: row.isFree,
    })
    await prisma.event.update({
      where: { id: row.id },
      data: { rsvpCount, saveCount },
    })
    updated++
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Done — seeded counts on ${updated} events in ${elapsed}s.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
