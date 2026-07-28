import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { CATEGORY_COLOR, isEventPast, pluralize, recommendationLabel } from '../lib/utils'
import { CatRow, SearchBar, pillBase, pillSelected, pillUnselected } from '../components/rows'
import { cn } from '../lib/utils'
import { useEventFeed } from '../lib/useEventFeed'
import { EventGrid } from '../components/EventCard'
import { EventImage } from '../components/EventImage'
import { NearMeChip } from '../components/NearMeChip'
import {
  AIChip,
  AlmostFullBadge,
  GoingStack,
  LoadMore,
  PageLoader,
  RSVPBtn,
  SaveBtn,
} from '../components/primitives'

// The page *is* the "For You" feed, so that tab is implicit. Trending/Following
// are now toggle pills in the filter row below: selecting one swaps the feed
// source, deselecting returns to the default For You recommendations.
const FEED_TOGGLES = ['Trending', 'Following']

/* Featured hero card — controlled 320px (desktop) height with a smooth
   bottom-up overlay so the white text stays readable. */
function FeaturedCard({ event }) {
  const navigate = useNavigate()
  const { savedIds, goingIds, toggleSaved, toggleGoing, interestLabelsByCategory } = useApp()
  const matchedLabels =
    interestLabelsByCategory?.[event.category] ??
    interestLabelsByCategory?.[event.categorySlug] ??
    []
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
  // so route straight to the run screen. Non-sports: bump the local count
  // synchronously so the hero "N going" ticks in the same frame as the button
  // flip, then roll back if the RSVP was login-gated or rejected.
  const onRsvp = async () => {
    if (event.isSports) return navigate(`/sports/${event.id}`)
    const wasGoing = goingIds.has(event.id)
    const willGo = !wasGoing
    setGoingCount((c) => Math.max(0, c + (willGo ? 1 : -1)))
    const result = await toggleGoing(event.id)
    if (result === null || result === wasGoing) {
      setGoingCount((c) => Math.max(0, c + (willGo ? -1 : 1)))
    }
    navigate(`/event/${event.id}`)
  }

  return (
    <div className="relative h-[240px] overflow-hidden rounded-card shadow-hero sm:h-[300px] md:h-[330px]">
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
          <AIChip
            text={recommendationLabel(
              event.rationale,
              event.category,
              matchedLabels,
              `${event.title ?? ''} ${event.description ?? ''}`,
            )}
          />
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
          className="pointer-events-auto cursor-pointer font-display text-xl font-bold leading-tight sm:text-[26px] md:text-[30px]"
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
          <GoingStack
            count={goingCount}
            avatars={event.goingAvatars}
            mutuals={event.mutualsGoing}
            size="md"
          />
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
  // Debounced mirror of `query`. Typing hits the DB full-text search ~250ms
  // after the user stops, so search reaches *every* event in the database — not
  // just the recommendation batch already on screen (which the old in-memory
  // .includes() filter was limited to).
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Depend only on the coord primitives (or city) so a full user-object
  // reference change from a /me refresh doesn't retrigger this effect.
  const near = nearForUser(user)
  const nearKey = near?.lat != null ? `${near.lat},${near.lng}` : (near?.city ?? '')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const searching = debouncedQuery.length > 0

  // Cursor-paginated feed (Load more + infinite scroll). The key encodes every
  // input that changes the query, so switching tab/search/location resets and
  // refetches page 1. The loader picks the right source:
  //   - search      → GET /events?q= (paginated across the whole DB)
  //   - For You     → POST /recommendations (a single ranked batch, not paged)
  //   - Trending/Following → GET /events?sort= (paginated)
  // Recommendations aren't cursor-paged server-side, so that mode returns no
  // nextCursor and the Load more control simply doesn't appear.
  const fetchKey = `${tab}|${debouncedQuery}|${interests.join(',')}|${nearKey}`
  const { events, loadMore, loadingMore, hasMore, sentinelRef } = useEventFeed(
    fetchKey,
    async (cursor) => {
      if (searching) {
        return api.eventsPage({ q: debouncedQuery, near, cursor })
      }
      if (tab === 'For You') {
        // Recommendations are a single ranked batch — no pagination.
        const recs = await api.recommendations(interests)
        return { events: recs, nextCursor: null }
      }
      return api.eventsPage({ sort: tab === 'Trending' ? 'popular' : 'date', near, cursor })
    },
  )

  const filtered = (events ?? []).filter((e) => {
    if (isEventPast(e)) return false // keep the feed forward-looking
    if (cat !== 'All' && e.category !== cat) return false
    return true
  })

  const [featured, ...rest] = filtered

  return (
    <div className="loop-container pb-24 pt-4 md:pb-12">
      {/* sticky search — pinned flush below the 80px TopNav (top-20). Filters
          the events feed; people search lives on the Social tab. */}
      <div className="sticky top-20 z-20 -mx-4 bg-white/95 px-4 pb-3 pt-2 backdrop-blur-md md:-mx-6 md:px-6">
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={() => setDebouncedQuery(query.trim())}
          city={user?.homeCity}
        />
      </div>

      {/* "Near me" chip — shows the current location + radius that's shaping
          this feed, and deep-links to Settings to change it. Only appears once
          the user has a saved home location. */}
      <div className="mt-3">
        <NearMeChip />
      </div>

      {/* filter row — Trending/Following toggles sit attached to the category
          chips; a selected toggle swaps the feed source, deselecting it (or
          picking the other) returns to the default For You recommendations. */}
      <div className="mt-4">
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

      {events === null ? (
        <PageLoader label="Loading events" />
      ) : searching ? (
        /* ---- Search mode: a plain results grid over the whole DB (no hero,
            no rationale chips — these are literal keyword matches, not
            personalized picks). ------------------------------------------- */
        <>
          <h1 className="mb-5 mt-6 font-display text-xl font-bold leading-tight text-ink sm:text-[28px] md:text-3xl">
            {filtered.length} {pluralize(filtered.length, 'result')} for "{debouncedQuery}"
          </h1>
          {filtered.length > 0 ? (
            <EventGrid events={filtered} />
          ) : (
            <p className="py-16 text-center text-sm text-text-muted">
              No events match "{debouncedQuery}". Try a different search.
            </p>
          )}
          <LoadMore
            hasMore={hasMore}
            loading={loadingMore}
            onClick={loadMore}
            sentinelRef={sentinelRef}
          />
        </>
      ) : (
        <>
          {/* featured hero — 24px below categories */}
          {featured && (
            <div className="mt-6">
              <FeaturedCard event={featured} />
            </div>
          )}

          {/* grid — 24px below hero. Every card carries its own rationale
              chip (from the recommendation engine) — "Because you like X",
              "Friends going", "Popular near you", etc. — so the feel of
              personalization comes from the labels on each card, not from
              editorial rails (those live on Discover). */}
          <div className="mt-6">
            {rest.length > 0 ? (
              <EventGrid events={rest} showRationale />
            ) : (
              !featured && (
                <p className="py-16 text-center text-sm text-text-muted">No events match yet.</p>
              )
            )}
          </div>
          <LoadMore
            hasMore={hasMore}
            loading={loadingMore}
            onClick={loadMore}
            sentinelRef={sentinelRef}
          />
        </>
      )}
    </div>
  )
}
