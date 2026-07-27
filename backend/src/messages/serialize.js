// Snake-case serializers for the messages API. Keeps the client shape in one
// place so routes and the SSE fan-out never diverge on field names.

export const PARTICIPANT_SELECT = {
  userId: true,
  lastReadAt: true,
  joinedAt: true,
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

export function toParticipant(p) {
  return {
    user_id: p.userId,
    last_read_at: p.lastReadAt,
    joined_at: p.joinedAt,
    user: p.user
      ? {
          id: p.user.id,
          display_name: p.user.displayName,
          handle: p.user.handle,
          avatar_url: p.user.avatarUrl,
          is_verified: p.user.isVerified,
        }
      : null,
  }
}

export function toMessage(m, clientId = null) {
  return {
    id: m.id,
    thread_id: m.threadId,
    sender_id: m.senderId,
    text: m.text ?? null,
    attached_event: m.attachedEvent ?? null,
    created_at: m.createdAt,
    // Echoed only on the sender's own send response + SSE frame so the client
    // can dedupe an optimistic bubble against the confirmed row.
    client_id: clientId ?? null,
    // Reactions: [{ user_id, emoji }] — the client aggregates counts + a
    // "mine" flag from the current viewer's id. Empty for freshly created rows.
    reactions: (m.reactions ?? []).map((r) => ({ user_id: r.userId, emoji: r.emoji })),
  }
}

export function toThread(thread, participants, lastMessage, unreadCount) {
  return {
    id: thread.id,
    dm_key: thread.dmKey ?? null,
    name: thread.name ?? null,
    created_at: thread.createdAt,
    last_message_at: thread.lastMessageAt,
    participants: participants.map(toParticipant),
    last_message: lastMessage ? toMessage(lastMessage) : null,
    unread_count: unreadCount ?? 0,
  }
}
