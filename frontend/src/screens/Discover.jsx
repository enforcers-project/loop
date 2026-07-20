import { useEffect, useMemo, useState } from 'react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CatRow, FilterBar, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { PageLoader } from '../components/primitives'
import { pluralize } from '../lib/utils'

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
  // null while the events fetch is in flight, so the screen can show a
  // spinner instead of "0 events near you".
  const [events, setEvents] = useState(null)

  const near = nearForUser(user)
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
    api.events({ near: nearForUser(user) }).then((data) => {
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

      {events === null ? (
        <PageLoader label="Loading events" />
      ) : (
        <>
          {/* section heading — 24px above, 20px below to the grid */}
          <h1 className="mb-5 mt-6 font-display text-[28px] font-bold leading-tight text-ink md:text-3xl">
            {heading}
          </h1>

          {filtered.length > 0 ? (
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
