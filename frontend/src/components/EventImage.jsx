import { useState } from 'react'
import {
  Music,
  Moon,
  Trophy,
  Briefcase,
  UtensilsCrossed,
  GraduationCap,
  CalendarDays,
} from 'lucide-react'
import { cn } from '../lib/utils'

/* Per-category brand gradient + icon for the polished image fallback. Each
   gradient stays anchored in Loop's purple/pink palette but shifts toward the
   category tint so a fallback still reads as the right kind of event. */
const CATEGORY_VISUAL = {
  Music: { gradient: 'linear-gradient(135deg, #6D5EFC 0%, #A855F7 100%)', Icon: Music },
  Nightlife: { gradient: 'linear-gradient(135deg, #FF2E74 0%, #6D5EFC 100%)', Icon: Moon },
  Sports: { gradient: 'linear-gradient(135deg, #16C784 0%, #6D5EFC 100%)', Icon: Trophy },
  Networking: { gradient: 'linear-gradient(135deg, #2D8CFF 0%, #6D5EFC 100%)', Icon: Briefcase },
  Food: { gradient: 'linear-gradient(135deg, #FFB020 0%, #FF2E74 100%)', Icon: UtensilsCrossed },
  Campus: { gradient: 'linear-gradient(135deg, #FF7A45 0%, #FF2E74 100%)', Icon: GraduationCap },
}

const DEFAULT_VISUAL = {
  gradient: 'linear-gradient(135deg, #6D5EFC 0%, #FF2E74 100%)',
  Icon: CalendarDays,
}

/* --------------------------------------------------------------------------
   EventImage — cover image with a skeleton-while-loading state and a polished
   branded fallback when the src is missing or fails to load. Reserves space
   via the wrapper (aspect-ratio / fixed height) so images never shift layout.
-------------------------------------------------------------------------- */
export function EventImage({
  src,
  alt,
  category,
  title,
  className,
  iconSize = 40,
  showLabel = true,
}) {
  const [status, setStatus] = useState(src ? 'loading' : 'error')
  // Aspect ratio drives fit: landscape photos (typical Ticketmaster/SeatGeek
  // posters) look best with object-cover so the tile is fully filled.
  // Portrait AI flyers get object-contain so the title/text at the top and
  // bottom of the flyer isn't cropped by the tile edges.
  const [portrait, setPortrait] = useState(false)

  const visual = category ? CATEGORY_VISUAL[category] : DEFAULT_VISUAL
  const { Icon } = visual
  const fallbackStyle = { backgroundImage: visual.gradient }

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-surface">
      {/* Blurred backdrop fills any letterbox gap for portrait flyers, so
          they read as intentional rather than "floating on grey". */}
      {portrait && status === 'loaded' && src && (
        <img
          src={src}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
        />
      )}
      {status !== 'error' && src && (
        <img
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalHeight > img.naturalWidth) setPortrait(true)
            setStatus('loaded')
          }}
          onError={() => setStatus('error')}
          className={cn(
            'relative h-full w-full transition-opacity duration-300',
            portrait ? 'object-contain' : 'object-cover',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            className,
          )}
        />
      )}

      {/* skeleton while the image loads */}
      {status === 'loading' && <div className="loop-skeleton absolute inset-0" aria-hidden />}

      {/* branded gradient fallback */}
      {status === 'error' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white"
          style={fallbackStyle}
          aria-label={alt || title || category || 'Event'}
        >
          <Icon size={iconSize} strokeWidth={1.75} className="opacity-90 drop-shadow-sm" />
          {showLabel && (category || title) && (
            <span className="line-clamp-2 text-sm font-semibold leading-tight text-white/95 drop-shadow-sm">
              {category ?? title}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
