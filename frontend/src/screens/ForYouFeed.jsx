import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CATEGORY_COLOR, recommendationLabel } from '../lib/utils'
import { CatRow, SearchBar, pillBase, pillSelected, pillUnselected } from '../components/rows'
import { cn } from '../lib/utils'
import { EventGrid } from '../components/EventCard'
import { EventImage } from '../components/EventImage'
import { AIChip, AlmostFullBadge, GoingStack, RSVPBtn, SaveBtn } from '../components/primitives'

// The page *is* the "For You" feed, so that tab is implicit. Trending/Following
// are now toggle pills in the filter row below: selecting one swaps the feed
// source, deselecting returns to the default For You recommendations.
const FEED_TOGGLES = ['Trending', 'Following']

/* Featured hero card — controlled 320px (desktop) height with a smooth
   bottom-up overlay so the white text stays readable. */
function FeaturedCard({ event }) {
  const navigate = useNavigate()
  const { savedIds, goingIds, toggleSaved, toggleGoing } = useApp()
  // Re-seed during render when reused for a different event (React's
  // reset-state-on-prop-change pattern — no effect, so no optimistic clobber).
  const [goingCount, setGoingCount] = useState(event.goingCount ?? 0)
  const [seededId, setSeededId] = useState(event.id)
  if (seededId !== event.id) {
    setSeededId(event.id)
    setGoingCount(event.goingCount ?? 0)
  }

  const go = () => navigate(event.isSports ? `/sports/${event.id}` : `/event/${event.id}`)

  // Sports runs fill via the roster, not RSVP (the backend 409s a sports RSVP),
  // so route straight to the run screen. Non-sports: RSVP, bump the local count
  // on a real state change, then open the detail page.
  const onRsvp = async () => {
    if (event.isSports) return navigate(`/sports/${event.id}`)
    const wasGoing = goingIds.has(event.id)
    const result = await toggleGoing(event.id)
    if (result !== null && result !== wasGoing) {
      setGoingCount((c) => Math.max(0, c + (result ? 1 : -1)))
    }
    navigate(`/event/${event.id}`)
  }

  return (
    <div className="relative h-[300px] overflow-hidden rounded-card shadow-hero md:h-[330px]">
      <button
        type="button"
        onClick={go}
        aria-label={`View ${event.title}`}
        className="absolute inset-0 z-0 block h-full w-full cursor-pointer text-left"
      >
        <EventImage
          src={event.poster}
          alt={event.title}
          category={event.category}
          title={event.title}
          iconSize={56}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      </button>

      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-2">
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

      <div className="pointer-events-none absolute inset-x-4 bottom-4 text-white sm:inset-x-6 sm:bottom-6">
        <h2
          onClick={go}
          className="pointer-events-auto cursor-pointer font-display text-[26px] font-bold leading-tight md:text-[30px]"
        >
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
        <div className="pointer-events-auto mt-4 flex flex-wrap items-center justify-between gap-3">
          <GoingStack count={goingCount} avatars={event.goingAvatars} size="md" />
          <div className="flex items-center gap-2">
            <SaveBtn saved={savedIds.has(event.id)} onToggle={() => toggleSaved(event.id)} />
            <RSVPBtn variant={goingIds.has(event.id) ? 'outline' : 'filled'} onClick={onRsvp}>
              {goingIds.has(event.id) ? 'Going' : 'RSVP'}
            </RSVPBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ForYouFeed() {
  const { interests, user } = useApp()
  const [tab, setTab] = useState('For You')
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [events, setEvents] = useState([])

  // Depend only on the coord primitives (or city) so a full user-object
  // reference change from a /me refresh doesn't retrigger this effect.
  const near = nearForUser(user)
  const nearKey = near?.lat != null ? `${near.lat},${near.lng}` : (near?.city ?? '')

  useEffect(() => {
    if (tab === 'For You') {
      // /recommendations reads home location off the user row server-side, so
      // no per-request geo params are needed here.
      api.recommendations(interests).then(setEvents)
    } else {
      api
        .events({ sort: tab === 'Trending' ? 'popular' : 'date', near: nearForUser(user) })
        .then(setEvents)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, interests, nearKey])

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
        <SearchBar value={query} onChange={setQuery} city={user?.homeCity} />
      </div>

      {/* filter row — Trending/Following toggles sit attached to the category
          chips; a selected toggle swaps the feed source, deselecting it (or
          picking the other) returns to the default For You recommendations. */}
      <div className="mt-5">
        <CatRow
          active={cat}
          onChange={setCat}
          leading={FEED_TOGGLES.map((t) => (
            <button
              key={t}
              onClick={() => setTab((cur) => (cur === t ? 'For You' : t))}
              aria-pressed={tab === t}
              className={cn(pillBase, tab === t ? pillSelected : pillUnselected)}
            >
              {t}
            </button>
          ))}
        />
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
