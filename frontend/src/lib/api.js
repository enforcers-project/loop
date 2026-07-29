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

// Distinguishes a real backend UUID from a mock seed id (e.g. `org-*`), so
// callers can skip a doomed request against the Prisma-backed API for mock rows.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

// The default profile picture shown when a user has no avatar_url. New accounts
// get this seeded on the backend (DEFAULT_AVATAR_URL) so this is just a safety
// net for older rows / mocks. Set VITE_DEFAULT_AVATAR_URL to the same S3
// silhouette URL at build time so the fallback matches; otherwise a neutral
// pravatar keeps the UI from rendering a broken image.
export const DEFAULT_AVATAR =
  import.meta.env.VITE_DEFAULT_AVATAR_URL || 'https://i.pravatar.cc/150?img=1'

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
const rationaleText = (r) => {
  if (r == null) return undefined
  const text = typeof r === 'string' ? r : r.text
  return text || undefined
}

export function toEventCardShape(e) {
  if (!isBackendRow(e)) return e
  const priceMin = e.price_min
  return {
    id: e.id,
    title: e.title,
    category: e.category?.name ?? '',
    poster: e.flyer_url ?? '',
    isFree: e.is_free,
    // Free = either the isFree flag OR a $0 price_min (organizers who set the
    // price to 0 instead of flipping the free toggle shouldn't see a "$0"
    // pill). Fall back to 'TBA' for paid events with no price_min so the
    // EventCard price pill never renders as an empty white chip (looks like a
    // bug).
    price: e.is_free || priceMin === 0 ? 'Free' : priceMin != null ? `$${priceMin}` : 'TBA',
    date: e.starts_at
      ? new Date(e.starts_at).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : '',
    isoDate: e.starts_at ?? '',
    endsAt: e.ends_at ?? null,
    timezone: e.timezone ?? null,
    publishedAt: e.published_at ?? null,
    // Lifecycle state — surfaced to the client so EditEvent/EventDetail can
    // show a cancelled banner, gate the RSVP CTA, and hide the organizer
    // action bar for past/cancelled events. `status` is one of
    // 'draft'|'published'|'cancelled'|'past'.
    status: e.status ?? null,
    cancelledAt: e.cancelled_at ?? null,
    cancelReason: e.cancel_reason ?? null,
    description: e.description ?? '',
    venueName: e.venue_name ?? '',
    address: e.address ?? '',
    city: e.city ?? '',
    lat: e.lat,
    lng: e.lng,
    placeId: e.google_place_id ?? null,
    priceMin: e.price_min ?? null,
    priceMax: e.price_max ?? null,
    ageMin: e.age_min ?? null,
    categorySlug: e.category?.slug ?? null,
    // Provenance for events pulled from partner APIs. `source` is one of
    // 'native' | 'ticketmaster' | 'seatgeek'; `ticketUrl` is the partner's
    // ticket page (external_url). Non-native events surface a "Get tickets"
    // link so the user can buy through the original seller.
    source: e.source ?? 'native',
    ticketUrl: e.external_url ?? null,
    distanceKm: e.distance_km ?? null,
    organizerId: e.organizer?.id ?? null,
    organizer: e.organizer
      ? {
          id: e.organizer.id,
          name: e.organizer.display_name,
          // Prefix the handle with '@' so the hosted-by card and hero organizer
          // chip render the same social-media convention as mock organizers.
          handle: e.organizer.handle ? `@${e.organizer.handle}` : null,
          // Fall back to the shared default avatar for legacy organizer rows
          // whose avatar_url is null (accounts created before DEFAULT_AVATAR_URL
          // was set). Otherwise the hosted-by chip renders a broken image icon.
          avatar: e.organizer.avatar_url || DEFAULT_AVATAR,
          verified: e.organizer.is_verified,
          // Trust signals — the hosted-by card renders followers when present,
          // and formatCount() collapses large numbers ("8.4k"). Nullable so
          // brand-new organizers show the row only once they have a real count.
          followers: e.organizer.follower_count ?? null,
          role: e.organizer.role ?? null,
          bio: e.organizer.bio ?? null,
        }
      : e.external_organizer_name
        ? { id: null, name: e.external_organizer_name, avatar: DEFAULT_AVATAR, verified: false }
        : null,
    rsvpCount: e.rsvp_count ?? 0,
    goingCount: e.rsvp_count ?? 0,
    // Mutuals going — people the viewer follows who RSVP'd (from the rec
    // engine's social scorer via going_stack.friends). Their avatars render as
    // the face stack on the card; `mutualsGoing` (name + count) drives the
    // "Sarah + 2 going" label. Empty for events with no followed attendee, so
    // the card falls back to the plain "N going" count.
    goingAvatars: (e.going_stack?.friends ?? [])
      .map((f) => f.avatar_url || DEFAULT_AVATAR)
      .filter(Boolean),
    mutualsGoing: {
      count: e.going_stack?.count ?? 0,
      names: (e.going_stack?.friends ?? []).map((f) => f.display_name).filter(Boolean),
    },
    saveCount: e.save_count ?? 0,
    capacity: e.capacity ?? null,
    ageRestriction: e.age_label ?? null,
    // Whether age_min is a hard RSVP gate (true) vs a recommended age (false).
    ageRestricted: e.age_restricted ?? false,
    almostFull:
      e.capacity != null && e.rsvp_count != null ? e.rsvp_count >= 0.9 * e.capacity : false,
    isSports: e.is_sports ?? false,
    playersNeeded: e.players_needed ?? e.sports_details?.players_needed ?? undefined,
    playersSignedUp: e.players_signed_up ?? e.sports_details?.players_signed_up ?? undefined,
    // Sports-run detail fields. The event detail endpoint nests these under
    // `sports_details`; hoist them onto the flat shape so SportsPickupDetail
    // can render the header chip, skill row, and position picker grid without
    // reaching into a nested object. Card responses omit sports_details, so
    // these stay undefined there — the card doesn't render them anyway.
    ...(e.sports_details
      ? {
          sport: e.sports_details.sport ?? '',
          skillLevel: prettySkill(e.sports_details.skill_level),
          indoor: e.sports_details.venue_setting === 'indoor',
          positions: (e.sports_details.positions ?? []).map((p) => ({
            id: p.id,
            label: p.label,
            capacity: p.capacity,
            filled: p.capacity - (p.open_slots ?? p.capacity),
          })),
        }
      : {}),
    // Roster (sports events only). The detail endpoint embeds this so the
    // roster table renders on the initial fetch; card responses omit it, so
    // it stays undefined there.
    ...(Array.isArray(e.roster) ? { roster: e.roster } : {}),
    tags: [],
    rationale: rationaleText(e.rationale),
  }
}

// Backend stores skill level as 'all_levels'/'beginner'/'intermediate'/'advanced'
// (snake_case, lowercase). SportsPickupDetail renders this verbatim in the
// "Skill: X" row and passes it to SkillBadge (which keys on Title Case), so
// map it back to the display convention.
function prettySkill(s) {
  if (!s) return ''
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

// Like get(), but preserves the pagination cursor that sits beside `data` in the
// envelope ({ data, nextCursor }). Returns { data, nextCursor }; on failure the
// fallback supplies the data and the cursor is null (no more pages to load).
async function getPage(path, fallback) {
  try {
    const res = await fetch(apiUrl(path), { credentials: 'include' })
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    return { data: json.data, nextCursor: json.nextCursor ?? null }
  } catch {
    return { data: fallback(), nextCursor: null }
  }
}

// Fetch one page of a follow-list endpoint and flatten { user, followed_at }
// rows down to the PublicUser (keeping viewer-relative is_following). Returns
// { users, nextCursor }; empty page + null cursor on failure so a modal can
// degrade to "no one" rather than throwing.
async function followPage(path, cursor) {
  const suffix = cursor
    ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`
    : ''
  try {
    const res = await fetch(apiUrl(`${path}${suffix}`), { credentials: 'include' })
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    const users = (json.data ?? []).map((row) => row.user).filter(Boolean)
    return { users, nextCursor: json.nextCursor ?? null }
  } catch {
    return { users: [], nextCursor: null }
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
    // Machine-readable code from the { error: { code, message } } envelope, so
    // callers can branch (e.g. age gate: BIRTHDATE_REQUIRED vs AGE_RESTRICTED).
    err.code = json?.error?.code ?? null
    // Extra fields the backend attaches to the envelope (e.g. field name for a
    // 409 CONFLICT, retry_after_ms for a 429 RATE_LIMITED). Surface everything
    // beyond code/message so screens can branch on them without re-parsing.
    if (json?.error && typeof json.error === 'object') {
      const { code: _c, message: _m, ...rest } = json.error
      err.details = rest
    }
    throw err
  }
  return json?.data
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
    // Raw stored handle (no leading @, may be null) — the edit form needs the
    // real value to prefill, distinct from the always-present display `handle`.
    handleRaw: u.handle ?? null,
    // When the username (handle) was last changed on the backend. The profile
    // edit form uses this to compute the 7-day cooldown locally and disable
    // the input before the caller sees a 429. Display name has no cooldown.
    handleChangedAt: u.handle_changed_at ?? null,
    bio: u.bio ?? '',
    avatar: u.avatar_url || DEFAULT_AVATAR,
    role: u.role,
    // Organizer flavor ('organizer' | 'promoter' | null) — distinguishes a
    // Promoter from a plain Organizer for the profile role pill + selector.
    organizerKind: u.organizer_kind ?? null,
    isHost: u.is_host,
    isVerified: u.is_verified,
    // Denormalized social counts (0 for a brand-new user); the profile header
    // renders these and toggleFollow bumps `following` live on follow/unfollow.
    followers: u.follower_count ?? 0,
    following: u.following_count ?? 0,
    onboardingCompletedAt: u.onboarding_completed_at,
    homeCity: u.home_city ?? null,
    homeLat: u.home_lat ?? null,
    homeLng: u.home_lng ?? null,
    homePlaceId: u.home_place_id ?? null,
    // "Near me" radius in kilometers. Feeds the recommender's geo pre-filter
    // and the /events?radiusKm query the ForYou/Discover screens send. Defaults
    // to 40 (matches the backend Prisma default).
    locationRadiusKm: u.location_radius_km ?? 40,
    birthDate: u.birth_date ?? null,
    cover: u.cover_image_url ?? null,
    // Notification toggles (Settings). null when the user has never set them —
    // the UI treats a missing map as all-on, matching the backend default.
    notificationPrefs: u.notification_prefs ?? null,
    joinedAt: u.created_at ?? null,
  }
}

// --- Social feed mappers (SocialFeed, backend #29) --------------------------
// The backend serializes posts/stories/comments in snake_case with a compact
// author ref; the SocialFeed components read a flat camelCase shape (org.name,
// post.likes, post.timeAgo, …). These adapters bridge the two, mirroring
// toEventCardShape/toClientUser.

// A backend author ref → the { id, name, handle, avatar, verified } shape the
// PostCard/StoriesRow/comment rows render.
function toClientAuthor(a) {
  if (!a) return null
  return {
    id: a.id,
    name: a.display_name || a.handle || 'Someone',
    handle: a.handle ? `@${a.handle}` : '@someone',
    avatar: a.avatar_url || DEFAULT_AVATAR,
    verified: !!a.is_verified,
  }
}

function toClientPost(p) {
  if (!p) return p
  return {
    id: p.id,
    organizer: toClientAuthor(p.author),
    eventId: p.event_id ?? null,
    kind: p.kind,
    image: p.image_url || '',
    caption: p.caption || '',
    likes: p.like_count ?? 0,
    commentCount: p.comment_count ?? 0,
    likedByMe: !!p.liked_by_me,
    timeAgo: p.created_at || '',
  }
}

function toClientComment(c) {
  if (!c) return c
  const author = toClientAuthor(c.author)
  return {
    id: c.id,
    authorId: c.author?.id ?? null,
    author: author?.name ?? 'Someone',
    authorHandle: author?.handle ?? '',
    authorAvatar: author?.avatar ?? DEFAULT_AVATAR,
    verified: author?.verified ?? false,
    text: c.body,
    parentId: c.parent_comment_id ?? null,
    replyCount: c.reply_count ?? 0,
    createdAt: c.created_at,
  }
}

function toClientStoryGroup(g) {
  if (!g) return g
  return {
    author: toClientAuthor(g.author),
    allViewed: !!g.all_viewed,
    stories: (g.stories ?? []).map((s) => ({
      id: s.id,
      mediaUrl: s.media_url,
      caption: s.caption || '',
      eventId: s.event_id ?? null,
      viewedByMe: !!s.viewed_by_me,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
    })),
  }
}

// Shape a mock seed POST (frontend/src/data/seed.js) as if it came from the
// backend feed, so the offline fallback flows through the same toClientPost.
function mockPostToBackend(p) {
  const org = MOCK_ORGANIZERS.find((o) => o.id === p.organizerId) ?? null
  return {
    id: p.id,
    author: org
      ? {
          id: org.id,
          display_name: org.name,
          handle: org.handle?.replace(/^@/, ''),
          avatar_url: org.avatar,
          is_verified: org.verified,
        }
      : null,
    event_id: p.eventId ?? null,
    kind: 'flyer',
    image_url: p.image,
    caption: p.caption,
    like_count: p.likes ?? 0,
    comment_count: p.comments?.length ?? 0,
    liked_by_me: false,
    // Mock posts stored a relative label ("3h"); keep it verbatim — timeAgo()
    // only reformats real ISO timestamps and passes a non-date through as-is.
    created_at: p.timeAgo ?? '',
  }
}

// Build a `near` filter for api.events() from the client user. Prefers lat/lng
// (backend does an earth_distance radius query when both are present), else
// falls back to city ILIKE. Carries the user's stored radius so a saved
// preference of "10 mi" narrows the /events?radiusKm query the same way the
// recommender's pre-filter uses it. Returns null when nothing is set.
//
// When both lat/lng and homeCity are known, we send BOTH: the backend uses
// the radius for events with real coordinates and falls back to a city match
// for events whose organizer skipped Places autocomplete (lat/lng null).
// Without this, a freshly-created event with no pinned coordinates would be
// invisible to every user who set a home location during onboarding.
export function nearForUser(user) {
  if (!user) return null
  if (user.homeLat != null && user.homeLng != null) {
    return {
      lat: user.homeLat,
      lng: user.homeLng,
      radiusKm: user.locationRadiusKm ?? 40,
      city: user.homeCity ?? null,
    }
  }
  if (user.homeCity) return { city: user.homeCity }
  return null
}

// Build the GET /api/events query string from a filters object. Shared by
// api.events() (first page only) and api.eventsPage() (cursor-paginated) so the
// two stay in lockstep — a filter added here applies to both. Returns a string
// beginning with '?' (or '' when there are no params).
function eventsQuery(filters = {}) {
  const qs = new URLSearchParams()
  if (filters.category && filters.category !== 'All') qs.set('category', filters.category)
  if (filters.isFree) qs.set('isFree', 'true')
  if (filters.isSports) qs.set('isSports', 'true')
  if (filters.q) qs.set('q', filters.q)
  if (filters.sort) qs.set('sort', filters.sort)
  if (filters.cursor) qs.set('cursor', filters.cursor)
  if (filters.limit) qs.set('limit', String(filters.limit))
  const near = filters.near
  if (near?.lat != null && near?.lng != null) {
    qs.set('nearLat', String(near.lat))
    qs.set('nearLng', String(near.lng))
    qs.set('radiusKm', String(near.radiusKm ?? 40))
    // Also send city so the backend can include events created without pinned
    // coordinates (organizer skipped Places autocomplete); the backend ORs it
    // with the radius filter instead of hard-excluding null-coord rows.
    if (near.city) qs.set('city', near.city)
  } else if (near?.city) {
    qs.set('city', near.city)
  }
  return qs.toString() ? `?${qs}` : ''
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
  const hit = cats.find((c) => c.name?.toLowerCase() === key || c.slug?.toLowerCase() === slug)
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
    // Real location from Google Places (when the organizer picked a suggestion):
    // coordinates + formatted address + place id. The backend already stores
    // these; the form just never sent them before. All null for a free-typed venue.
    address: draft.address || null,
    lat: draft.lat ?? null,
    lng: draft.lng ?? null,
    google_place_id: draft.placeId ?? null,
    description: draft.description || null,
    // Send the flyer through as flyer_url when it's persistable. AI-generated
    // flyers are base64 data URLs (roundtrip fine). Locally uploaded files
    // come in as blob: URLs that only exist in the current tab, so we drop
    // those rather than persist a dead reference — a proper file upload path
    // (S3 presigned PUT) is a separate task.
    flyer_url:
      typeof draft.flyer === 'string' &&
      (draft.flyer.startsWith('data:') || draft.flyer.startsWith('http'))
        ? draft.flyer
        : null,
    price_min: priceMin,
    price_max: priceMin,
    is_free: priceMin === 0,
    capacity: draft.capacity ?? null,
    age_min: draft.ageRestriction ?? null,
    // Display label the EventCard/detail render (age_min is the numeric gate;
    // age_label is what shows). "21+" convention matches the live preview.
    age_label: draft.ageRestriction ? `${draft.ageRestriction}+` : null,
    // Hard age gate: when true the backend enforces age_min at RSVP; when false
    // age_min is only a recommended age shown on the event.
    age_restricted: Boolean(draft.ageRestricted),
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

// Build a snake_case PATCH body for `updateEvent`. Only keys the organizer
// actually touched appear on the wire, so a form resubmit with no changes is
// a 200 no-op and the backend's meaningful-field diff sees nothing to notify
// on. Mirrors `toCreateEventBody` field-for-field.
async function toUpdateEventBody(patch) {
  const body = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.category !== undefined) {
    const categoryId = await resolveCategoryId(patch.category)
    if (!categoryId) throw new Error(`Unknown category "${patch.category}"`)
    body.category_id = categoryId
  }
  if (patch.date !== undefined || patch.time !== undefined) {
    const stamp = patch.time ? `${patch.date}T${patch.time}` : patch.date
    const startsAt = new Date(stamp)
    if (isNaN(startsAt.getTime())) throw new Error('Enter a valid date and time')
    body.starts_at = startsAt.toISOString()
  }
  if (patch.timezone !== undefined) body.timezone = patch.timezone
  if (patch.city !== undefined) body.city = patch.city
  if (patch.location !== undefined) body.venue_name = patch.location || null
  if (patch.address !== undefined) body.address = patch.address || null
  if (patch.lat !== undefined) body.lat = patch.lat ?? null
  if (patch.lng !== undefined) body.lng = patch.lng ?? null
  if (patch.placeId !== undefined) body.google_place_id = patch.placeId ?? null
  if (patch.description !== undefined) body.description = patch.description || null
  if (patch.flyer !== undefined) {
    body.flyer_url =
      typeof patch.flyer === 'string' &&
      (patch.flyer.startsWith('data:') || patch.flyer.startsWith('http'))
        ? patch.flyer
        : null
  }
  if (patch.price !== undefined) {
    const priceMin = Number(patch.price) || 0
    body.price_min = priceMin
    body.price_max = priceMin
    body.is_free = priceMin === 0
  }
  if (patch.capacity !== undefined) body.capacity = patch.capacity ?? null
  if (patch.ageRestriction !== undefined) {
    body.age_min = patch.ageRestriction ?? null
    body.age_label = patch.ageRestriction ? `${patch.ageRestriction}+` : null
  }
  if (patch.ageRestricted !== undefined) {
    body.age_restricted = Boolean(patch.ageRestricted)
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

  // The caller's own onboarding interest picks (GET /users/:id/interests) —
  // used to hydrate the interests context on login/refresh so the profile
  // "Interests" tab survives a reload. Returns the id array (UUIDs matching
  // the ids in GET /api/interests). [] on any failure so a hydration hiccup
  // never blocks the app.
  userInterests: async (id) => {
    try {
      const res = await request(`/users/${id}/interests`)
      return (res ?? []).map((row) => row.id).filter(Boolean)
    } catch {
      return []
    }
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

  // Edit the caller's own profile (PATCH /users/:id). Sends only the provided
  // fields; returns the refreshed SelfUser. No mock fallback — a save must
  // genuinely persist. Throws with .status so the caller can surface a 409
  // (handle taken) or validation message.
  updateProfile: (userId, fields) => request(`/users/${userId}`, { method: 'PATCH', body: fields }),

  // Change the user's self-defined role (PUT /users/:id/role). `preset` is one
  // of 'attendee' | 'organizer' | 'promoter' | 'sports_host' — the backend
  // resolves it to the valid { role, organizer_kind, is_host } triple and
  // returns the refreshed SelfUser. No mock fallback — a role change must
  // genuinely persist (it gates event creation).
  saveRole: (userId, preset) =>
    request(`/users/${userId}/role`, { method: 'PUT', body: { preset } }),

  // Update notification toggles (PUT /users/:id/notification-prefs). Send only
  // the keys that changed — the backend merges over the stored prefs. Returns
  // the refreshed SelfUser (with the full, merged notification_prefs map). No
  // mock fallback — a preference change must genuinely persist.
  saveNotificationPrefs: (userId, prefs) =>
    request(`/users/${userId}/notification-prefs`, { method: 'PUT', body: prefs }),

  // Commit the user's date of birth (PUT /users/:id/birthdate). Feeds the
  // age gate — events with an age_min filter compare against the caller's age
  // derived from birth_date. When onboarding runs before login (no userId) or
  // the network is down, echo the input with `pending: true` so the flow
  // completes and the caller can toast.
  saveBirthDate: (userId, birthDate) =>
    userId
      ? put(`/users/${userId}/birthdate`, { birth_date: birthDate }, () => ({
          birth_date: birthDate,
          pending: true,
        }))
      : Promise.resolve({ birth_date: birthDate, pending: true }),

  // Commit the user's home location (PUT /users/:id/location). Feeds the
  // recommender's geo pre-filter — with lat/lng it does a real radius search
  // (earth_distance in engine.js), else falls back to city name matching.
  // `radiusKm` optionally updates the stored "near me" radius the recommender
  // + /events geo query use (1–500km, backend defaults it to 40).
  saveLocation: (userId, { city, lat, lng, placeId, radiusKm }) =>
    userId
      ? put(
          `/users/${userId}/location`,
          {
            city,
            lat,
            lng,
            place_id: placeId,
            ...(radiusKm != null ? { radius_km: radiusKm } : {}),
          },
          () => ({
            city,
            lat,
            lng,
            place_id: placeId,
            radius_km: radiusKm,
            pending: true,
          }),
        )
      : Promise.resolve({ city, lat, lng, place_id: placeId, radius_km: radiusKm, pending: true }),

  // GET /api/events. `near` is the caller's home location (from nearForUser());
  // with both lat + lng the backend does an earth_distance radius query
  // (radiusKm defaults to 40 to match the recommender), else falls back to
  // city equality. Missing near → no geo filter (pre-onboarding sessions).
  //
  // We do NOT retry without the geo filter on an empty result. This is a
  // location-based app: if nothing is within the user's radius, the honest
  // answer is the "No events near you yet" empty state — not a silent refetch
  // that dumps events from other cities/states (which is exactly the far-away-
  // events bug). Widening the search is the radius slider's job, and the
  // offline path (mockFilter) has no geo filter anyway, so this only tightens
  // real backend responses.
  events: async (filters = {}) => {
    const suffix = eventsQuery(filters)
    // No mock fallback here. The mock catalog's isoDate values are frozen in
    // the past, so on any transient backend hiccup the client would render
    // "only 2 events" (the two future-dated mocks) instead of the real feed.
    // A failed fetch degrades to [] and the screen's empty state, which is
    // honest — better than showing a stale two-item catalog.
    const list = (await get(`/events${suffix}`, () => [])) ?? []
    return list.map(toEventCardShape)
  },

  // Paginated variant of events(): preserves the backend's `nextCursor` so a
  // screen can page through the *whole* result set (Load more / infinite
  // scroll) instead of being stuck on the first page. Same filters as events(),
  // plus `cursor` (from a prior page) and `limit`. Returns { events, nextCursor };
  // nextCursor is null when there are no more pages. A failed fetch degrades to
  // an empty page with a null cursor — honest, and stops further paging.
  eventsPage: async (filters = {}) => {
    const suffix = eventsQuery(filters)
    const { data, nextCursor } = await getPage(`/events${suffix}`, () => [])
    return { events: (data ?? []).map(toEventCardShape), nextCursor }
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

  // For-You recommendations. On a 401 (no session yet, e.g. /me hasn't landed)
  // or an empty personalized list, fall through to the real `/events?sort=popular`
  // list so the feed always renders live data — never the stale MOCK_EVENTS
  // (whose isoDate values are frozen to 2026-07 and get culled as "past" by
  // the client-side filter, producing the "only 2 events" symptom).
  recommendations: async (interests) => {
    let list = null
    try {
      const res = await fetch(apiUrl('/recommendations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ interests }),
      })
      if (res.ok) {
        const json = await res.json()
        list = json.data
      }
    } catch {
      // Network-only failure — fall through to popular events below.
    }
    const arr = list ?? []
    if (arr.length > 0) return arr.map(toEventCardShape)
    // Live popular events as the empty/unauthed fallback — no mock detour.
    const fallback = (await get('/events?sort=popular', () => [])) ?? []
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

  // Upload a new profile picture. Three steps, no mock fallback (a real upload
  // must genuinely persist): (1) ask the backend for a presigned PUT URL, (2) PUT
  // the raw file bytes straight to S3 — those bytes never touch our server — then
  // (3) save the resulting public URL on the user. Returns the updated SelfUser
  // (backend snake_case) so the caller can adopt it. Throws on any failure so the
  // UI can surface a real error and roll back.
  uploadAvatar: async (userId, file) => {
    const { upload_url, public_url } = await request(`/users/${userId}/avatar-upload-url`, {
      method: 'POST',
      body: { content_type: file.type },
    })
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!put.ok) throw new Error(`Upload failed (${put.status})`)
    return request(`/users/${userId}/avatar`, { method: 'PUT', body: { avatar_url: public_url } })
  },

  // Upload a new cover/banner image. Same three-step presigned flow as
  // uploadAvatar (ask for a URL → PUT bytes to S3 → save the public URL), just
  // pointed at the cover endpoints. Returns the updated SelfUser so the caller
  // can adopt it. Throws on any failure so the UI can surface a real error.
  uploadCover: async (userId, file) => {
    const { upload_url, public_url } = await request(`/users/${userId}/cover-upload-url`, {
      method: 'POST',
      body: { content_type: file.type },
    })
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!put.ok) throw new Error(`Upload failed (${put.status})`)
    return request(`/users/${userId}/cover`, {
      method: 'PUT',
      body: { cover_image_url: public_url },
    })
  },

  // People search (GET /api/users?q=…) — trigram fuzzy match, ranked by
  // similarity. Feeds the SocialFeed sidebar, ForYouFeed People rail, and the
  // new-message / group-chat picker. Backend rows carry snake_case fields
  // (display_name / avatar_url / is_verified) — we spread those through so
  // UserSearch keeps working, and also attach { name, avatar, verified }
  // aliases so the messaging picker and older FollowRow surfaces render
  // without knowing the field spelling. Mock fallback scans MOCK_ORGANIZERS
  // (already in client shape) so the picker still returns something when the
  // backend is offline. Handles are normalized to raw (no leading `@`) so
  // every render site can uniformly prefix `@` — mocks store `@lagosnights`,
  // the backend stores `lagosnights`; strip the prefix here to reconcile. []
  // on empty query.
  searchUsers: async (q) => {
    const term = String(q ?? '').trim()
    if (!term) return []
    const list = await get(`/users?q=${encodeURIComponent(term)}`, () => {
      const n = term.toLowerCase()
      return MOCK_ORGANIZERS.filter(
        (o) => o.name.toLowerCase().includes(n) || (o.handle ?? '').toLowerCase().includes(n),
      ).slice(0, 20)
    })
    return (list ?? []).map((u) => {
      const rawHandle = typeof u.handle === 'string' ? u.handle.replace(/^@/, '') : u.handle
      if (u.display_name !== undefined || u.avatar_url !== undefined) {
        return {
          ...u,
          handle: rawHandle,
          name: u.display_name || rawHandle || 'Someone',
          avatar: u.avatar_url || DEFAULT_AVATAR,
          verified: !!u.is_verified,
        }
      }
      return { ...u, handle: rawHandle }
    })
  },

  // Who's going to an event (GET /api/events/:id/attendees). Public. Returns
  // { users: PublicUser[], nextCursor, total } — total is the true going count
  // (rides the raw envelope), users is one page (viewer-relative is_following).
  // Falls back to an empty page so the attendee strip degrades to nothing rather
  // than throwing. Reads the envelope directly since getPage() drops `total`.
  eventAttendees: async (eventId, cursor) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    try {
      const res = await fetch(apiUrl(`/events/${eventId}/attendees${suffix}`), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      return {
        users: json.data ?? [],
        nextCursor: json.nextCursor ?? null,
        total: json.total ?? json.data?.length ?? 0,
      }
    } catch {
      return { users: [], nextCursor: null, total: 0 }
    }
  },

  // A user's public upcoming events they're going to (GET /users/:id/attending).
  // Public — the "Attending" tab on someone else's profile. Returns EventCards
  // (mapped to the UI shape); [] on failure. Skips mock `org-*` ids (no backend
  // row) so a mock organizer profile doesn't fire a doomed request.
  userAttending: async (id, cursor) => {
    if (!isUuid(id)) return []
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const rows = await get(`/users/${id}/attending${suffix}`, () => [])
    return (rows ?? []).map(toEventCardShape)
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

  // One page of a user's followers / following, for the follow-list modals.
  // Backend returns { data: [{ user: PublicUser, followed_at }], nextCursor };
  // we flatten to the PublicUser (carrying viewer-relative is_following) so the
  // shared UserResultList can render each row. [] + null cursor on any failure.
  followerList: (id, cursor) => followPage(`/users/${id}/followers`, cursor),
  followingList: (id, cursor) => followPage(`/users/${id}/following`, cursor),

  // RSVP / cancel for an event (no mock fallback — an RSVP must genuinely
  // persist). PUT sets status='going'; DELETE cancels. Both throw on failure so
  // the caller can roll back optimistic UI. Returns { event_rsvp_count, ... } so
  // a screen can sync the "N going" count.
  rsvp: (id) => request(`/events/${id}/rsvp`, { method: 'PUT', body: { status: 'going' } }),
  rsvpCancel: (id) => request(`/events/${id}/rsvp`, { method: 'DELETE' }),

  // Sports roster (planning §7.4). Sports runs use the roster, not RSVPs — the
  // backend explicitly rejects an RSVP on an is_sports event. positions() is
  // public; roster()/joinRun()/leaveRun() require auth. joinRun accepts an
  // optional positionId (the picker sends the position the user tapped) and an
  // optional slotNumber (host-managed runs may pin a slot). All three throw on
  // failure so SportsPickupDetail can roll back its optimistic Join state.
  positions: (id) => get(`/events/${id}/positions`, () => null),
  roster: (id) => request(`/events/${id}/roster`),
  joinRun: (id, { positionId, slotNumber } = {}) =>
    request(`/events/${id}/roster`, {
      method: 'POST',
      body: {
        ...(positionId ? { sports_position_id: positionId } : {}),
        ...(slotNumber != null ? { slot_number: slotNumber } : {}),
      },
    }),
  leaveRun: (id) => request(`/events/${id}/roster`, { method: 'DELETE' }),

  // Save / unsave for an event. Same shape as rsvp above — no mock fallback,
  // throws on failure so an optimistic UI can roll back. Every mutation writes
  // an interaction_events row on the backend, which triggers a rebuild of the
  // user's preference vector — so a subsequent /recommendations call reflects
  // the click on refresh.
  save: (id) => request(`/events/${id}/save`, { method: 'PUT' }),
  saveCancel: (id) => request(`/events/${id}/save`, { method: 'DELETE' }),

  // The caller's saved event ids (GET /api/users/:id/saved) — used to hydrate
  // saved state on login/refresh so the bookmark highlight survives a reload.
  // Returns the id array; [] on any failure so a hydration hiccup never blocks
  // the app. Mirrors api.goingEvents.
  savedEvents: async (id) => {
    try {
      const res = await request(`/users/${id}/saved`)
      return (res ?? []).map((row) => row.event?.id).filter(Boolean)
    } catch {
      return []
    }
  },

  // The caller's saved events as full EventCards (GET /api/users/:id/saved),
  // for the profile "Saved" tab. Unlike api.events() this returns the user's
  // actual saved events (incl. past / non-feed ones), newest first. [] on
  // failure so the tab degrades to its empty state rather than crashing.
  savedEventCards: async (id) => {
    try {
      const res = await request(`/users/${id}/saved`)
      return (res ?? [])
        .map((row) => row.event)
        .filter(Boolean)
        .map(toEventCardShape)
    } catch {
      return []
    }
  },

  // The caller's going events as full EventCards (GET /api/users/:id/rsvps?
  // status=going), for the profile "Going" tab. Same rationale as
  // savedEventCards — the true list, not a filter over the generic feed.
  goingEventCards: async (id) => {
    try {
      const res = await request(`/users/${id}/rsvps?status=going`)
      return (res ?? [])
        .map((row) => row.event)
        .filter(Boolean)
        .map(toEventCardShape)
    } catch {
      return []
    }
  },

  // Organizer dashboard (#32) — the event owner's view of who RSVP'd, plus
  // check-in. Both are owner-gated server-side (403 for non-organizers).
  //   eventRsvps: GET /api/events/:id/rsvps → { data:[{ id, user, status,
  //     guests_count, attended, checked_in_at, created_at }], nextCursor,
  //     counts:{ going, interested, waitlisted, attended } }. Returns the raw
  //     envelope so the screen can read counts + page. Degrades to an empty one.
  //   checkInAttendee: PATCH /api/events/:id/rsvps/:userId { attended:true } —
  //     fires the ranker's top-weight `attend` signal. Throws on 403/404 so the
  //     dashboard can surface it.
  eventRsvps: async (eventId, { status, cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    try {
      const res = await fetch(apiUrl(`/events/${eventId}/rsvps${suffix}`), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(String(res.status))
      return await res.json() // { data, nextCursor, counts }
    } catch {
      return {
        data: [],
        nextCursor: null,
        counts: { going: 0, interested: 0, waitlisted: 0, attended: 0 },
      }
    }
  },
  checkInAttendee: (eventId, userId) =>
    request(`/events/${eventId}/rsvps/${userId}`, {
      method: 'PATCH',
      body: { attended: true },
    }),

  // Events an organizer has published (GET /api/users/:id/events), for the
  // organizer-only "Events" tab on UserProfile. Same endpoint OrganizerProfile
  // uses, so upcoming/past ordering matches. [] on failure so the tab degrades
  // to its empty state rather than crashing.
  myEventCards: async (id, status = 'upcoming') => {
    try {
      const res = await request(`/users/${id}/events?status=${status}`)
      return (res ?? []).map(toEventCardShape)
    } catch {
      return []
    }
  },

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

  // Direct messaging (real endpoints; no mock fallback — DMs must genuinely
  // persist). Each helper returns the envelope's `data`, or a null-ish sentinel
  // on failure so callers stay optimistic without throwing. The SSE stream
  // isn't in this map — MessagesRealtime opens the EventSource directly since
  // it needs the raw event listener plumbing, not a promise.
  messages: {
    listThreads: async () => {
      try {
        const res = await request('/threads')
        return res ?? []
      } catch {
        return []
      }
    },
    getMessages: async (threadId, cursor) => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      try {
        const res = await fetch(apiUrl(`/threads/${threadId}/messages${qs}`), {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(String(res.status))
        return await res.json() // { data, nextCursor }
      } catch {
        return { data: [], nextCursor: null }
      }
    },
    createDm: (partnerId) =>
      request('/threads/dm', { method: 'POST', body: { partner_id: partnerId } }),
    createGroup: (participantIds, name) =>
      request('/threads/group', {
        method: 'POST',
        body: { participant_ids: participantIds, name: name || null },
      }),
    sendMessage: (threadId, { text, eventId, clientId } = {}) =>
      request(`/threads/${threadId}/messages`, {
        method: 'POST',
        body: {
          text: text || null,
          event_id: eventId || null,
          client_id: clientId || null,
        },
      }),
    markRead: (threadId) => request(`/threads/${threadId}/read`, { method: 'POST' }),
    deleteMessage: (threadId, messageId) =>
      request(`/threads/${threadId}/messages/${messageId}`, { method: 'DELETE' }),
    renameThread: (threadId, name) =>
      request(`/threads/${threadId}`, { method: 'PATCH', body: { name: name ?? null } }),
    // Toggle a reaction on a message — server flips insert/delete on the
    // composite key and echoes { op: 'added' | 'removed' } so the client can
    // roll back a mispredicted optimistic tap.
    react: (threadId, messageId, emoji = '❤️') =>
      request(`/threads/${threadId}/messages/${messageId}/react`, {
        method: 'POST',
        body: { emoji },
      }),
    // Typing is fire-and-forget — no need to await, no need to error a UI on
    // a dropped fetch. Called from the composer's onChange (throttled).
    typing: (threadId) => {
      try {
        void fetch(apiUrl(`/threads/${threadId}/typing`), {
          method: 'POST',
          credentials: 'include',
        })
      } catch {
        /* ignore */
      }
    },
    // The URL for MessagesRealtime's EventSource construction. Centralized so
    // API_BASE handling isn't duplicated across the provider.
    streamUrl: () => apiUrl('/messages/stream'),
  },

  // Posses (event group coordination). Real endpoints; mutations use request()
  // so a failure throws (with .status/.code) and the caller can surface it —
  // a posse action must genuinely persist. Reads return [] / null on failure so
  // a screen degrades rather than crashing.
  posses: {
    // My posses (any membership status), newest first.
    mine: async () => {
      try {
        return (await request('/posses')) ?? []
      } catch {
        return []
      }
    },
    // One posse with its full roster + my viewer state. Throws on 404/403 so the
    // detail screen can show a "not found / no access" state.
    get: (id) => request(`/posses/${id}`),
    // Discoverable posses for an event (public + eligible mutuals + mine).
    forEvent: async (eventId) => {
      try {
        return (await request(`/events/${eventId}/posses`)) ?? []
      } catch {
        return []
      }
    },
    // Cross-event discovery feed — public + reciprocal-mutuals posses for
    // upcoming events I'm not already in.
    discover: async () => {
      try {
        return (await request('/posses/discover')) ?? []
      } catch {
        return []
      }
    },
    create: ({ eventId, name, note, visibility, joinPolicy }) =>
      request('/posses', {
        method: 'POST',
        body: {
          event_id: eventId,
          name,
          note: note || null,
          visibility,
          join_policy: joinPolicy,
        },
      }),
    update: (id, fields) => request(`/posses/${id}`, { method: 'PATCH', body: fields }),
    // Join (open policy) or request (ask policy). Server returns 201 (active) or
    // 202 (pending) — both parse to the envelope's data here.
    join: (id) => request(`/posses/${id}/join`, { method: 'POST' }),
    invite: (id, userId) =>
      request(`/posses/${id}/invite`, { method: 'POST', body: { user_id: userId } }),
    // Invitee responds to their own invite. accept → active (+ RSVP going, so
    // the response carries rsvp_blocked); decline → the invite is removed.
    accept: (id) => request(`/posses/${id}/accept`, { method: 'POST' }),
    decline: (id) => request(`/posses/${id}/decline`, { method: 'POST' }),
    approve: (id, userId) => request(`/posses/${id}/members/${userId}/approve`, { method: 'POST' }),
    // Remove someone (captain) or leave (self) — same route, server decides by
    // whether uid === caller.
    removeMember: (id, userId) => request(`/posses/${id}/members/${userId}`, { method: 'DELETE' }),
    dissolve: (id) => request(`/posses/${id}`, { method: 'DELETE' }),
  },

  // Pre-event reminders (planning §7.5, work-plan #28). No mock fallback — a
  // reminder must genuinely persist, so the caller shows a real success/error.
  reminders: {
    // Schedule: server computes remind_at = starts_at − offset_minutes.
    // Throws (with .status) on 409 duplicate / 422 bad-time so the picker can
    // surface the message.
    create: (eventId, offsetMinutes, channel = 'in_app') =>
      request(`/events/${eventId}/reminders`, {
        method: 'POST',
        body: { offset_minutes: offsetMinutes, channel },
      }),
    // A user's reminders (owner only). Degrades to [] so the UI still renders.
    list: async (userId, { status, cursor, limit } = {}) => {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (cursor) qs.set('cursor', cursor)
      if (limit) qs.set('limit', String(limit))
      const suffix = qs.toString() ? `?${qs}` : ''
      try {
        const res = await fetch(apiUrl(`/users/${userId}/reminders${suffix}`), {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(String(res.status))
        const json = await res.json()
        return json.data ?? []
      } catch {
        return []
      }
    },
    cancel: (id) => request(`/reminders/${id}`, { method: 'DELETE' }),
  },

  // Instagram-style social feed (GET /api/feed/social; backend #29). Returns
  // client-shaped posts (see toClientPost) with live like_count + liked_by_me.
  // Falls back to the mock catalog so the SocialFeed always renders when the
  // backend is unreachable (matches api.posts()'s original behavior).
  feedSocial: async ({ cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    const { data, nextCursor } = await getPage(`/feed/social${suffix}`, () =>
      MOCK_POSTS.map((p) => mockPostToBackend(p)),
    )
    return { posts: (data ?? []).map(toClientPost), nextCursor }
  },

  // Create a post (POST /api/posts; backend #29). No mock fallback — a real post
  // must persist. `kind` is flyer/recap/update; image is a URL string; eventId
  // is optional. Returns the created post in client shape so the caller can
  // prepend it to the feed without a refetch.
  createPost: async ({ kind = 'update', imageUrl, caption, eventId } = {}) => {
    const created = await request('/posts', {
      method: 'POST',
      body: {
        kind,
        image_url: imageUrl,
        ...(caption ? { caption } : {}),
        ...(eventId ? { event_id: eventId } : {}),
      },
    })
    return toClientPost(created)
  },

  // Post an ephemeral story (POST /api/stories; backend #29). Expires in 24h
  // server-side. No mock fallback. Returns the raw created row ({ id, media_url,
  // … }); the SocialFeed refetches stories to regroup rings, so we keep it thin.
  createStory: ({ mediaUrl, caption, eventId } = {}) =>
    request('/stories', {
      method: 'POST',
      body: {
        media_url: mediaUrl,
        ...(caption ? { caption } : {}),
        ...(eventId ? { event_id: eventId } : {}),
      },
    }),

  // Upload a post/story image to S3 and return its public URL. Two steps,
  // mirroring uploadAvatar: (1) ask for a presigned PUT URL, (2) PUT the bytes
  // straight to S3 (they never touch our server). `kind` picks the S3 folder
  // ('post' | 'story'). Throws on failure; the 503 { code:'NOT_CONFIGURED' }
  // surfaces via err.status so the Composer can fall back to a URL input.
  uploadSocialImage: async (file, kind = 'post') => {
    const { upload_url, public_url } = await request('/uploads/social-image', {
      method: 'POST',
      body: { content_type: file.type, kind },
    })
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!put.ok) throw new Error(`Upload failed (${put.status})`)
    return public_url
  },

  // Upload a CreateEvent flyer to S3 and return its public URL (reuses the
  // presign flow, 'flyer' folder). Previously the form used a blob: URL that
  // only lived in the tab and was dropped on publish, so uploaded flyers never
  // showed on the created event — this persists the bytes so flyer_url resolves
  // everywhere. Throws (err.status===503 NOT_CONFIGURED) when S3 is off so the
  // caller can fall back to the AI generator / URL.
  uploadFlyer: async (file) => {
    const { upload_url, public_url } = await request('/uploads/social-image', {
      method: 'POST',
      body: { content_type: file.type, kind: 'flyer' },
    })
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!put.ok) throw new Error(`Upload failed (${put.status})`)
    return public_url
  },

  // Story rings grouped by author (GET /api/stories; backend #29). Each group is
  // { author, allViewed, stories:[{ id, mediaUrl, viewedByMe, ... }] }. Falls
  // back to an empty list (the StoriesRow still shows the "Your story" tile).
  stories: async ({ cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    const list = await get(`/stories${suffix}`, () => [])
    return (list ?? []).map(toClientStoryGroup)
  },

  // Like / unlike a post (POST/DELETE /api/posts/:id/like; backend #29). No mock
  // fallback — a like must genuinely persist so the count reconciles. Both throw
  // on failure so PostCard can roll back its optimistic flip. Returns
  // { post_id, like_count, liked }.
  likePost: (id) => request(`/posts/${id}/like`, { method: 'POST' }),
  unlikePost: (id) => request(`/posts/${id}/like`, { method: 'DELETE' }),

  // Comments on a post (GET/POST /api/posts/:id/comments; backend #29/#30).
  // list() is public and returns client-shaped comments; add() requires auth and
  // returns the created comment. list() degrades to [] so the card still renders.
  postComments: async (id, { parentId, cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (parentId) qs.set('parentId', parentId)
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    const list = await get(`/posts/${id}/comments${suffix}`, () => [])
    return (list ?? []).map(toClientComment)
  },
  addComment: (id, body, parentCommentId) =>
    request(`/posts/${id}/comments`, {
      method: 'POST',
      body: { body, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) },
    }).then(toClientComment),

  // Comments on an event (GET/POST /api/events/:id/comments; backend #30).
  // Same contract + client shape as post comments, keyed on the event id.
  eventComments: async (id, { parentId, cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (parentId) qs.set('parentId', parentId)
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    const list = await get(`/events/${id}/comments${suffix}`, () => [])
    return (list ?? []).map(toClientComment)
  },
  addEventComment: (id, body, parentCommentId) =>
    request(`/events/${id}/comments`, {
      method: 'POST',
      body: { body, ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}) },
    }).then(toClientComment),

  // Soft-delete a comment (DELETE /api/comments/:id; backend #30). Works for
  // both event and post comments; returns nothing (204) on success.
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),

  // --- Reviews (community rating + comments; attended-only) ------------------
  // An event review carries an event star rating (1-5, required), an optional
  // organizer star rating (1-5), and an optional body. A user is only allowed
  // to review a past event they were checked in for (rsvps.attended = true).
  //
  // eventReviewSummary: aggregate for the event + eligibility + the caller's
  //   current review row when signed in. Public read.
  eventReviewSummary: (id) =>
    get(`/events/${id}/reviews/summary`, () => ({
      event_id: id,
      organizer_id: null,
      count: 0,
      event_avg: null,
      organizer_avg: null,
      histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      eligibility: { eligible: false, reason: 'not_authenticated' },
      my_review: null,
    })),
  // eventReviews: paginated list of reviews on an event. Public read; degrades
  // to an empty page rather than throwing.
  eventReviews: async (id, { cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    return getPage(`/events/${id}/reviews${suffix}`, () => [])
  },
  // Upsert (create or edit) the caller's review for an event. The response is
  // the review row. Throws with err.code = 'NOT_ELIGIBLE' when the caller
  // hasn't been checked in for the event, so the UI can show a targeted hint.
  submitEventReview: (id, { eventRating, organizerRating, body }) =>
    request(`/events/${id}/reviews`, {
      method: 'PUT',
      body: {
        event_rating: eventRating,
        ...(organizerRating != null ? { organizer_rating: organizerRating } : {}),
        ...(body != null ? { body } : {}),
      },
    }),
  // Soft-delete the caller's review. Idempotent — a repeat delete is a no-op.
  deleteEventReview: (id) => request(`/events/${id}/reviews`, { method: 'DELETE' }),

  // Aggregate rating across every event this organizer has run — powers the
  // stars row on the OrganizerProfile header. Two averages:
  //   event_avg     — avg of every event_rating on their events (main signal)
  //   organizer_avg — avg of every optional organizer_rating (sparser)
  // Public read.
  organizerReviewSummary: (id) =>
    get(`/organizers/${id}/reviews/summary`, () => ({
      organizer_id: id,
      count: 0,
      event_count: 0,
      combined_count: 0,
      event_avg: null,
      organizer_avg: null,
      combined_avg: null,
      event_histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      organizer_histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      combined_histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    })),
  // Paginated list of every review that mentioned this organizer. Each row
  // carries the review + the { id, title, starts_at } of the event it was on.
  organizerReviews: async (id, { cursor, limit } = {}) => {
    const qs = new URLSearchParams()
    if (cursor) qs.set('cursor', cursor)
    if (limit) qs.set('limit', String(limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    return getPage(`/organizers/${id}/reviews${suffix}`, () => [])
  },

  // Report a post / comment / story (POST /api/reports). Idempotent (upserts on
  // reporter+target). Server returns { hidden: true } and, from the next list
  // fetch onward, subtracts the target from what this user sees. `targetType`
  // is 'post' | 'comment' | 'story'; `reason` is one of the enum values
  // (spam, harassment, hate, nudity, violence, self_harm, misinfo, other).
  reportContent: ({ targetType, targetId, reason, note }) =>
    request('/reports', {
      method: 'POST',
      body: {
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(note ? { note } : {}),
      },
    }),

  // Undo a report (DELETE /api/reports). Idempotent — a missing row still
  // returns 200 so a double-tap Undo doesn't 404. On success the target starts
  // showing again on the next list fetch.
  unreportContent: ({ targetType, targetId }) =>
    request('/reports', {
      method: 'DELETE',
      body: { target_type: targetType, target_id: targetId },
    }),

  // Mark a story viewed (POST /api/stories/:id/view; backend #29). Idempotent
  // and fire-and-forget — a failed seen-marker never blocks the UI, so we
  // swallow errors rather than throw.
  viewStory: (id) => request(`/stories/${id}/view`, { method: 'POST' }).catch(() => null),

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

  // Update a published or draft event the caller owns. Only sends the keys
  // the organizer actually changed so a form re-submit with no edits is a
  // 200 no-op. Backend fans out `event_updated` notifications for meaningful
  // field changes (schedule, venue, price, capacity, age policy).
  updateEvent: async (id, patch) => {
    const body = await toUpdateEventBody(patch)
    const updated = await request(`/events/${id}`, { method: 'PATCH', body })
    return toEventCardShape(updated)
  },

  // Cancel an event the caller owns. Idempotent: a second call on an already-
  // cancelled event 409s so the UI can toast "already cancelled" instead of
  // firing a duplicate notification. `reason` is optional; when provided it
  // shows up in the attendee notification body and on the cancelled banner.
  cancelEvent: async (id, reason) => {
    const body = reason ? { reason } : {}
    const cancelled = await request(`/events/${id}/cancel`, { method: 'POST', body })
    return toEventCardShape(cancelled)
  },

  // Organizer AI description writer (POST /api/ai/description). Groq-backed,
  // rewrites the organizer's rough notes into a short polished paragraph. No
  // mock fallback — a 503 surfaces to the UI as an inline error so the user
  // knows the AI writer isn't configured.
  generateDescription: ({ title, category, tone, notes }) =>
    request('/ai/description', {
      method: 'POST',
      body: { title, category, tone, notes },
    }),

  // Organizer AI flyer generation (POST /api/ai/flyer). No mock fallback: the
  // whole point is to hit OpenAI. Caller shows a spinner during the ~5-10s call
  // and drops the returned data URL straight into the CreateEvent flyer state.
  generateFlyer: ({ prompt, style, title, category }) =>
    request('/ai/flyer', {
      method: 'POST',
      body: { prompt, style, title, category },
    }),

  // Auto-tag preview (POST /api/ai/autotag). Rule-based, deterministic, free —
  // returns the interests + vibe + price tier we WOULD write if the organizer
  // hit Publish now. Called on a debounce as they type in the Create Event
  // form. Never throws in a way that blocks the UI; on failure the form just
  // hides the chips row.
  //
  // Returns:
  //   { interests: [{ slug, label, confidence, matched_keywords[] }],
  //     vibe: { slug, confidence, matched_keywords[] } | null,
  //     price_tier: 'free'|'$'|'$$'|'$$$' | null,
  //     category_fallback: { slug, label } | null }
  autotag: ({ title, description, isFree, priceMin, category }) =>
    request('/ai/autotag', {
      method: 'POST',
      body: {
        title: title ?? '',
        description: description ?? '',
        is_free: isFree ?? false,
        price_min: priceMin ?? null,
        category: category ?? null,
      },
    }),

  // Fire-and-forget behavior-signal beacon (POST /api/interactions). Best-
  // effort — every caller is optimistic UI, and a failed signal must never
  // block the user action that produced it. Feeds the recommender + organizer
  // analytics (surface breakdowns, share counts).
  interactions: (events) =>
    fetch(apiUrl('/interactions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ events }),
    }).catch(() => null),

  // Organizer analytics (§7.7). Both owner-gated on the backend; return the
  // full analytics envelope. Any failure surfaces as a thrown Error so the
  // page can render an inline error state.
  eventAnalytics: (id, { from, to } = {}) => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request(`/events/${id}/analytics${suffix}`)
  },
  organizerAnalytics: (id, { from, to } = {}) => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    const suffix = qs.toString() ? `?${qs}` : ''
    return request(`/organizers/${id}/analytics${suffix}`)
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

  // Title-only event search for the Discover search bar (POST /api/ai/search).
  // Case-insensitive substring match on event.title so a query like "fut" only
  // returns events whose title literally contains those letters — no semantic
  // fan-out, no NL parse, no pills. Offline fallback filters MOCK_EVENTS the
  // same way so both paths behave identically. `label` is accepted for
  // backwards compatibility with older callers but ignored.
  nlSearch: async (q) => {
    const res = await post('/ai/search', { q }, () => {
      const n = String(q ?? '')
        .trim()
        .toLowerCase()
      const events = n
        ? MOCK_EVENTS.map(withOrganizer).filter((e) => e.title?.toLowerCase().includes(n))
        : []
      return { reply: '', events: events.slice(0, 20), pills: [], label: {} }
    })
    return {
      reply: res.reply ?? '',
      events: (res.events ?? []).map(toEventCardShape),
      pills: res.pills ?? [],
      label: res.label ?? {},
    }
  },

  // Conversational assistant drawer (planning §7.6, work-plan #31). Persists
  // threads server-side via ai_conversations + ai_messages, retrieval grounded
  // in pgvector when embedding keys are set (keyword fallback otherwise), reply
  // drafted by Groq when GROQ_API_KEY is set (template fallback otherwise).
  //
  // Fallback strategy: when the backend is unreachable, everything degrades to
  // the legacy in-memory /ai/search path so the drawer still renders. `start`
  // and `get` return a synthetic id ('mock') the frontend recognizes to skip
  // the hydration fetch and stay stateless.
  ai: {
    startConversation: async () => {
      try {
        return await request('/ai/conversations', { method: 'POST', body: {} })
      } catch {
        return { id: 'mock', title: null, created_at: new Date().toISOString() }
      }
    },
    getConversation: async (id) => {
      if (!id || id === 'mock') return { id: 'mock', messages: [] }
      try {
        return await request(`/ai/conversations/${id}`)
      } catch {
        return { id, messages: [] }
      }
    },
    sendMessage: async (id, content) => {
      // Real thread: persist + ground on the backend.
      if (id && id !== 'mock') {
        try {
          const data = await request(`/ai/conversations/${id}/messages`, {
            method: 'POST',
            body: { content },
          })
          return {
            reply: data.message.content,
            events: (data.events ?? []).map(toEventCardShape),
          }
        } catch {
          // fall through to the legacy one-shot path
        }
      }
      // Legacy one-shot / logged-out / offline fallback.
      const res = await api.aiSearch(content)
      return { reply: res.reply, events: (res.events ?? []).map(toEventCardShape) }
    },
  },
}
