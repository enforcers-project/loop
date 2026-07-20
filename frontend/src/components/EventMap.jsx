import { MapPin, ExternalLink } from 'lucide-react'

/**
 * EventMap — full-width interactive map for the event detail page.
 *
 * Uses Google Maps' keyless embed endpoint (q=lat,lng, output=embed) so the
 * demo scale project can ship a real interactive map without provisioning an
 * API key. Matches the Google-Maps decision in project memory while keeping
 * the surface a one-component swap if we later move to the JS SDK. Renders
 * a labeled placeholder (no floating pin over grey) when coords are missing,
 * so a partial event never shows a broken tile.
 */
export function EventMap({ lat, lng, venueName, city, address, height = 320 }) {
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
  const label = [venueName, city].filter(Boolean).join(', ')
  const query = address || (hasCoords ? `${lat},${lng}` : label)
  const openUrl = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null

  return (
    <div className="overflow-hidden rounded-card border border-border-light shadow-card">
      <div className="relative w-full bg-surface" style={{ height }}>
        {hasCoords ? (
          <iframe
            title={`Map showing ${label || 'event location'}`}
            src={`https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <MapPin size={28} />
            <span className="text-sm">{label || 'Location coming soon'}</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{venueName || 'Venue'}</p>
          <p className="truncate text-xs text-text-secondary">{address || city}</p>
        </div>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:opacity-80"
          >
            Open in Maps <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  )
}
