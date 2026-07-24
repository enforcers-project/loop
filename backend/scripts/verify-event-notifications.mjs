// Integration test for the attendee-fanout helpers introduced with organizer
// edit + cancel. Runs entirely in-process against a stubbed Prisma so it can
// exercise the real publish.js module without touching a database. Verifies:
//
//   1. `event_updated` rows are inserted for the union of RSVPed + roster users.
//   2. The organizer is excluded from the recipient set.
//   3. Users present in BOTH rsvps and roster_entries are deduped to one row.
//   4. The body copy collapses field keys via CHANGE_LABEL.
//   5. `event_cancelled` metadata is `{ reason }` only when reason is non-empty.
//   6. Cursor-based paging traverses > BATCH_SIZE recipients correctly.
//
// Run with:  node scripts/verify-event-notifications.mjs

import { pathToFileURL } from 'node:url'
import path from 'node:path'

// --------------------------------------------------------------------------
// Stub Prisma. Replace the real module in Node's ESM loader by intercepting
// the `../lib/prisma.js` import path from publish.js. Simplest: patch the
// module registry via a small proxy loader.
// --------------------------------------------------------------------------

const insertedRows = []
let queryLog = []

const stubEventStore = new Map()

function makePrismaStub() {
  return {
    event: {
      async findUnique({ where, select: _select }) {
        return stubEventStore.get(where.id) ?? null
      },
    },
    notification: {
      async createMany({ data }) {
        insertedRows.push(...data)
        return { count: data.length }
      },
    },
    async $queryRawUnsafe(sql, ...params) {
      queryLog.push({ sql, params })
      // Parameters: [eventId, organizerId?, cursorId?, limit]
      const [eventId] = params
      const limit = params[params.length - 1]
      const hasOrganizer = params.length >= 3 // eventId + organizer + limit at minimum
      const organizerId = hasOrganizer ? params[1] : null
      const cursorId = params.length === 4 ? params[2] : null
      const scenario = currentScenario
      const rsvpRows = (scenario.rsvps ?? [])
        .filter((r) => r.event_id === eventId)
        .filter((r) => ['going', 'interested', 'waitlisted'].includes(r.status))
      const rosterRows = (scenario.rosters ?? [])
        .filter((r) => r.event_id === eventId)
        .filter((r) => ['claimed', 'waitlisted'].includes(r.status))
      const savedRows = (scenario.saved ?? []).filter((r) => r.event_id === eventId)
      const merged = new Set([
        ...rsvpRows.map((r) => r.user_id),
        ...rosterRows.map((r) => r.user_id),
        ...savedRows.map((r) => r.user_id),
      ])
      let ids = [...merged]
      if (organizerId) ids = ids.filter((u) => u !== organizerId)
      if (cursorId) ids = ids.filter((u) => u > cursorId)
      ids.sort()
      ids = ids.slice(0, limit)
      return ids.map((user_id) => ({ user_id }))
    },
  }
}

let currentScenario = null

// --------------------------------------------------------------------------
// Custom loader: rewrite `../lib/prisma.js` to a data-URL that exports our stub.
// --------------------------------------------------------------------------

import { register } from 'node:module'
import { MessageChannel } from 'node:worker_threads'

// Wire the loader below so any `import prisma from '../lib/prisma.js'` resolves
// to a synthetic module that returns our stub.
const loaderCode = `
export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('/lib/prisma.js') || specifier === '../lib/prisma.js') {
    return { url: 'data:text/javascript,export default globalThis.__PRISMA_STUB__', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
`

// Registering a data-URL loader via node:module.register is the cleanest way
// but requires Node 20.6+; both dev + CI use 20.18, so we're fine.
const { port1, port2 } = new MessageChannel()
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, {
  parentURL: pathToFileURL(path.resolve('./scripts/verify-event-notifications.mjs')),
  data: { port: port2 },
  transferList: [port2],
})
port1.unref()

// --------------------------------------------------------------------------
// Now register the stub on globalThis so the loader's data-URL module can pick
// it up, then dynamically import publish.js. Because register() is async-effect,
// we defer the import until the next tick.
// --------------------------------------------------------------------------

globalThis.__PRISMA_STUB__ = makePrismaStub()

const { notifyAttendeesOfEventUpdate, notifyAttendeesOfEventCancel } =
  await import('../src/notifications/publish.js')

// --------------------------------------------------------------------------
// Test harness
// --------------------------------------------------------------------------

let failures = 0
function assert(cond, label) {
  if (cond) {
    console.log(`  ok  ${label}`)
  } else {
    console.error(`  FAIL ${label}`)
    failures += 1
  }
}
function reset() {
  insertedRows.length = 0
  queryLog = []
  stubEventStore.clear()
}

const ORGANIZER_ID = '00000000-0000-0000-0000-0000000000ff'
const EVENT_ID = '00000000-0000-0000-0000-000000000001'

// -- Test 1: update notifies deduped attendee set, excludes organizer --------
console.log('\n[1] event_updated fanout — dedup + organizer exclusion')
reset()
stubEventStore.set(EVENT_ID, { id: EVENT_ID, title: 'Sunday soccer', organizerId: ORGANIZER_ID })
currentScenario = {
  rsvps: [
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000010', status: 'going' },
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000011', status: 'interested' },
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000012', status: 'waitlisted' },
    // Should be excluded — organizer
    { event_id: EVENT_ID, user_id: ORGANIZER_ID, status: 'going' },
    // Should be excluded — status not in the eligible set
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000019', status: 'cancelled' },
  ],
  rosters: [
    // Overlap with rsvp #10 — should dedupe
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000010', status: 'claimed' },
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000013', status: 'claimed' },
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000014', status: 'waitlisted' },
    // Should be excluded — statuses not in the eligible set
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000017', status: 'no_show' },
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000018', status: 'cancelled' },
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-00000000001a', status: 'attended' },
  ],
  saved: [
    // Fresh saved-only user — should receive
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000015' },
    // Overlap with rsvp #11 — should dedupe
    { event_id: EVENT_ID, user_id: '00000000-0000-0000-0000-000000000011' },
  ],
}

const updateCount = await notifyAttendeesOfEventUpdate(EVENT_ID, ['startsAt', 'venueName'])
assert(updateCount === 6, `count=6 (got ${updateCount})`)
assert(
  new Set(insertedRows.map((r) => r.userId)).size === 6,
  'unique userIds = 6 (dedup effective across rsvp+roster+saved)',
)
assert(
  insertedRows.some((r) => r.userId === '00000000-0000-0000-0000-000000000015'),
  'saved-only user gets notified',
)
assert(!insertedRows.some((r) => r.userId === ORGANIZER_ID), 'organizer never appears as recipient')
assert(
  insertedRows.every((r) => r.type === 'event_updated'),
  'all rows type=event_updated',
)
assert(
  insertedRows.every((r) => r.channel === 'in_app'),
  'all rows channel=in_app',
)
assert(
  insertedRows.every((r) => r.actorId === ORGANIZER_ID),
  'all rows actor=organizer',
)
assert(
  insertedRows.every((r) => r.eventId === EVENT_ID),
  'all rows point at the event',
)
assert(
  insertedRows.every((r) => r.title === '"Sunday soccer" was updated'),
  'title format correct',
)
assert(
  insertedRows.every((r) => r.body === 'Time and Venue changed'),
  'body summarises fields',
)
assert(
  insertedRows.every(
    (r) =>
      r.metadata &&
      Array.isArray(r.metadata.changed) &&
      r.metadata.changed.join(',') === 'startsAt,venueName',
  ),
  'metadata.changed preserved',
)

// -- Test 2: only-description edit (no meaningful fields) --------------------
console.log('\n[2] event_updated fanout — empty changedFields short-circuits')
reset()
stubEventStore.set(EVENT_ID, { id: EVENT_ID, title: 'x', organizerId: ORGANIZER_ID })
currentScenario = { rsvps: [{ event_id: EVENT_ID, user_id: 'u1', status: 'going' }] }
const zeroCount = await notifyAttendeesOfEventUpdate(EVENT_ID, [])
assert(zeroCount === 0, 'empty changedFields returns 0 without any query')
assert(queryLog.length === 0, 'no SQL fired')

// -- Test 3: cancel with reason ---------------------------------------------
console.log('\n[3] event_cancelled fanout — reason wired into metadata')
reset()
stubEventStore.set(EVENT_ID, {
  id: EVENT_ID,
  title: 'Rooftop yoga',
  organizerId: ORGANIZER_ID,
})
currentScenario = {
  rsvps: [
    { event_id: EVENT_ID, user_id: 'u-a', status: 'going' },
    { event_id: EVENT_ID, user_id: 'u-b', status: 'interested' },
  ],
}
const cancelWithReason = await notifyAttendeesOfEventCancel(EVENT_ID, '  Rain \n')
assert(cancelWithReason === 2, `2 rows written (got ${cancelWithReason})`)
assert(
  insertedRows.every((r) => r.type === 'event_cancelled'),
  'type=event_cancelled',
)
assert(
  insertedRows.every((r) => r.title === '"Rooftop yoga" was cancelled'),
  'cancel title',
)
assert(
  insertedRows.every((r) => r.body === 'Rain'),
  'body = trimmed reason',
)
assert(
  insertedRows.every((r) => r.metadata && r.metadata.reason === 'Rain'),
  'metadata.reason trimmed',
)

// -- Test 4: cancel without reason -------------------------------------------
console.log('\n[4] event_cancelled fanout — no reason means null body + null metadata')
reset()
stubEventStore.set(EVENT_ID, { id: EVENT_ID, title: 'Bar crawl', organizerId: ORGANIZER_ID })
currentScenario = { rsvps: [{ event_id: EVENT_ID, user_id: 'u-c', status: 'going' }] }
const cancelNoReason = await notifyAttendeesOfEventCancel(EVENT_ID, null)
assert(cancelNoReason === 1, '1 row written')
assert(insertedRows[0].body === null, 'body is null')
assert(insertedRows[0].metadata === null, 'metadata is null')

// -- Test 5: label collapse (only Time appears for startsAt + timezone) ------
console.log('\n[5] event_updated fanout — label collapse')
reset()
stubEventStore.set(EVENT_ID, { id: EVENT_ID, title: 'x', organizerId: ORGANIZER_ID })
currentScenario = { rsvps: [{ event_id: EVENT_ID, user_id: 'u-x', status: 'going' }] }
await notifyAttendeesOfEventUpdate(EVENT_ID, ['startsAt', 'endsAt', 'timezone'])
assert(insertedRows[0].body === 'Time changed', 'three time-family keys collapse to "Time"')

reset()
stubEventStore.set(EVENT_ID, { id: EVENT_ID, title: 'x', organizerId: ORGANIZER_ID })
currentScenario = { rsvps: [{ event_id: EVENT_ID, user_id: 'u-y', status: 'going' }] }
await notifyAttendeesOfEventUpdate(EVENT_ID, ['priceMin', 'capacity', 'ageMin'])
assert(
  insertedRows[0].body === 'Price and Capacity changed',
  'three labels cap at two ("Price and Capacity"), Age dropped',
)

// -- Test 6: paging beyond BATCH_SIZE (500) ---------------------------------
console.log('\n[6] event_updated fanout — cursor pages > 500 recipients')
reset()
stubEventStore.set(EVENT_ID, { id: EVENT_ID, title: 'Mega party', organizerId: ORGANIZER_ID })
const many = Array.from({ length: 1234 }, (_, i) => ({
  event_id: EVENT_ID,
  user_id: `u-${String(i).padStart(6, '0')}`,
  status: 'going',
}))
currentScenario = { rsvps: many }
const megaCount = await notifyAttendeesOfEventUpdate(EVENT_ID, ['startsAt'])
assert(megaCount === 1234, `all 1234 users notified (got ${megaCount})`)
assert(queryLog.length === 3, `3 SQL pages (got ${queryLog.length})`)

// -- Test 7: unknown event ---------------------------------------------------
console.log('\n[7] both helpers no-op on missing event')
reset()
const missingUpdate = await notifyAttendeesOfEventUpdate('nope', ['startsAt'])
assert(missingUpdate === 0, 'update: unknown event -> 0')
const missingCancel = await notifyAttendeesOfEventCancel('nope', 'because')
assert(missingCancel === 0, 'cancel: unknown event -> 0')

// --------------------------------------------------------------------------
console.log('\n' + (failures ? `FAILED (${failures} assertion(s))` : 'ALL OK'))
process.exit(failures ? 1 : 0)
