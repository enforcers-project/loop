import { PrismaClient } from '@prisma/client'
import { filterDuplicates } from './dedup.js'
import { mockSocialCounts } from './mock-counts.js'

const prisma = new PrismaClient()

const REFRESH_WINDOW_HOURS = 6

/**
 * Upsert synced events into the DB.
 * - Resolves categorySlug → category_id
 * - Filters cross-provider fuzzy duplicates
 * - Upserts on UNIQUE(source, external_id)
 * - Skips rows synced within the refresh window
 *
 * Returns { inserted, updated, skippedDuplicates }
 */
export async function upsertSyncedEvents(events, source) {
  const categories = await prisma.category.findMany()
  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]))

  const otherSource = source === 'ticketmaster' ? 'seatgeek' : 'ticketmaster'
  const existingOtherSource = await prisma.event.findMany({
    where: { source: otherSource },
    select: { title: true, startsAt: true, city: true },
  })

  const deduped = filterDuplicates(events, existingOtherSource)
  const skippedDuplicates = events.length - deduped.length

  let inserted = 0
  let updated = 0

  for (const evt of deduped) {
    const categoryId = catBySlug[evt.categorySlug] || catBySlug['music']
    if (!categoryId) continue

    const existing = await prisma.event.findUnique({
      where: { source_externalId: { source: evt.source, externalId: evt.externalId } },
      select: { id: true, lastSyncedAt: true },
    })

    if (existing?.lastSyncedAt) {
      const hoursSinceSync = (Date.now() - existing.lastSyncedAt.getTime()) / (1000 * 60 * 60)
      if (hoursSinceSync < REFRESH_WINDOW_HOURS) {
        skippedDuplicates
        continue
      }
    }

    const data = {
      title: evt.title,
      description: evt.description,
      flyerUrl: evt.flyerUrl,
      categoryId,
      status: evt.status,
      source: evt.source,
      externalId: evt.externalId,
      externalUrl: evt.externalUrl,
      rawPayload: evt.rawPayload,
      lastSyncedAt: new Date(),
      startsAt: evt.startsAt,
      endsAt: evt.endsAt,
      timezone: evt.timezone,
      venueName: evt.venueName,
      address: evt.address,
      city: evt.city,
      lat: evt.lat,
      lng: evt.lng,
      priceMin: evt.priceMin,
      priceMax: evt.priceMax,
      isFree: evt.isFree,
      currency: evt.currency,
      capacity: evt.capacity,
      ageMin: evt.ageMin,
      ageLabel: evt.ageLabel,
      publishedAt: new Date(),
    }

    // Seed a plausible RSVP+save count on FIRST insert so synced cards don't
    // read as "0 going" in the feed. Update path skips this so accumulated
    // real RSVPs on top of the seed aren't clobbered by a later refresh.
    const mockCounts = mockSocialCounts({
      source: evt.source,
      externalId: evt.externalId,
      isFree: evt.isFree,
    })

    await prisma.event.upsert({
      where: { source_externalId: { source: evt.source, externalId: evt.externalId } },
      update: { ...data, lastSyncedAt: new Date() },
      create: { ...data, rsvpCount: mockCounts.rsvpCount, saveCount: mockCounts.saveCount },
    })

    if (existing) {
      updated++
    } else {
      inserted++
    }
  }

  return { inserted, updated, skippedDuplicates }
}

/**
 * Get sync status across all sources.
 */
export async function getSyncStatus() {
  const staleThreshold = new Date(Date.now() - REFRESH_WINDOW_HOURS * 60 * 60 * 1000)

  const sources = ['native', 'ticketmaster', 'seatgeek']
  const results = []

  for (const source of sources) {
    const [eventCount, staleCount, latest] = await Promise.all([
      prisma.event.count({ where: { source } }),
      prisma.event.count({
        where: {
          source,
          OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleThreshold } }],
        },
      }),
      prisma.event.findFirst({
        where: { source },
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      }),
    ])

    results.push({
      source,
      lastSyncedAt: latest?.lastSyncedAt || null,
      eventCount,
      staleCount,
    })
  }

  return results
}
