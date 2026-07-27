import { mapSeatgeekCategory, DEFAULT_CATEGORY } from './taxonomy-map.js'

const SG_BASE = 'https://api.seatgeek.com/2/events'

const PAGE_SIZE = 50

/**
 * Fetch events from SeatGeek API, paging until exhausted (or `maxPages` is
 * reached). Results across pages are concatenated and normalized.
 * Returns normalized event objects ready for upsert.
 */
export async function fetchSeatgeekEvents({
  city,
  lat,
  lng,
  radiusKm,
  dateFrom,
  dateTo,
  maxPages = 4,
}) {
  const clientId = process.env.SEATGEEK_CLIENT_ID
  if (!clientId) {
    return { events: [], error: 'SEATGEEK_CLIENT_ID not configured' }
  }

  const baseParams = new URLSearchParams({
    client_id: clientId,
    per_page: String(PAGE_SIZE),
    sort: 'datetime_local.asc',
  })

  if (process.env.SEATGEEK_CLIENT_SECRET) {
    baseParams.set('client_secret', process.env.SEATGEEK_CLIENT_SECRET)
  }

  if (lat && lng && radiusKm) {
    baseParams.set('lat', String(lat))
    baseParams.set('lon', String(lng))
    baseParams.set('range', `${radiusKm}km`)
  } else if (city) {
    baseParams.set('venue.city', city)
  }

  if (dateFrom) baseParams.set('datetime_local.gte', new Date(dateFrom).toISOString().slice(0, 19))
  if (dateTo) baseParams.set('datetime_local.lte', new Date(dateTo).toISOString().slice(0, 19))

  const events = []
  let error = null

  // SeatGeek pages are 1-indexed.
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams(baseParams)
    params.set('page', String(page))

    const res = await fetch(`${SG_BASE}?${params.toString()}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      error = `SeatGeek API ${res.status} on page ${page}: ${text.slice(0, 200)}`
      break
    }

    const data = await res.json()
    const raw = data.events || []
    for (const e of raw) {
      const transformed = transformSeatgeekEvent(e)
      if (transformed) events.push(transformed)
    }

    // meta.total tells us the full result size; stop once we've fetched it all
    // (or the API returned a short page).
    const total = data.meta?.total ?? raw.length
    if (raw.length < PAGE_SIZE || page * PAGE_SIZE >= total) break
  }

  return { events, error }
}

function transformSeatgeekEvent(raw) {
  const categorySlug = mapSeatgeekCategory(raw.taxonomies) || DEFAULT_CATEGORY
  const venue = raw.venue

  if (!raw.datetime_local) return null

  const lowestPrice = raw.stats?.lowest_price
  const highestPrice = raw.stats?.highest_price

  return {
    source: 'seatgeek',
    externalId: String(raw.id),
    title: raw.title || raw.short_title || 'Untitled Event',
    description: raw.description || null,
    flyerUrl: raw.performers?.[0]?.image || null,
    categorySlug,
    status: 'published',
    externalUrl: raw.url || null,
    rawPayload: raw,
    startsAt: new Date(raw.datetime_local),
    endsAt:
      raw.datetime_local !== raw.datetime_utc && raw.enddatetime_utc
        ? new Date(raw.enddatetime_utc)
        : null,
    timezone: raw.venue?.timezone || null,
    venueName: venue?.name || null,
    address: venue?.address || null,
    city: venue?.city ? `${venue.city}, ${venue.state || ''}`.trim() : null,
    lat: venue?.location?.lat ?? null,
    lng: venue?.location?.lon ?? null,
    priceMin: lowestPrice ?? null,
    priceMax: highestPrice ?? null,
    isFree: lowestPrice === 0 && highestPrice === 0,
    currency: 'USD',
    capacity: venue?.capacity || null,
    ageMin: null,
    ageLabel: null,
  }
}
