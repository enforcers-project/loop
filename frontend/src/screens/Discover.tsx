import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { Category, Event } from '../lib/types'
import { CatRow, FilterBar, SearchBar, type Filters } from '../components/rows'
import { EventGrid } from '../components/EventCard'

const EMPTY_FILTERS: Filters = {
  free: false,
  today: false,
  weekend: false,
  sports: false,
  nearby: false,
}

export function Discover() {
  const [cat, setCat] = useState<Category | 'All'>('All')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    api.events().then(setEvents)
  }, [])

  const toggle = (k: keyof Filters) =>
    setFilters((f) => ({ ...f, [k]: !f[k] }))

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

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-4 md:pb-10">
      <SearchBar value={query} onChange={setQuery} placeholder="Search events, venues, organizers…" />

      <div className="mt-3">
        <CatRow active={cat} onChange={setCat} />
      </div>
      <div className="mt-2">
        <FilterBar filters={filters} onToggle={toggle} />
      </div>

      {/* count header */}
      <div className="mb-4 mt-4 flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold text-ink">
          {filtered.length} event{filtered.length === 1 ? '' : 's'}
          {cat !== 'All' ? ` in ${cat}` : ' near you'}
        </h1>
      </div>

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
