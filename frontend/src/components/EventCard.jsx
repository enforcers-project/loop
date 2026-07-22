import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { m } from 'motion/react'
import { CATEGORY_COLOR, recommendationLabel } from '../lib/utils'
import { fadeUp, staggerParent } from '../lib/motion'
import { useApp } from '../context/AppContext'
import { EventImage } from './EventImage'
import { AIChip, AlmostFullBadge, GoingStack, RSVPBtn, SaveBtn, VerifiedBadge } from './primitives'

/* CategoryBadge — the top-left tint pill when there's no AI rationale. */
function CategoryBadge({ category }) {
  return (
    <span
      className="rounded-pill px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
      style={{ backgroundColor: CATEGORY_COLOR[category] }}
    >
      {category}
    </span>
  )
}

export function EventCard({ event, showRationale = false, onClick }) {
  const navigate = useNavigate()
  const { savedIds, goingIds, toggleSaved, toggleGoing } = useApp()
  const saved = savedIds.has(event.id)
  const going = goingIds.has(event.id)
  // Local "going" count so the footer updates immediately on RSVP; seeded from
  // the event's denormalized rsvp_count. Sports cards read the roster count
  // (players_signed_up), which the RSVP flow doesn't touch, so they're left as-is.
  // Re-seed during render when the card is reused for a different event (React's
  // reset-state-on-prop-change pattern — no effect, so no optimistic clobber).
  const [goingCount, setGoingCount] = useState(event.goingCount ?? 0)
  const [seededId, setSeededId] = useState(event.id)
  if (seededId !== event.id) {
    setSeededId(event.id)
    setGoingCount(event.goingCount ?? 0)
  }

  const go = () => {
    if (onClick) return onClick()
    navigate(event.isSports ? `/sports/${event.id}` : `/event/${event.id}`)
  }

  // Sports runs fill via the roster (claim a spot), not the RSVP flow — the
  // backend 409s a sports RSVP — so "Join" routes to the run's detail screen.
  // Non-sports: RSVP, then keep the local count in step with the resulting
  // state. Skips the login-gated (null) and failure/rollback (unchanged) cases.
  const onRsvp = async () => {
    if (event.isSports) return navigate(`/sports/${event.id}`)
    const wasGoing = goingIds.has(event.id)
    const result = await toggleGoing(event.id)
    if (result === null || result === wasGoing) return
    setGoingCount((c) => Math.max(0, c + (result ? 1 : -1)))
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-border-light bg-card-bg shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      {/* Poster — fixed 180px height, consistent across every card */}
      <button
        type="button"
        onClick={go}
        aria-label={`View ${event.title}`}
        className="relative block h-[180px] w-full cursor-pointer overflow-hidden"
      >
        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
          <EventImage
            src={event.poster}
            alt={event.title}
            category={event.category}
            title={event.title}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

        {/* top row: AIChip|CategoryBadge (left) + AlmostFullBadge (right) */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {showRationale && event.rationale ? (
            <AIChip text={recommendationLabel(event.rationale, event.category)} />
          ) : (
            <CategoryBadge category={event.category} />
          )}
          {event.almostFull && <AlmostFullBadge />}
        </div>

        {/* price bottom-left */}
        <span className="absolute bottom-3 left-3 rounded-pill bg-white/95 px-2.5 py-1 text-xs font-bold text-ink shadow-sm">
          {event.isFree ? 'Free' : event.price}
        </span>
      </button>

      {/* Info */}
      <div className="flex flex-1 flex-col p-4">
        <h3
          onClick={go}
          className="min-h-[42px] cursor-pointer font-display text-base font-bold leading-snug text-ink line-clamp-2"
        >
          {event.title}
        </h3>

        {/* organizer row */}
        {event.organizer && (
          <div className="mt-2 flex items-center gap-1.5">
            <img
              src={event.organizer.avatar}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
            />
            <span className="truncate text-[13px] font-medium text-text-secondary">
              {event.organizer.name}
            </span>
            {event.organizer.verified && <VerifiedBadge size={14} />}
          </div>
        )}

        {/* date + venue row */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] text-text-secondary">
            <Calendar size={13} className="flex-shrink-0 text-text-muted" />
            <span className="truncate">{event.date}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-text-secondary">
            <MapPin size={13} className="flex-shrink-0 text-text-muted" />
            <span className="truncate">
              {event.venueName} · {event.city}
            </span>
          </div>
        </div>

        {/* actions — pinned to the bottom so every footer aligns */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-light pt-3">
          <GoingStack
            count={event.isSports ? (event.playersSignedUp ?? 0) : goingCount}
            avatars={event.goingAvatars}
          />
          <div className="flex flex-shrink-0 items-center gap-2">
            <SaveBtn sm saved={saved} onToggle={() => toggleSaved(event.id)} />
            <RSVPBtn sm variant={going ? 'outline' : 'filled'} onClick={onRsvp}>
              {going ? 'Going' : event.isSports ? 'Join' : 'RSVP'}
            </RSVPBtn>
          </div>
        </div>
      </div>
    </article>
  )
}

/* Responsive event grid — the spec's flex-wrap system (project_knowledge.md
   §gridSystem): 1 col mobile · 2 tablet · 3 desktop · 4 large. Each card sits in
   a width-controlled wrapper so a short last row centers (justify-center),
   stepping to left-aligned only on xl. gap-4 → 8/11/12px width offsets. */
export function EventGrid({ events, showRationale }) {
  return (
    // Cards fade-up in a gentle stagger on mount. `key` on the container resets
    // the reveal when the list identity changes (tab/filter swap) so a new set
    // animates in rather than snapping. viewport once → animate a single time.
    <m.div
      key={events.map((e) => e.id).join(',')}
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="flex flex-wrap justify-center gap-4 xl:justify-start"
    >
      {events.map((e) => (
        <m.div
          key={e.id}
          variants={fadeUp}
          className="w-full sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)] xl:w-[calc(25%-12px)]"
        >
          <EventCard event={e} showRationale={showRationale} />
        </m.div>
      ))}
    </m.div>
  )
}
