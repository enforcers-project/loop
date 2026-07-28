import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, MapPin, Map as MapIcon } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CatRow, FilterBar, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { EventsMap } from '../components/EventsMap'
import { NearMeChip } from '../components/NearMeChip'
import { PageLoader } from '../components/primitives'
import { cn, isEventPast, pluralize } from '../lib/utils'

const EMPTY_FILTERS = {
  free: false,
  today: false,
  weekend: false,
  sports: false,
}

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

  // Fri/Sat/Sun by starts_at (0 = Sun, 5 = Fri, 6 = Sat).
  const weekend = take(
    events
      .filter((e) => {
        if (!e.isoDate) return false
        const d = new Date(e.isoDate)
        if (isNaN(d.getTime())) return false
        const day = d.getDay()
        return day === 0 || day === 5 || day === 6
      })
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
  // Non-null when the user picked a place from the map's search box. Takes
  // priority over the profile's home location so "events near X" reflects the
  // search. Null → fall back to nearForUser(user).
  const [locationOverride, setLocationOverride] = useState(null) // { lat, lng, city }
  // null while the events fetch is in flight, so the screen can show a
  // spinner instead of "0 events near you".
  const [events, setEvents] = useState(null)

  // Title search state. `nlResults` is null while a search is in flight and
  // becomes the ranked title-match array once it resolves; that flip drives the
  // search-mode UI (browse hidden, results shown).
  const [nlResults, setNlResults] = useState(null)

  // Debounce the raw query (350ms) so the search fires once typing settles
  // rather than on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const near = locationOverride ?? nearForUser(user)
  const nearKey = near?.lat != null ? `${near.lat},${near.lng}` : (near?.city ?? '')

  // Render-time reset when the fetch input changes so stale rows don't flash
  // before the new request resolves. See FeaturedCard for the same pattern.
  const [fetchedKey, setFetchedKey] = useState('')
  if (fetchedKey !== nearKey) {
    setFetchedKey(nearKey)
    setEvents(null)
  }

  useEffect(() => {
    let cancelled = false
    api.events({ near }).then((data) => {
      if (!cancelled) setEvents(data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearKey])

  // Debounce the raw query into `debouncedQuery` (350ms) so the search fires
  // once typing settles, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

  const toggle = (k) => setFilters((f) => ({ ...f, [k]: !f[k] }))

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
      return true
    })
  }, [events, cat, filters])

  // Default browse: no category, no refinements → editorial rails. Any active
  // filter/category flips to a single filtered grid so the user sees exactly
  // what they asked for without the rails muddying the view. (Query no longer
  // counts — it drives NL search on Enter, not the local browse grid.)
  const filtersActive =
    cat !== 'All' || filters.free || filters.today || filters.weekend || filters.sports

  const rails = useMemo(
    () => (!filtersActive ? buildRails(events ?? []) : []),
    [events, filtersActive],
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
          {/* "Near me" chip — surfaces the saved home + radius that's driving
              the near-you filter, and links to Settings to change it. Hidden
              when the user has an active locationOverride pick (the search-chip
              below takes over the same role). */}
          {!locationOverride && (
            <div className="mt-3">
              <NearMeChip />
            </div>
          )}

          {/* filters — first row categories, second row quick filters */}
          <div className="mt-4">
            <CatRow active={cat} onChange={setCat} />
          </div>
          <div className="mt-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Refine
            </span>
            <FilterBar filters={filters} onToggle={toggle} />
          </div>

          {locationOverride && (
            <div className="mt-3 flex items-center gap-2 rounded-pill border border-primary/30 bg-primary-light px-3 py-1.5 text-xs font-medium text-primary">
              <MapPin size={12} />
              <span>Showing events near {locationOverride.city}</span>
              <button
                type="button"
                onClick={() => setLocationOverride(null)}
                className="ml-auto font-semibold underline-offset-2 hover:underline"
              >
                Reset
              </button>
            </div>
          )}

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
              </div>
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
      className="flex flex-shrink-0 items-center rounded-pill border border-border-light bg-white p-1"
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
