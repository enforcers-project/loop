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

function mockFilter({ category, isFree, isSports, q }) {
  let list = MOCK_EVENTS.map(withOrganizer)
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

export const api = {
  categories: () => get('/categories', () => MOCK_CATEGORIES),
  interests: () => get('/interests', () => MOCK_INTERESTS),

  events: (filters = {}) => {
    const qs = new URLSearchParams()
    if (filters.category && filters.category !== 'All') qs.set('category', filters.category)
    if (filters.isFree) qs.set('isFree', 'true')
    if (filters.isSports) qs.set('isSports', 'true')
    if (filters.q) qs.set('q', filters.q)
    if (filters.sort) qs.set('sort', filters.sort)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get(`/events${suffix}`, () => mockFilter(filters))
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
