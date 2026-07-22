// Deterministic mock RSVP + save counts for synced (Ticketmaster/SeatGeek)
// events. The demo feed reads as lifeless when every synced card shows "0
// going" — but a synced row has no organic RSVPs yet, so we fill a plausible
// count keyed by (source, externalId) on the FIRST insert only. Never applied
// to update paths, so a real RSVP that accumulates on top of the mock seed is
// preserved on the next sync. Native organizer-created events keep the
// schema's default of 0 (a brand-new event legitimately starts at 0).

function hashUnit(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * Seed plausible RSVP + save counts for a synced event.
 *
 * Third-party ticketed events (concerts, sports, festivals) draw big crowds,
 * but capacity is almost always null on the sync payloads — so we sample from
 * a fixed range keyed by (source, externalId) rather than a capacity ratio.
 * Free events skew smaller; paid ticketed events skew larger.
 *
 * Saves track ~30–55% of RSVPs (people who bookmark but haven't committed).
 */
export function mockSocialCounts({ source, externalId, isFree }) {
  const key = `${source}:${externalId}`
  const r1 = hashUnit(key)
  const r2 = hashUnit(`${key}:save`)
  const low = isFree ? 40 : 120
  const high = isFree ? 300 : 900
  const rsvpCount = Math.round(low + r1 * (high - low))
  const saveRatio = 0.3 + r2 * 0.25
  const saveCount = Math.round(rsvpCount * saveRatio)
  return { rsvpCount, saveCount }
}
