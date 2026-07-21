import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Search, X } from 'lucide-react'
import { cityFromGeocode, isGoogleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps'
import { CATEGORY_COLOR, cn } from '../lib/utils'
import { EventImage } from './EventImage'
import { Spinner } from './primitives'

/**
 * EventsMap — themed Google Map for the Discover screen.
 *
 * Renders one pin per event that has lat/lng (silently skips coord-less rows)
 * and shows a floating card overlay when a pin is clicked. Reuses the shared
 * loadGoogleMaps() promise from lib/googleMaps.js so the Maps JS script is
 * loaded exactly once per session, matching Onboarding.
 *
 * Center/zoom priority: `viewLat/viewLng` (from an address search or the
 * user's home) → fitBounds over the pins → wide US fallback.
 *
 * `onLocationChange({ lat, lng, city })` fires when the user picks a place
 * from the overlay search box, so Discover can refetch events near there.
 */

const FALLBACK_CENTER = { lat: 39.8283, lng: -98.5795 } // continental US centroid
const FALLBACK_ZOOM = 4
const NEAR_ZOOM = 11

/**
 * Warm-neutral map style — off-white land, calm water, muted roads. Keeps the
 * category-colored pins as the loudest thing on screen (the "Airbnb pattern").
 * Tweak the fills/strokes here to reskin without touching the component.
 */
const MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#f5efe6' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6b76' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#faf6f0' }] },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.neighborhood',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#dbe7d0' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b8f5c' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#f7ede0' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#f2d8a8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#e8c68a' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry',
    stylers: [{ color: '#f2d8a8' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#bcd7de' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5f8791' }],
  },
]

export function EventsMap({
  events,
  viewLat,
  viewLng,
  searchLocation,
  onLocationChange,
  height,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const searchMarkerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [scriptError, setScriptError] = useState(null)
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()

  // Missing-key case is a render-time constant — no effect needed. Async load
  // failure lands in `scriptError` from the loader promise below.
  const configured = isGoogleMapsConfigured()
  const loadError = configured ? scriptError : 'Maps setup is missing — set VITE_GOOGLE_MAPS_KEY.'

  // Load the SDK + create the map instance once.
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !containerRef.current) return
        const initialCenter =
          viewLat != null && viewLng != null ? { lat: viewLat, lng: viewLng } : FALLBACK_CENTER
        const initialZoom = viewLat != null && viewLng != null ? NEAR_ZOOM : FALLBACK_ZOOM
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: initialCenter,
          zoom: initialZoom,
          styles: MAP_STYLES,
          disableDefaultUI: false,
          clickableIcons: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        })
        setReady(true)
      })
      .catch((err) => {
        if (!cancelled) setScriptError(err.message || 'Could not load the map.')
      })
    return () => {
      cancelled = true
    }
    // Only run once — the map keeps its own viewport state after init, and we
    // reflect prop changes through the marker effect + a recenter effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recenter when viewLat/viewLng changes (user's location resolves, or the
  // search box picks a new place). Skips no-op writes to avoid re-triggering
  // the marker `fitBounds` effect below.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    if (viewLat == null || viewLng == null) return
    mapRef.current.setCenter({ lat: viewLat, lng: viewLng })
    if (mapRef.current.getZoom() < NEAR_ZOOM) mapRef.current.setZoom(NEAR_ZOOM)
  }, [ready, viewLat, viewLng])

  // Search marker — a distinct "you searched here" indicator so the user can
  // orient themselves against nearby event pins. Rendered as an SVG path
  // (bigger halo + solid center + tail) so it reads clearly as a
  // location-search result rather than another event dot. Cleared when
  // searchLocation goes null (Reset button).
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google) return
    const google = window.google

    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null)
      searchMarkerRef.current = null
    }
    if (!searchLocation || typeof searchLocation.lat !== 'number') return

    // Teardrop pin shape — a filled path with a stroke, sized to sit clearly
    // above the smaller category dots. anchor puts the tip at the geo point.
    searchMarkerRef.current = new google.maps.Marker({
      map: mapRef.current,
      position: { lat: searchLocation.lat, lng: searchLocation.lng },
      title: searchLocation.city || 'Searched location',
      zIndex: 999,
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
  }, [ready, searchLocation])

  // Sync markers whenever the events prop changes. Full rebuild is fine at this
  // scale (tens to low hundreds of pins) and keeps the code simple.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google) return
    const google = window.google

    for (const m of markersRef.current) m.setMap(null)
    markersRef.current = []

    const withCoords = (events ?? []).filter(
      (e) => typeof e.lat === 'number' && typeof e.lng === 'number',
    )
    if (withCoords.length === 0) return

    const markers = withCoords.map((event) => {
      const color = CATEGORY_COLOR[event.category] || '#6D5EFC'
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: event.lat, lng: event.lng },
        title: event.title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      })
      marker.addListener('click', () => {
        setSelected(event)
        mapRef.current.panTo({ lat: event.lat, lng: event.lng })
      })
      return marker
    })
    markersRef.current = markers

    // Only auto-fit when the parent isn't driving the view. If viewLat/viewLng
    // is set (user's home, or a search-box pick), respect that center — don't
    // yank the map to the pins' bounding box.
    if (viewLat == null || viewLng == null) {
      const bounds = new google.maps.LatLngBounds()
      for (const m of markers) bounds.extend(m.getPosition())
      mapRef.current.fitBounds(bounds, 64)
      const zoomListener = google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
        if (mapRef.current.getZoom() > 14) mapRef.current.setZoom(14)
      })
      return () => google.maps.event.removeListener(zoomListener)
    }
  }, [ready, events, viewLat, viewLng])

  const dismiss = useCallback(() => setSelected(null), [])

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-border-light shadow-card',
        height ? '' : 'h-[420px] md:h-[560px]',
      )}
      style={height ? { height } : undefined}
    >
      {loadError ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface text-text-muted">
          <MapPin size={28} />
          <span className="text-sm">{loadError}</span>
        </div>
      ) : (
        <>
          <div ref={containerRef} className="absolute inset-0 bg-[#f5efe6]" />
          {!ready && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/60">
              <Spinner size="lg" label="Loading map" />
            </div>
          )}
          {ready && onLocationChange && <MapSearchBox onPick={onLocationChange} />}
        </>
      )}

      {selected && (
        <MapEventCard
          event={selected}
          onDismiss={dismiss}
          onOpen={() =>
            navigate(selected.isSports ? `/sports/${selected.id}` : `/event/${selected.id}`)
          }
        />
      )}
    </div>
  )
}

/**
 * MapSearchBox — pill-shaped autocomplete floating at the top of the map.
 * Uses Google Places AutocompleteService (same as Onboarding) but accepts any
 * address type, not just cities. Calls onPick({ lat, lng, city }) when the
 * user selects a suggestion.
 */
function MapSearchBox({ onPick }) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState([])
  const [open, setOpen] = useState(false)
  const autocompleteRef = useRef(null)
  const placesServiceRef = useRef(null)
  const sessionTokenRef = useRef(null)

  // Init Places services once. Reuses the already-loaded google global.
  useEffect(() => {
    const google = window.google
    if (!google?.maps?.places) return
    autocompleteRef.current = new google.maps.places.AutocompleteService()
    // PlacesService needs a real DOM node or a Map — a throwaway div is fine
    // (matches the Onboarding pattern).
    placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'))
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
  }, [])

  // Fire predictions on each keystroke; Google throttles server-side and the
  // session token bundles the request chain into a single billable session
  // that ends when a place is picked. Empty-query clears via the input's
  // onChange handler below, not here — matching Onboarding's pattern.
  useEffect(() => {
    if (!autocompleteRef.current) return
    const q = query.trim()
    if (!q) return
    let cancelled = false
    autocompleteRef.current.getPlacePredictions(
      { input: q, sessionToken: sessionTokenRef.current },
      (res, status) => {
        if (cancelled) return
        if (status !== 'OK' || !Array.isArray(res)) {
          setPredictions([])
          return
        }
        setPredictions(res.slice(0, 5))
      },
    )
    return () => {
      cancelled = true
    }
  }, [query])

  const pick = (prediction) => {
    const svc = placesServiceRef.current
    if (!svc) return
    svc.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['formatted_address', 'geometry', 'address_components', 'name'],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        if (status !== 'OK' || !place?.geometry?.location) return
        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        const city =
          cityFromGeocode([{ address_components: place.address_components || [] }]) ||
          place.name ||
          prediction.description
        setQuery(prediction.description)
        setPredictions([])
        setOpen(false)
        onPick({ lat, lng, city })
        // Mint a fresh session token — the prior "session" ended when details
        // resolved, per the Places billing model.
        if (window.google?.maps?.places) {
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        }
      },
    )
  }

  return (
    <div className="absolute inset-x-3 top-3 z-10 flex justify-center md:inset-x-0">
      <div className="w-full max-w-md">
        <div
          className={cn(
            'flex items-center gap-2 rounded-pill border border-border-light bg-white px-4 py-2.5 shadow-card',
            'focus-within:border-primary',
          )}
        >
          <Search size={16} className="flex-shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => {
              const v = e.target.value
              setQuery(v)
              setOpen(true)
              if (!v.trim()) setPredictions([])
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search any address, venue, or city"
            aria-label="Search a location on the map"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setPredictions([])
              }}
              aria-label="Clear search"
              className="flex-shrink-0 text-text-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {open && predictions.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-card border border-border-light bg-white shadow-card">
            {predictions.map((p) => (
              <button
                key={p.place_id}
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface"
              >
                <MapPin size={14} className="flex-shrink-0 text-text-muted" />
                <span className="truncate">{p.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* Floating card that appears at the bottom of the map when a pin is clicked.
   Slim variant of EventCard — poster on top, title/date/venue, "View details"
   CTA — so the map view stays glanceable without duplicating the full card. */
function MapEventCard({ event, onDismiss, onOpen }) {
  const color = CATEGORY_COLOR[event.category] || '#6D5EFC'
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-card border border-border-light bg-card-bg shadow-card">
        <button
          type="button"
          onClick={onOpen}
          className="relative block h-[140px] w-full overflow-hidden"
          aria-label={`View ${event.title}`}
        >
          <EventImage
            src={event.poster}
            alt={event.title}
            category={event.category}
            title={event.title}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <span
            className="absolute left-3 top-3 rounded-pill px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            {event.category}
          </span>
          <span className="absolute bottom-3 left-3 rounded-pill bg-white/95 px-2.5 py-1 text-xs font-bold text-ink shadow-sm">
            {event.isFree ? 'Free' : event.price}
          </span>
        </button>
        <div className="p-3">
          <h3
            onClick={onOpen}
            className="cursor-pointer font-display text-sm font-bold leading-snug text-ink line-clamp-2"
          >
            {event.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-secondary">
            <MapPin size={12} className="flex-shrink-0 text-text-muted" />
            <span className="truncate">
              {event.venueName} · {event.city}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-text-secondary">{event.date}</div>
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 w-full rounded-button bg-accent py-2 text-xs font-semibold text-white active:scale-95"
          >
            View details
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close preview"
        className="pointer-events-auto absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-ink shadow-card hover:bg-white"
      >
        <X size={16} />
      </button>
    </div>
  )
}
