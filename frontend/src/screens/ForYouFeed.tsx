import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import type { Category, Event } from '../lib/types'
import { useApp } from '../context/AppContext'
import { CATEGORY_COLOR } from '../lib/utils'
import { CatRow, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { AIChip, AlmostFullBadge, GoingStack, RSVPBtn, SaveBtn } from '../components/primitives'

const TABS = ['For You', 'Trending', 'Following'] as const
type Tab = (typeof TABS)[number]

/* Featured hero card — 320px tall. */
function FeaturedCard({ event }: { event: Event }) {
  const navigate = useNavigate()
  const { savedIds, goingIds, toggleSaved, toggleGoing } = useApp()
  return (
    <div
      className="relative h-80 overflow-hidden rounded-card shadow-card"
      style={{ backgroundColor: '#000' }}
    >
      <img src={event.poster} alt="" className="h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
        {event.rationale ? (
          <AIChip text={event.rationale} />
        ) : (
          <span
            className="rounded-pill px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: CATEGORY_COLOR[event.category] }}
          >
            {event.category}
          </span>
        )}
        {event.almostFull && <AlmostFullBadge />}
      </div>

      <div className="absolute inset-x-4 bottom-4 text-white">
        <h2 className="font-display text-2xl font-bold md:text-3xl">{event.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} /> {event.date}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={14} /> {event.venueName} · {event.city}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <GoingStack count={event.goingCount} avatars={event.goingAvatars} size="md" />
          <div className="flex items-center gap-2">
            <SaveBtn saved={savedIds.has(event.id)} onToggle={() => toggleSaved(event.id)} />
            <RSVPBtn
              variant={goingIds.has(event.id) ? 'outline' : 'filled'}
              onClick={() => {
                if (!goingIds.has(event.id)) toggleGoing(event.id)
                navigate(event.isSports ? `/sports/${event.id}` : `/event/${event.id}`)
              }}
            >
              {goingIds.has(event.id) ? 'Going' : 'RSVP'}
            </RSVPBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ForYouFeed() {
  const { interests } = useApp()
  const [tab, setTab] = useState<Tab>('For You')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const [query, setQuery] = useState('')
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    if (tab === 'For You') {
      api.recommendations(interests).then(setEvents)
    } else {
      api.events({ sort: tab === 'Trending' ? 'popular' : 'date' }).then(setEvents)
    }
  }, [tab, interests])

  const filtered = events.filter((e) => {
    if (cat !== 'All' && e.category !== cat) return false
    if (query.trim()) {
      const n = query.toLowerCase()
      return (
        e.title.toLowerCase().includes(n) ||
        e.tags.some((t) => t.toLowerCase().includes(n)) ||
        e.category.toLowerCase().includes(n)
      )
    }
    return true
  })

  const [featured, ...rest] = filtered

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-4 md:pb-10">
      {/* sticky search */}
      <div className="sticky top-16 z-20 -mx-5 bg-white/95 px-5 py-3 backdrop-blur-md">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* tabs */}
      <div className="mt-3 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              'rounded-pill border px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t
                ? 'border-primary bg-primary text-white'
                : 'border-border-light bg-white text-text-secondary hover:border-text-muted')
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* category row */}
      <div className="mt-3">
        <CatRow active={cat} onChange={setCat} />
      </div>

      {/* featured hero */}
      {featured && (
        <div className="mt-5">
          <FeaturedCard event={featured} />
        </div>
      )}

      {/* grid */}
      <div className="mt-6">
        {rest.length > 0 ? (
          <EventGrid events={rest} showRationale />
        ) : (
          <p className="py-16 text-center text-sm text-text-muted">No events match yet.</p>
        )}
      </div>
    </div>
  )
}
