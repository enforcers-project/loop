// API client. Talks to the backend when reachable; falls back to the local
// mock seed so the Figma UI always renders (the prototype was mock-driven).

import {
  EVENTS as MOCK_EVENTS,
  INTERESTS as MOCK_INTERESTS,
  CATEGORIES as MOCK_CATEGORIES,
  ORGANIZERS as MOCK_ORGANIZERS,
  POSTS as MOCK_POSTS,
} from '../data/seed'

// Where the API lives. In dev this is empty, so calls stay relative (`/api/…`)
// and Vite proxies them to the backend (see vite.config.js). In a deployed
// build the backend is on another origin, so set VITE_API_BASE_URL (baked in at
// build time) to that origin — e.g. https://loop-server.onrender.com — and
// every request targets it directly. A trailing slash is trimmed so we never
// emit `//api`.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const apiUrl = (path) => `${API_BASE}/api${path}`

const withOrganizer = (e) => ({
  ...e,
  organizer: MOCK_ORGANIZERS.find((o) => o.id === e.organizerId) ?? null,
})

// The backend (GET /events, /events/:id, /events/:id/related, POST
// /recommendations) serializes events in snake_case with a nested `category`
// object, while every screen + the mock seed use a flat camelCase shape
// (category is a plain string, `poster`, `isFree`, `rsvpCount`, …). Rendering a
// raw backend row crashes React ("Objects are not valid as a React child" on
// the category object). This adapter maps a backend row to the UI shape.
//
// It only touches genuine backend rows — detected by the snake_case `is_free`
// marker key — so mock rows (and the already-mock-shaped /organizers stub) pass
// through untouched. Every array field the UI may .map()/.slice() is defaulted
// so no screen can throw on a missing collection.
const isBackendRow = (e) => e && typeof e === 'object' && 'is_free' in e

// Rationale arrives as a string (mock) or an object { text, signal } (real
// recommendations). recommendationLabel() expects a string, so flatten it.
const rationaleText = (r) => (r == null ? undefined : typeof r === 'string' ? r : r.text)

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
    description: e.description ?? '',
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
    rsvpCount: e.rsvp_count ?? 0,
    goingCount: e.rsvp_count ?? 0,
    goingAvatars: [],
    saveCount: e.save_count ?? 0,
    capacity: e.capacity ?? null,
    ageRestriction: e.age_label ?? null,
    almostFull:
      e.capacity != null && e.rsvp_count != null ? e.rsvp_count >= 0.9 * e.capacity : false,
    isSports: e.is_sports ?? false,
    playersNeeded: e.players_needed ?? undefined,
    playersSignedUp: e.players_signed_up ?? undefined,
    tags: [],
    rationale: rationaleText(e.rationale),
  }
}

async function get(path, fallback) {
  try {
    const res = await fetch(apiUrl(path), { credentials: 'include' })
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    return json.data
  } catch {
    return fallback()
  }
}

async function post(path, body, fallback) {
  try {
    const res = await fetch(apiUrl(path), {
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

async function put(path, body, fallback) {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'PUT',
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

// Auth has NO mock fallback: a login must genuinely succeed or fail, never be
// faked. This helper surfaces the backend's error envelope as a thrown Error
// (with .status) so the UI can show a real message.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(apiUrl(path), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  let json = null
  try {
    json = await res.json()
  } catch {
    // Non-JSON (proxy/network error page) — fall through to the guard below.
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return json?.data
}

function mockFilter({ category, isFree, isSports, q }) {
  // Match the backend: past events are hidden from Home/Search. Compare on
  // isoDate (has TZ offset) — an event that has already started is not
  // something the user can still attend.
  const now = Date.now()
  let list = MOCK_EVENTS.map(withOrganizer).filter((e) => {
    const t = e.isoDate ? Date.parse(e.isoDate) : NaN
    return isNaN(t) || t >= now
  })
  if (category && category !== 'All') list = list.filter((e) => e.category === category)
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

// Map the backend's snake_case SelfUser (auth/serialize.js) onto the camelCase
// shape the UI reads. Falls back to a derived handle/avatar so the nav + profile
// always have something to render.
export function toClientUser(u) {
  if (!u) return null
  return {
    id: u.id,
    email: u.email,
    name: u.display_name || u.email?.split('@')[0] || 'You',
    handle: u.handle ? `@${u.handle}` : `@${u.email?.split('@')[0] || 'you'}`,
    avatar: u.avatar_url || 'https://i.pravatar.cc/150?img=1',
    role: u.role,
    isHost: u.is_host,
    isVerified: u.is_verified,
    onboardingCompletedAt: u.onboarding_completed_at,
  }
}

export const api = {
  categories: () => get('/categories', () => MOCK_CATEGORIES),
  interests: () => get('/interests', () => MOCK_INTERESTS),

  // --- Auth (real endpoints, no mock fallback; backend #6) ------------------
  auth: {
    signup: (payload) => request('/auth/signup', { method: 'POST', body: payload }),
    login: (email, password) =>
      request('/auth/login', { method: 'POST', body: { email, password } }),
    // Exchange a Google id_token for a Loop session (backend verifies + sets the
    // cookie). `extras` (role/organizer_kind/is_host) apply only when the Google
    // account is brand-new. Returns { user, is_new } so the caller can route
    // first-timers to onboarding. No mock fallback — like every auth call.
    google: (idToken, extras = {}) =>
      request('/auth/oauth/google', { method: 'POST', body: { id_token: idToken, ...extras } }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    // Resolve the current session; returns null when not authenticated (401)
    // instead of throwing, so callers can treat "logged out" as a normal state.
    me: async () => {
      try {
        return await request('/auth/me')
      } catch (err) {
        if (err.status === 401) return null
        throw err
      }
    },
  },

  // Commit the user's onboarding interest picks (PUT /users/:id/interests).
  // The endpoint requires auth; when onboarding runs before login (no userId)
  // or the network is down, we fall back to echoing the picks with
  // `pending: true` so onboarding still completes and the UI can notify.
  saveInterests: (userId, interestIds) =>
    userId
      ? put(`/users/${userId}/interests`, { interest_ids: interestIds }, () => ({
          interest_ids: interestIds,
          pending: true,
        }))
      : Promise.resolve({ interest_ids: interestIds, pending: true }),

  events: (filters = {}) => {
    const qs = new URLSearchParams()
    if (filters.category && filters.category !== 'All') qs.set('category', filters.category)
    if (filters.isFree) qs.set('isFree', 'true')
    if (filters.isSports) qs.set('isSports', 'true')
    if (filters.q) qs.set('q', filters.q)
    if (filters.sort) qs.set('sort', filters.sort)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get(`/events${suffix}`, () => mockFilter(filters)).then((list) =>
      (list ?? []).map(toEventCardShape),
    )
  },

  event: (id) =>
    get(`/events/${id}`, () => {
      const e = MOCK_EVENTS.find((x) => x.id === id)
      return e ? withOrganizer(e) : null
    }).then(toEventCardShape),

  related: (id) =>
    get(`/events/${id}/related`, () => {
      const e = MOCK_EVENTS.find((x) => x.id === id)
      if (!e) return []
      const rel = MOCK_EVENTS.filter((x) => x.id !== id && x.category === e.category)
      return (rel.length ? rel : MOCK_EVENTS.filter((x) => x.id !== id).slice(0, 3)).map(
        withOrganizer,
      )
    }).then((list) => (list ?? []).map(toEventCardShape)),

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
    }).then((list) => (list ?? []).map(toEventCardShape)),

  organizer: (id) =>
    get(`/organizers/${id}`, () => {
      const o = MOCK_ORGANIZERS.find((x) => x.id === id)
      if (!o) return null
      return { ...o, events: MOCK_EVENTS.filter((e) => e.organizerId === id).map(withOrganizer) }
    }).then((o) => (o ? { ...o, events: (o.events ?? []).map(toEventCardShape) } : o)),

  posts: () =>
    get('/posts', () =>
      MOCK_POSTS.map((p) => ({
        ...p,
        organizer: MOCK_ORGANIZERS.find((o) => o.id === p.organizerId) ?? null,
        event: MOCK_EVENTS.find((e) => e.id === p.eventId) ?? null,
      })),
    ).then((list) =>
      (list ?? []).map((p) => (p?.event ? { ...p, event: toEventCardShape(p.event) } : p)),
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
