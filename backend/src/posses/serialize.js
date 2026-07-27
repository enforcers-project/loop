// Snake-case serializers for the posses API. Keeps the client shape in one
// place so routes never diverge on field names. Mirrors messages/serialize.js.

// Slim member projection — enough to render an avatar row without over-fetching.
export const POSSE_MEMBER_SELECT = {
  role: true,
  status: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      displayName: true,
      handle: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
}

export function toPosseMember(m) {
  return {
    role: m.role,
    status: m.status,
    joined_at: m.createdAt,
    user: m.user
      ? {
          id: m.user.id,
          display_name: m.user.displayName,
          handle: m.user.handle,
          avatar_url: m.user.avatarUrl,
          is_verified: m.user.isVerified,
        }
      : null,
  }
}

// Slim event projection for a posse card (parallels the messages slimEvent).
function toPosseEvent(event) {
  if (!event) return null
  return {
    id: event.id,
    title: event.title || 'Event',
    poster: event.flyerUrl || '',
    date: event.startsAt ? new Date(event.startsAt).toISOString() : '',
    venue_name: event.venueName || '',
    city: event.city || '',
  }
}

/**
 * Serialize a posse. `viewer` fields (viewer_role, viewer_status) are relative
 * to the requesting user so the client can pick the right CTA (Join / Requested
 * / Open chat / Manage). `members` is optional — list endpoints omit it and
 * send only counts; the detail endpoint includes the full roster.
 */
export function toPosse(posse, { members = null, viewer = null } = {}) {
  const active = (posse.members ?? []).filter((m) => m.status === 'active')
  const pending = (posse.members ?? []).filter((m) => m.status === 'pending')
  return {
    id: posse.id,
    event_id: posse.eventId,
    thread_id: posse.threadId,
    creator_id: posse.creatorId,
    name: posse.name,
    note: posse.note ?? null,
    visibility: posse.visibility,
    join_policy: posse.joinPolicy,
    created_at: posse.createdAt,
    event: posse.event ? toPosseEvent(posse.event) : null,
    member_count: active.length,
    pending_count: pending.length,
    viewer_role: viewer?.role ?? null,
    viewer_status: viewer?.status ?? null,
    members: members ? members.map(toPosseMember) : null,
  }
}
