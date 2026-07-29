// MessagesRealtime — one EventSource per session that pipes server-sent
// message/typing/read frames into the local messages store. Mounted once at
// the App shell (below AppProvider); the store handles fan-out to every
// widget/hook subscriber.
//
// Auth relies on the HttpOnly JWT cookie (`ACCESS_COOKIE`). EventSource sends
// same-origin cookies automatically; for a cross-origin build we set
// `withCredentials: true` and the backend must allow credentials.
//
// Reconnect strategy: exponential backoff (1s → 2s → 5s → 15s), reset on the
// first successful frame. On logout we close the stream + clear the store.
//
// Token-expiry recovery: the access-token cookie has a 1-hour TTL. Once it
// expires, `/api/messages/stream` returns 401 and `EventSource` will loop
// forever reconnecting to the same 401. On the first `onerror` after a
// previously-successful `hello`, try `api.auth.refresh()` before the next
// reconnect — one round-trip mints a fresh cookie and the reconnect succeeds.
import { useEffect } from 'react'
import { useApp } from './AppContext'
import { api } from '../lib/api'
import {
  hydrateThreads,
  ingestMessage,
  ingestMessageDeleted,
  ingestReaction,
  ingestRead,
  ingestThreadUpdated,
  ingestTyping,
  resetMessagesStore,
} from '../lib/messages'
import { emitPosseEvent, isPosseFrame } from '../lib/posseEvents'

const BACKOFFS = [1000, 2000, 5000, 15000]

export function MessagesRealtimeProvider({ children }) {
  const { user } = useApp()
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) {
      resetMessagesStore()
      return
    }

    let source = null
    let closed = false
    let backoffIdx = 0
    let reconnectHandle = null
    let firstConnect = true
    // Set after we've tried a refresh in response to a drop, so a genuine
    // network flap can't burn through refresh calls in a tight loop. Reset
    // on the next `hello` — a successful reconnect means the fresh cookie is
    // in place and future drops get their own refresh attempt.
    let refreshedThisCycle = false

    const dropSource = () => {
      try {
        source?.close()
      } catch {
        /* ignore */
      }
      source = null
    }

    const scheduleReconnect = () => {
      if (closed) return
      const wait = BACKOFFS[Math.min(backoffIdx, BACKOFFS.length - 1)]
      backoffIdx += 1
      reconnectHandle = setTimeout(connect, wait)
    }

    const connect = () => {
      if (closed) return
      // Hydrate once on first mount so the widget renders immediately even if
      // the SSE stream is slow or unreachable. Subsequent reconnects re-hydrate
      // in the `hello` handler (once we know the connection is live).
      if (firstConnect) {
        firstConnect = false
        hydrateThreads(userId).catch(() => {})
      }

      try {
        source = new EventSource(api.messages.streamUrl(), { withCredentials: true })
      } catch {
        scheduleReconnect()
        return
      }

      source.addEventListener('hello', () => {
        // First byte received — connection is authenticated and live. Reset
        // backoff so the next disconnect starts aggressive again, and if this
        // is a reconnect rehydrate whatever the client missed while offline.
        const wasReconnect = backoffIdx > 0
        backoffIdx = 0
        refreshedThisCycle = false
        if (wasReconnect) hydrateThreads(userId).catch(() => {})
      })

      source.onmessage = (ev) => {
        let payload
        try {
          payload = JSON.parse(ev.data)
        } catch {
          return
        }
        if (!payload || typeof payload !== 'object') return
        switch (payload.type) {
          case 'message':
            ingestMessage(payload.threadId, payload.message, userId)
            break
          case 'read':
            ingestRead(payload.threadId, payload.userId, payload.lastReadAt, userId)
            break
          case 'typing':
            ingestTyping(payload.threadId, payload.userId, userId)
            break
          case 'reaction':
            ingestReaction(
              payload.threadId,
              payload.messageId,
              payload.userId,
              payload.emoji,
              payload.op,
            )
            break
          case 'message-deleted':
            ingestMessageDeleted(payload.threadId, payload.messageId)
            break
          case 'thread-updated':
            ingestThreadUpdated(payload.threadId, payload.changes)
            break
          default:
            if (isPosseFrame(payload.type)) emitPosseEvent(payload)
            break
        }
      }

      source.onerror = () => {
        dropSource()
        // If the stream never delivered `hello`, or we haven't already tried
        // a refresh this reconnect cycle, do one refresh attempt before the
        // next reconnect. A stale/expired access token is the common reason a
        // previously-working stream starts flapping — refresh mints a new
        // cookie and the reconnect authenticates. On success we reset the
        // backoff so recovery is snappy; on failure we let the loop back off
        // as before.
        if (!refreshedThisCycle) {
          refreshedThisCycle = true
          api.auth
            .refresh()
            .then((ok) => {
              if (closed) return
              if (ok) backoffIdx = 0
              scheduleReconnect()
            })
            .catch(() => scheduleReconnect())
          return
        }
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      closed = true
      if (reconnectHandle) clearTimeout(reconnectHandle)
      dropSource()
    }
  }, [userId])

  return children
}
