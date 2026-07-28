import prisma from '../lib/prisma.js'
import { fetchTicketmasterEvents } from './ticketmaster.js'
import { fetchSeatgeekEvents } from './seatgeek.js'
import { upsertSyncedEvents } from './upsert.js'

// How far ahead to pull. A rolling window keeps the sync focused on events
// people can actually still attend rather than paging through next year.
const WINDOW_DAYS = 90

// Cluster user homes onto a coarse grid so a dozen users in the same metro
// collapse to one sync target instead of a dozen near-identical radius queries.
// ~0.5° ≈ 55km at mid-latitudes, comfortably inside a typical search radius.
const CLUSTER_PRECISION = 0.5

// Fallback markets when there are no user home locations yet (fresh DB). Keeps
// the scheduled job productive before the first users set a home city.
const FALLBACK_MARKETS = [
  { lat: 40.7128, lng: -74.006, city: 'New York, NY', radiusKm: 40 },
  { lat: 34.0522, lng: -118.2437, city: 'Los Angeles, CA', radiusKm: 40 },
  { lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', radiusKm: 40 },
  { lat: 25.7617, lng: -80.1918, city: 'Miami, FL', radiusKm: 40 },
  { lat: 33.749, lng: -84.388, city: 'Atlanta, GA', radiusKm: 40 },
]

function clusterCoord(value) {
  return Math.round(value / CLUSTER_PRECISION) * CLUSTER_PRECISION
}

/**
 * Derive the list of markets to sync from distinct user home locations. Users
 * with coords are clustered onto a coarse grid (so one metro = one target); the
 * largest radius in each cluster wins so we don't under-cover anyone. Falls back
 * to a fixed metro list when no user has set a home location.
 *
 * Returns [{ lat, lng, city, radiusKm }].
 */
export async function deriveMarketsFromUsers() {
  const users = await prisma.user.findMany({
    where: { homeLat: { not: null }, homeLng: { not: null } },
    select: { homeLat: true, homeLng: true, homeCity: true, locationRadiusKm: true },
  })

  if (users.length === 0) return FALLBACK_MARKETS

  const clusters = new Map()
  for (const u of users) {
    const key = `${clusterCoord(u.homeLat)},${clusterCoord(u.homeLng)}`
    const existing = clusters.get(key)
    const radiusKm = u.locationRadiusKm || 40
    if (!existing) {
      clusters.set(key, {
        lat: u.homeLat,
        lng: u.homeLng,
        city: u.homeCity || null,
        radiusKm,
      })
    } else if (radiusKm > existing.radiusKm) {
      existing.radiusKm = radiusKm
    }
  }

  return [...clusters.values()]
}

/**
 * Run a full external-event sync: for each market, page both providers over a
 * rolling date window and upsert. Ticketmaster runs first so SeatGeek's
 * cross-provider dedup can match against the rows it just wrote.
 *
 * @param {object} [opts]
 * @param {Array}  [opts.markets]  — explicit market list; defaults to user-derived
 * @param {number} [opts.maxPages] — pages per provider per market (~50 events/page)
 * @param {number} [opts.windowDays]
 * @returns {Promise<object>} run summary
 */
export async function runExternalSync({ markets, maxPages = 4, windowDays = WINDOW_DAYS } = {}) {
  const targets = markets ?? (await deriveMarketsFromUsers())
  const dateFrom = new Date()
  const dateTo = new Date(dateFrom.getTime() + windowDays * 24 * 60 * 60 * 1000)

  const totals = {
    markets: targets.length,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skippedDuplicates: 0,
    skippedFresh: 0,
    errors: [],
  }

  for (const market of targets) {
    for (const provider of ['ticketmaster', 'seatgeek']) {
      const fetcher = provider === 'ticketmaster' ? fetchTicketmasterEvents : fetchSeatgeekEvents
      try {
        const { events, error } = await fetcher({
          lat: market.lat,
          lng: market.lng,
          city: market.city,
          radiusKm: market.radiusKm,
          dateFrom,
          dateTo,
          maxPages,
        })

        if (error) {
          totals.errors.push({
            provider,
            market: market.city ?? `${market.lat},${market.lng}`,
            error,
          })
        }

        if (events.length) {
          const result = await upsertSyncedEvents(events, provider)
          totals.fetched += events.length
          totals.inserted += result.inserted
          totals.updated += result.updated
          totals.skippedDuplicates += result.skippedDuplicates
          totals.skippedFresh += result.skippedFresh ?? 0
        }
      } catch (err) {
        totals.errors.push({
          provider,
          market: market.city ?? `${market.lat},${market.lng}`,
          error: err.message,
        })
      }
    }
  }

  return totals
}
