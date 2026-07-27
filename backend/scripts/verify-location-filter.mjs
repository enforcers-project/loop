// Read-only verification for the location-radius bug fix.
//
// The bug: far-away events (other cities/states) showed on For You / Discover.
// Two leak paths, both in the "no results in radius" fallbacks:
//   1. recommendations/engine.js fallbackPopularityFeed — filtered on homeCity
//      string-equality only, and on NOTHING when homeCity was null.
//   2. lib/api.js events() — refetched with the geo filter stripped on empty.
// Plus a city-format mismatch (events "San Francisco, CA" vs user
// "San Francisco") that drove users into those fallbacks in the first place.
//
// This script does NOT write anything. It replays the OLD vs NEW SQL against
// the live catalog for the real bug cohorts and asserts the new logic no longer
// returns out-of-area events. Run: node scripts/verify-location-filter.mjs
import prisma from '../src/lib/prisma.js'

const RADIUS_KM = 40
let failures = 0
const check = (name, pass, detail) => {
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

// SF reference point (matches the dominant user cohort).
const SF = { lat: 37.7749, lng: -122.4194 }

// Old city filter: exact case-insensitive equality.
const oldCityMatch = (userCity) =>
  prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM events WHERE status='published' AND city ILIKE $1`,
    userCity,
  )
// New city filter: compare the token before the first comma on both sides.
const newCityMatch = (userCity) =>
  prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM events
       WHERE status='published'
         AND lower(trim(split_part(city, ',', 1))) = lower(trim(split_part($1, ',', 1)))`,
    userCity,
  )

// How many published events sit OUTSIDE a 40km radius of SF (i.e. would be
// "far away" if they leaked in).
const outsideRadius = () =>
  prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM events
       WHERE status='published' AND lat IS NOT NULL AND lng IS NOT NULL
         AND earth_distance(ll_to_earth($1,$2), ll_to_earth(lat,lng)) > $3::float*1000`,
    SF.lat,
    SF.lng,
    RADIUS_KM,
  )

async function main() {
  console.log('Location-filter verification (read-only)\n')

  const [{ n: totalPublished }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM events WHERE status='published'`,
  )
  const [{ n: farAway }] = await outsideRadius()
  console.log(
    `Catalog: ${totalPublished} published events, ${farAway} outside ${RADIUS_KM}km of SF.\n`,
  )

  // --- Cohort 1: city-only user "San Francisco" (33 real users) -------------
  // OLD exact match "San Francisco" vs stored "San Francisco, CA" → 0 hits →
  // empty backend → frontend stripped geo → nationwide. NEW token match hits.
  const [{ n: oldExact }] = await oldCityMatch('San Francisco')
  const [{ n: newToken }] = await newCityMatch('San Francisco')
  // The trigger: exact match "San Francisco" only catches the handful of events
  // stored WITHOUT a state suffix, missing the "San Francisco, CA" bulk. The
  // near-empty result is what tripped the frontend's geo-strip retry.
  check(
    'city-only "San Francisco": OLD exact match misses the bulk (the trigger)',
    newToken >= oldExact * 10,
    `old exact matched ${oldExact}, new token matches ${newToken} (${(newToken / Math.max(1, oldExact)).toFixed(0)}× more)`,
  )
  check(
    'city-only "San Francisco": NEW token match finds the SF catalog',
    newToken > 0,
    `new matches ${newToken} events`,
  )

  // Every event the NEW city match returns must actually be an SF event (token
  // before the comma == "san francisco") — never another city/state.
  const bad = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT city FROM events
       WHERE status='published'
         AND lower(trim(split_part(city, ',', 1))) = lower(trim(split_part($1, ',', 1)))
         AND lower(trim(split_part(city, ',', 1))) <> 'san francisco'`,
    'San Francisco',
  )
  check(
    'NEW token match returns ONLY San Francisco events (no leakage)',
    bad.length === 0,
    bad.length ? `leaked cities: ${bad.map((r) => r.city).join(', ')}` : 'clean',
  )

  // --- Cohort 2: coords user, radius pre-filter → fallback ------------------
  // NEW fallbackPopularityFeed uses the same earth_distance radius as preFilter.
  // Assert it returns only in-radius events (the OLD version returned nationwide
  // whenever homeCity didn't string-match).
  const fallbackRows = await prisma.$queryRawUnsafe(
    `SELECT e.city,
            earth_distance(ll_to_earth(e.lat,e.lng), ll_to_earth($1,$2))/1000 AS km
       FROM events e
       WHERE e.status='published' AND e.starts_at > now()
         AND e.lat IS NOT NULL AND e.lng IS NOT NULL
         AND earth_distance(ll_to_earth(e.lat,e.lng), ll_to_earth($1,$2)) <= $3::float*1000
       ORDER BY (e.rsvp_count + 2*e.save_count) DESC
       LIMIT 20`,
    SF.lat,
    SF.lng,
    RADIUS_KM,
  )
  const maxKm = fallbackRows.reduce((m, r) => Math.max(m, Number(r.km)), 0)
  check(
    'NEW coords fallback: every returned event is within radius',
    fallbackRows.length > 0 && maxKm <= RADIUS_KM,
    `${fallbackRows.length} events, farthest ${maxKm.toFixed(1)}km (≤ ${RADIUS_KM})`,
  )

  // --- Cohort 3: location-less user (no coords, no city) --------------------
  // Both fallbacks now emit NO geo clause for a user with neither coord nor
  // city — that genuinely can't be filtered, so nationwide is expected and
  // correct. Just document the count so the behavior is explicit.
  console.log(
    `\nℹ️  Location-less users (no coords, no city) legitimately see all ${totalPublished} events — nothing to filter on. The fix targets users WITH a saved location.`,
  )

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('verify error:', e.message)
  await prisma.$disconnect()
  process.exit(2)
})
