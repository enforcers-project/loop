/**
 * Cross-provider fuzzy dedup guard.
 * Prevents the same real-world event from existing as both a Ticketmaster
 * and SeatGeek row by comparing normalized (title + date + city).
 */

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function dateKey(isoDate) {
  if (!isoDate) return ''
  return new Date(isoDate).toISOString().slice(0, 10)
}

export function dedupKey(title, startsAt, city) {
  return `${normalize(title)}|${dateKey(startsAt)}|${normalize(city)}`
}

/**
 * Given an array of candidate events to insert and a list of existing events
 * already in the DB (different source), returns only candidates that don't
 * fuzzy-match an existing row.
 */
export function filterDuplicates(candidates, existingEvents) {
  const existingKeys = new Set(existingEvents.map((e) => dedupKey(e.title, e.startsAt, e.city)))

  return candidates.filter((c) => !existingKeys.has(dedupKey(c.title, c.startsAt, c.city)))
}
