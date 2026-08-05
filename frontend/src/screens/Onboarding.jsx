import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, MapPin, Navigation, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useForceLight } from '../context/ThemeContext'
import { cn } from '../lib/utils'
import { FormField, InlineAlert, inputClass } from '../components/primitives'
import { InterestBlobs } from '../components/InterestBlobs'
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

// Identity constraints — mirror the backend (auth/routes.js + users/routes.js).
// The username (stored as `handle`) is the immutable-ID-free lookup key for
// @-mentions; the DB references (messages, posses) still key off user.id, so
// a later handle change won't orphan anything.
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/
const NAME_MIN = 2
const NAME_MAX = 120

// "Ada Lovelace" → "adalovelace". Lowercase, strip non-[a-z0-9_], drop leading
// digits/underscores, cap at 30. Empty when the name has no usable chars; the
// caller should render an empty state rather than a broken suggestion.
function usernameFromName(name) {
  if (!name) return ''
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 30)
  // Guard against a stub too short for the backend's 3-char minimum — leave
  // empty rather than pad with junk that the user would just have to delete.
  return cleaned.length >= 3 ? cleaned : ''
}

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
  // A future birthdate yields a negative age here; the caller distinguishes it
  // from an out-of-range age (>120) so we can show a specific error.
  return age
}

function pad2(v) {
  return String(v).padStart(2, '0')
}

export function Onboarding() {
  // Onboarding is a light-only experience — the interest blobs, the deep-purple
  // gradient CTAs and the fallback maps illustrations are all designed against
  // a bright surface. Force light while this screen is mounted; the user's real
  // theme choice takes over once they land on /feed.
  useForceLight()
  const navigate = useNavigate()
  const { user, setInterests, saveBirthDate, saveLocation, updateProfile } = useApp()
  const toast = useToast()
  const [step, setStep] = useState(1)
  // Presentation defaults — DOB 03/03/2000 so we don't type it live on stage.
  const [dob, setDob] = useState({ m: '03', d: '03', y: '2000' })
  // Name & username — pre-filled from the signed-in user's SelfUser so a Google
  // sign-up (backend seeded displayName from the Google profile) usually only
  // needs a confirm-tap. The stored handle at this point is an auto-picked
  // placeholder (see auth/routes.js), so we leave the field empty and let the
  // derive-from-name pass suggest one. Both fields lazy-init from `user`;
  // AppContext resolves `user` before this screen mounts (auth guard), so
  // there's no useEffect chase.
  // Presentation defaults — pre-fill "David" / "david" so the demo doesn't stall
  // typing them. Falls back to the signed-in user's name if there already is one.
  const [displayName, setDisplayName] = useState(() => user?.name ?? 'David')
  const [username, setUsername] = useState(() => usernameFromName(user?.name) || 'david')
  // Tracks whether the user hand-edited the username field. Once true, typing
  // in the name field stops re-deriving the handle (so we don't stomp their
  // choice). Managed by the setUsername wrapper below.
  const usernameEditedRef = useRef(false)
  // Name setter that also derives a fresh username when the user hasn't
  // touched it yet — running as part of the change handler (rather than a
  // useEffect) avoids the cascading-render lint and keeps the two fields in
  // step in a single React commit.
  const updateDisplayName = (next) => {
    setDisplayName(next)
    if (!usernameEditedRef.current) {
      const derived = usernameFromName(next)
      if (derived) setUsername(derived)
    }
  }
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

  // --- Live handle availability ---------------------------------------------
  // As the user types (or the derive-from-name pass fills the field), ask the
  // backend whether the candidate is free. The effect only runs the async
  // fetch — the "empty" / "wrong-shape" states are derived in render below
  // (via `handleStatus`), which keeps setState out of the effect body until a
  // real network result lands.
  const cleanUsername = useMemo(() => username.trim().replace(/^@/, ''), [username])
  // Result of the last completed remote check. Never touched synchronously in
  // an effect body — only from the async callback below.
  const [remoteHandleResult, setRemoteHandleResult] = useState({
    checked: '',
    state: 'idle', // available | taken | invalid | error
    suggestions: [],
  })

  useEffect(() => {
    if (!cleanUsername || !USERNAME_RE.test(cleanUsername)) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await api.checkHandle(cleanUsername)
        if (cancelled) return
        if (!res) {
          setRemoteHandleResult({ checked: cleanUsername, state: 'error', suggestions: [] })
          return
        }
        setRemoteHandleResult({
          checked: cleanUsername,
          state: res.available ? 'available' : res.reason === 'invalid' ? 'invalid' : 'taken',
          suggestions: res.suggestions ?? [],
        })
      } catch {
        if (!cancelled) {
          setRemoteHandleResult({ checked: cleanUsername, state: 'error', suggestions: [] })
        }
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cleanUsername])

  // Derived status the NameStep reads. Local shape rules (empty, invalid) are
  // computed here so a slow network response can't clobber what the user has
  // since typed; only when the remote result matches the current field do we
  // trust its verdict.
  const handleStatus = useMemo(() => {
    if (!cleanUsername) return { state: 'idle', suggestions: [], checked: '' }
    if (!USERNAME_RE.test(cleanUsername)) {
      return { state: 'invalid', suggestions: [], checked: cleanUsername }
    }
    if (remoteHandleResult.checked === cleanUsername) {
      return {
        state: remoteHandleResult.state,
        suggestions: remoteHandleResult.suggestions,
        checked: cleanUsername,
      }
    }
    return { state: 'checking', suggestions: [], checked: '' }
  }, [cleanUsername, remoteHandleResult])

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

  // Step 3 (the blob picker) needs a wider canvas than the other steps so the
  // interest tiles are square enough for their labels to sit inside without
  // wrapping into three lines. The other steps keep the tighter reading width.
  const wide = step === 3

  // Save the name & username, then advance to interests. Uses PATCH
  // /users/:id — same endpoint the profile edit form uses. A 409 on the handle
  // races another sign-up snagging it in the last few hundred ms; surface as
  // an inline error and let the user pick a suggestion or a new value.
  const saveIdentity = async () => {
    if (saving) return
    setError('')
    const cleanName = displayName.trim()
    if (cleanName.length < NAME_MIN || cleanName.length > NAME_MAX) {
      return setError(`Enter your name (${NAME_MIN}–${NAME_MAX} characters).`)
    }
    if (!USERNAME_RE.test(cleanUsername)) {
      return setError('Username must be 3–30 characters: letters, numbers and _ only.')
    }
    // Trust the last availability result when it matches what's in the field;
    // if the debounce hasn't landed yet, let the backend be the source of truth.
    if (handleStatus.checked === cleanUsername && handleStatus.state === 'taken') {
      return setError('That username is taken — try one of the suggestions.')
    }
    setSaving(true)
    try {
      await updateProfile({ display_name: cleanName, handle: cleanUsername })
      setStep(3)
    } catch (err) {
      // Backend surfaces 409 with { field: 'handle' } when the handle races
      // another signup; refresh the suggestions so the user can one-tap fix it.
      if (err.status === 409) {
        setError('That username is taken — pick another.')
        try {
          const res = await api.checkHandle(cleanUsername)
          if (res && !res.available) {
            setRemoteHandleResult({
              checked: cleanUsername,
              state: 'taken',
              suggestions: res.suggestions ?? [],
            })
          }
        } catch {
          // Non-fatal — the field already shows the taken banner.
        }
      } else {
        setError(err.message || 'Could not save. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'mx-auto flex min-h-screen flex-col px-5 py-10',
        wide ? 'max-w-6xl' : 'max-w-2xl',
      )}
    >
      {/* progress */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
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
            if (age < 0)
              return setError("That birthday hasn't happened yet — enter a real date of birth.")
            if (age > MAX_AGE) return setError('That age looks off — enter a real date of birth.')
            if (age < MIN_AGE) return setError(`You must be at least ${MIN_AGE} to use Loop.`)
            setError('')
            setStep(2)
          }}
        />
      ) : step === 2 ? (
        <NameStep
          displayName={displayName}
          setDisplayName={updateDisplayName}
          username={username}
          setUsername={(v) => {
            usernameEditedRef.current = true
            setUsername(v)
          }}
          handleStatus={handleStatus}
          error={error}
          saving={saving}
          onContinue={saveIdentity}
        />
      ) : step === 3 ? (
        <div className="flex flex-1 flex-col">
          <h1 className="font-display text-4xl font-bold text-ink">What are you into?</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Tap a world to open it. Every pick tunes what we recommend.
          </p>

          <div className="mt-6">
            <InterestBlobs interests={interests} picked={picked} onToggle={toggle} minPicks={3} />
          </div>

          <div className="mt-auto pt-10">
            <button
              disabled={!canContinue}
              onClick={() => setStep(4)}
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
        We use this to keep age-restricted events off your feed. You must be at least {MIN_AGE} to
        use Loop.
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

      {complete && Number.isFinite(age) && age >= 0 && age <= MAX_AGE && (
        <p className="mt-4 text-center text-sm text-text-secondary">
          You’re <span className="font-semibold text-ink">{age}</span>.
        </p>
      )}
      {complete && Number.isFinite(age) && (age < 0 || age > MAX_AGE) && (
        <p className="mt-4 text-center text-sm font-medium text-accent">
          {age < 0
            ? "That birthday hasn't happened yet."
            : 'That age looks off — enter a real date of birth.'}
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

/**
 * NameStep — display name (free-form, non-unique) + username (unique @handle).
 * The username field live-checks against the backend and shows an inline chip
 * (available/taken/checking); when taken, up to three free suggestions render
 * beneath the field so the user can pick one with a single tap.
 *
 * Handles vs identity: the DB stores handles on users but references from
 * messages/posses/etc. always join on user.id. So a handle change here — or
 * later, from the profile edit form — never orphans a message or event ref.
 */
function NameStep({
  displayName,
  setDisplayName,
  username,
  setUsername,
  handleStatus,
  error,
  saving,
  onContinue,
}) {
  const cleanUsername = username.trim().replace(/^@/, '')
  const cleanName = displayName.trim()
  const canContinue =
    cleanName.length >= NAME_MIN &&
    cleanName.length <= NAME_MAX &&
    USERNAME_RE.test(cleanUsername) &&
    handleStatus.checked === cleanUsername &&
    handleStatus.state === 'available' &&
    !saving

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display text-4xl font-bold text-ink">What should we call you?</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Your name is what friends see. Your username is your @-mention — pick something short.
      </p>

      <div className="mt-8 space-y-4">
        <FormField label="Name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, NAME_MAX))}
            placeholder="Ada Lovelace"
            autoComplete="name"
            // Slightly taller (py-4) and larger text (text-base) than the shared
            // inputClass — this is the only screen where reading these values is
            // the whole point, so the accessibility tradeoff wins here.
            className={cn(inputClass, 'py-4 text-base')}
          />
        </FormField>

        <FormField label="Username">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-text-muted">
              @
            </span>
            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.replace(/^@/, '').slice(0, 30).toLowerCase())
              }
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="adalovelace"
              className={cn(inputClass, 'py-4 pl-8 pr-12 text-base')}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <HandleStatusIcon status={handleStatus} candidate={cleanUsername} />
            </span>
          </div>
          <HandleStatusText status={handleStatus} candidate={cleanUsername} />
          {handleStatus.state === 'taken' && handleStatus.suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {handleStatus.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setUsername(s)}
                  className="rounded-full border border-border-light bg-white px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary"
                >
                  @{s}
                </button>
              ))}
            </div>
          )}
        </FormField>
      </div>

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
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

// Right-side status glyph inside the username input. Only paints a definitive
// state when the last result matches what's in the field right now — otherwise
// a slow response could green-check a handle the user has since edited.
function HandleStatusIcon({ status, candidate }) {
  if (!candidate) return null
  if (status.checked !== candidate) {
    return <span className="h-2 w-2 rounded-full bg-border-light" aria-hidden />
  }
  if (status.state === 'checking') {
    return <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60" aria-hidden />
  }
  if (status.state === 'available') {
    return <Check size={16} className="text-emerald-500" aria-label="Username is available" />
  }
  if (status.state === 'taken' || status.state === 'invalid') {
    return <X size={16} className="text-accent" aria-label="Username is not available" />
  }
  return null
}

// Sub-label under the username input. Kept as a separate helper so the icon
// stays inside the input and this line handles the wordier feedback (why a
// handle was rejected, what the tone should be).
function HandleStatusText({ status, candidate }) {
  if (!candidate) {
    return (
      <p className="mt-2 text-sm text-text-muted">3–30 characters. Letters, numbers, and _ only.</p>
    )
  }
  if (status.checked !== candidate || status.state === 'checking') {
    return <p className="mt-2 text-sm text-text-muted">Checking availability…</p>
  }
  if (status.state === 'available') {
    return <p className="mt-2 text-sm font-medium text-emerald-600">@{candidate} is available.</p>
  }
  if (status.state === 'invalid') {
    return (
      <p className="mt-2 text-sm text-accent">3–30 characters. Letters, numbers, and _ only.</p>
    )
  }
  if (status.state === 'taken') {
    return (
      <p className="mt-2 text-sm font-medium text-accent">
        @{candidate} is taken. Try one of these:
      </p>
    )
  }
  if (status.state === 'error') {
    return <p className="mt-2 text-sm text-text-muted">Couldn’t check — try again in a moment.</p>
  }
  return null
}
