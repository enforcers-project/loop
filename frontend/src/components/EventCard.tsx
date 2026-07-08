import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import type { Event } from '../lib/types'
import { CATEGORY_COLOR, recommendationLabel } from '../lib/utils'
import { useApp } from '../context/AppContext'
import { EventImage } from './EventImage'
import { AIChip, AlmostFullBadge, GoingStack, RSVPBtn, SaveBtn, VerifiedBadge } from './primitives'

/* CategoryBadge — the top-left tint pill when there's no AI rationale. */
function CategoryBadge({ category }: { category: Event['category'] }) {
  return (
    <span
      className="rounded-pill px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
      style={{ backgroundColor: CATEGORY_COLOR[category] }}
    >
      {category}
    </span>
  )
}

export function EventCard({
  event,
  showRationale = false,
  onClick,
}: {
  event: Event
  showRationale?: boolean
  onClick?: () => void
}) {
  const navigate = useNavigate()
  const { savedIds, goingIds, toggleSaved, toggleGoing } = useApp()
  const saved = savedIds.has(event.id)
  const going = goingIds.has(event.id)

  const go = () => {
    if (onClick) return onClick()
    navigate(event.isSports ? `/sports/${event.id}` : `/event/${event.id}`)
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
            count={event.isSports ? (event.playersSignedUp ?? 0) : event.goingCount}
            avatars={event.goingAvatars}
          />
          <div className="flex flex-shrink-0 items-center gap-2">
            <SaveBtn sm saved={saved} onToggle={() => toggleSaved(event.id)} />
            <RSVPBtn
              sm
              variant={going ? 'outline' : 'filled'}
              onClick={() => toggleGoing(event.id)}
            >
              {going ? 'Going' : event.isSports ? 'Join' : 'RSVP'}
            </RSVPBtn>
          </div>
        </div>
      </div>
    </article>
  )
}

/* Responsive event grid — 1 col mobile · 2 tablet · 3 medium desktop · 4 large.
   Uses CSS grid so every cell is equal width with consistent gaps. */
export function EventGrid({ events, showRationale }: { events: Event[]; showRationale?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map((e) => (
        <EventCard key={e.id} event={e} showRationale={showRationale} />
      ))}
    </div>
  )
}
