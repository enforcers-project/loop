import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { CatRow, FilterBar, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'

const EMPTY_FILTERS = {
  free: false,
  today: false,
  weekend: false,
  sports: false,
  nearby: false,
}

export function Discover() {
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [events, setEvents] = useState([])

  useEffect(() => {
    api.events().then(setEvents)
  }, [])

  const toggle = (k) => setFilters((f) => ({ ...f, [k]: !f[k] }))

  const filtered = useMemo(() => {
    return events.filter((e) => {
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
      ? `${filtered.length} ${cat} event${filtered.length === 1 ? '' : 's'} near you`
      : `${filtered.length} event${filtered.length === 1 ? '' : 's'} near you this week`

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

      {/* section heading — 24px above, 20px below to the grid */}
      <h1 className="mb-5 mt-6 font-display text-[22px] font-bold leading-tight text-ink md:text-2xl">
        {heading}
      </h1>

      {filtered.length > 0 ? (
        <EventGrid events={filtered} />
      ) : (
        <p className="py-16 text-center text-sm text-text-muted">
          No events match those filters. Try clearing a few.
        </p>
      )}
    </div>
  )
}
