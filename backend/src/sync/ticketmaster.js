import { mapTicketmasterCategory, DEFAULT_CATEGORY } from './taxonomy-map.js'

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json'

/**
 * Fetch events from Ticketmaster Discovery API.
 * Returns normalized event objects ready for upsert.
 */
export async function fetchTicketmasterEvents({ city, lat, lng, radiusKm, dateFrom, dateTo }) {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey) {
    return { events: [], error: 'TICKETMASTER_API_KEY not configured' }
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    size: '50',
    sort: 'date,asc',
  })

  if (lat && lng && radiusKm) {
    params.set('latlong', `${lat},${lng}`)
    params.set('radius', String(Math.round(radiusKm * 0.621371)))
    params.set('unit', 'miles')
  } else if (city) {
    params.set('city', city)
  }

  if (dateFrom) params.set('startDateTime', new Date(dateFrom).toISOString().replace('.000Z', 'Z'))
  if (dateTo) params.set('endDateTime', new Date(dateTo).toISOString().replace('.000Z', 'Z'))

  const url = `${TM_BASE}?${params.toString()}`
  const res = await fetch(url)

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { events: [], error: `Ticketmaster API ${res.status}: ${text.slice(0, 200)}` }
  }

  const data = await res.json()
  const raw = data._embedded?.events || []

  const events = raw.map((e) => transformTicketmasterEvent(e)).filter(Boolean)
  return { events, error: null }
}

function transformTicketmasterEvent(raw) {
  const classification = raw.classifications?.[0]
  const categorySlug = mapTicketmasterCategory(classification) || DEFAULT_CATEGORY

  const venue = raw._embedded?.venues?.[0]
  const priceRange = raw.priceRanges?.[0]

  const startsAt = raw.dates?.start?.dateTime || raw.dates?.start?.localDate
  if (!startsAt) return null

  return {
    source: 'ticketmaster',
    externalId: raw.id,
    title: raw.name || 'Untitled Event',
    description: raw.info || raw.pleaseNote || null,
    flyerUrl: getBestImage(raw.images),
    categorySlug,
    status: 'published',
    externalUrl: raw.url || null,
    rawPayload: raw,
    startsAt: new Date(startsAt),
    endsAt: raw.dates?.end?.dateTime ? new Date(raw.dates.end.dateTime) : null,
    timezone: raw.dates?.timezone || null,
    venueName: venue?.name || null,
    address: venue
      ? [venue.address?.line1, venue.city?.name, venue.state?.stateCode].filter(Boolean).join(', ')
      : null,
    city: venue?.city?.name ? `${venue.city.name}, ${venue.state?.stateCode || ''}`.trim() : null,
    lat: venue?.location?.latitude ? parseFloat(venue.location.latitude) : null,
    lng: venue?.location?.longitude ? parseFloat(venue.location.longitude) : null,
    priceMin: priceRange?.min ?? null,
    priceMax: priceRange?.max ?? null,
    isFree: priceRange ? priceRange.min === 0 && priceRange.max === 0 : false,
    currency: priceRange?.currency || 'USD',
    capacity: null,
    ageMin: raw.ageRestrictions?.legalAgeEnforced ? 18 : null,
    ageLabel: raw.ageRestrictions?.legalAgeEnforced ? '18+' : null,
  }
}

function getBestImage(images) {
  if (!Array.isArray(images) || !images.length) return null
  const wide = images.find((i) => i.ratio === '16_9' && i.width >= 640)
  return wide?.url || images[0]?.url || null
}
