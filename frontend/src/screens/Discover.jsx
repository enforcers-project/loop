import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { CatRow, FilterBar, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { useToast } from '../context/ToastContext'

// Category display name -> backend slug (the backend filters on category.slug).
const NAME_TO_SLUG = {
  Music: 'music',
  Nightlife: 'nightlife',
  Sports: 'sports',
  Networking: 'networking',
  Food: 'food',
  Campus: 'campus',
}

const QUICK_FILTER_KEYS = ['free', 'today', 'weekend', 'sports', 'nearby']

// Local date ranges for the today / weekend quick filters, as ISO strings.
function dayRange(kind) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (kind === 'today') {
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { dateFrom: start.toISOString(), dateTo: end.toISOString() }
  }
  // weekend: upcoming Sat 00:00 -> Mon 00:00
  const daysUntilSat = (6 - start.getDay() + 7) % 7
  const sat = new Date(start)
  sat.setDate(sat.getDate() + daysUntilSat)
  const mon = new Date(sat)
  mon.setDate(mon.getDate() + 2)
  return { dateFrom: sat.toISOString(), dateTo: mon.toISOString() }
}

export function Discover() {
  const toast = useToast()
  // Filter state lives in the URL so a filtered view is deep-linkable and
  // survives back/refresh (spec §Discover mobile-web note). `cat` = category
  // display names (multi), `q` = query, `f` = active quick-filter keys.
  const [params, setParams] = useSearchParams()
  const [coords, setCoords] = useState(null) // {lat,lng} once geolocated
  const [locating, setLocating] = useState(false)

  const categories = params.getAll('cat')
  const query = params.get('q') ?? ''
  const quick = new Set(params.getAll('f'))

  const update = (fn) => {
    const next = new URLSearchParams(params)
    fn(next)
    setParams(next, { replace: true })
  }

  const toggleCat = (name) =>
    update((p) => {
      if (name === 'All') return p.delete('cat')
      const set = new Set(p.getAll('cat'))
      set.has(name) ? set.delete(name) : set.add(name)
      p.delete('cat')
      for (const c of set) p.append('cat', c)
    })

  const setQuickKeys = (p, set) => {
    p.delete('f')
    for (const k of set) p.append('f', k)
  }

  const toggleQuick = (key) =>
    update((p) => {
      const set = new Set(p.getAll('f'))
      set.has(key) ? set.delete(key) : set.add(key)
      setQuickKeys(p, set)
    })

  const setQuery = (v) => update((p) => (v ? p.set('q', v) : p.delete('q')))

  // Location pill -> browser geolocation, then flip on the "nearby" filter.
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not available in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
        update((p) => setQuickKeys(p, new Set(p.getAll('f')).add('nearby')))
        toast.success('Showing events near you.')
      },
      () => {
        setLocating(false)
        toast.error('Could not get your location.')
      },
    )
  }

  // Build the filter object api.events() understands.
  const nearbyActive = quick.has('nearby') && coords
  const filters = {
    categories: categories.map((n) => NAME_TO_SLUG[n]).filter(Boolean),
    categoryNames: categories, // drives the offline mock fallback
    q: query.trim() || undefined,
    isFree: quick.has('free') || undefined,
    isSports: quick.has('sports') || undefined,
    ...(quick.has('today') ? dayRange('today') : {}),
    ...(quick.has('weekend') ? dayRange('weekend') : {}),
    ...(nearbyActive ? { nearLat: coords.lat, nearLng: coords.lng, radiusKm: 25 } : {}),
  }

  const { data: events = [], isPending } = useQuery({
    queryKey: ['events', 'discover', params.toString(), coords],
    queryFn: () => api.events(filters),
  })

  const catLabel = categories.length === 1 ? `${categories[0]} ` : ''
  const heading = isPending
    ? 'Finding events…'
    : `${events.length} ${catLabel}event${events.length === 1 ? '' : 's'} near you`

  const quickState = Object.fromEntries(QUICK_FILTER_KEYS.map((k) => [k, quick.has(k)]))

  return (
    <div className="loop-container pb-24 pt-4 md:pb-12">
      <SearchBar
        value={query}
        onChange={setQuery}
        onLocation={useMyLocation}
        locating={locating}
        city={coords ? 'Near me' : 'Oakland'}
        placeholder="Search events, venues, organizers…"
      />

      {/* filters — first row categories (multi-select), second row quick filters */}
      <div className="mt-4">
        <CatRow active={categories} onChange={toggleCat} multi />
      </div>
      <div className="mt-2">
        <FilterBar filters={quickState} onToggle={toggleQuick} />
      </div>

      {/* section heading — 24px above, 20px below to the grid */}
      <h1 className="mb-5 mt-6 font-display text-[22px] font-bold leading-tight text-ink md:text-2xl">
        {heading}
      </h1>

      {isPending ? null : events.length > 0 ? (
        <EventGrid events={events} />
      ) : (
        <p className="py-16 text-center text-sm text-text-muted">
          No events match those filters. Try clearing a few.
        </p>
      )}
    </div>
  )
}
