import { useEffect, useRef, useState } from 'react'
import { MapPin, ExternalLink } from 'lucide-react'
import { isGoogleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps'
import { getMapStyles, MAP_BG } from '../lib/mapStyles'
import { useTheme } from '../context/ThemeContext'

/**
 * EventMap — full-width interactive map for the event detail page.
 *
 * When VITE_GOOGLE_MAPS_KEY is set, renders a JS-SDK map styled with the app's
 * brand palette (shared with the Discover map via lib/mapStyles) and a single
 * marker at the venue. Without a key it falls back to Google's keyless embed
 * iframe so the demo still ships a real map — that endpoint can't be recolored,
 * so it stays Google-default. Renders a labeled placeholder when coords are
 * missing, so a partial event never shows a broken tile.
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
          <MapCanvas lat={lat} lng={lng} label={label} height={height} />
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

/**
 * MapCanvas — the tile surface. Brand-styled JS-SDK map when a key exists,
 * otherwise the keyless embed iframe (unstyleable, Google-default look).
 */
function MapCanvas({ lat, lng, label, height }) {
  const { theme } = useTheme()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const configured = isGoogleMapsConfigured()

  // Build the styled JS-SDK map once (only when configured). Falls back to the
  // iframe if the script fails to load.
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat, lng },
          zoom: 15,
          styles: getMapStyles(theme),
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        })
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: { lat, lng },
          title: label || 'Event location',
          icon: {
            path: 'M 0,0 C -6,-16 -16,-20 -16,-30 A 16,16 0 1,1 16,-30 C 16,-20 6,-16 0,0 z',
            fillColor: '#6D5EFC',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
            scale: 1,
            anchor: new google.maps.Point(0, 0),
          },
        })
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
    // Re-center handled by the effect below; theme handled by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  // Keep the marker/center in sync if the event's coords change (e.g. edit).
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const pos = { lat, lng }
    mapRef.current.setCenter(pos)
    markerRef.current?.setPosition(pos)
  }, [ready, lat, lng])

  // Re-skin tiles on theme toggle without rebuilding the map.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    mapRef.current.setOptions({ styles: getMapStyles(theme) })
  }, [ready, theme])

  // No key, or the SDK failed to load → keyless embed (Google-default look).
  if (!configured || failed) {
    return (
      <iframe
        title={`Map showing ${label || 'event location'}`}
        src={`https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ height, background: MAP_BG[theme] || MAP_BG.light }}
    />
  )
}
