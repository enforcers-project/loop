import { mapSeatgeekCategory, DEFAULT_CATEGORY } from './taxonomy-map.js'

const SG_BASE = 'https://api.seatgeek.com/2/events'

/**
 * Fetch events from SeatGeek API.
 * Returns normalized event objects ready for upsert.
 */
export async function fetchSeatgeekEvents({ city, lat, lng, radiusKm, dateFrom, dateTo }) {
  const clientId = process.env.SEATGEEK_CLIENT_ID
  if (!clientId) {
    return { events: [], error: 'SEATGEEK_CLIENT_ID not configured' }
  }

  const params = new URLSearchParams({
    client_id: clientId,
    per_page: '50',
    sort: 'datetime_local.asc',
  })

  if (process.env.SEATGEEK_CLIENT_SECRET) {
    params.set('client_secret', process.env.SEATGEEK_CLIENT_SECRET)
  }

  if (lat && lng && radiusKm) {
    params.set('lat', String(lat))
    params.set('lon', String(lng))
    params.set('range', `${radiusKm}km`)
  } else if (city) {
    params.set('venue.city', city)
  }

  if (dateFrom) params.set('datetime_local.gte', new Date(dateFrom).toISOString().slice(0, 19))
  if (dateTo) params.set('datetime_local.lte', new Date(dateTo).toISOString().slice(0, 19))

  const url = `${SG_BASE}?${params.toString()}`
  const res = await fetch(url)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { events: [], error: `SeatGeek API ${res.status}: ${text.slice(0, 200)}` }
  }

  const data = await res.json()
  const raw = data.events || []

  const events = raw.map((e) => transformSeatgeekEvent(e)).filter(Boolean)
  return { events, error: null }
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
