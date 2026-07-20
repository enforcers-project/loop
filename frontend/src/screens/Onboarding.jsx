import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Navigation, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'
import { InlineAlert } from '../components/primitives'
import {
  cityFromGeocode,
  getCurrentLocation,
  isGoogleMapsConfigured,
  loadGoogleMaps,
} from '../lib/googleMaps'

// Fallback list when Google Maps isn't configured (or fails to load) — the
// picker still works, just without autocomplete/geocode. Rec engine falls back
// to city ILIKE when lat/lng are missing (see engine.js preFilter).
const FALLBACK_CITIES = [
  'Oakland, CA',
  'San Francisco, CA',
  'Berkeley, CA',
  'San Jose, CA',
  'New York, NY',
  'Atlanta, GA',
]

export function Onboarding() {
  const navigate = useNavigate()
  const { user, setInterests, saveLocation } = useApp()
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [interests, setInterestList] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [citySearch, setCitySearch] = useState('')
  // `city` alone (no coords) is still enough to persist, but with coords the
  // recommender's radius search kicks in.
  const [location, setLocation] = useState(null) // { city, lat, lng, placeId }
  const [saving, setSaving] = useState(false)
  const [locatingMe, setLocatingMe] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [mapsReady, setMapsReady] = useState(false)
  // Inline error shown above the step's primary button, instead of a toast at
  // the bottom of the screen.
  const [error, setError] = useState('')

  const autocompleteRef = useRef(null)
  const placesServiceRef = useRef(null)
  const sessionTokenRef = useRef(null)

  useEffect(() => {
    api.interests().then(setInterestList)
  }, [])

  // Load the Places SDK once on mount. If the key is missing or the script
  // fails, the picker silently degrades to the hardcoded fallback list.
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

  // Autocomplete predictions. Fire on each keystroke; Google throttles at their
  // end and the session token bundles the request chain into a single billable
  // "session" that ends when a place is picked.
  useEffect(() => {
    if (!mapsReady || !autocompleteRef.current) return
    const q = citySearch.trim()
    // Empty query clears via the input's onChange (see below), not here — that
    // avoids a synchronous setState inside an effect body.
    if (!q) return
    let cancelled = false
    autocompleteRef.current.getPlacePredictions(
      { input: q, types: ['(cities)'], sessionToken: sessionTokenRef.current },
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
  }, [citySearch, mapsReady])

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const canContinue = picked.size >= 3

  // Turn a picked prediction into { city, lat, lng, placeId } via Places
  // details. Details closes the autocomplete "session" — mint a new token
  // afterward so a subsequent search starts a fresh session.
  const pickPrediction = (prediction) => {
    if (!placesServiceRef.current) return
    placesServiceRef.current.getDetails(
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
        setLocation({
          city:
            cityFromGeocode([{ address_components: place.address_components || [] }]) ||
            place.name ||
            prediction.description,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          placeId: prediction.place_id,
        })
        setCitySearch(prediction.description)
        setPredictions([])
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
      setLocation(loc)
      setCitySearch(loc.city)
      setPredictions([])
    } catch (err) {
      setError(err.message || "Couldn't get your location")
    } finally {
      setLocatingMe(false)
    }
  }

  const pickFallback = (label) => {
    // No coords — recommender falls back to city ILIKE for these.
    setLocation({ city: label, lat: null, lng: null, placeId: null })
    setCitySearch(label)
  }

  const finish = async () => {
    if (saving) return
    if (!location) return
    setError('')
    const ids = [...picked]
    setSaving(true)
    setInterests(ids)
    try {
      const [interestsRes, locationRes] = await Promise.all([
        api.saveInterests(user?.id, ids),
        saveLocation(location),
      ])
      if (interestsRes?.pending || locationRes?.pending) {
        toast.info('Saved locally — will sync when you sign in.')
      }
      navigate('/feed')
    } catch {
      setError("Couldn't save your onboarding. Please try again.")
      setSaving(false)
    }
  }

  const fallbackVisible = !mapsReady && !locatingMe
  const fallbackList = fallbackVisible
    ? FALLBACK_CITIES.filter((c) => c.toLowerCase().includes(citySearch.toLowerCase()))
    : []

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-10">
      {/* progress */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2].map((s) => (
          <span
            key={s}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              step >= s ? 'bg-primary' : 'bg-border-light',
            )}
          />
        ))}
      </div>

      {step === 1 ? (
        <div className="flex flex-1 flex-col">
          <h1 className="font-display text-4xl font-bold text-ink">What are you into?</h1>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm text-text-secondary">Pick at least 3 to tune your feed.</p>
            <span
              className={cn(
                'rounded-pill px-2.5 py-1 text-xs font-semibold',
                canContinue ? 'bg-success/15 text-success' : 'bg-surface text-text-muted',
              )}
            >
              {picked.size} selected
            </span>
          </div>

          {/* chips flush below subhead */}
          <div className="mt-6 flex flex-wrap gap-2">
            {interests.map((i) => {
              const on = picked.has(i.id)
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  className={cn(
                    'rounded-pill border px-4 py-2 text-sm font-medium transition-colors',
                    on
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                  )}
                >
                  {i.label}
                </button>
              )
            })}
          </div>

          <div className="mt-auto pt-10">
            <button
              disabled={!canContinue}
              onClick={() => setStep(2)}
              className={cn(
                'w-full rounded-button py-3.5 text-sm font-semibold transition-colors',
                canContinue
                  ? 'bg-accent text-white active:scale-95'
                  : 'cursor-not-allowed bg-surface text-text-muted',
              )}
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <h1 className="font-display text-4xl font-bold text-ink">Where are you?</h1>
          <p className="mt-2 text-sm text-text-secondary">
            We’ll show you events happening nearby.
          </p>

          {/* city search — autocomplete when Maps is configured, plain filter otherwise */}
          <div className="mt-6 flex items-center gap-2 rounded-input border border-border-light bg-white px-4 py-3 focus-within:border-primary">
            <Search size={18} className="text-text-muted" />
            <input
              value={citySearch}
              onChange={(e) => {
                const v = e.target.value
                setCitySearch(v)
                if (!v.trim()) setPredictions([])
                if (location && v !== location.city) setLocation(null)
              }}
              placeholder={mapsReady ? 'Search any city' : 'Search your city'}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-placeholder"
            />
          </div>

          <button
            onClick={useMyLocation}
            disabled={locatingMe}
            className="mt-3 flex w-full items-center gap-2 rounded-button border border-primary bg-primary-light px-4 py-3 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Navigation size={16} />{' '}
            {locatingMe ? 'Getting your location…' : 'Use my current location'}
          </button>

          <div className="mt-4 space-y-1.5">
            {mapsReady
              ? predictions.map((p) => (
                  <button
                    key={p.place_id}
                    onClick={() => pickPrediction(p)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-button border px-4 py-3 text-left text-sm transition-colors',
                      location?.placeId === p.place_id
                        ? 'border-primary bg-primary text-white'
                        : 'border-border-light bg-white text-text-primary hover:border-text-muted',
                    )}
                  >
                    <MapPin
                      size={16}
                      className={
                        location?.placeId === p.place_id ? 'text-white' : 'text-text-muted'
                      }
                    />
                    {p.description}
                  </button>
                ))
              : fallbackList.map((c) => (
                  <button
                    key={c}
                    onClick={() => pickFallback(c)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-button border px-4 py-3 text-left text-sm transition-colors',
                      location?.city === c
                        ? 'border-primary bg-primary text-white'
                        : 'border-border-light bg-white text-text-primary hover:border-text-muted',
                    )}
                  >
                    <MapPin
                      size={16}
                      className={location?.city === c ? 'text-white' : 'text-text-muted'}
                    />
                    {c}
                  </button>
                ))}
          </div>

          <div className="mt-auto pt-10">
            {/* inline error — right above the Done button that triggered it */}
            <InlineAlert message={error} className="mb-3" />
            <button
              disabled={!location || saving}
              onClick={finish}
              className={cn(
                'w-full rounded-button py-3.5 text-sm font-semibold transition-colors',
                location && !saving
                  ? 'bg-accent text-white active:scale-95'
                  : 'cursor-not-allowed bg-surface text-text-muted',
              )}
            >
              {saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
