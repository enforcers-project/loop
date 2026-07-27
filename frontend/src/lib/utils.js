/** Tiny classnames joiner. */
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

/** Figma categoryColors — the single source of truth for category tints. */
export const CATEGORY_COLOR = {
  Music: '#6D5EFC',
  Nightlife: '#FF2E74',
  Sports: '#16C784',
  Networking: '#2D8CFF',
  Food: '#FFB020',
  Campus: '#FF7A45',
}

// The four self-defined roles, each mapping the display label onto the backend
// triple {role, organizerKind, isHost}. Single source of truth: the RoleSelector
// (edit-profile + settings), roleLabelFor(), and the backend validator all key
// off this list. Attendee is the plain member; the other three are organizer
// flavors (a promoter is organizerKind='promoter'; a sports host is an organizer
// with the isHost capability). See planning §3/§10.
export const ROLE_OPTIONS = [
  {
    label: 'Attendee',
    description: 'Discover and RSVP to events.',
    role: 'attendee',
    organizerKind: null,
    isHost: false,
  },
  {
    label: 'Organizer',
    description: 'Create and manage your own events.',
    role: 'organizer',
    organizerKind: 'organizer',
    isHost: false,
  },
  {
    label: 'Promoter',
    description: 'Promote events and grow your audience.',
    role: 'organizer',
    organizerKind: 'promoter',
    isHost: false,
  },
  {
    label: 'Sports Host',
    description: 'Run casual pickup games.',
    role: 'organizer',
    organizerKind: 'organizer',
    isHost: true,
  },
]

// Resolve the display label for a user's stored role triple. Sports Host (the
// isHost capability) wins over the plain organizer/promoter kinds; a promoter is
// distinguished by organizerKind. Falls back to Attendee for anything unknown.
export function roleLabelFor({ role, organizerKind, isHost } = {}) {
  if (role !== 'organizer') return 'Attendee'
  if (isHost) return 'Sports Host'
  if (organizerKind === 'promoter') return 'Promoter'
  return 'Organizer'
}

/** Role badge tints (Figma RoleBadge variants). */
export const ROLE_STYLE = {
  Attendee: { bg: '#F7F7F8', text: '#6B6B76' },
  Organizer: { bg: '#F0EFFE', text: '#6D5EFC' },
  Promoter: { bg: '#FFE4EE', text: '#FF2E74' },
  'Sports Host': { bg: '#DFF7EC', text: '#16C784' },
}

export function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(n)
}

const IRREGULAR_PLURALS = { person: 'people' }

/**
 * English plural for a simple noun. Handles the common suffix rules (…y → …ies,
 * …s/x/z/ch/sh → …es) and a small irregulars map, defaulting to "+s". Only for
 * short countable nouns rendered right after a number — e.g. `${n} ${pluralize(n, 'like')}`.
 */
export function pluralize(n, word) {
  if (n === 1) return word
  const irregular = IRREGULAR_PLURALS[word]
  if (irregular) return irregular
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
  return `${word}s`
}

/**
 * Compact relative time ("3h", "2d", "just now") from an ISO timestamp — used
 * by the SocialFeed PostCard where the mock previously hardcoded `timeAgo`.
 * Returns '' for a missing/invalid input so the caller can render nothing.
 */
export function timeAgo(iso) {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  return `${Math.floor(days / 30)}mo`
}

/**
 * Has an event already happened? True once its end time (or start, when there's
 * no explicit end) is in the past. We prefer `endsAt` so an event that's
 * currently underway isn't prematurely marked "passed"; a backend `status` of
 * 'past' short-circuits to true even if the dates are missing/odd. Returns
 * false for anything unparseable so a bad date never hides a live event.
 *
 * Client-side guard: the backend already splits upcoming/past for real profile
 * feeds, but mock organizers and the Discover/For-You lists don't, so cards
 * everywhere lean on this to stay consistent.
 */
export function isEventPast(event, now = Date.now()) {
  if (!event) return false
  if (event.status === 'past') return true
  const end = event.endsAt || event.isoDate
  if (!end) return false
  const t = Date.parse(end)
  if (isNaN(t)) return false
  return t < now
}

/**
 * Normalize a raw recommendation rationale into a short, intentional badge
 * label — never long enough to truncate or overflow. Falls back to the
 * event category so "Because you like …" stays specific but concise.
 */
export function recommendationLabel(rationale, category) {
  if (!rationale) return 'Recommended'
  const r = rationale.toLowerCase()
  if (r.includes('friend')) return rationale.length <= 28 ? rationale : 'Friends going'
  if (r.includes('hosted by')) return 'From someone you follow'
  if (r.includes('saved')) return 'Similar to saved'
  if (r.includes('trending')) return 'Trending nearby'
  if (r.includes('popular')) return 'Popular near you'
  if (r.includes('follow')) return 'Recommended for you'
  if (r.includes('into this lately')) return 'Friends are into this'
  if (r.startsWith('because you like')) {
    return category ? `Because you like ${category}` : 'Recommended for you'
  }
  return rationale.length <= 28 ? rationale : 'Recommended for you'
}

/**
 * "Joined <Month YYYY>" from an ISO timestamp — used on the profile header to
 * show when the account was created. Returns '' for missing/invalid input so
 * the caller can conditionally render.
 */
export function formatJoinDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return 'Joined ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
