import { useEffect, useRef, useState } from 'react'
import { MapPin, Navigation, Search } from 'lucide-react'
import {
  cityFromGeocode,
  getCurrentLocation,
  isGoogleMapsConfigured,
  loadGoogleMaps,
} from '../lib/googleMaps'
import { cn } from '../lib/utils'
import { InlineAlert } from './primitives'

// Fallback list when Google Maps isn't configured (or fails to load). Same set
// as Onboarding uses, keeps the picker functional without autocomplete.
const FALLBACK_CITIES = [
  'Oakland, CA',
  'San Francisco, CA',
  'Berkeley, CA',
  'San Jose, CA',
  'New York, NY',
  'Atlanta, GA',
]

/**
 * AddressPicker — a reusable Places-autocomplete address input.
 *
 * Accepts a `value` ({ city, lat, lng, placeId } | null) and calls
 * `onChange(next)` when the user picks a prediction, uses "current location",
 * or clears the field. Unlike Onboarding this accepts *any* address type
 * (`geocode`) rather than just cities, so the user can type "415 Mission St,
 * San Francisco" and Loop stores the exact lat/lng.
 *
 * Falls back to a hardcoded city list when VITE_GOOGLE_MAPS_KEY isn't set —
 * degrades gracefully rather than blocking the form.
 */
export function AddressPicker({ value, onChange, placeholder = 'Search any address or city' }) {
  const [query, setQuery] = useState(value?.city ?? '')
  const [predictions, setPredictions] = useState([])
  const [locatingMe, setLocatingMe] = useState(false)
  const [mapsReady, setMapsReady] = useState(false)
  const [error, setError] = useState('')

  const autocompleteRef = useRef(null)
  const placesServiceRef = useRef(null)
  const sessionTokenRef = useRef(null)

  useEffect(() => {
    if (!isGoogleMapsConfigured()) return
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled) return
        autocompleteRef.current = new google.maps.places.AutocompleteService()
        placesServiceRef.current = new google.maps.places.PlacesService(
          document.createElement('div'),
        )
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
        setMapsReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Fire predictions on each keystroke; Google throttles at their end and the
  // session token bundles the request chain into a single billable session
  // that ends when a place is picked. `types: ['geocode']` accepts addresses,
  // venues, and cities — not just city-level entries like Onboarding.
  useEffect(() => {
    if (!mapsReady || !autocompleteRef.current) return
    const q = query.trim()
    if (!q) return
    let cancelled = false
    autocompleteRef.current.getPlacePredictions(
      { input: q, types: ['geocode'], sessionToken: sessionTokenRef.current },
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
  }, [query, mapsReady])

  // Resolve a prediction → { city, lat, lng, placeId } via Places details.
  // Details closes the autocomplete "session", so mint a fresh token afterward.
  const pick = (prediction) => {
    setError('')
    const svc = placesServiceRef.current
    if (!svc) return
    svc.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['formatted_address', 'geometry', 'address_components', 'name'],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        if (status !== 'OK' || !place?.geometry?.location) {
          setError("Couldn't look up that place. Try picking another.")
          return
        }
        const city =
          cityFromGeocode([{ address_components: place.address_components || [] }]) ||
          place.name ||
          prediction.description
        const next = {
          // Prefer the full formatted address as the stored label so users see
          // exactly what they typed ("415 Mission St, San Francisco, CA"), not
          // just the city. Fall back to prediction description.
          city: place.formatted_address || prediction.description || city,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          placeId: prediction.place_id,
        }
        setQuery(next.city)
        setPredictions([])
        onChange(next)
        if (window.google?.maps?.places) {
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        }
      },
    )
  }

  const useMyLocation = async () => {
    if (locatingMe) return
    setError('')
    if (!isGoogleMapsConfigured()) {
      setError('Maps setup is missing — pick a city instead.')
      return
    }
    setLocatingMe(true)
    try {
      const loc = await getCurrentLocation()
      setQuery(loc.city)
      setPredictions([])
      onChange(loc)
    } catch (err) {
      setError(err.message || "Couldn't get your location")
    } finally {
      setLocatingMe(false)
    }
  }

  const pickFallback = (label) => {
    // No coords — recommender falls back to city ILIKE for these.
    const next = { city: label, lat: null, lng: null, placeId: null }
    setQuery(label)
    onChange(next)
  }

  const fallbackVisible = !mapsReady && !locatingMe
  const fallbackList = fallbackVisible
    ? FALLBACK_CITIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    <div>
      <div className="flex items-center gap-2 rounded-input border border-border-light bg-white px-4 py-3 focus-within:border-primary">
        <Search size={18} className="flex-shrink-0 text-text-muted" />
        <input
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            if (!v.trim()) {
              setPredictions([])
              onChange(null)
            }
          }}
          placeholder={mapsReady ? placeholder : 'Search your city'}
          aria-label="Address"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
        />
      </div>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locatingMe}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-button border border-primary bg-primary-light px-4 py-2.5 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Navigation size={15} />
        {locatingMe ? 'Getting your location…' : 'Use my current location'}
      </button>

      {(predictions.length > 0 || fallbackList.length > 0) && (
        <div className="mt-2 space-y-1.5">
          {mapsReady
            ? predictions.map((p) => (
                <button
                  key={p.place_id}
                  type="button"
                  onClick={() => pick(p)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-button border px-4 py-2.5 text-left text-sm transition-colors',
                    value?.placeId === p.place_id
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-primary hover:border-text-muted',
                  )}
                >
                  <MapPin
                    size={15}
                    className={value?.placeId === p.place_id ? 'text-white' : 'text-text-muted'}
                  />
                  <span className="truncate">{p.description}</span>
                </button>
              ))
            : fallbackList.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickFallback(c)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-button border px-4 py-2.5 text-left text-sm transition-colors',
                    value?.city === c
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-primary hover:border-text-muted',
                  )}
                >
                  <MapPin
                    size={15}
                    className={value?.city === c ? 'text-white' : 'text-text-muted'}
                  />
                  {c}
                </button>
              ))}
        </div>
      )}

      <InlineAlert message={error} className="mt-2" />
    </div>
  )
}
