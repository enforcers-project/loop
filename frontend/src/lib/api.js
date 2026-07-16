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
    homeCity: u.home_city ?? null,
    homeLat: u.home_lat ?? null,
    homeLng: u.home_lng ?? null,
  }
}

// Build a `near` filter for api.events() from the client user. Prefers lat/lng
// (backend does an earth_distance radius query when both are present), else
// falls back to city ILIKE. Returns null when nothing is set.
export function nearForUser(user) {
  if (!user) return null
  if (user.homeLat != null && user.homeLng != null) {
    return { lat: user.homeLat, lng: user.homeLng }
  }
  if (user.homeCity) return { city: user.homeCity }
  return null
}

// Resolve a category display name (e.g. "Nightlife") to the backend's real
// category id. The category list is small and immutable during a session, so we
// fetch it once and cache the promise. Matches on name or slug, case-insensitively.
let _categoriesPromise = null
async function resolveCategoryId(name) {
  if (!_categoriesPromise) {
    _categoriesPromise = fetch(apiUrl('/categories'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => j.data ?? [])
      .catch(() => [])
  }
  const cats = await _categoriesPromise
  const key = String(name ?? '').toLowerCase()
  const slug = key.replace(/\s+/g, '-')
  const hit = cats.find(
    (c) => c.name?.toLowerCase() === key || c.slug?.toLowerCase() === slug,
  )
  return hit?.id ?? null
}

// Translate the CreateEvent form's flat camelCase draft into the snake_case
// body the backend expects. Throws a friendly Error when a required field the
// backend enforces can't be satisfied (so the mutation's onError fires with a
// real message instead of the request 422-ing opaquely).
async function toCreateEventBody(draft) {
  const categoryId = await resolveCategoryId(draft.category)
  if (!categoryId) throw new Error(`Unknown category "${draft.category}"`)

  // The form collects date + time; combine into an ISO instant the backend can
  // Date.parse(). `datetime-local` inputs give "YYYY-MM-DDTHH:mm"; a bare date
  // is fine too (midnight). Guard against an unparseable combo up front.
  const stamp = draft.time ? `${draft.date}T${draft.time}` : draft.date
  const startsAt = new Date(stamp)
  if (isNaN(startsAt.getTime())) throw new Error('Enter a valid date and time')

  const priceMin = Number(draft.price) || 0
  const body = {
    title: draft.title,
    category_id: categoryId,
    starts_at: startsAt.toISOString(),
    timezone: draft.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    city: draft.city,
    venue_name: draft.location || null,
    description: draft.description || null,
    price_min: priceMin,
    price_max: priceMin,
    is_free: priceMin === 0,
    capacity: draft.capacity ?? null,
    age_min: draft.ageRestriction ?? null,
    is_sports: Boolean(draft.isSports),
  }

  if (draft.isSports) {
    const playersNeeded = Number(draft.playersNeeded) || 0
    // Parse "Goalkeeper, Defender, ..." into positions. The backend enforces
    // Σ capacity = players_needed, so distribute the roster as evenly as
    // possible across the named positions (remainder lands on the first few).
    const labels = String(draft.positions || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    let positions
    if (labels.length) {
      const base = Math.floor(playersNeeded / labels.length)
      const extra = playersNeeded % labels.length
      positions = labels.map((label, i) => ({ label, capacity: base + (i < extra ? 1 : 0) }))
    }
    body.sports_details = {
      sport: draft.category === 'Sports' ? 'general' : (draft.sport ?? 'general'),
      skill_level: (draft.skillLevel || 'All Levels').toLowerCase().replace(/\s+/g, '_'),
      venue_setting: draft.indoor ? 'indoor' : 'outdoor',
      players_needed: playersNeeded,
      ...(positions ? { positions } : {}),
    }
  }

  return body
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

  // Commit the user's home location (PUT /users/:id/location). Feeds the
  // recommender's geo pre-filter — with lat/lng it does a real radius search
  // (earth_distance in engine.js), else falls back to city name matching.
  saveLocation: (userId, { city, lat, lng, placeId }) =>
    userId
      ? put(`/users/${userId}/location`, { city, lat, lng, place_id: placeId }, () => ({
          city,
          lat,
          lng,
          place_id: placeId,
          pending: true,
        }))
      : Promise.resolve({ city, lat, lng, place_id: placeId, pending: true }),

  // GET /api/events. `near` is the caller's home location (from nearForUser());
  // with both lat + lng the backend does an earth_distance radius query
  // (radiusKm defaults to 40 to match the recommender), else falls back to
  // city equality. Missing near → no geo filter (pre-onboarding sessions).
  // Empty-near-you fallback: if a geo-filtered request returns 0 events, retry
  // without geo so the user always sees something. Matters because the seed
  // catalog only covers a handful of cities — a user whose saved location is
  // elsewhere would otherwise see "No events match yet" forever.
  events: async (filters = {}) => {
    const buildQs = (includeGeo) => {
      const qs = new URLSearchParams()
      if (filters.category && filters.category !== 'All') qs.set('category', filters.category)
      if (filters.isFree) qs.set('isFree', 'true')
      if (filters.isSports) qs.set('isSports', 'true')
      if (filters.q) qs.set('q', filters.q)
      if (filters.sort) qs.set('sort', filters.sort)
      if (includeGeo) {
        const near = filters.near
        if (near?.lat != null && near?.lng != null) {
          qs.set('nearLat', String(near.lat))
          qs.set('nearLng', String(near.lng))
          qs.set('radiusKm', String(near.radiusKm ?? 40))
        } else if (near?.city) {
          qs.set('city', near.city)
        }
      }
      return qs.toString() ? `?${qs}` : ''
    }
    const hasGeo = !!(
      (filters.near?.lat != null && filters.near?.lng != null) ||
      filters.near?.city
    )
    let list = (await get(`/events${buildQs(true)}`, () => mockFilter(filters))) ?? []
    if (list.length === 0 && hasGeo) {
      list = (await get(`/events${buildQs(false)}`, () => mockFilter(filters))) ?? []
    }
    return list.map(toEventCardShape)
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

  // Empty-feed fallback: /recommendations filters by the user's saved location
  // server-side, so a user whose saved city has no seeded events would see an
  // empty For You feed. When that happens, fall back to non-geo popular events
  // so the feed always has something to show.
  recommendations: async (interests) => {
    const list = await post('/recommendations', { interests }, () => {
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
    })
    const arr = list ?? []
    if (arr.length > 0) return arr.map(toEventCardShape)
    const fallback = (await get('/events?sort=popular', () => mockFilter({}))) ?? []
    return fallback.map(toEventCardShape)
  },

  organizer: (id) =>
    get(`/organizers/${id}`, () => {
      const o = MOCK_ORGANIZERS.find((x) => x.id === id)
      if (!o) return null
      return { ...o, events: MOCK_EVENTS.filter((e) => e.organizerId === id).map(withOrganizer) }
    }).then((o) => (o ? { ...o, events: (o.events ?? []).map(toEventCardShape) } : o)),

  // Public user/organizer profile (GET /api/users/:id + /:id/events). Real UUID
  // ids hit Prisma; mock `org-*` ids 404 the profile fetch, so we fall back to
  // the mock organizer + its events. Returns the backend shape (snake_case) when
  // real, the mock shape when not — toOrganizerShape() in the screen normalizes.
  user: async (id, status = 'upcoming') => {
    const profile = await get(`/users/${id}`, () => {
      const o = MOCK_ORGANIZERS.find((x) => x.id === id)
      if (!o) return null
      return { ...o, _mock: true }
    })
    if (!profile) return null
    if (profile._mock) {
      const events = MOCK_EVENTS.filter((e) => e.organizerId === id).map(withOrganizer)
      return { ...profile, events: events.map(toEventCardShape) }
    }
    // Real profile: pull the organizer's events for the requested tab.
    const events = await get(`/users/${id}/events?status=${status}`, () => [])
    return { ...profile, events: (events ?? []).map(toEventCardShape) }
  },

  // Follow / unfollow an organizer (no mock fallback — a follow must genuinely
  // persist). POST returns { is_following, followee: { follower_count } };
  // DELETE is 204 (request() returns null). Both throw on failure so the caller
  // can roll back optimistic UI.
  follow: (id) => request(`/users/${id}/follow`, { method: 'POST' }),
  unfollow: (id) => request(`/users/${id}/follow`, { method: 'DELETE' }),

  // Who a user follows (GET /api/users/:id/following) — used to hydrate the
  // FollowBtn state on login/refresh. Returns the id array; [] on any failure
  // so a hydration hiccup never blocks the app.
  following: async (id) => {
    try {
      const res = await request(`/users/${id}/following`)
      return (res ?? []).map((row) => row.user?.id).filter(Boolean)
    } catch {
      return []
    }
  },

  // RSVP / cancel for an event (no mock fallback — an RSVP must genuinely
  // persist). PUT sets status='going'; DELETE cancels. Both throw on failure so
  // the caller can roll back optimistic UI. Returns { event_rsvp_count, ... } so
  // a screen can sync the "N going" count.
  rsvp: (id) => request(`/events/${id}/rsvp`, { method: 'PUT', body: { status: 'going' } }),
  rsvpCancel: (id) => request(`/events/${id}/rsvp`, { method: 'DELETE' }),

  // Save / unsave for an event. Same shape as rsvp above — no mock fallback,
  // throws on failure so an optimistic UI can roll back. Every mutation writes
  // an interaction_events row on the backend, which triggers a rebuild of the
  // user's preference vector — so a subsequent /recommendations call reflects
  // the click on refresh.
  save: (id) => request(`/events/${id}/save`, { method: 'PUT' }),
  saveCancel: (id) => request(`/events/${id}/save`, { method: 'DELETE' }),

  // The caller's "going" event ids (GET /api/users/:id/rsvps?status=going) —
  // used to hydrate RSVP state on login/refresh so the "Going" highlight
  // survives a reload. Returns the id array; [] on any failure so a hydration
  // hiccup never blocks the app. Mirrors api.following.
  goingEvents: async (id) => {
    try {
      const res = await request(`/users/${id}/rsvps?status=going`)
      return (res ?? []).map((row) => row.event?.id).filter(Boolean)
    } catch {
      return []
    }
  },

  // Notification bell feed (real endpoints, no mock fallback — like auth/follow;
  // backend #27). list() returns the full envelope { data, nextCursor,
  // unread_count } so the bell can drive its unread dot from the server count.
  // A logged-out caller 401s; the caller treats that as an empty feed.
  notifications: {
    list: async ({ unreadOnly = false, cursor, limit } = {}) => {
      const qs = new URLSearchParams()
      if (unreadOnly) qs.set('is_read', 'false')
      if (cursor) qs.set('cursor', cursor)
      if (limit) qs.set('limit', String(limit))
      const suffix = qs.toString() ? `?${qs}` : ''
      try {
        const res = await fetch(apiUrl(`/notifications${suffix}`), { credentials: 'include' })
        if (!res.ok) throw new Error(String(res.status))
        return await res.json() // { data, nextCursor, unread_count }
      } catch {
        return { data: [], nextCursor: null, unread_count: 0 }
      }
    },
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
  },

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

  // Create + publish a native event. The backend contract (POST /api/events)
  // is snake_case and starts the event as a draft; a second call to
  // POST /api/events/:id/publish flips it live. We translate the flat camelCase
  // form draft into that contract, resolve the real category_id, and build a
  // proper ISO starts_at. No mock fallback — like auth, a publish must genuinely
  // succeed or fail so the UI can show the real error (a 422 no longer gets
  // silently swallowed into a fake pending draft).
  createEvent: async (draft) => {
    const body = await toCreateEventBody(draft)
    const created = await request('/events', { method: 'POST', body })
    const published = await request(`/events/${created.id}/publish`, { method: 'POST' })
    // The publish response is a slim { id, status, published_at }; return the
    // full created detail merged with the new status so the caller has both an
    // id to navigate to and the live status.
    return { ...created, status: published?.status ?? created.status }
  },

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
