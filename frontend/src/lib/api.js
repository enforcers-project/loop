// API client. Talks to the backend when reachable; falls back to the local
// mock seed so the Figma UI always renders (the prototype was mock-driven).

import {
  EVENTS as MOCK_EVENTS,
  INTERESTS as MOCK_INTERESTS,
  CATEGORIES as MOCK_CATEGORIES,
  ORGANIZERS as MOCK_ORGANIZERS,
  POSTS as MOCK_POSTS,
} from '../data/seed'

const withOrganizer = (e) => ({
  ...e,
  organizer: MOCK_ORGANIZERS.find((o) => o.id === e.organizerId) ?? null,
})

// The backend (GET /api/events, #11) serializes events in snake_case with a
// nested category object, while the EventCard component and the mock seed use
// a camelCase, flat shape. This adapter maps the backend row to the shape the
// UI renders. Applied only to real backend rows — mock rows already match, and
// are detected by the absence of the snake_case `is_free` marker key.
const isBackendRow = (e) => e && typeof e === 'object' && 'is_free' in e

export function toEventCardShape(e) {
  if (!isBackendRow(e)) return e
  const priceMin = e.price_min
  return {
    id: e.id,
    title: e.title,
    category: e.category?.name ?? '',
    poster: e.flyer_url ?? '',
    isFree: e.is_free,
    price: e.is_free ? 'Free' : priceMin != null ? `$${priceMin}` : '',
    date: e.starts_at
      ? new Date(e.starts_at).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : '',
    isoDate: e.starts_at ?? '',
    venueName: e.venue_name ?? '',
    city: e.city ?? '',
    lat: e.lat,
    lng: e.lng,
    distanceKm: e.distance_km ?? null,
    organizerId: e.organizer?.id ?? null,
    organizer: e.organizer
      ? {
          id: e.organizer.id,
          name: e.organizer.display_name,
          handle: e.organizer.handle,
          avatar: e.organizer.avatar_url,
          verified: e.organizer.is_verified,
        }
      : e.external_organizer_name
        ? { id: null, name: e.external_organizer_name, avatar: '', verified: false }
        : null,
    goingCount: e.rsvp_count ?? 0,
    goingAvatars: [],
    saveCount: e.save_count ?? 0,
    capacity: e.capacity ?? null,
    almostFull:
      e.capacity != null && e.rsvp_count != null ? e.rsvp_count >= 0.9 * e.capacity : false,
    isSports: e.is_sports ?? false,
    playersNeeded: e.players_needed ?? undefined,
    playersSignedUp: e.players_signed_up ?? undefined,
    tags: [],
  }
}

async function get(path, fallback) {
  try {
    const res = await fetch(`/api${path}`, { credentials: 'include' })
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    return json.data
  } catch {
    return fallback()
  }
}

async function post(path, body, fallback) {
  try {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    return json.data
  } catch {
    return fallback()
  }
}

// Client-side mirror of the #11 filter semantics, used when the backend is
// offline. `categories` is an array of category *names* (e.g. ['Music']).
function mockFilter({ categories = [], isFree, isSports, q } = {}) {
  let list = MOCK_EVENTS.map(withOrganizer)
  const cats = categories.filter((c) => c && c !== 'All')
  if (cats.length) list = list.filter((e) => cats.includes(e.category))
  if (isFree) list = list.filter((e) => e.isFree)
  if (isSports) list = list.filter((e) => e.isSports)
  if (q?.trim()) {
    const n = q.toLowerCase()
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(n) ||
        e.description.toLowerCase().includes(n) ||
        e.tags.some((t) => t.toLowerCase().includes(n)) ||
        e.city.toLowerCase().includes(n) ||
        e.category.toLowerCase().includes(n),
    )
  }
  return list
}

export const api = {
  categories: () => get('/categories', () => MOCK_CATEGORIES),
  interests: () => get('/interests', () => MOCK_INTERESTS),

  // GET /api/events (#11). Accepts the full spec filter set. `categories` is an
  // array of category *slugs* for the backend (?category=music&category=...);
  // `categoryNames` (array of display names) drives the offline mock. Results
  // are mapped through toEventCardShape so the UI gets a consistent shape.
  events: async (filters = {}) => {
    const qs = new URLSearchParams()
    for (const slug of filters.categories ?? []) {
      if (slug && slug !== 'all') qs.append('category', slug)
    }
    if (filters.q) qs.set('q', filters.q)
    if (filters.isFree) qs.set('isFree', 'true')
    if (filters.isSports) qs.set('isSports', 'true')
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) qs.set('dateTo', filters.dateTo)
    if (filters.priceMin != null) qs.set('priceMin', String(filters.priceMin))
    if (filters.priceMax != null) qs.set('priceMax', String(filters.priceMax))
    if (filters.ageMax != null) qs.set('ageMax', String(filters.ageMax))
    for (const s of filters.source ?? []) qs.append('source', s)
    if (filters.nearLat != null && filters.nearLng != null) {
      qs.set('nearLat', String(filters.nearLat))
      qs.set('nearLng', String(filters.nearLng))
      qs.set('radiusKm', String(filters.radiusKm ?? 25))
    }
    if (filters.sort) qs.set('sort', filters.sort)
    const suffix = qs.toString() ? `?${qs}` : ''
    const rows = await get(`/events${suffix}`, () =>
      mockFilter({ categories: filters.categoryNames, ...filters }),
    )
    return Array.isArray(rows) ? rows.map(toEventCardShape) : []
  },

  event: (id) =>
    get(`/events/${id}`, () => {
      const e = MOCK_EVENTS.find((x) => x.id === id)
      return e ? withOrganizer(e) : null
    }),

  related: (id) =>
    get(`/events/${id}/related`, () => {
      const e = MOCK_EVENTS.find((x) => x.id === id)
      if (!e) return []
      const rel = MOCK_EVENTS.filter((x) => x.id !== id && x.category === e.category)
      return (rel.length ? rel : MOCK_EVENTS.filter((x) => x.id !== id).slice(0, 3)).map(
        withOrganizer,
      )
    }),

  recommendations: (interests) =>
    post('/recommendations', { interests }, () => {
      const cats = new Set(
        MOCK_INTERESTS.filter((i) => interests.includes(i.id)).map((i) => i.category),
      )
      return MOCK_EVENTS.map(withOrganizer)
        .map((e) => ({
          e,
          score: (cats.has(e.category) ? 100000 : 0) + e.rsvpCount + 2 * e.saveCount,
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ e }) =>
          cats.size && !cats.has(e.category) ? { ...e, rationale: 'Popular near you' } : e,
        )
    }),

  organizer: (id) =>
    get(`/organizers/${id}`, () => {
      const o = MOCK_ORGANIZERS.find((x) => x.id === id)
      if (!o) return null
      return { ...o, events: MOCK_EVENTS.filter((e) => e.organizerId === id).map(withOrganizer) }
    }),

  posts: () =>
    get('/posts', () =>
      MOCK_POSTS.map((p) => ({
        ...p,
        organizer: MOCK_ORGANIZERS.find((o) => o.id === p.organizerId) ?? null,
        event: MOCK_EVENTS.find((e) => e.id === p.eventId) ?? null,
      })),
    ),

  // Publish a new event. Targets POST /api/events (issue #9, not built yet);
  // until that lands the request 404s and we fall back to echoing the draft
  // back with a generated id + `pending: true` so the UI can flow end-to-end.
  // Swap the fallback out — no caller change — the moment #9 ships.
  createEvent: (draft) =>
    post('/events', draft, () => ({
      ...draft,
      id: `draft-${draft.title?.toLowerCase().replace(/\s+/g, '-') || 'event'}`,
      pending: true,
    })),

  aiSearch: (q) =>
    post('/ai/search', { q }, () => {
      let matches = MOCK_EVENTS.map(withOrganizer)
      const n = q.toLowerCase()
      if (n.includes('free')) matches = matches.filter((e) => e.isFree)
      const cat = MOCK_CATEGORIES.find((c) => n.includes(c.name.toLowerCase()))
      if (cat) matches = matches.filter((e) => e.category === cat.name)
      const events = (matches.length ? matches : MOCK_EVENTS.map(withOrganizer)).slice(0, 3)
      return {
        reply: events.length
          ? `I found ${events.length} events that match. Here are the top picks:`
          : `Here are some popular events near you:`,
        events,
      }
    }),
}
