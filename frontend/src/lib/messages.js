// Local, client-only direct-message store. Persists to localStorage, keyed by
// the current user's id, so two browser profiles (or two logged-in demo
// accounts on the same browser) don't share threads. No backend calls — this
// is a demo layer that pairs with the mock-fallback pattern the rest of the
// app already uses for social data.
//
// Two thread kinds:
//   'dm'    — 1:1. threadId is deterministic across both sides (see threadIdFor).
//             thread.partner is the single other person.
//   'group' — 3+. threadId is deterministic from the sorted participant ids.
//             thread.participants is the full member list (excluding "me").
//             thread.name is an optional group title; if absent, the UI
//             derives one from the first few names.
// A group message carries `senderId` (the participant who sent it) alongside
// the same `from: 'me' | 'them'` marker used by DMs, so the view can attribute
// each bubble to the right avatar/name.
//
// Shape stored under `loop.messages.<userId>`:
//   { threads: { [threadId]: {
//       id, kind: 'dm'|'group',
//       partner?: {id,name,handle,avatar,verified},    // dm
//       participants?: [{...same shape}],              // group
//       name?: string,                                 // group (optional)
//       messages: [{id, from, senderId?, text?, event?, at}], updatedAt } } }
// `from` is 'me' | 'them' so we don't have to remember the caller's id.
// `event`, when present, is a slim snapshot of an event
// ({id, title, poster, date, venueName, city, price, isFree, isSports}) that
// the bubble renders as a mini-card — Instagram's "share to DM" flow.

import { useCallback, useSyncExternalStore } from 'react'
import { ORGANIZERS as MOCK_ORGANIZERS, POSTS as MOCK_POSTS } from '../data/seed'

const STORAGE_PREFIX = 'loop.messages.'
const listeners = new Set()

function keyFor(userId) {
  return `${STORAGE_PREFIX}${userId || 'anon'}`
}

// Read the whole store for one user. Returns a fresh object even on first
// read so callers can mutate a copy safely.
function readStore(userId) {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return { threads: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.threads !== 'object') {
      return { threads: {} }
    }
    return parsed
  } catch {
    return { threads: {} }
  }
}

function writeStore(userId, store) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(store))
  } catch {
    // Quota/private-mode failures — silently drop; the UI still has in-memory state.
  }
  // Invalidate the snapshot caches for this user so useSyncExternalStore
  // observes a new reference on the next getSnapshot call.
  snapshotCache.delete(userId ?? '__anon__')
  for (const k of threadCache.keys()) {
    if (k.startsWith(`${userId}::`)) threadCache.delete(k)
  }
  emit(userId)
}

// Cached snapshots per user, so useSyncExternalStore-style hooks can call
// listThreads() every render without generating a new array (which would loop
// React). Cleared on every write via writeStore().
const snapshotCache = new Map()

function emit(userId) {
  for (const fn of listeners) {
    try {
      fn(userId)
    } catch {
      // Never let a subscriber failure break another subscriber.
    }
  }
}

/** Subscribe to store changes for any user. Returns an unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// A tiny counter+timestamp id so two messages typed in the same millisecond
// still get distinct ids (Date.now alone can collide on paste-of-many).
let idCounter = 0
function newId(prefix) {
  idCounter = (idCounter + 1) % 1000000
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

// Deterministic thread id from the pair of participant ids so opening a
// thread twice always finds the same row (no matter who initiated).
export function threadIdFor(myId, partnerId) {
  const a = String(myId ?? '')
  const b = String(partnerId ?? '')
  return a < b ? `${a}::${b}` : `${b}::${a}`
}

// Deterministic group thread id from a sorted list of participant ids so
// re-opening a group composed of the same people lands on the same thread.
// Prefixed with `g::` so it can't collide with a DM id.
export function groupThreadId(participantIds) {
  const sorted = [...new Set(participantIds.map((id) => String(id ?? '')))]
    .filter(Boolean)
    .sort()
  return `g::${sorted.join('::')}`
}

// Normalize any of the shapes the app passes around (mock organizer, backend
// public user, PostCard author, comment author) into what the thread renders.
export function partnerFromAny(person) {
  if (!person) return null
  const id = person.id ?? person.authorId
  if (!id) return null
  return {
    id,
    name: person.name || person.display_name || person.author || 'Someone',
    handle: person.handle || (person.display_name ? `@${person.handle ?? ''}` : ''),
    avatar: person.avatar || person.avatar_url || person.authorAvatar || '',
    verified: !!(person.verified ?? person.is_verified),
  }
}

// Present a thread as { title, subtitle, avatars, verified } regardless of
// whether it's a DM or a group — the two rendering surfaces (list row, view
// header) can then share code and not care which kind they're looking at.
// - DM:    title = partner name, one avatar.
// - Group: title = the group's saved name if set, else the participant names
//          comma-joined (truncated in CSS by the caller). Avatars = up to 3
//          stacked. Verified only meaningful for DMs.
export function describeThread(thread) {
  if (!thread) return { title: '', subtitle: '', avatars: [], verified: false }
  if (thread.kind === 'group' && Array.isArray(thread.participants)) {
    const names = thread.participants.map((p) => p.name || 'Someone')
    const title = thread.name || names.join(', ')
    return {
      title,
      subtitle: `${thread.participants.length + 1} members`,
      avatars: thread.participants.slice(0, 3).map((p) => p.avatar || ''),
      verified: false,
      isGroup: true,
    }
  }
  const p = thread.partner
  return {
    title: p?.name || 'Someone',
    subtitle: p?.handle || '',
    avatars: p?.avatar ? [p.avatar] : [],
    verified: !!p?.verified,
    isGroup: false,
  }
}

// Look up a participant on a group thread by id. Falls back to null so the UI
// can render an "Unknown" bubble without crashing when a message references a
// participant that has been removed (future-proofing).
export function participantOf(thread, senderId) {
  if (!thread || !senderId) return null
  if (thread.kind === 'group') {
    return thread.participants?.find((p) => p.id === senderId) ?? null
  }
  if (thread.partner?.id === senderId) return thread.partner
  return null
}

// Unread means: latest message is FROM the partner AND arrived after readAt.
// Seed scripts end on a `them` line without a readAt, which is exactly the
// state we want for the demo — the blob shows a badge on first load.
function threadIsUnread(thread) {
  const last = thread?.messages?.[thread.messages.length - 1]
  if (!last || last.from !== 'them') return false
  if (!thread.readAt) return true
  return Date.parse(last.at) > Date.parse(thread.readAt)
}

/** All threads for a user, most-recent first. Cached until the next write.
 *  Each thread is decorated with a derived `unread` boolean so consumers
 *  (widget blob, inbox row) can render badges without recomputing. */
export function listThreads(userId) {
  if (!userId) return EMPTY
  const cacheKey = userId
  const cached = snapshotCache.get(cacheKey)
  if (cached) return cached
  const store = readStore(userId)
  ensureSeeded(userId, store)
  const list = Object.values(store.threads)
    .map((t) => ({ ...t, unread: threadIsUnread(t) }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  snapshotCache.set(cacheKey, list)
  return list
}

// Frozen empty array so useSyncExternalStore-style hooks see a stable
// reference when the caller has no user (logged out).
const EMPTY = Object.freeze([])

/** One thread by id. Cached until the next write for identity stability. */
export function getThread(userId, threadId) {
  if (!userId || !threadId) return null
  const cacheKey = `${userId}::${threadId}`
  const cached = threadCache.get(cacheKey)
  if (cached) return cached
  const store = readStore(userId)
  ensureSeeded(userId, store)
  const thread = store.threads[threadId] ?? null
  if (thread) threadCache.set(cacheKey, thread)
  return thread
}

const threadCache = new Map()

// Ensure a thread exists for (me, partner) and return its id. If it's new,
// the caller sees an empty message list they can immediately type into.
export function ensureThread(userId, partner) {
  if (!userId || !partner?.id) return null
  const store = readStore(userId)
  ensureSeeded(userId, store)
  const id = threadIdFor(userId, partner.id)
  if (!store.threads[id]) {
    store.threads[id] = {
      id,
      kind: 'dm',
      partner: partnerFromAny(partner),
      messages: [],
      updatedAt: new Date().toISOString(),
    }
    writeStore(userId, store)
  } else {
    // Refresh partner metadata in case the caller has newer info (name/avatar).
    const fresh = partnerFromAny(partner)
    if (fresh) {
      store.threads[id].partner = { ...store.threads[id].partner, ...fresh }
      store.threads[id].kind = store.threads[id].kind || 'dm'
      writeStore(userId, store)
    }
  }
  return id
}

// Ensure a group thread exists with the given partners (2+ people beyond the
// caller). Returns its id, or null if fewer than two partners were supplied
// (that's a DM — the caller should use ensureThread). `name` is optional; when
// absent the UI derives one from the participants.
export function ensureGroupThread(userId, partners, name) {
  if (!userId || !Array.isArray(partners)) return null
  const normalized = partners
    .map((p) => partnerFromAny(p))
    .filter((p) => p && p.id && p.id !== userId)
  // De-dupe by id so the same person selected twice doesn't inflate the group.
  const seen = new Set()
  const uniq = []
  for (const p of normalized) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    uniq.push(p)
  }
  if (uniq.length < 2) return null
  const store = readStore(userId)
  ensureSeeded(userId, store)
  const id = groupThreadId([userId, ...uniq.map((p) => p.id)])
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!store.threads[id]) {
    store.threads[id] = {
      id,
      kind: 'group',
      participants: uniq,
      name: trimmedName || null,
      messages: [],
      updatedAt: new Date().toISOString(),
    }
    writeStore(userId, store)
  } else {
    // Refresh participant metadata; if the caller supplied a name and the
    // group had none, adopt it. Existing names stick.
    store.threads[id].participants = uniq
    store.threads[id].kind = 'group'
    if (trimmedName && !store.threads[id].name) {
      store.threads[id].name = trimmedName
    }
    writeStore(userId, store)
  }
  return id
}

/** Send a message from `me` in `threadId`; returns the created message. */
export function sendMessage(userId, threadId, text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return null
  return appendOwnMessage(userId, threadId, { text: trimmed })
}

// Slim projection of an event that survives serialization — anything Loop
// renders in a mini-card belongs here. Keeps the message payload bounded so
// localStorage never balloons even after many shares.
function slimEvent(event) {
  if (!event || !event.id) return null
  return {
    id: event.id,
    title: event.title || 'Event',
    poster: event.poster || '',
    date: event.date || '',
    venueName: event.venueName || '',
    city: event.city || '',
    price: event.price || '',
    isFree: !!event.isFree,
    isSports: !!event.isSports,
  }
}

/**
 * Send an event share (optional note + event mini-card) into `threadId`.
 * Returns the created message, or null if the event is missing / the thread
 * doesn't exist.
 */
export function sendEventShare(userId, threadId, event, note) {
  const slim = slimEvent(event)
  if (!slim) return null
  const trimmedNote = typeof note === 'string' ? note.trim() : ''
  return appendOwnMessage(userId, threadId, {
    text: trimmedNote || null,
    event: slim,
  })
}

// Shared "me" append. Handles the store write, readAt bump, and fake-reply
// scheduling so sendMessage + sendEventShare stay identical in behaviour.
function appendOwnMessage(userId, threadId, payload) {
  if (!userId || !threadId) return null
  const store = readStore(userId)
  const thread = store.threads[threadId]
  if (!thread) return null
  const at = new Date().toISOString()
  const message = {
    id: newId('m'),
    from: 'me',
    senderId: userId,
    text: payload.text ?? null,
    ...(payload.event ? { event: payload.event } : {}),
    at,
  }
  thread.messages.push(message)
  thread.updatedAt = at
  // Sending IS reading — mark our own message as seen so the unread badge
  // doesn't include the line we just typed.
  thread.readAt = at
  writeStore(userId, store)
  // Cheap chat illusion: the other side "replies" a few seconds later with a
  // canned line. Groups get one reply per participant, spaced apart, so it
  // feels like a real conversation.
  scheduleFakeReply(userId, threadId, { forEvent: !!payload.event })
  return message
}

/** Mark a thread's newest partner message as read up to now. */
export function markThreadRead(userId, threadId) {
  if (!userId || !threadId) return
  const store = readStore(userId)
  const thread = store.threads[threadId]
  if (!thread) return
  const stamp = thread.updatedAt || new Date().toISOString()
  if (thread.readAt === stamp) return
  thread.readAt = stamp
  writeStore(userId, store)
}

/** Count of threads with at least one unread partner message. */
export function unreadCount(userId) {
  if (!userId) return 0
  return listThreads(userId).filter((t) => t.unread).length
}

// Canned replies the partner sends back. Rotated by thread hash so two threads
// don't produce the same first reply.
const CANNED_REPLIES = [
  'Yes! I was just about to hit you up 🔥',
  'lol appreciate that — you making it out?',
  'For sure. We back at it this weekend?',
  'Man 😂 you already know',
  'Send me the flyer whenever, I got you',
  'Yeah RSVP is live — grab yours before it caps',
  "Let's link. What time works?",
  'Guest list is open till Friday — want me to add a +1?',
]
// Event-share specific replies — reads like a real reaction to the flyer that
// just showed up in the DM rather than a generic canned line.
const EVENT_SHARE_REPLIES = [
  'Ooh this looks fire 🔥 I might pull up',
  'Wait this is exactly my vibe, sending it to my group',
  'Bet — RSVPing right now',
  "Damn I've been meaning to check them out. We linking?",
  'lock in a +1 for me if you got the plug',
  "Nice — what time you rolling?",
  'omg saved. thanks for the heads up 🙏',
]
function pickReply(seed, kind = 'text') {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const pool = kind === 'event' ? EVENT_SHARE_REPLIES : CANNED_REPLIES
  return pool[Math.abs(h) % pool.length]
}

// Push one canned reply into the thread. `senderId` picks which participant is
// speaking (groups); DMs pass the partner id. Guards against the fake reply
// firing after the user has typed again — the illusion breaks if the "other
// side" cuts into a monologue. `kind` picks the pool ('event' → reactions to a
// shared flyer, otherwise the default chatter pool).
function postFakeReply(userId, threadId, senderId, seed, kind = 'text') {
  const store = readStore(userId)
  const thread = store.threads[threadId]
  if (!thread) return
  const last = thread.messages[thread.messages.length - 1]
  if (!last || last.from !== 'me') return
  const at = new Date().toISOString()
  thread.messages.push({
    id: newId('m'),
    from: 'them',
    senderId,
    text: pickReply(seed, kind),
    at,
  })
  thread.updatedAt = at
  writeStore(userId, store)
}

function scheduleFakeReply(userId, threadId, opts = {}) {
  const store = readStore(userId)
  const thread = store.threads[threadId]
  if (!thread) return
  const kind = opts.forEvent ? 'event' : 'text'
  // Groups: schedule a reply for each participant, staggered so they feel like
  // separate people responding rather than a chorus firing at the same tick.
  if (thread.kind === 'group' && Array.isArray(thread.participants)) {
    thread.participants.forEach((p, i) => {
      const delay = 1500 + i * 1200 + Math.floor(Math.random() * 1500)
      setTimeout(
        () => postFakeReply(userId, threadId, p.id, `${threadId}::${p.id}::${kind}`, kind),
        delay,
      )
    })
    return
  }
  // DMs: one reply, senderId = the partner.
  const delay = 1500 + Math.floor(Math.random() * 2500)
  setTimeout(() => {
    postFakeReply(userId, threadId, thread.partner?.id ?? null, `${threadId}::${kind}`, kind)
  }, delay)
}

/** Total number of threads (unused right now, but handy for a badge later). */
export function threadCount(userId) {
  if (!userId) return 0
  return Object.keys(readStore(userId).threads).length
}

// --- Seeded threads ---------------------------------------------------------
// Give a new user two or three plausible existing DMs so the inbox never
// looks empty. Seeded once per user (idempotent) and only when the store is
// empty — we never overwrite real user content.
const SEED_MARK = '__seeded__'

function ensureSeeded(userId, store) {
  if (!userId) return
  if (store[SEED_MARK]) return
  if (Object.keys(store.threads).length > 0) {
    store[SEED_MARK] = true
    writeStore(userId, store)
    return
  }
  const now = Date.now()
  const seeds = pickSeedPartners()
  for (const [i, partner] of seeds.entries()) {
    const id = threadIdFor(userId, partner.id)
    // Stagger updatedAt so the list renders in a natural order.
    const base = now - (i + 1) * 3600000 // an hour apart
    const script = SEED_SCRIPTS[i % SEED_SCRIPTS.length]
    store.threads[id] = {
      id,
      kind: 'dm',
      partner: partnerFromAny(partner),
      messages: script.map((m, j) => ({
        id: `seed-${i}-${j}`,
        from: m.from,
        senderId: m.from === 'me' ? userId : partner.id,
        text: m.text,
        at: new Date(base + j * 90000).toISOString(),
      })),
      updatedAt: new Date(base + (script.length - 1) * 90000).toISOString(),
    }
  }
  store[SEED_MARK] = true
  writeStore(userId, store)
}

function pickSeedPartners() {
  // Prefer verified organizers first (feels closer to the reference
  // screenshot), then fall back to the first post authors so the seed feels
  // connected to something the user has actually seen in the feed.
  const orgs = MOCK_ORGANIZERS.filter((o) => o.verified).slice(0, 2)
  const seen = new Set(orgs.map((o) => o.id))
  const morePeople = []
  for (const p of MOCK_POSTS) {
    const org = MOCK_ORGANIZERS.find((o) => o.id === p.organizerId)
    if (org && !seen.has(org.id)) {
      seen.add(org.id)
      morePeople.push(org)
      if (morePeople.length >= 1) break
    }
  }
  return [...orgs, ...morePeople].slice(0, 3)
}

const SEED_SCRIPTS = [
  [
    { from: 'them', text: 'Ayo, you making it to the rooftop set on Sunday?' },
    { from: 'me', text: 'Trying to — is the guest list still open?' },
    { from: 'them', text: 'Yeah, drop your +1 by Friday. I got you 🕺' },
  ],
  [
    { from: 'them', text: 'Nice recap post 👀 how was the crowd?' },
    { from: 'me', text: 'Wildddd. Best one yet, easily.' },
    { from: 'them', text: "Bet — we're already planning the next one. Stay tuned." },
  ],
  [
    { from: 'them', text: 'Send me the flyer when you get a sec' },
    { from: 'me', text: 'On it — dropping tonight.' },
  ],
]

// --- React bridges ---------------------------------------------------------
// Shared useSyncExternalStore wrappers so the widget, inbox, and thread views
// don't each re-implement the subscribe/getSnapshot pair. `getSnapshot`
// returns the cached list/thread — writeStore() clears those caches, so the
// returned reference is stable between writes (satisfies useSyncExternalStore).

export function useThreads(userId) {
  const s = useCallback(() => listThreads(userId), [userId])
  const sub = useCallback(
    (cb) =>
      subscribe((changedUserId) => {
        if (changedUserId === userId) cb()
      }),
    [userId],
  )
  return useSyncExternalStore(sub, s, () => EMPTY)
}

export function useThread(userId, threadId) {
  const s = useCallback(() => getThread(userId, threadId), [userId, threadId])
  const sub = useCallback(
    (cb) =>
      subscribe((changedUserId) => {
        if (changedUserId === userId) cb()
      }),
    [userId],
  )
  return useSyncExternalStore(sub, s, () => null)
}

export function useUnreadCount(userId) {
  const s = useCallback(() => unreadCount(userId), [userId])
  const sub = useCallback(
    (cb) =>
      subscribe((changedUserId) => {
        if (changedUserId === userId) cb()
      }),
    [userId],
  )
  return useSyncExternalStore(sub, s, () => 0)
}
