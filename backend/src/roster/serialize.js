// Serializers for the sports roster responses (planning §7.4).
// Kept separate from the route handlers so the "shape" the frontend sees is
// defined in one place and easy to eyeball against the spec.

/** A compact user reference embedded in roster rows. */
function toUserRef(u) {
  if (!u) return null
  return { id: u.id, display_name: u.displayName, avatar_url: u.avatarUrl }
}

/**
 * GET /positions — the position-picker grid.
 * For each position we report capacity, how many slots are claimed, how many
 * are open, and a per-slot occupancy map (so the UI can grey out taken slots).
 * `claimedByPosition` is a Map(positionId -> [claimed roster rows]).
 */
export function toPositionsView(event, claimedByPosition) {
  const sd = event.sportsDetail
  return {
    sports_detail: {
      event_id: event.id,
      sport: sd.sport,
      skill_level: sd.skillLevel,
      venue_setting: sd.venueSetting,
      players_needed: sd.playersNeeded,
      players_signed_up: sd.playersSignedUp,
    },
    positions: sd.positions
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => {
        const claimed = claimedByPosition.get(p.id) ?? []
        const takenSlots = new Set(claimed.map((r) => r.slotNumber))
        return {
          id: p.id,
          label: p.label,
          capacity: p.capacity,
          skill_level: p.skillLevel,
          sort_order: p.sortOrder,
          claimed_count: claimed.length,
          open_slots: p.capacity - claimed.length,
          // slots are 1-indexed; `claimed` marks which are occupied.
          slots: Array.from({ length: p.capacity }, (_, i) => ({
            slot_number: i + 1,
            claimed: takenSlots.has(i + 1),
          })),
        }
      }),
  }
}

/**
 * GET /roster — claimed players + the FIFO waitlist.
 * `entries` are roster rows with their user + position relations included.
 */
export function toRosterView(event, entries) {
  const sd = event.sportsDetail
  const claimed = entries
    .filter((e) => e.status === 'claimed')
    .map((e) => ({
      id: e.id,
      user: toUserRef(e.user),
      sports_position_id: e.sportsPositionId,
      position_label: e.sportsPosition?.label ?? null,
      slot_number: e.slotNumber,
      status: e.status,
      claimed_at: e.claimedAt,
      checked_in_at: e.checkedInAt,
    }))
  const waitlist = entries
    .filter((e) => e.status === 'waitlisted')
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
    .map((e) => ({
      id: e.id,
      user: toUserRef(e.user),
      waitlist_position: e.waitlistPosition,
      claimed_at: e.claimedAt,
    }))
  return {
    sports_detail: {
      event_id: event.id,
      players_needed: sd.playersNeeded,
      players_signed_up: sd.playersSignedUp,
      skill_level: sd.skillLevel,
    },
    claimed,
    waitlist,
    open_slots: Math.max(0, sd.playersNeeded - claimed.length),
  }
}

/** A single roster entry (POST/PATCH responses). */
export function toRosterEntry(e) {
  return {
    id: e.id,
    event_id: e.eventId,
    sports_detail_id: e.sportsDetailId,
    sports_position_id: e.sportsPositionId,
    user_id: e.userId,
    slot_number: e.slotNumber,
    status: e.status,
    waitlist_position: e.waitlistPosition,
    checked_in_at: e.checkedInAt,
    cancelled_at: e.cancelledAt,
    claimed_at: e.claimedAt,
  }
}
