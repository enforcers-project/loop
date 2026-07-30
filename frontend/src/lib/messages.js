// Real messaging client — backed by /api/threads/* + an SSE stream (see
// `frontend/src/context/MessagesRealtime.jsx`). Message rows and thread state
// live in an in-memory store; useSyncExternalStore hooks bridge that store to
// React. Every previously-exported name is preserved so existing importers
// (MessagesPage, MessagesWidget, messages.jsx, ShareEventSheet) keep working.
//
// Thread shape after normalization (what UIs see):
//   {
//     id,                                // whichever id we've heard for it
//     kind: 'dm' | 'group',              // derived from participants.length
//     partner: {id,name,handle,avatar,verified}?  // dm only, computed
//     participants: [...same shape]?     // group only, computed (excludes me)
//     name: string|null,
//     messages: [{id, from, senderId, text?, event?, post?, at, status?, clientId?}]
//     updatedAt,
//     lastReadByUser: { [userId]: ISO|null },  // per-participant lastReadAt
//     unread: bool,                      // for the current viewer
//     serverId: uuid|null,               // real server id once we know it
//   }
//
// A message's `status` is only meaningful for outbound (mine) rows:
//   - 'sending'   : we've POSTed and haven't heard back yet
//   - 'delivered' : the POST succeeded (or the SSE echo landed)
//   - 'failed'    : the POST rejected
//   - 'read'      : any *other* participant's lastReadAt ≥ message.at
// The `statusFor()` selector derives 'read' at read time from lastReadByUser,
// so we don't have to store 'read' on the message itself.

import { useCallback, useSyncExternalStore } from 'react'
import { api } from './api'

// --- store ------------------------------------------------------------------

const state = {
  // Threads keyed by whichever id the caller / server first told us. When a
  // temporary optimistic id reconciles to the real server uuid, both keys point
  // at the same thread object until the temp id is cleaned up.
  threads: new Map(),
  // Per-thread typing markers: threadId → { [userId]: { at, name } }.
  typing: new Map(),
}
const aliasToReal = new Map() // temp/optimistic id → real server id
// Messages that arrived via SSE before we knew the thread; replayed after the
// next hydrate lands the thread row.
const pendingMessagesByThread = new Map()

const listeners = new Set()
function emit() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      /* never let one subscriber break another */
    }
  }
}
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// A counter-suffixed id so messages typed in the same ms still get unique ids.
let idCounter = 0
function newId(prefix) {
  idCounter = (idCounter + 1) % 1000000
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

// Deterministic ids used ONLY as placeholders until the server hands back the
// real uuid. Kept for compatibility with ShareEventSheet / callers that need
// an id synchronously.
export function threadIdFor(myId, partnerId) {
  const a = String(myId ?? '')
  const b = String(partnerId ?? '')
  return a < b ? `tmp::${a}::${b}` : `tmp::${b}::${a}`
}
export function groupThreadId(participantIds) {
  const sorted = [...new Set(participantIds.map((id) => String(id ?? '')))].filter(Boolean).sort()
  return `tmpg::${sorted.join('::')}`
}

// Resolve any thread id (real or an old alias) to the current server id if we
// know one — otherwise return the id itself so the store lookup still works.
function resolveId(id) {
  return aliasToReal.get(id) ?? id
}

// Normalize a person shape from any of the picker/organizer/backend rows.
export function partnerFromAny(person) {
  if (!person) return null
  const id = person.id ?? person.user?.id ?? person.authorId
  if (!id) return null
  const rawHandle =
    typeof person.handle === 'string' && person.handle
      ? person.handle.replace(/^@/, '')
      : person.handle || person.user?.handle || ''
  return {
    id,
    name:
      person.name ||
      person.display_name ||
      person.user?.display_name ||
      person.author ||
      rawHandle ||
      'Someone',
    handle: rawHandle,
    avatar:
      person.avatar || person.avatar_url || person.user?.avatar_url || person.authorAvatar || '',
    verified: !!(person.verified ?? person.is_verified ?? person.user?.is_verified),
  }
}

// --- normalization ----------------------------------------------------------

// The store keeps threads in a shape the UI has always spoken. Server rows
// carry `participants` as {user_id, user:{...}, last_read_at}; we split those
// into DM `partner` vs group `participants[]` + a `lastReadByUser` map.
function normalizeServerThread(row, meId) {
  const participants = row.participants ?? []
  const others = participants
    .filter((p) => p.user_id !== meId)
    .map((p) => partnerFromAny(p.user))
    .filter(Boolean)
  const kind = participants.length >= 3 ? 'group' : 'dm'
  const lastReadByUser = Object.fromEntries(
    participants.map((p) => [p.user_id, p.last_read_at ?? null]),
  )
  return {
    id: row.id,
    serverId: row.id,
    kind,
    ...(kind === 'dm' ? { partner: others[0] ?? null } : { participants: others }),
    name: row.name ?? null,
    messages: [], // fetched separately via getMessages / SSE
    updatedAt: row.last_message_at || row.created_at || new Date().toISOString(),
    lastReadByUser,
    readAtLocal: lastReadByUser[meId] ?? null,
  }
}

function normalizeServerMessage(row, meId) {
  const senderId = row.sender_id
  // Reactions arrive as [{user_id, emoji}] — normalize to [{userId, emoji}].
  const reactions = Array.isArray(row.reactions)
    ? row.reactions.map((r) => ({ userId: r.user_id ?? r.userId, emoji: r.emoji }))
    : []
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    from: senderId === meId ? 'me' : 'them',
    senderId,
    text: row.text ?? null,
    event: row.attached_event ?? null,
    post: normalizeAttachedPost(row.attached_post),
    at: row.created_at,
    status: senderId === meId ? 'delivered' : undefined,
    reactions,
  }
}

// Snapshotted post attachment — shape mirrors the backend snake_case snapshot,
// but the client renders it in camelCase like the rest of the store. The
// author sub-object is nullable (the source post's author may have been
// deleted since the share happened).
function normalizeAttachedPost(raw) {
  if (!raw || !raw.id) return null
  const author = raw.author
    ? {
        id: raw.author.id,
        name: raw.author.display_name || raw.author.name || 'Someone',
        handle: typeof raw.author.handle === 'string' ? raw.author.handle.replace(/^@/, '') : '',
        avatar: raw.author.avatar_url || raw.author.avatar || '',
        verified: !!(raw.author.is_verified ?? raw.author.verified),
      }
    : null
  return {
    id: raw.id,
    eventId: raw.event_id ?? null,
    kind: raw.kind ?? 'update',
    image: raw.image_url || raw.image || '',
    caption: raw.caption || '',
    createdAt: raw.created_at || null,
    author,
  }
}

function threadIsUnread(thread, meId) {
  if (!thread) return false
  const lastRead = thread.lastReadByUser?.[meId] ?? thread.readAtLocal ?? null
  const readAt = lastRead ? Date.parse(lastRead) : 0
  // Fresh partner message → unread.
  const last = thread.messages?.[thread.messages.length - 1]
  if (last && last.from === 'them') {
    if (!readAt) return true
    if (Date.parse(last.at) > readAt) return true
  }
  // Someone hearted my message → unread until I open the thread. lastReactionAt
  // is bumped in ingestReaction whenever another user adds a reaction to one of
  // my outbound bubbles.
  if (thread.lastReactionAt) {
    if (Date.parse(thread.lastReactionAt) > readAt) return true
  }
  return false
}

// --- describe / participant lookup (shape-compatible with old exports) -----

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
  const raw = typeof p?.handle === 'string' ? p.handle.replace(/^@/, '') : ''
  return {
    title: p?.name || 'Someone',
    subtitle: raw ? `@${raw}` : '',
    avatars: p?.avatar ? [p.avatar] : [],
    verified: !!p?.verified,
    isGroup: false,
  }
}

export function participantOf(thread, senderId) {
  if (!thread || !senderId) return null
  if (thread.kind === 'group') {
    return thread.participants?.find((p) => p.id === senderId) ?? null
  }
  if (thread.partner?.id === senderId) return thread.partner
  return null
}

// --- store mutations (called by the SSE bridge, API helpers, wrappers) -----

/** Merge a hydration response into the current thread map. NEVER clears state —
 *  a reconnect-triggered rehydrate must not wipe an open thread's message
 *  history or destroy an object the UI is holding a reference to. Rows we
 *  already know about are mutated in place; brand new rows are inserted. */
export function replaceThreads(rows, meId) {
  const serverIdsSeen = new Set()
  for (const row of rows) {
    const norm = normalizeServerThread(row, meId)
    serverIdsSeen.add(norm.id)
    const existing = state.threads.get(norm.id)
    if (existing) {
      // Mutate in place — the UI (useThread, ThreadView) is holding this ref.
      existing.id = norm.id
      existing.serverId = norm.id
      existing.kind = norm.kind
      if (norm.kind === 'dm') {
        existing.partner = norm.partner ?? existing.partner
        delete existing.participants
      } else {
        existing.participants = norm.participants ?? existing.participants
        delete existing.partner
      }
      existing.name = norm.name ?? existing.name
      existing.lastReadByUser = { ...(existing.lastReadByUser ?? {}), ...norm.lastReadByUser }
      existing.readAtLocal = norm.readAtLocal ?? existing.readAtLocal
      existing.updatedAt = norm.updatedAt || existing.updatedAt
      // Merge the newest server message into our list. Empty → seed it. Non-empty
      // → dedupe append if it's a message we don't have yet. This is the recovery
      // path when SSE has silently dropped: a rehydrate must land the missed row,
      // not just bump `updatedAt`. Otherwise the preview + ThreadView would keep
      // showing the stale bubble and the only way out would be a page refresh.
      if (row.last_message) {
        const incoming = normalizeServerMessage(row.last_message, meId)
        if (!existing.messages || existing.messages.length === 0) {
          existing.messages = [incoming]
        } else if (!existing.messages.some((m) => m.id === incoming.id)) {
          // If this is our own optimistic bubble echoing back, reconcile by
          // clientId (same logic ingestMessage uses) so we don't double-render.
          const byClient =
            incoming.clientId &&
            existing.messages.find((m) => m.clientId && m.clientId === incoming.clientId)
          if (byClient) {
            byClient.id = incoming.id
            byClient.at = incoming.at
            byClient.status = 'delivered'
            existing.messages = [...existing.messages]
          } else {
            const merged = [...existing.messages, incoming].sort(
              (a, b) => Date.parse(a.at) - Date.parse(b.at),
            )
            existing.messages = merged
          }
        }
        // If the newest server message is ahead of what we hold locally there
        // may be additional missed rows (the server hydrate only carries the
        // single last_message). Fetch a page in the background so nothing is
        // stuck in-between. Guarded by a per-thread in-flight promise so a
        // 60s poll + a visibility rehydrate don't stampede /threads/:id/messages.
        const localLast = existing.messages[existing.messages.length - 1]
        const serverAt = Date.parse(row.last_message.created_at ?? row.last_message.createdAt ?? 0)
        const localAt = localLast ? Date.parse(localLast.at) : 0
        if (serverAt > 0 && localAt > 0 && serverAt > localAt + 1) {
          kickBackfill(existing.serverId, meId)
        }
      }
    } else {
      const fresh = norm
      if (row.last_message) fresh.messages = [normalizeServerMessage(row.last_message, meId)]
      state.threads.set(fresh.id, fresh)
    }
    // Bind the deterministic temp id → real server id for DMs, and if a temp
    // stub with that id is still in the map, fold it into the real thread.
    if (norm.kind === 'dm' && norm.partner?.id) {
      const tempId = threadIdFor(meId, norm.partner.id)
      aliasToReal.set(tempId, norm.id)
      const stub = state.threads.get(tempId)
      const real = state.threads.get(norm.id)
      if (stub && stub !== real) {
        // Preserve any optimistic messages the stub was holding. Merge into
        // real.messages by clientId (or dedupe by id) so an optimistic bubble
        // is never silently dropped when the temp thread reconciles to a real
        // one that also carries a last_message.
        if (stub.messages?.length) {
          const seenIds = new Set((real.messages ?? []).map((m) => m.id))
          const seenClients = new Set(
            (real.messages ?? []).filter((m) => m.clientId).map((m) => m.clientId),
          )
          const carryover = stub.messages.filter(
            (m) => !seenIds.has(m.id) && (!m.clientId || !seenClients.has(m.clientId)),
          )
          if (carryover.length > 0) {
            const merged = [...(real.messages ?? []), ...carryover].sort(
              (a, b) => Date.parse(a.at) - Date.parse(b.at),
            )
            real.messages = merged
          }
        }
        state.threads.delete(tempId)
      }
    }
  }
  emit()
}

/** Merge a paginated message page (or a single server message) into the
 *  thread's message list. Reconciles optimistic-by-clientId rows and dedupes
 *  by server id, then sorts chronologically. IMPORTANT: never mutate the
 *  existing messages array in place — React's useMemo compares by reference,
 *  and mutating would leave the message list stale in the UI. Always assign a
 *  fresh array. */
export function mergeMessages(threadIdRaw, rows, meId) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return
  const incoming = rows.map((r) => normalizeServerMessage(r, meId))
  const byId = new Map(t.messages.map((m) => [m.id, m]))
  const byClient = new Map(t.messages.filter((m) => m.clientId).map((m) => [m.clientId, m]))
  const additions = []
  for (const m of incoming) {
    if (m.id && byId.has(m.id)) continue
    if (m.clientId && byClient.has(m.clientId)) {
      const existing = byClient.get(m.clientId)
      existing.id = m.id
      existing.at = m.at
      existing.status = 'delivered'
      byId.set(m.id, existing)
      continue
    }
    additions.push(m)
    byId.set(m.id, m)
  }
  if (additions.length > 0 || incoming.some((m) => byClient.has(m.clientId))) {
    const merged = [...t.messages, ...additions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    t.messages = merged
    t.updatedAt = merged[merged.length - 1]?.at ?? t.updatedAt
  }
  emit()
}

/** Handle a live `message` SSE frame. */
export function ingestMessage(threadIdRaw, row, meId) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) {
    // Message arrived for a thread we don't know yet (e.g. someone DMed us
    // before we hydrated). Kick a hydrate so the widget gets the row, then
    // replay this message once the thread lands.
    pendingMessagesByThread.set(id, [...(pendingMessagesByThread.get(id) ?? []), row])
    kickHydrate(meId).then(() => {
      const pending = pendingMessagesByThread.get(id)
      if (!pending) return
      pendingMessagesByThread.delete(id)
      for (const r of pending) ingestMessage(id, r, meId)
    })
    return
  }
  const incoming = normalizeServerMessage(row, meId)
  // If we sent this optimistically, reconcile by clientId. Mutating the
  // existing bubble is fine (React only diffs the message array reference,
  // and we replace it below to force a re-render).
  if (incoming.from === 'me' && incoming.clientId) {
    const existing = t.messages.find((m) => m.clientId === incoming.clientId)
    if (existing) {
      existing.id = incoming.id
      existing.at = incoming.at
      existing.status = 'delivered'
      t.messages = [...t.messages]
      t.updatedAt = incoming.at
      emit()
      return
    }
  }
  // Otherwise append if we don't already have it (dedup by server id).
  if (!t.messages.some((m) => m.id === incoming.id)) {
    t.messages = [...t.messages, incoming]
    t.updatedAt = incoming.at
  }
  emit()
}

/** Handle a live `read` SSE frame. */
export function ingestRead(threadIdRaw, userId, lastReadAt, meId) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return
  if (!t.lastReadByUser) t.lastReadByUser = {}
  t.lastReadByUser[userId] = lastReadAt
  if (userId === meId) t.readAtLocal = lastReadAt
  emit()
}

/** Handle a live `reaction` SSE frame. op ∈ {'added', 'removed'}. */
export function ingestReaction(threadIdRaw, messageId, userId, emoji, op) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return
  const idx = t.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return
  const target = t.messages[idx]
  const cur = Array.isArray(target.reactions) ? target.reactions : []
  const has = cur.some((r) => r.userId === userId && r.emoji === emoji)
  let next
  if (op === 'added' && !has) next = [...cur, { userId, emoji }]
  else if (op === 'removed' && has)
    next = cur.filter((r) => !(r.userId === userId && r.emoji === emoji))
  else return // already in the state the frame describes
  // Replace both the message object and the messages array so useMemo sees a
  // fresh reference on the render side.
  const nextMsg = { ...target, reactions: next }
  t.messages = [...t.messages.slice(0, idx), nextMsg, ...t.messages.slice(idx + 1)]
  // If someone else just hearted one of MY messages, treat it as a fresh
  // notification: bump updatedAt and clear my readAtLocal so the widget's
  // unread badge + ThreadList row light up. Removals never re-open the notif.
  if (op === 'added' && target.from === 'me' && userId !== target.senderId) {
    const stamp = new Date().toISOString()
    t.updatedAt = stamp
    t.lastReactionAt = stamp
  }
  emit()
}

/** Handle a live `message-deleted` SSE frame. */
export function ingestMessageDeleted(threadIdRaw, messageId) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return
  const idx = t.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return
  t.messages = [...t.messages.slice(0, idx), ...t.messages.slice(idx + 1)]
  const last = t.messages[t.messages.length - 1]
  if (last?.at) t.updatedAt = last.at
  emit()
}

/** Handle a live `thread-updated` SSE frame — currently just `name` changes,
 *  but the payload shape (`changes: {...}`) leaves room to grow. */
export function ingestThreadUpdated(threadIdRaw, changes) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return
  if (!changes || typeof changes !== 'object') return
  if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
    t.name = changes.name ?? null
  }
  emit()
}

/** Handle a live `typing` SSE frame. */
export function ingestTyping(threadIdRaw, userId, meId) {
  const id = resolveId(threadIdRaw)
  if (userId === meId) return
  const t = state.threads.get(id)
  if (!t) return
  const name = participantOf(t, userId)?.name || 'Someone'
  const now = new Date().toISOString()
  const map = state.typing.get(id) ?? {}
  map[userId] = { at: now, name }
  state.typing.set(id, map)
  emit()
  // Auto-expire after 3s.
  setTimeout(() => {
    const cur = state.typing.get(id)
    if (!cur) return
    const entry = cur[userId]
    if (!entry) return
    if (entry.at !== now) return // superseded by a fresher event
    delete cur[userId]
    if (Object.keys(cur).length === 0) state.typing.delete(id)
    else state.typing.set(id, cur)
    emit()
  }, 3200)
}

let hydrateInFlight = null
function kickHydrate(meId) {
  if (hydrateInFlight) return hydrateInFlight
  hydrateInFlight = api.messages
    .listThreads()
    .then((rows) => replaceThreads(rows ?? [], meId))
    .finally(() => {
      hydrateInFlight = null
    })
  return hydrateInFlight
}

/** External entry point for MessagesRealtime after SSE connects. */
export async function hydrateThreads(meId) {
  return kickHydrate(meId)
}

/** External entry point for ThreadView on open — fetches messages if missing. */
export async function ensureMessagesLoaded(meId, threadIdRaw) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t || !t.serverId) return // temp thread with no server row yet — nothing to fetch
  if (t.messagesLoaded) return
  t.messagesLoaded = true
  const page = await api.messages.getMessages(t.serverId)
  mergeMessages(t.serverId, page.data ?? [], meId)
}

// Backfill missed messages after a rehydrate spots a gap between the server's
// `last_message` and our local tail. One in-flight fetch per thread — a burst
// of rehydrates all reuse the same promise instead of hammering the API.
// mergeMessages is dedupe/reconcile-safe.
const backfillInFlight = new Map()
function kickBackfill(serverId, meId) {
  if (!serverId) return
  if (backfillInFlight.has(serverId)) return backfillInFlight.get(serverId)
  const p = api.messages
    .getMessages(serverId)
    .then((page) => mergeMessages(serverId, page.data ?? [], meId))
    .catch(() => {
      /* transient — the next hydrate will retry */
    })
    .finally(() => {
      backfillInFlight.delete(serverId)
    })
  backfillInFlight.set(serverId, p)
  return p
}

// --- selectors used by hooks ------------------------------------------------

let threadsSnapshotKey = 0
let threadsSnapshot = []
let threadsSnapshotFor = null
let threadsSnapshotVersion = -1
let storeVersion = 0
function bumpStoreVersion() {
  storeVersion += 1
}
// Every mutator emits, so wire a subscriber that bumps the version too — the
// snapshot cache uses it to know when to rebuild.
listeners.add(bumpStoreVersion)

export function listThreads(userId) {
  if (!userId) return EMPTY
  if (threadsSnapshotFor === userId && threadsSnapshotVersion === storeVersion) {
    return threadsSnapshot
  }
  // Dedup: alias entries can be present when a temp id + real id both live in
  // the map; only include unique thread objects.
  const seen = new Set()
  const uniq = []
  for (const t of state.threads.values()) {
    if (seen.has(t)) continue
    seen.add(t)
    uniq.push(t)
  }
  const decorated = uniq
    .map((t) => ({ ...t, unread: threadIsUnread(t, userId) }))
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
  threadsSnapshot = decorated
  threadsSnapshotFor = userId
  threadsSnapshotVersion = storeVersion
  threadsSnapshotKey += 1
  return decorated
}

const EMPTY = Object.freeze([])

const threadRefCache = new Map()
let threadRefCacheVersion = -1
export function getThread(userId, threadIdRaw) {
  if (!userId || !threadIdRaw) return null
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return null
  if (threadRefCacheVersion !== storeVersion) {
    threadRefCache.clear()
    threadRefCacheVersion = storeVersion
  }
  const cached = threadRefCache.get(id)
  // Track the messages array reference (not just length) so an in-place
  // reconciliation that keeps length constant but swaps the reference (see
  // ingestMessage / doSend) still yields a fresh decorated object — otherwise
  // useThread returns a stale ref and useMemo([thread.messages]) never updates.
  if (cached && cached.__source === t && cached.__mRef === t.messages) {
    return cached
  }
  const decorated = {
    ...t,
    unread: threadIsUnread(t, userId),
    __source: t,
    __mRef: t.messages,
  }
  threadRefCache.set(id, decorated)
  return decorated
}

export function unreadCount(userId) {
  if (!userId) return 0
  return listThreads(userId).filter((t) => t.unread).length
}

export function threadCount(userId) {
  if (!userId) return 0
  return state.threads.size
}

/** Typing markers for a thread, keyed as an array — used by useTyping.
 *  MUST return a stable reference when nothing has changed: useSyncExternalStore
 *  loops (and freezes the UI) if two consecutive getSnapshot() calls return
 *  arrays that fail Object.is. Cache per-thread and invalidate on the store's
 *  monotonic version. */
const typingSnapshotByThread = new Map() // id → { version, list }
export function typingFor(threadIdRaw) {
  const id = resolveId(threadIdRaw)
  const map = state.typing.get(id)
  if (!map || Object.keys(map).length === 0) return EMPTY_TYPING
  const cached = typingSnapshotByThread.get(id)
  if (cached && cached.version === storeVersion) return cached.list
  const list = Object.entries(map).map(([userId, v]) => ({ userId, name: v.name }))
  typingSnapshotByThread.set(id, { version: storeVersion, list })
  return list
}
const EMPTY_TYPING = Object.freeze([])

/** Derive the visible status tail for one message. Returns null when we
 *  shouldn't show a tail (message from other side, or older mine bubbles).
 *  Callers pass `isLatestMine` because they know the message list ordering. */
export function statusFor(message, thread, meId, { isLatestMine = false } = {}) {
  if (!message || message.from !== 'me') return null
  if (!isLatestMine) return null
  if (message.status === 'sending') return 'sending'
  if (message.status === 'failed') return 'failed'
  const at = message.at ? Date.parse(message.at) : 0
  if (thread?.lastReadByUser) {
    for (const [uid, iso] of Object.entries(thread.lastReadByUser)) {
      if (uid === meId) continue
      const stamp = iso ? Date.parse(iso) : 0
      if (stamp && stamp >= at) return 'read'
    }
  }
  return 'delivered'
}

// --- wrappers preserving the original signatures --------------------------

/** Ensure a DM thread exists locally + kick a background create. Returns an id
 *  the caller can immediately navigate to (may be a temp id until the server
 *  hands back the real uuid; both lookups resolve to the same thread). */
export function ensureThread(userId, partner) {
  if (!userId || !partner?.id) return null
  const partnerNorm = partnerFromAny(partner)
  const tempId = threadIdFor(userId, partnerNorm.id)
  // If we already have a resolved thread for this pair, return its real id.
  const realId = aliasToReal.get(tempId)
  if (realId && state.threads.has(realId)) {
    // Refresh partner metadata in case the caller has newer info.
    const t = state.threads.get(realId)
    if (t.kind === 'dm') t.partner = { ...t.partner, ...partnerNorm }
    return realId
  }
  // Otherwise place a stub so useThread() renders an empty conversation while
  // the create resolves.
  if (!state.threads.has(tempId)) {
    state.threads.set(tempId, {
      id: tempId,
      serverId: null,
      kind: 'dm',
      partner: partnerNorm,
      name: null,
      messages: [],
      updatedAt: new Date().toISOString(),
      lastReadByUser: { [userId]: new Date().toISOString() },
      readAtLocal: new Date().toISOString(),
    })
    emit()
  }
  // Kick the real create so the server row exists before the first send.
  api.messages
    .createDm(partnerNorm.id)
    .then((serverThread) => {
      if (!serverThread) return
      reconcileThread(tempId, serverThread, userId)
    })
    .catch(() => {
      /* leave the temp thread; sendMessage will surface the failure */
    })
  return tempId
}

/** Ensure a group thread. Returns null if <2 partners were provided. */
export function ensureGroupThread(userId, partners, name) {
  if (!userId || !Array.isArray(partners)) return null
  const norm = partners.map((p) => partnerFromAny(p)).filter((p) => p && p.id && p.id !== userId)
  const seen = new Set()
  const uniq = []
  for (const p of norm) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    uniq.push(p)
  }
  if (uniq.length < 2) return null
  const tempId = groupThreadId([userId, ...uniq.map((p) => p.id)])
  if (!state.threads.has(tempId)) {
    state.threads.set(tempId, {
      id: tempId,
      serverId: null,
      kind: 'group',
      participants: uniq,
      name: name?.trim() || null,
      messages: [],
      updatedAt: new Date().toISOString(),
      lastReadByUser: { [userId]: new Date().toISOString() },
      readAtLocal: new Date().toISOString(),
    })
    emit()
  }
  api.messages
    .createGroup(
      uniq.map((p) => p.id),
      name,
    )
    .then((serverThread) => {
      if (!serverThread) return
      reconcileThread(tempId, serverThread, userId)
    })
    .catch(() => {})
  return tempId
}

function reconcileThread(tempId, serverRow, meId) {
  const real = normalizeServerThread(serverRow, meId)
  const existing = state.threads.get(tempId)
  if (existing) {
    // Mutate the existing thread object in place so any in-flight sender that
    // captured a reference to it observes the new serverId (doSend polls the
    // captured object). Copy every field the server row carries.
    existing.id = real.id
    existing.serverId = real.id
    existing.kind = real.kind
    if (real.kind === 'dm') {
      existing.partner = real.partner ?? existing.partner
      delete existing.participants
    } else {
      existing.participants = real.participants ?? existing.participants
      delete existing.partner
    }
    existing.name = real.name ?? existing.name
    existing.lastReadByUser = { ...(existing.lastReadByUser ?? {}), ...real.lastReadByUser }
    // Point the real id at the same object so lookups by either key hit it.
    state.threads.set(real.id, existing)
  } else {
    state.threads.set(real.id, real)
  }
  aliasToReal.set(tempId, real.id)
  // Both the temp id and the real id resolve to the same object so a
  // subscriber holding the temp id keeps seeing the same thread.
  emit()
}

/** Send text. Returns { id, clientId } synchronously so callers can pin an
 *  optimistic bubble; the SSE echo reconciles it later. Idempotent-ish: two
 *  quick calls will produce two messages, because the composer clears between
 *  sends.
 *
 *  `opts.onError(err)` is called when the send is rejected — used by the
 *  composer to surface a filter-block toast (PROFANITY_BLOCKED) that would
 *  otherwise be silent behind the "failed" bubble state.
 */
export function sendMessage(userId, threadIdRaw, text, opts = {}) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed || !userId || !threadIdRaw) return null
  return appendOptimistic(userId, threadIdRaw, { text: trimmed, event: null }, opts)
}

/** Send an event share (optional note + slim event card). */
export function sendEventShare(userId, threadIdRaw, event, note, opts = {}) {
  const slim = slimEvent(event)
  if (!slim || !userId || !threadIdRaw) return null
  const trimmedNote = typeof note === 'string' ? note.trim() : ''
  return appendOptimistic(
    userId,
    threadIdRaw,
    {
      text: trimmedNote || null,
      event: slim,
    },
    opts,
  )
}

/** Send a post share (optional note + slim post card). Backend snapshots a
 *  full author + image + caption at send-time; the optimistic slim carries
 *  the same fields so the bubble renders correctly before the SSE echo. */
export function sendPostShare(userId, threadIdRaw, post, note, opts = {}) {
  const slim = slimPost(post)
  if (!slim || !userId || !threadIdRaw) return null
  const trimmedNote = typeof note === 'string' ? note.trim() : ''
  return appendOptimistic(
    userId,
    threadIdRaw,
    {
      text: trimmedNote || null,
      post: slim,
    },
    opts,
  )
}

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

// Optimistic post attachment — same shape normalizeAttachedPost produces, so
// the render path can't tell an optimistic bubble from an SSE-confirmed one.
function slimPost(post) {
  if (!post || !post.id) return null
  const organizer = post.organizer || post.author || null
  const author = organizer
    ? {
        id: organizer.id,
        name: organizer.name || 'Someone',
        handle: typeof organizer.handle === 'string' ? organizer.handle.replace(/^@/, '') : '',
        avatar: organizer.avatar || '',
        verified: !!organizer.verified,
      }
    : null
  return {
    id: post.id,
    eventId: post.eventId ?? null,
    kind: post.kind || 'update',
    image: post.image || '',
    caption: post.caption || '',
    createdAt: post.timeAgo || post.createdAt || null,
    author,
  }
}

function appendOptimistic(userId, threadIdRaw, payload, opts = {}) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) {
    // Store doesn't have this thread yet — rehydrate + retry once the
    // fetch lands. Prevents a "typed, hit Enter, bubble vanished" silent
    // drop when the user opens /messages/<uuid> directly or when the SSE
    // pending-replay hasn't inserted the row yet.
    kickHydrate(userId).then(() => {
      if (state.threads.get(resolveId(threadIdRaw))) {
        appendOptimistic(userId, threadIdRaw, payload, opts)
      } else if (typeof opts.onError === 'function') {
        try {
          opts.onError({ code: 'NO_THREAD', message: 'This conversation is not available.' })
        } catch {
          /* ignore */
        }
      }
    })
    return null
  }
  const at = new Date().toISOString()
  const clientId = newId('c')
  const message = {
    id: clientId, // temporary — replaced on SSE echo
    clientId,
    from: 'me',
    senderId: userId,
    text: payload.text ?? null,
    event: payload.event ?? undefined,
    post: payload.post ?? undefined,
    at,
    status: 'sending',
  }
  // Replace the messages array reference so React re-renders — mutating in
  // place would leave useMemo([thread.messages]) with a stale cache.
  t.messages = [...t.messages, message]
  t.updatedAt = at
  t.readAtLocal = at
  if (!t.lastReadByUser) t.lastReadByUser = {}
  t.lastReadByUser[userId] = at
  emit()
  doSend(t, message, payload, opts).catch(() => {})
  return message
}

async function doSend(thread, message, payload, opts = {}) {
  // Wait for the server thread if we're still optimistically stubbed.
  let serverId = thread.serverId
  if (!serverId) {
    // Poll briefly — up to ~5s — for the create to resolve. Simpler than
    // building a full promise queue; the create is fast.
    for (let i = 0; i < 25; i++) {
      if (thread.serverId) {
        serverId = thread.serverId
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    if (!serverId) {
      message.status = 'failed'
      emit()
      return
    }
  }
  const eventId = payload.event?.id ?? null
  const postId = payload.post?.id ?? null
  let res = null
  let sendErr = null
  try {
    res = await api.messages.sendMessage(serverId, {
      text: payload.text,
      eventId,
      postId,
      clientId: message.clientId,
    })
  } catch (err) {
    sendErr = err
  }
  if (!res) {
    // Profanity blocks (and the rate-limit escalation for repeat offenders)
    // are refused by the server — the message never reaches the recipient.
    // Drop the optimistic bubble entirely so the sender doesn't see it linger
    // as a retryable "failed" bubble, and surface a toast so they know why.
    const filterBlocked =
      sendErr && (sendErr.code === 'PROFANITY_BLOCKED' || sendErr.code === 'RATE_LIMITED')
    if (filterBlocked) {
      const idx = thread.messages.findIndex((m) => m.clientId === message.clientId)
      if (idx >= 0) {
        thread.messages = [...thread.messages.slice(0, idx), ...thread.messages.slice(idx + 1)]
      }
    } else {
      message.status = 'failed'
    }
    emit()
    if (filterBlocked && typeof opts.onError === 'function') {
      try {
        opts.onError(sendErr)
      } catch {
        /* callback errors shouldn't wedge the send path */
      }
    }
    return
  }
  // Adopt server-issued id + timestamp; SSE echo may or may not arrive
  // afterward (we dedupe either way). Replace the messages array reference
  // so the render pass sees the change.
  message.id = res.id
  message.at = res.created_at
  message.status = 'delivered'
  thread.messages = [...thread.messages]
  thread.updatedAt = res.created_at
  emit()
}

/** Toggle a reaction on a message. Optimistic — flips the badge immediately,
 *  POSTs to the server, then reconciles: if the server's op contradicts our
 *  guess (e.g. we thought we were adding but we already had one), we defer to
 *  the server's truth. SSE echo will also arrive and dedupe via ingestReaction. */
export function toggleReaction(userId, threadIdRaw, messageId, emoji = '❤️') {
  if (!userId || !threadIdRaw || !messageId) return
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t?.serverId) return
  const idx = t.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return
  const target = t.messages[idx]
  const cur = Array.isArray(target.reactions) ? target.reactions : []
  const mineHas = cur.some((r) => r.userId === userId && r.emoji === emoji)
  const optimisticOp = mineHas ? 'removed' : 'added'
  // Apply optimistically via the same code path the SSE frame uses so
  // any concurrent frame from the peer just no-ops (same target state).
  ingestReaction(id, messageId, userId, emoji, optimisticOp)

  api.messages
    .react(t.serverId, messageId, emoji)
    .then((res) => {
      if (!res || !res.op) return
      if (res.op !== optimisticOp) {
        // Server disagreed — revert to whatever the server says is true.
        ingestReaction(id, messageId, userId, emoji, res.op)
      }
    })
    .catch(() => {
      // Roll back on network failure.
      ingestReaction(id, messageId, userId, emoji, mineHas ? 'added' : 'removed')
    })
}

/** Delete one of my messages. Optimistic — drops the bubble immediately, then
 *  POSTs to the server. On failure the message is restored at its original
 *  position so the sender can retry. Only outbound (mine) messages with a real
 *  server id can be deleted; optimistic-only bubbles (still `c-…`) are a no-op. */
export function deleteMessage(userId, threadIdRaw, messageId) {
  if (!userId || !threadIdRaw || !messageId) return
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t?.serverId) return
  const idx = t.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return
  const target = t.messages[idx]
  if (target.from !== 'me') return
  if (String(target.id).startsWith('c-')) return

  const removed = target
  t.messages = [...t.messages.slice(0, idx), ...t.messages.slice(idx + 1)]
  const last = t.messages[t.messages.length - 1]
  if (last?.at) t.updatedAt = last.at
  emit()

  api.messages.deleteMessage(t.serverId, messageId).catch(() => {
    const cur = state.threads.get(id)
    if (!cur) return
    if (cur.messages.some((m) => m.id === messageId)) return
    const insertAt = Math.min(idx, cur.messages.length)
    cur.messages = [...cur.messages.slice(0, insertAt), removed, ...cur.messages.slice(insertAt)]
    emit()
  })
}

/** Rename a group thread. Optimistic — updates the title immediately, POSTs
 *  to the server, rolls back on failure. Any participant is allowed (server
 *  enforces the same). DMs and threads with no server id yet are a no-op. */
export function renameGroup(userId, threadIdRaw, nextName) {
  if (!userId || !threadIdRaw) return
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t?.serverId) return
  if (t.kind !== 'group') return
  const cleaned = typeof nextName === 'string' ? nextName.trim().slice(0, 80) : ''
  const previous = t.name ?? null
  const target = cleaned || null
  if (previous === target) return
  t.name = target
  emit()

  api.messages.renameThread(t.serverId, target).catch(() => {
    const cur = state.threads.get(id)
    if (!cur) return
    cur.name = previous
    emit()
  })
}

/** Mark a thread's most-recent partner message as read up to now. */
export function markThreadRead(userId, threadIdRaw) {
  if (!userId || !threadIdRaw) return
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t) return
  const stamp = new Date().toISOString()
  if (t.readAtLocal === stamp) return
  t.readAtLocal = stamp
  if (!t.lastReadByUser) t.lastReadByUser = {}
  t.lastReadByUser[userId] = stamp
  emit()
  if (t.serverId) {
    api.messages.markRead(t.serverId).catch(() => {})
  }
}

// --- typing signal (throttled) ---------------------------------------------
const lastTypingByThread = new Map()
export function notifyTyping(threadIdRaw) {
  const id = resolveId(threadIdRaw)
  const t = state.threads.get(id)
  if (!t || !t.serverId) return
  const now = Date.now()
  const last = lastTypingByThread.get(t.serverId) ?? 0
  if (now - last < 1500) return
  lastTypingByThread.set(t.serverId, now)
  api.messages.typing(t.serverId)
}

// --- React hooks -----------------------------------------------------------

export function useThreads(userId) {
  const s = useCallback(() => listThreads(userId), [userId])
  const sub = useCallback((cb) => subscribe(cb), [])
  return useSyncExternalStore(sub, s, () => EMPTY)
}

export function useThread(userId, threadId) {
  const s = useCallback(() => getThread(userId, threadId), [userId, threadId])
  const sub = useCallback((cb) => subscribe(cb), [])
  return useSyncExternalStore(sub, s, () => null)
}

export function useUnreadCount(userId) {
  const s = useCallback(() => unreadCount(userId), [userId])
  const sub = useCallback((cb) => subscribe(cb), [])
  return useSyncExternalStore(sub, s, () => 0)
}

export function useTyping(threadId) {
  const s = useCallback(() => typingFor(threadId), [threadId])
  const sub = useCallback((cb) => subscribe(cb), [])
  return useSyncExternalStore(sub, s, () => EMPTY_TYPING)
}

/** Full store reset (called on logout). */
export function resetMessagesStore() {
  state.threads.clear()
  state.typing.clear()
  aliasToReal.clear()
  pendingMessagesByThread.clear()
  typingSnapshotByThread.clear()
  threadRefCache.clear()
  emit()
}

// Silence a lint hint about `threadsSnapshotKey` being unused externally — it
// exists to invalidate the snapshot even if the array reference didn't change.
export const _internal = {
  get snapshotKey() {
    return threadsSnapshotKey
  },
}
