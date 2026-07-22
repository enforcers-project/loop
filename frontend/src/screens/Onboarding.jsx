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

// The DOB slide asks month/day/year separately (three focused inputs). Loop's
// minimum age is 13 (COPPA) — mirrors the backend validator in
// PUT /users/:id/birthdate.
const MIN_AGE = 13
const MAX_AGE = 120

// Compute age (in full years) from a { m, d, y } triple. Returns NaN when any
// piece is missing or the date doesn't exist (e.g. Feb 30). Used to gate the
// Continue button and drive the inline age-preview chip.
function ageFromParts({ m, d, y }) {
  if (!m || !d || !y) return NaN
  const month = Number(m)
  const day = Number(d)
  const year = Number(y)
  if (!Number.isInteger(month) || month < 1 || month > 12) return NaN
  if (!Number.isInteger(day) || day < 1 || day > 31) return NaN
  if (!Number.isInteger(year) || year < 1900) return NaN
  // Reject impossible dates by round-tripping through Date — Feb 30 becomes
  // Mar 2 (getUTCMonth === 2, not 1), which we treat as invalid.
  const dob = new Date(Date.UTC(year, month - 1, day))
  if (
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    return NaN
  }
  const today = new Date()
  let age = today.getUTCFullYear() - year
  const monthDelta = today.getUTCMonth() - (month - 1)
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < day)) age -= 1
  return age
}

function pad2(v) {
  return String(v).padStart(2, '0')
}

export function Onboarding() {
  const navigate = useNavigate()
  const { user, setInterests, saveBirthDate, saveLocation } = useApp()
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [dob, setDob] = useState({ m: '', d: '', y: '' })
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
    const birthIso = `${dob.y}-${pad2(dob.m)}-${pad2(dob.d)}`
    setSaving(true)
    setInterests(ids)
    try {
      const [birthRes, interestsRes, locationRes] = await Promise.all([
        saveBirthDate(birthIso),
        api.saveInterests(user?.id, ids),
        saveLocation(location),
      ])
      if (birthRes?.pending || interestsRes?.pending || locationRes?.pending) {
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
        {[1, 2, 3].map((s) => (
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
        <AgeStep
          dob={dob}
          setDob={setDob}
          error={error}
          onContinue={() => {
            const age = ageFromParts(dob)
            if (isNaN(age)) return setError('Enter a valid date of birth.')
            if (age < MIN_AGE) return setError(`You must be at least ${MIN_AGE} to use Loop.`)
            if (age > MAX_AGE) return setError('Please enter a valid date of birth.')
            setError('')
            setStep(2)
          }}
        />
      ) : step === 2 ? (
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
              onClick={() => setStep(3)}
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

/**
 * AgeStep — three numeric fields (MM / DD / YYYY) with an inline age preview.
 * Kept as a local subcomponent because the picker state and validation are only
 * used by this screen; a shared date picker would be premature.
 *
 * We ask for date of birth rather than a raw age so a birthday doesn't quietly
 * make the stored value drift (a 17-year-old today is 18 next year — a static
 * age would still say 17). The backend applies the same validation.
 */
function AgeStep({ dob, setDob, error, onContinue }) {
  const monthRef = useRef(null)
  const dayRef = useRef(null)
  const yearRef = useRef(null)

  const age = ageFromParts(dob)
  const complete = dob.m && dob.d && dob.y
  const validAge = Number.isFinite(age) && age >= MIN_AGE && age <= MAX_AGE
  const canContinue = complete && validAge

  // Auto-advance once a field is full — small polish that matches Apple's
  // birthday picker feel without stealing focus mid-typing. Ref lookup happens
  // inside the handler (not during render), so this satisfies react-hooks/refs.
  const handleChange = (key, maxLen, nextKey) => (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maxLen)
    setDob((prev) => ({ ...prev, [key]: digits }))
    if (digits.length === maxLen && nextKey) {
      const nextRef = nextKey === 'd' ? dayRef : nextKey === 'y' ? yearRef : monthRef
      nextRef.current?.focus()
    }
  }

  const fieldClass =
    'w-full rounded-input border border-border-light bg-white px-3 py-3 text-center text-lg font-semibold text-text-primary outline-none placeholder:text-placeholder focus:border-primary'

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display text-4xl font-bold text-ink">When’s your birthday?</h1>
      <p className="mt-2 text-sm text-text-secondary">
        We use this to keep age-restricted events off your feed. You must be at least{' '}
        {MIN_AGE} to use Loop.
      </p>

      <div className="mt-8 grid grid-cols-[1fr_1fr_1.4fr] gap-3">
        <label className="block">
          <span className="mb-1.5 block text-center text-[13px] font-medium text-text-secondary">
            Month
          </span>
          <input
            ref={monthRef}
            value={dob.m}
            onChange={handleChange('m', 2, 'd')}
            inputMode="numeric"
            placeholder="MM"
            aria-label="Birth month"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-center text-[13px] font-medium text-text-secondary">
            Day
          </span>
          <input
            ref={dayRef}
            value={dob.d}
            onChange={handleChange('d', 2, 'y')}
            inputMode="numeric"
            placeholder="DD"
            aria-label="Birth day"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-center text-[13px] font-medium text-text-secondary">
            Year
          </span>
          <input
            ref={yearRef}
            value={dob.y}
            onChange={handleChange('y', 4, null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canContinue) onContinue()
            }}
            inputMode="numeric"
            placeholder="YYYY"
            aria-label="Birth year"
            className={fieldClass}
          />
        </label>
      </div>

      {complete && Number.isFinite(age) && (
        <p className="mt-4 text-center text-sm text-text-secondary">
          You’re <span className="font-semibold text-ink">{age}</span>.
        </p>
      )}

      <div className="mt-auto pt-10">
        <InlineAlert message={error} className="mb-3" />
        <button
          disabled={!canContinue}
          onClick={onContinue}
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
  )
}
