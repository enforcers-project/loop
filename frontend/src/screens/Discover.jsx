import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, MapPin, Map as MapIcon } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CatRow, FilterBar, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { EventsMap } from '../components/EventsMap'
import { PageLoader } from '../components/primitives'
import { cn, pluralize } from '../lib/utils'

const EMPTY_FILTERS = {
  free: false,
  today: false,
  weekend: false,
  sports: false,
  nearby: false,
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

  const toggle = (k) => setFilters((f) => ({ ...f, [k]: !f[k] }))

  const filtered = useMemo(() => {
    return (events ?? []).filter((e) => {
      if (cat !== 'All' && e.category !== cat) return false
      if (filters.free && !e.isFree) return false
      if (filters.sports && !e.isSports) return false
      if (query.trim()) {
        const n = query.toLowerCase()
        if (
          !e.title.toLowerCase().includes(n) &&
          !e.tags.some((t) => t.toLowerCase().includes(n)) &&
          !e.category.toLowerCase().includes(n) &&
          !e.city.toLowerCase().includes(n)
        )
          return false
      }
      return true
    })
  }, [events, cat, filters, query])

  const heading =
    cat !== 'All'
      ? `${filtered.length} ${cat} ${pluralize(filtered.length, 'event')} near you`
      : `${filtered.length} ${pluralize(filtered.length, 'event')} near you this week`

  return (
    <div className="loop-container pb-24 pt-4 md:pb-12">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search events, venues, organizers…"
      />

      {/* filters — first row categories, second row quick filters */}
      <div className="mt-4">
        <CatRow active={cat} onChange={setCat} />
      </div>
      <div className="mt-2">
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
      ) : (
        <>
          {/* section heading + list/map toggle */}
          <div className="mb-5 mt-6 flex items-center justify-between gap-3">
            <h1 className="font-display text-[28px] font-bold leading-tight text-ink md:text-3xl">
              {heading}
            </h1>
            <ViewToggle value={view} onChange={setView} />
          </div>

          {view === 'map' ? (
            <EventsMap
              events={filtered}
              viewLat={near?.lat}
              viewLng={near?.lng}
              searchLocation={locationOverride}
              onLocationChange={setLocationOverride}
            />
          ) : filtered.length > 0 ? (
            <EventGrid events={filtered} />
          ) : (
            <p className="py-16 text-center text-sm text-text-muted">
              No events match those filters. Try clearing a few.
            </p>
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
              active
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-ink',
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
