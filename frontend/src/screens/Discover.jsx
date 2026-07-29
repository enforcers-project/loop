import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, Map as MapIcon } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CatRow, FilterBar, SearchBar, WhenRow } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { EventsMap } from '../components/EventsMap'
import { NearMePopover } from '../components/NearMePopover'
import { LoadMore, PageLoader } from '../components/primitives'
import { cn, isEventPast, pluralize } from '../lib/utils'
import { useEventFeed } from '../lib/useEventFeed'

const EMPTY_FILTERS = {
  free: false,
  sports: false,
  when: 'any', // date-span preset — see WHEN_OPTIONS / eventInWhen
}

// Date-span presets for the "When" filter row. Each is matched against an
// event's isoDate by eventInWhen(); 'any' means no date constraint.
const WHEN_OPTIONS = [
  { key: 'any', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'This week' },
  { key: 'next7', label: 'Next 7 days' },
  { key: 'month', label: 'This month' },
]

/**
 * Build editorial rails for the default browse state (no category, no
 * refinement filters, no query). Each rail picks up to `n` events from the
 * source list; a shared `used` Set drives top-down dedup so an event only
 * appears in one rail. Order matters — earlier rails get first pick of any
 * event that would otherwise appear in multiple rails.
 *
 * Rails, in priority order:
 *   1. Trending this week      — top by goingCount (social proof)
 *   2. Almost full             — RSVP count ≥ 90% of capacity (scarcity — same
 *                                signal the AlmostFullBadge uses on cards)
 *   3. New this week           — published within the last 7 days, newest first
 *   4. Free tonight            — isFree
 *   5. Pickup runs             — isSports (dedicated sports rail so soccer/hoops
 *                                don't get buried by nightlife)
 *   6. Coming up this weekend  — Fri/Sat/Sun by starts_at
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Quick-filter date predicates, shared so the "Today"/"This weekend" grid uses
// the same day-of-week logic the weekend rail does (Sun=0, Fri=5, Sat=6).
// Both guard against a missing/invalid isoDate so a bad row is simply excluded
// rather than throwing.
function isWeekendEvent(e) {
  if (!e.isoDate) return false
  const d = new Date(e.isoDate)
  if (isNaN(d.getTime())) return false
  const day = d.getDay()
  return day === 0 || day === 5 || day === 6
}

function isTodayEvent(e, now = new Date()) {
  if (!e.isoDate) return false
  const d = new Date(e.isoDate)
  if (isNaN(d.getTime())) return false
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// Start of `now`'s day (local midnight) — the lower bound for every span so a
// past-earlier-today event isn't matched.
function startOfDay(now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

// Does an event fall within the selected date-span preset? Spans are inclusive
// of today and bounded to the upper edge of the window ('any' → always true).
// A missing/invalid isoDate never matches a dated span (but does match 'any').
function eventInWhen(e, when, now = new Date()) {
  if (when === 'any') return true
  if (!e.isoDate) return false
  const d = new Date(e.isoDate)
  if (isNaN(d.getTime())) return false
  const start = startOfDay(now)
  if (d < start) return false // already passed earlier today / before

  switch (when) {
    case 'today':
      return isTodayEvent(e, now)
    case 'weekend':
      return isWeekendEvent(e)
    case 'week': {
      // Through the end of the current week (Saturday night), matching the
      // Sun–Sat week the rest of the app uses.
      const end = new Date(start)
      end.setDate(end.getDate() + (6 - start.getDay()) + 1) // exclusive next-Sun 00:00
      return d < end
    }
    case 'next7': {
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return d < end
    }
    case 'month':
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    default:
      return true
  }
}

function buildRails(events, now = Date.now()) {
  // Rails only ever show upcoming events — a past event has no business in
  // "Trending" or "This weekend". Filter once up front so every rail inherits it.
  events = events.filter((e) => !isEventPast(e, now))
  const used = new Set()
  const take = (list, n) => {
    const out = []
    for (const e of list) {
      if (out.length >= n) break
      if (used.has(e.id)) continue
      used.add(e.id)
      out.push(e)
    }
    return out
  }

  const rails = []

  const trending = take(
    [...events].sort((a, b) => (b.goingCount ?? 0) - (a.goingCount ?? 0)),
    6,
  )
  if (trending.length) rails.push({ title: 'Trending this week', events: trending })

  // Same threshold the card badge uses (rsvp_count ≥ 0.9 * capacity). Order by
  // how-full ratio so the tightest ones surface first.
  const almostFull = take(
    events
      .filter((e) => e.almostFull === true)
      .sort((a, b) => {
        const ra = a.capacity ? (a.goingCount ?? 0) / a.capacity : 0
        const rb = b.capacity ? (b.goingCount ?? 0) / b.capacity : 0
        return rb - ra
      }),
    6,
  )
  if (almostFull.length) rails.push({ title: 'Almost full', events: almostFull })

  const newThisWeek = take(
    events
      .filter((e) => {
        if (!e.publishedAt) return false
        const t = Date.parse(e.publishedAt)
        if (isNaN(t)) return false
        return now - t <= WEEK_MS
      })
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    6,
  )
  if (newThisWeek.length) rails.push({ title: 'New this week', events: newThisWeek })

  const free = take(
    events.filter((e) => e.isFree === true),
    6,
  )
  if (free.length) rails.push({ title: 'Free tonight', events: free })

  const pickup = take(
    events.filter((e) => e.isSports === true),
    6,
  )
  if (pickup.length) rails.push({ title: 'Pickup runs', events: pickup })

  // Fri/Sat/Sun by starts_at (see isWeekendEvent: Sun=0, Fri=5, Sat=6).
  const weekend = take(
    events
      .filter(isWeekendEvent)
      .sort((a, b) => new Date(a.isoDate).getTime() - new Date(b.isoDate).getTime()),
    6,
  )
  if (weekend.length) rails.push({ title: 'Coming up this weekend', events: weekend })

  return rails
}

export function Discover() {
  const { user } = useApp()
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [view, setView] = useState('list') // 'list' | 'map'
  // Session-only location/radius override, set via the near-me popover or the
  // map's search box. Takes priority over the profile's saved home so "events
  // near X" reflects the search; it's never persisted, so a reload reverts to
  // the profile's settings. Null → fall back to nearForUser(user).
  // Shape: { lat, lng, city, radiusKm? } — radiusKm optional (map picks omit it).
  const [locationOverride, setLocationOverride] = useState(null)

  // Title search state. `nlResults` is null while a search is in flight and
  // becomes the ranked title-match array once it resolves; that flip drives the
  // search-mode UI (browse hidden, results shown).
  const [nlResults, setNlResults] = useState(null)

  // Debounce the raw query (350ms) so the search fires once typing settles
  // rather than on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Merge the override onto the profile's near settings: an override always
  // wins on place, and its radiusKm (if set) overrides the profile radius —
  // otherwise the profile's saved radius still applies to the searched place.
  const profileNear = nearForUser(user)
  const near = locationOverride
    ? {
        ...locationOverride,
        radiusKm: locationOverride.radiusKm ?? profileNear?.radiusKm ?? 40,
      }
    : profileNear
  const nearKey =
    near?.lat != null ? `${near.lat},${near.lng},${near.radiusKm ?? ''}` : (near?.city ?? '')

  // Cursor-paginated browse feed (Load more + infinite scroll on the filtered
  // grid). `events` is null while page 1 is in flight. Keyed on the location so
  // changing the near-me pin resets and refetches page 1.
  const { events, loadMore, loadingMore, hasMore, sentinelRef } = useEventFeed(nearKey, (cursor) =>
    api.eventsPage({ near, cursor }),
  )

  // Debounce the raw query into `debouncedQuery` (350ms) so the search fires
  // once typing settles, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

  const toggle = (k) => setFilters((f) => ({ ...f, [k]: !f[k] }))
  const setWhen = (when) => setFilters((f) => ({ ...f, when }))

  // Monotonic request id so a slow earlier search can't overwrite a newer one's
  // results (last-typed wins, regardless of which response lands first).
  const searchSeq = useRef(0)

  // Render-time reset (same pattern as the `fetchedKey` block above): when the
  // active query changes, blank the results so the spinner shows while the new
  // search runs. An empty query converges on the browse experience
  // (searching=false).
  const [searchedFor, setSearchedFor] = useState('')
  if (searchedFor !== debouncedQuery) {
    setSearchedFor(debouncedQuery)
    setNlResults(null)
  }

  // Fire the title search automatically whenever the debounced query changes.
  useEffect(() => {
    if (!debouncedQuery) return
    const seq = ++searchSeq.current
    api
      .nlSearch(debouncedQuery)
      .then((res) => {
        if (seq !== searchSeq.current) return // a newer search superseded this one
        setNlResults(res.events)
      })
      .catch(() => {
        if (seq === searchSeq.current) setNlResults([]) // surface the empty state
      })
  }, [debouncedQuery])

  // Local browse filtering (only used when NOT in NL-search mode). NL results
  // are already ranked + constrained server-side, so we render them as-is.
  const filtered = useMemo(() => {
    return (events ?? []).filter((e) => {
      if (isEventPast(e)) return false // don't surface events that already happened
      if (cat !== 'All' && e.category !== cat) return false
      if (filters.free && !e.isFree) return false
      if (filters.sports && !e.isSports) return false
      if (!eventInWhen(e, filters.when)) return false
      return true
    })
  }, [events, cat, filters])

  // Default browse: no category, no refinements → editorial rails. Any active
  // filter/category flips to a single filtered grid so the user sees exactly
  // what they asked for without the rails muddying the view. (Query no longer
  // counts — it drives NL search on Enter, not the local browse grid.)
  const filtersActive = cat !== 'All' || filters.free || filters.sports || filters.when !== 'any'

  const rails = useMemo(
    () => (!filtersActive ? buildRails(events ?? []) : []),
    [events, filtersActive],
  )

  // Events already surfaced in a rail — excluded from the "All near you" grid
  // below so the same event doesn't appear twice on the default browse view.
  const railedIds = useMemo(() => new Set(rails.flatMap((r) => r.events.map((e) => e.id))), [rails])
  // The full near-you catalog for the default browse view, minus what the rails
  // already show and minus past events. This is the paginated grid that lets a
  // user reach *all* nearby events (rails only sample the top few each), so
  // Load more / infinite scroll fills it out beyond the first page.
  const restNearYou = useMemo(
    () => filtered.filter((e) => !railedIds.has(e.id)),
    [filtered, railedIds],
  )

  // Two view modes: NL-search results (a query is active) or the default browse
  // experience. The search runs live as the user types.
  const searching = debouncedQuery.length > 0

  const browseHeading =
    cat !== 'All'
      ? `${filtered.length} ${cat} ${pluralize(filtered.length, 'event')} near you`
      : `${filtered.length} ${pluralize(filtered.length, 'event')} near you this week`

  const searchHeading = `${nlResults?.length ?? 0} ${pluralize(nlResults?.length ?? 0, 'result')} for "${query.trim()}"`

  return (
    <div className="loop-container pb-24 pt-4 md:pb-12">
      <SearchBar value={query} onChange={setQuery} placeholder="Search events by title" />

      {searching ? (
        /* ---- Title-search mode: results run live as you type. ------------ */
        nlResults === null ? (
          <PageLoader label="Searching" />
        ) : (
          <>
            <h1 className="mb-5 mt-6 font-display text-[28px] font-bold leading-tight text-ink md:text-3xl">
              {searchHeading}
            </h1>
            {nlResults.length > 0 ? (
              <EventGrid events={nlResults} />
            ) : (
              <p className="py-16 text-center text-sm text-text-muted">
                No events match that title. Try a different word.
              </p>
            )}
          </>
        )
      ) : (
        /* ---- Browse mode: near-me chip, filters, rails / grid / map ------ */
        <>
          {/* "Near me" control — surfaces the location + radius driving the
              near-you filter and opens an inline popover to adjust both for this
              search only (a reload reverts to the profile's saved settings). */}
          <div className="mt-3">
            <NearMePopover
              override={locationOverride}
              onApply={setLocationOverride}
              onReset={() => setLocationOverride(null)}
            />
          </div>

          {/* filters — categories, then a date-span row, then quick filters */}
          <div className="mt-4">
            <CatRow active={cat} onChange={setCat} />
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              When
            </span>
            <WhenRow options={WHEN_OPTIONS} value={filters.when} onChange={setWhen} />
          </div>
          <div className="mt-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Refine
            </span>
            <FilterBar filters={filters} onToggle={toggle} />
          </div>

          {events === null ? (
            <PageLoader label="Loading events" />
          ) : view === 'map' ? (
            <>
              {/* Map mode short-circuits both the rails and the filtered-grid
                  paths — the map is the primary view, so we surface the toggle
                  above it and render pins for whatever's currently filtered
                  (or every event when no filter is active). */}
              <div className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="font-display text-xl font-bold leading-tight text-ink sm:text-[28px] md:text-3xl">
                  {filtersActive
                    ? browseHeading
                    : `${filtered.length} ${pluralize(filtered.length, 'event')} on the map`}
                </h1>
                <ViewToggle value={view} onChange={setView} />
              </div>
              <EventsMap
                events={filtered}
                viewLat={near?.lat}
                viewLng={near?.lng}
                searchLocation={locationOverride}
                onLocationChange={setLocationOverride}
              />
            </>
          ) : filtersActive ? (
            <>
              {/* section heading + list/map toggle */}
              <div className="mb-5 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="font-display text-xl font-bold leading-tight text-ink sm:text-[28px] md:text-3xl">
                  {browseHeading}
                </h1>
                <ViewToggle value={view} onChange={setView} />
              </div>

              {filtered.length > 0 ? (
                <EventGrid events={filtered} />
              ) : (
                <p className="py-16 text-center text-sm text-text-muted">
                  No events match those filters. Try clearing a few.
                </p>
              )}
              {/* Load more pulls the next page of near-you events; the active
                  category/quick filters re-apply to the appended rows. */}
              <LoadMore
                hasMore={hasMore}
                loading={loadingMore}
                onClick={loadMore}
                sentinelRef={sentinelRef}
              />
            </>
          ) : rails.length > 0 ? (
            <>
              <div className="mb-4 mt-6 flex items-center justify-end">
                <ViewToggle value={view} onChange={setView} />
              </div>
              <div>
                {rails.map((r, i) => (
                  <section key={r.title}>
                    <h2
                      className={cn(
                        'mb-4 font-display text-2xl font-bold text-ink',
                        i === 0 ? '' : 'mt-10',
                      )}
                    >
                      {r.title}
                    </h2>
                    <EventGrid events={r.events} />
                  </section>
                ))}

                {/* All near you — the paginated catalog under the curated
                    rails. Rails only sample the top few of each theme; this
                    grid is how a user reaches *every* nearby event, filling out
                    via Load more + infinite scroll. Hidden when the rails
                    already cover everything on the current page. */}
                {restNearYou.length > 0 && (
                  <section>
                    <h2 className="mb-4 mt-10 font-display text-2xl font-bold text-ink">
                      All events near you
                    </h2>
                    <EventGrid events={restNearYou} />
                  </section>
                )}
              </div>
              <LoadMore
                hasMore={hasMore}
                loading={loadingMore}
                onClick={loadMore}
                sentinelRef={sentinelRef}
              />
            </>
          ) : (
            <p className="py-16 text-center text-sm text-text-muted">No events near you yet.</p>
          )}
        </>
      )}
    </div>
  )
}

function ViewToggle({ value, onChange }) {
  const OPTS = [
    { key: 'list', label: 'List', Icon: LayoutGrid },
    { key: 'map', label: 'Map', Icon: MapIcon },
  ]
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="flex flex-shrink-0 items-center rounded-pill border border-border-light bg-card-bg p-1"
    >
      {OPTS.map(({ key, label, Icon }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-primary text-white' : 'text-text-secondary hover:text-ink',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
