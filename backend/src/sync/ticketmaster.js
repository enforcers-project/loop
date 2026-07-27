import { mapTicketmasterCategory, DEFAULT_CATEGORY } from './taxonomy-map.js'

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json'

const PAGE_SIZE = 50
// Discovery API caps deep paging at (size * page) <= 1000, i.e. 20 pages at
// size 50. We never go past that even if maxPages is set higher.
const TM_MAX_PAGE = Math.floor(1000 / PAGE_SIZE)

/**
 * Fetch events from Ticketmaster Discovery API, paging until exhausted (or
 * `maxPages` is reached). Results across pages are concatenated and normalized.
 * Returns normalized event objects ready for upsert.
 */
export async function fetchTicketmasterEvents({
  city,
  lat,
  lng,
  radiusKm,
  dateFrom,
  dateTo,
  maxPages = 4,
}) {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey) {
    return { events: [], error: 'TICKETMASTER_API_KEY not configured' }
  }

  const baseParams = new URLSearchParams({
    apikey: apiKey,
    size: String(PAGE_SIZE),
    sort: 'date,asc',
  })

  if (lat && lng && radiusKm) {
    baseParams.set('latlong', `${lat},${lng}`)
    baseParams.set('radius', String(Math.round(radiusKm * 0.621371)))
    baseParams.set('unit', 'miles')
  } else if (city) {
    baseParams.set('city', city)
  }

  // TM's Discovery API demands YYYY-MM-DDTHH:mm:ssZ with NO milliseconds
  // (error DIS1015 otherwise), so strip the fractional-seconds segment that
  // toISOString() always emits — not just the ".000" special case.
  if (dateFrom) baseParams.set('startDateTime', tmDate(dateFrom))
  if (dateTo) baseParams.set('endDateTime', tmDate(dateTo))

  const events = []
  const pageCap = Math.min(maxPages, TM_MAX_PAGE)
  let error = null

  for (let page = 0; page < pageCap; page++) {
    const params = new URLSearchParams(baseParams)
    params.set('page', String(page))

    const res = await fetch(`${TM_BASE}?${params.toString()}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Keep whatever we already gathered; report the page that failed.
      error = `Ticketmaster API ${res.status} on page ${page}: ${text.slice(0, 200)}`
      break
    }

    const data = await res.json()
    const raw = data._embedded?.events || []
    for (const e of raw) {
      const transformed = transformTicketmasterEvent(e)
      if (transformed) events.push(transformed)
    }

    // Stop once we've consumed the last page the API reports (or a short page).
    const totalPages = data.page?.totalPages ?? 1
    if (raw.length < PAGE_SIZE || page + 1 >= totalPages) break
  }

  return { events, error }
}

// ISO-8601 without milliseconds, e.g. 2020-08-01T14:00:00Z — the only format
// Ticketmaster's date params accept.
function tmDate(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z')
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
