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
import { useEffect } from 'react'
import { useApp } from './AppContext'
import { api } from '../lib/api'
import {
  hydrateThreads,
  ingestMessage,
  ingestReaction,
  ingestRead,
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

    const connect = () => {
      if (closed) return
      // Hydrate once on first mount so the widget renders immediately even if
      // the SSE stream is slow or unreachable. Subsequent reconnects re-hydrate
      // in the `hello` handler (once we know the connection is live), not per
      // failed attempt — a flapping stream would otherwise hammer /api/threads
      // at the backoff cadence. replaceThreads now MERGES rather than clears,
      // so a stale hydrate can't destroy open threads.
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
        // First byte received — reset backoff so the next disconnect starts
        // aggressive again, and (if this is a reconnect) rehydrate so any
        // messages missed while offline land.
        const wasReconnect = backoffIdx > 0
        backoffIdx = 0
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
          default:
            // Posse roster frames ride this same stream — forward them to the
            // posse pub/sub so an open PosseDetail can refresh its roster live.
            if (isPosseFrame(payload.type)) emitPosseEvent(payload)
            // else ignore unknown types — forward-compat
            break
        }
      }

      source.onerror = () => {
        try {
          source?.close()
        } catch {
          /* ignore */
        }
        source = null
        scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      if (closed) return
      const wait = BACKOFFS[Math.min(backoffIdx, BACKOFFS.length - 1)]
      backoffIdx += 1
      reconnectHandle = setTimeout(connect, wait)
    }

    connect()

    return () => {
      closed = true
      if (reconnectHandle) clearTimeout(reconnectHandle)
      try {
        source?.close()
      } catch {
        /* ignore */
      }
    }
  }, [userId])

  return children
}
