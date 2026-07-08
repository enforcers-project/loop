import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CATEGORY_COLOR, recommendationLabel } from '../lib/utils'
import { CatRow, SearchBar } from '../components/rows'
import { EventGrid } from '../components/EventCard'
import { EventImage } from '../components/EventImage'
import { AIChip, AlmostFullBadge, GoingStack, RSVPBtn, SaveBtn } from '../components/primitives'

const TABS = ['For You', 'Trending', 'Following']

/* Featured hero card — controlled 320px (desktop) height with a smooth
   bottom-up overlay so the white text stays readable. */
function FeaturedCard({ event }) {
  const navigate = useNavigate()
  const { savedIds, goingIds, toggleSaved, toggleGoing } = useApp()
  return (
    <div className="relative h-[300px] overflow-hidden rounded-card shadow-hero md:h-[330px]">
      <EventImage
        src={event.poster}
        alt={event.title}
        category={event.category}
        title={event.title}
        iconSize={56}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
        {event.rationale ? (
          <AIChip text={recommendationLabel(event.rationale, event.category)} />
        ) : (
          <span
            className="rounded-pill px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
            style={{ backgroundColor: CATEGORY_COLOR[event.category] }}
          >
            {event.category}
          </span>
        )}
        {event.almostFull && <AlmostFullBadge />}
      </div>

      <div className="absolute inset-x-4 bottom-4 text-white sm:inset-x-6 sm:bottom-6">
        <h2 className="font-display text-[26px] font-bold leading-tight md:text-[30px]">
          {event.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/90">
          <span className="flex items-center gap-1.5">
            <Calendar size={15} className="opacity-90" /> {event.date}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={15} className="opacity-90" /> {event.venueName} · {event.city}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
  const [tab, setTab] = useState('For You')
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [events, setEvents] = useState([])

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
    <div className="loop-container pb-24 pt-4 md:pb-12">
      {/* sticky search — 32px below the navbar */}
      <div className="sticky top-16 z-20 -mx-4 bg-white/95 px-4 pb-3 pt-2 backdrop-blur-md md:-mx-6 md:px-6">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {/* tabs — 20px below search */}
      <div className="mt-5 flex gap-2">
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

      {/* category row — ~14px below tabs */}
      <div className="mt-3.5">
        <CatRow active={cat} onChange={setCat} />
      </div>

      {/* featured hero — 24px below categories */}
      {featured && (
        <div className="mt-6">
          <FeaturedCard event={featured} />
        </div>
      )}

      {/* grid — 24px below hero */}
      <div className="mt-6">
        {rest.length > 0 ? (
          <EventGrid events={rest} showRationale />
        ) : (
          !featured && (
            <p className="py-16 text-center text-sm text-text-muted">No events match yet.</p>
          )
        )}
      </div>
    </div>
  )
}
