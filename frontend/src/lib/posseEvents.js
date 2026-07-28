// Lightweight pub/sub for realtime posse roster frames.
//
// The messages SSE stream (one EventSource per session, owned by
// MessagesRealtime) already carries the posse_* frames the backend publishes on
// roster changes (join / request / leave / dissolved). Rather than thread posse
// state through the messages store, MessagesRealtime forwards those frames here
// and any interested screen (PosseDetail) subscribes. The chat itself is a
// normal thread and updates through the messages store as usual — this is only
// for the *roster* side.
//
// Frames (all carry posseId; some carry userId):
//   posse_join       — someone became an active member
//   posse_request    — someone asked to join (captain-facing)
//   posse_invited    — someone was invited (invitee-facing; they accept/decline)
//   posse_leave      — someone left / was removed
//   posse_dissolved  — the posse was dissolved

const listeners = new Set()

/** Subscribe to posse frames. Returns an unsubscribe fn. */
export function subscribePosseEvents(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Fan a frame out to every subscriber. Called by MessagesRealtime. */
export function emitPosseEvent(frame) {
  if (!frame || typeof frame !== 'object') return
  for (const fn of listeners) {
    try {
      fn(frame)
    } catch {
      // a bad subscriber must not break the SSE dispatch loop
    }
  }
}

const POSSE_FRAME_TYPES = new Set([
  'posse_join',
  'posse_request',
  'posse_invited',
  'posse_leave',
  'posse_dissolved',
])

/** Is this SSE frame a posse roster frame? */
export function isPosseFrame(type) {
  return POSSE_FRAME_TYPES.has(type)
}
