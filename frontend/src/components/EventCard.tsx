import { useNavigate } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import type { Event } from '../lib/types'
import { CATEGORY_COLOR, cn } from '../lib/utils'
import { useApp } from '../context/AppContext'
import {
  AIChip,
  AlmostFullBadge,
  GoingStack,
  RSVPBtn,
  SaveBtn,
  VerifiedBadge,
} from './primitives'

/* CategoryBadge — the top-left tint pill when there's no AI rationale. */
function CategoryBadge({ category }: { category: Event['category'] }) {
  return (
    <span
      className="rounded-pill px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm"
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
    <article
      className="group flex flex-col overflow-hidden rounded-card border border-border-light bg-card-bg shadow-card transition-shadow hover:shadow-card-hover"
    >
      {/* Poster */}
      <div className="relative h-48 cursor-pointer overflow-hidden" onClick={go}>
        <img
          src={event.poster}
          alt={event.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

        {/* top row: AIChip|CategoryBadge (left) + AlmostFullBadge (right) */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {showRationale && event.rationale ? (
            <AIChip text={event.rationale} />
          ) : (
            <CategoryBadge category={event.category} />
          )}
          {event.almostFull && <AlmostFullBadge />}
        </div>

        {/* price bottom-left */}
        <span className="absolute bottom-3 left-3 rounded-pill bg-white/95 px-2.5 py-1 text-xs font-bold text-ink">
          {event.isFree ? 'Free' : event.price}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-4">
        <h3
          onClick={go}
          className="cursor-pointer font-display text-base font-bold leading-snug text-[#111] line-clamp-2"
        >
          {event.title}
        </h3>

        {/* organizer row */}
        {event.organizer && (
          <div className="mt-2 flex items-center gap-1.5">
            <img
              src={event.organizer.avatar}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
            <span className="text-xs text-text-secondary">{event.organizer.name}</span>
            {event.organizer.verified && <VerifiedBadge size={14} />}
          </div>
        )}

        {/* date + venue row */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Calendar size={13} className="flex-shrink-0" />
            <span className="truncate">{event.date}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin size={13} className="flex-shrink-0" />
            <span className="truncate">
              {event.venueName} · {event.city}
            </span>
          </div>
        </div>

        {/* actions */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-light pt-3">
          <GoingStack
            count={event.isSports ? event.playersSignedUp ?? 0 : event.goingCount}
            avatars={event.goingAvatars}
          />
          <div className="flex items-center gap-2">
            <SaveBtn saved={saved} onToggle={() => toggleSaved(event.id)} />
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

/* Width wrapper for the flex-wrap grid — Figma gridSystem cardWidths. */
export function EventGrid({ events, showRationale }: { events: Event[]; showRationale?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-4 xl:justify-start">
      {events.map((e) => (
        <div
          key={e.id}
          className={cn(
            'w-full sm:w-[calc(50%-8px)]',
            'lg:w-[calc(33.333%-11px)] xl:w-[calc(25%-12px)]',
          )}
        >
          <EventCard event={e} showRationale={showRationale} />
        </div>
      ))}
    </div>
  )
}
