import { useEffect, useRef, useState } from 'react'
import { MapPin, Check } from 'lucide-react'
import { cn } from '../lib/utils'
import { inputClass } from './primitives'
import { cityFromGeocode, isGoogleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps'

// Venue picker backed by Google Places (planning: real location + map). Reuses
// the AutocompleteService pattern from EventsMap's MapSearchBox, but resolves a
// full venue: name + formatted address + lat/lng + placeId + city. Picking a
// suggestion calls onPick with all of those so CreateEvent can persist real
// coordinates (the backend already stores lat/lng/address/google_place_id — the
// form just never sent them before).
//
// Degrades to a plain text input when the Maps key isn't set (local dev / no
// key), so the form still works — it just captures a free-text venue name with
// no coordinates. `resolved` shows a green check once a real place is locked in.
export function VenueAutocomplete({ value, onChange, onPick, onClear, resolved }) {
  const [ready, setReady] = useState(false)
  const [configured] = useState(() => isGoogleMapsConfigured())
  const [predictions, setPredictions] = useState([])
  const [open, setOpen] = useState(false)
  const autocompleteRef = useRef(null)
  const placesServiceRef = useRef(null)
  const sessionTokenRef = useRef(null)

  // Load the SDK + init Places services once (only when a key is configured).
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled) return
        autocompleteRef.current = new google.maps.places.AutocompleteService()
        placesServiceRef.current = new google.maps.places.PlacesService(
          document.createElement('div'),
        )
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
        setReady(true)
      })
      .catch(() => setReady(false)) // fall back to plain text on load failure
    return () => {
      cancelled = true
    }
  }, [configured])

  // Fetch predictions on each keystroke. Google throttles server-side; the
  // session token bundles the request chain into one billable session that ends
  // when a place is picked.
  useEffect(() => {
    if (!ready || !autocompleteRef.current) return
    const q = (value ?? '').trim()
    if (!q || resolved) return // don't re-query once a place is locked in
    let cancelled = false
    autocompleteRef.current.getPlacePredictions(
      { input: q, sessionToken: sessionTokenRef.current },
      (res, status) => {
        if (cancelled) return
        setPredictions(status === 'OK' && Array.isArray(res) ? res.slice(0, 5) : [])
      },
    )
    return () => {
      cancelled = true
    }
  }, [value, ready, resolved])

  const pick = (prediction) => {
    const svc = placesServiceRef.current
    if (!svc) return
    svc.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['name', 'formatted_address', 'geometry', 'address_components'],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        if (status !== 'OK' || !place?.geometry?.location) return
        const city = cityFromGeocode([{ address_components: place.address_components || [] }]) || ''
        setPredictions([])
        setOpen(false)
        onPick({
          venueName: place.name || prediction.structured_formatting?.main_text || '',
          address: place.formatted_address || prediction.description || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          placeId: prediction.place_id,
          city,
        })
        // Mint a fresh token — the prior session ended when details resolved.
        if (window.google?.maps?.places) {
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        }
      },
    )
  }

  // Plain-text fallback: no key configured (or SDK failed) — just capture text.
  if (!configured) {
    return (
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Skyline Rooftop"
          className={cn(inputClass, 'pr-10')}
        />
        <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            if (resolved) onClear?.() // editing after a pick clears the locked place
          }}
          onFocus={() => setOpen(true)}
          placeholder={ready ? 'Search a venue or address' : 'Loading places…'}
          className={cn(inputClass, 'pr-10')}
          aria-label="Venue"
          autoComplete="off"
        />
        {resolved ? (
          <button
            type="button"
            onClick={() => onClear?.()}
            aria-label="Clear venue and search again"
            title="Clear venue"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-success hover:text-text-muted"
          >
            {/* Green check = a real place is locked in; click to clear + re-search. */}
            <Check size={16} />
          </button>
        ) : (
          <MapPin size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
        )}
      </div>

      {open && !resolved && predictions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-border-light bg-white shadow-card">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => pick(p)}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface"
            >
              <MapPin size={15} className="mt-0.5 flex-shrink-0 text-text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">
                  {p.structured_formatting?.main_text || p.description}
                </span>
                {p.structured_formatting?.secondary_text && (
                  <span className="block truncate text-xs text-text-muted">
                    {p.structured_formatting.secondary_text}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
