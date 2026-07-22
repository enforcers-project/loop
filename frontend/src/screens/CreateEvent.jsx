import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, RefreshCw, Sparkles, Undo2 } from 'lucide-react'
import { CATEGORY_COLOR, cn } from '../lib/utils'
import { FormField, InlineAlert, inputClass } from '../components/primitives'
import { EventCard } from '../components/EventCard'
import { VenueAutocomplete } from '../components/VenueAutocomplete'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

const CATEGORIES = ['Music', 'Nightlife', 'Sports', 'Networking', 'Food', 'Campus']

const POSITION_TEMPLATE = 'Goalkeeper, Defender, Midfielder, Forward'

// Tone presets for the description writer. Matches TONES in backend/src/ai/description.js.
const DESC_TONES = [
  { key: 'hype', label: 'Hype' },
  { key: 'chill', label: 'Chill' },
  { key: 'professional', label: 'Professional' },
  { key: 'playful', label: 'Playful' },
]

// Style presets the organizer picks with one tap. Matches STYLE_PRESETS in
// backend/src/ai/flyer.js — the backend appends the art-direction wording.
const FLYER_STYLES = [
  { key: 'bold', label: 'Bold' },
  { key: 'minimal', label: 'Minimal' },
  { key: 'retro', label: 'Retro' },
  { key: 'photo', label: 'Photo' },
]

// Cap client-side too so an organizer can't burn through their budget on one
// indecisive draft — the backend enforces the same limit per user/hour.
const MAX_FLYER_GENERATIONS = 3

// "Require" switch beside Min age. Off = the number is just a recommended age
// shown on the event. On = a hard age requirement (events.age_restricted) that
// the backend enforces at RSVP — a too-young or birthdate-less user is blocked.
function RequireToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={on ? 'Enforced at RSVP' : 'Just a recommended age'}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium transition-colors',
        on ? 'bg-primary/10 text-primary' : 'bg-surface text-text-muted hover:text-text-secondary',
      )}
    >
      <span
        className={cn(
          'inline-block h-3 w-3 rounded-full border transition-colors',
          on ? 'border-primary bg-primary' : 'border-text-muted bg-white',
        )}
      />
      {on ? 'Required' : 'Recommended'}
    </button>
  )
}

export function CreateEvent() {
  // Posting a pickup run requires the host sub-capability (organizer + is_host).
  // Non-hosts can create ordinary events but never see the Sports toggle.
  const { isHost } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Nightlife')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  // Location — `location` is the venue name (typed or from Places). When a Places
  // suggestion is picked we also capture address/lat/lng/placeId and set
  // `venueResolved` so the event persists real coordinates.
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [placeId, setPlaceId] = useState(null)
  const [venueResolved, setVenueResolved] = useState(false)
  const [city, setCity] = useState('')

  // Optional numeric fields. Price + capacity are always optional (Free /
  // unlimited when blank). Min age is special: the "Require" toggle turns it
  // from a recommended age into a HARD requirement (events.age_restricted) that
  // the backend enforces at RSVP.
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [age, setAge] = useState('')
  const [ageRestricted, setAgeRestricted] = useState(false)

  const [description, setDescription] = useState('')

  // Flyer — `flyer` holds the persisted URL (S3 public URL or AI data URL) that
  // gets saved. `flyerPreview` is a local blob shown instantly while the real
  // upload runs; `flyerUploading` gates the dropzone.
  const [flyer, setFlyer] = useState(null)
  const [flyerPreview, setFlyerPreview] = useState(null)
  const [flyerUploading, setFlyerUploading] = useState(false)
  const [flyerError, setFlyerError] = useState('')

  // sports
  const [isSports, setIsSports] = useState(false)
  const [playersNeeded, setPlayersNeeded] = useState('')
  const [skill, setSkill] = useState('All Levels')
  const [positions, setPositions] = useState('')
  const [indoor, setIndoor] = useState(false)

  // Inline publish error, shown right above the Publish button instead of a
  // bottom-of-screen toast. Success stays a toast (the page navigates away).
  const [error, setError] = useState('')

  // AI flyer generation state — panel opens under the dropzone.
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiStyle, setAiStyle] = useState('bold')
  const [aiError, setAiError] = useState('')
  const [aiPreview, setAiPreview] = useState(null)
  const [aiCount, setAiCount] = useState(0)

  // Upload a picked flyer file to S3 and keep the returned public URL. Shows a
  // local preview immediately; on 503 (S3 off) points the organizer at the AI
  // generator / keeps the form usable rather than silently dropping the file.
  const onPickFlyer = async (file) => {
    if (!file) return
    setFlyerError('')
    setFlyerPreview(URL.createObjectURL(file))
    setFlyerUploading(true)
    try {
      const url = await api.uploadFlyer(file)
      setFlyer(url)
    } catch (err) {
      setFlyer(null)
      setFlyerPreview(null)
      setFlyerError(
        err?.status === 503
          ? "Image uploads aren't set up — try “Generate with AI” instead."
          : 'Upload failed — please try another image.',
      )
    } finally {
      setFlyerUploading(false)
    }
  }

  const generateFlyer = useMutation({
    mutationFn: () =>
      api.generateFlyer({
        prompt: aiPrompt.trim(),
        style: aiStyle,
        title: title.trim(),
        category,
      }),
    onSuccess: (result) => {
      // Server returns either { url } (uploaded to S3) or { data_url } (local
      // dev without AWS creds). Both are usable in <img src>.
      setAiPreview(result?.url ?? result?.data_url ?? null)
      setAiCount((n) => n + 1)
    },
    onError: (err) => setAiError(err?.message || 'Could not generate flyer — please try again.'),
  })

  const onGenerateFlyer = () => {
    setAiError('')
    const prompt = aiPrompt.trim()
    if (!prompt) return setAiError('Describe what you want on the flyer.')
    if (aiCount >= MAX_FLYER_GENERATIONS) {
      return setAiError(`Reached ${MAX_FLYER_GENERATIONS} generations. Pick one to continue.`)
    }
    generateFlyer.mutate()
  }

  const applyGeneratedFlyer = () => {
    if (!aiPreview) return
    setFlyer(aiPreview)
    setFlyerPreview(aiPreview)
    setFlyerError('')
    setAiOpen(false)
    setAiPreview(null)
    toast.success('AI flyer applied.')
  }

  // AI description writer state — inline row above the description textarea.
  const [descTone, setDescTone] = useState('hype')
  const [descError, setDescError] = useState('')
  // Prior description text so a single "Undo" reverts a bad rewrite.
  const [descPrev, setDescPrev] = useState(null)

  const generateDescription = useMutation({
    mutationFn: () =>
      api.generateDescription({
        title: title.trim(),
        category,
        tone: descTone,
        notes: description.trim(),
      }),
    onSuccess: (result) => {
      const text = result?.text?.trim()
      if (!text) {
        setDescError('AI writer returned nothing — try again.')
        return
      }
      setDescPrev(description)
      setDescription(text)
    },
    onError: (err) =>
      setDescError(err?.message || 'Could not write description — please try again.'),
  })

  const onWriteDescription = () => {
    setDescError('')
    if (!title.trim() && !description.trim()) {
      return setDescError('Add a title or a rough draft first.')
    }
    generateDescription.mutate()
  }

  const onUndoDescription = () => {
    if (descPrev == null) return
    setDescription(descPrev)
    setDescPrev(null)
  }

  // Auto-tag preview. Debounced 400ms after the last keystroke on title,
  // description, or price. The endpoint is rule-based server-side (zero cost,
  // sub-ms) but debouncing prevents flicker while the organizer is still
  // typing. Empty/short input → no request, chips row hides.
  //
  // The clear-on-too-short case runs inside the debounced timeout (not the
  // effect body) so we don't cascade-render on every keystroke — the effect
  // itself doesn't setState synchronously.
  const [autotags, setAutotags] = useState(null)
  useEffect(() => {
    const t = (title ?? '').trim()
    const d = (description ?? '').trim()
    const controller = new AbortController()
    const handle = setTimeout(async () => {
      // Need something substantive to tag; ~10 chars filters out "a" or "hey".
      if (t.length + d.length < 10) {
        setAutotags(null)
        return
      }
      try {
        const result = await api.autotag({
          title: t,
          description: d,
          isFree: !price || price === '0',
          priceMin: price ? Number(price) : null,
          category,
        })
        if (!controller.signal.aborted) setAutotags(result)
      } catch {
        // Silent — the chip row is a hint, never a blocker.
        if (!controller.signal.aborted) setAutotags(null)
      }
    }, 400)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [title, description, price, category])

  // Lock in a real venue picked from Places autocomplete: capture coordinates +
  // address, and auto-fill city when we resolved one.
  const onPickVenue = (place) => {
    setLocation(place.venueName || '')
    setAddress(place.address || '')
    setLat(place.lat ?? null)
    setLng(place.lng ?? null)
    setPlaceId(place.placeId ?? null)
    setVenueResolved(true)
    if (place.city) setCity(place.city)
  }

  // Editing the venue text after a pick drops the resolved coordinates — the
  // saved venue should always match what's shown.
  const clearVenue = () => {
    setVenueResolved(false)
    setAddress('')
    setLat(null)
    setLng(null)
    setPlaceId(null)
  }

  const shownFlyer = flyerPreview || flyer

  const previewEvent = {
    id: 'preview',
    title: title || 'Your event title',
    category,
    poster: shownFlyer || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    price: price && Number(price) > 0 ? `$${price}` : 'Free',
    isFree: !price || Number(price) === 0,
    date: date || time ? `${date || 'Date'} · ${time || 'Time'}` : 'Date · Time',
    isoDate: '',
    venueName: location || 'Venue',
    city: city || 'Oakland',
    lat: lat ?? 37.8,
    lng: lng ?? -122.27,
    organizerId: 'org-preview',
    organizer: {
      id: 'org-preview',
      name: 'You',
      handle: '@you',
      avatar: 'https://i.pravatar.cc/150?img=1',
      verified: false,
      role: 'Organizer',
      followers: 0,
      bio: '',
      cover: '',
    },
    description,
    tags: [],
    goingCount: 0,
    goingAvatars: [],
    capacity: Number(capacity) || 100,
    rsvpCount: 0,
    saveCount: 0,
    almostFull: false,
    ageRestriction: age ? `${age}+` : undefined,
    isSports,
    playersNeeded: Number(playersNeeded) || undefined,
    playersSignedUp: isSports ? 0 : undefined,
    skillLevel: isSports ? skill : undefined,
    indoor,
  }

  const isValidNum = (v) => {
    if (String(v).trim() === '') return false
    const n = Number(v)
    return Number.isFinite(n) && n > 0
  }

  // Minimum fields to publish. Sports runs also need a player count. Price and
  // capacity are always optional (Free / unlimited when blank). Min age must
  // hold a real value only when the organizer marked it a hard requirement.
  const missing = []
  if (!title.trim()) missing.push('title')
  if (!date.trim()) missing.push('date')
  if (!location.trim()) missing.push('location')
  if (!city.trim()) missing.push('city')
  if (ageRestricted && !isValidNum(age)) missing.push('minimum age')
  if (isSports && !Number(playersNeeded)) missing.push('players needed')
  const canPublish = missing.length === 0 && !flyerUploading

  const publish = useMutation({
    mutationFn: () =>
      api.createEvent({
        title: title.trim(),
        category,
        date: date.trim(),
        time: time.trim(),
        location: location.trim(),
        address: address.trim() || null,
        lat,
        lng,
        placeId,
        city: city.trim(),
        price: price ? Number(price) : 0,
        capacity: capacity ? Number(capacity) : null,
        ageRestriction: age ? Number(age) : null,
        ageRestricted: ageRestricted && !!age,
        description: description.trim(),
        flyer,
        isSports,
        playersNeeded: isSports ? Number(playersNeeded) : null,
        skillLevel: isSports ? skill : null,
        positions: isSports ? positions.trim() : null,
        indoor: isSports ? indoor : null,
      }),
    onSuccess: (created) => {
      // Refresh any event lists so the newly published event shows up.
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Event published!')
      navigate(`/event/${created.id}`)
    },
    onError: (err) => setError(err?.message || 'Could not publish — please try again.'),
  })

  const onPublish = () => {
    setError('')
    if (flyerUploading) {
      setError('Hold on — your flyer is still uploading.')
      return
    }
    if (!canPublish) {
      setError(`Add a ${missing[0]} before publishing.`)
      return
    }
    publish.mutate()
  }

  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-6 md:pb-10">
      <h1 className="font-display text-3xl font-bold text-ink">Create an event</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Fill in the details — your live preview updates as you type.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        {/* form */}
        <div className="space-y-5">
          {/* flyer upload — plus AI generation panel */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-text-secondary">Flyer</span>
              <button
                type="button"
                onClick={() => {
                  setAiOpen((v) => !v)
                  setAiError('')
                  if (!aiPrompt && (title || description)) {
                    const seed = [title, category, description].filter(Boolean).join(', ')
                    setAiPrompt(seed)
                  }
                }}
                className="flex items-center gap-1.5 rounded-pill bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
              >
                <Sparkles size={13} />
                {aiOpen ? 'Hide AI generator' : 'Generate with AI'}
              </button>
            </div>
            <label className="relative flex h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-card border-2 border-dashed border-border-light bg-surface text-text-muted transition-colors hover:border-primary">
              {shownFlyer ? (
                <img src={shownFlyer} alt="" className="h-full w-full rounded-card object-cover" />
              ) : (
                <>
                  <ImagePlus size={28} />
                  <span className="text-sm">Upload a flyer</span>
                </>
              )}
              {flyerUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-text-secondary">
                  Uploading…
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFlyer(e.target.files?.[0])}
              />
            </label>
            {flyerError && (
              <div className="mt-2">
                <InlineAlert message={flyerError} />
              </div>
            )}

            {aiOpen && (
              <div className="mt-3 space-y-3 rounded-card border border-border-light bg-white p-4">
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
                    Describe your flyer
                  </span>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={3}
                    placeholder="Afro Nation rooftop, warm neon lights, Oakland skyline at dusk…"
                    className={cn(inputClass, 'resize-none')}
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Your title, date and venue overlay on top later — this is the background image.
                  </p>
                </div>

                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
                    Style
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {FLYER_STYLES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setAiStyle(s.key)}
                        className={cn(
                          'rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors',
                          aiStyle === s.key
                            ? 'border-primary bg-primary text-white'
                            : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <InlineAlert message={aiError} />

                {aiPreview && (
                  <div className="rounded-card border border-border-light bg-surface p-2">
                    <img
                      src={aiPreview}
                      alt="AI generated flyer"
                      className="mx-auto max-h-64 w-full rounded-card object-contain"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={applyGeneratedFlyer}
                        className="flex-1 rounded-button bg-accent py-2 text-sm font-semibold text-white transition-transform active:scale-95"
                      >
                        Use this flyer
                      </button>
                      <button
                        type="button"
                        onClick={onGenerateFlyer}
                        disabled={generateFlyer.isPending || aiCount >= MAX_FLYER_GENERATIONS}
                        className="flex items-center gap-1.5 rounded-button border border-border-light bg-white px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-text-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCw size={14} /> Regenerate
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-text-muted">
                    {aiCount}/{MAX_FLYER_GENERATIONS} generations used
                  </span>
                  {!aiPreview && (
                    <button
                      type="button"
                      onClick={onGenerateFlyer}
                      disabled={generateFlyer.isPending || aiCount >= MAX_FLYER_GENERATIONS}
                      className="flex items-center gap-1.5 rounded-button bg-primary px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Sparkles size={14} />
                      {generateFlyer.isPending ? 'Generating…' : 'Generate flyer'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <FormField label="Event title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Afro Nation Rooftop"
              className={inputClass}
            />
          </FormField>

          {/* category chips */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
              Category
            </span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    'rounded-pill border px-4 py-2 text-sm font-medium transition-colors',
                    category === c
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                  )}
                  style={
                    category === c
                      ? { backgroundColor: CATEGORY_COLOR[c], borderColor: CATEGORY_COLOR[c] }
                      : undefined
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Date">
              {/* Native date input; clicking anywhere on the field opens the
                  picker (Chrome/Safari support showPicker()). Only one calendar
                  glyph shows — the browser's built-in one. */}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onFocus={(e) => e.currentTarget.showPicker?.()}
                className={cn(inputClass, 'cursor-pointer')}
              />
            </FormField>
            <FormField label="Time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>

          {/* Venue — Google Places autocomplete captures real coordinates; city
              auto-fills from the pick but stays editable. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Venue">
              <VenueAutocomplete
                value={location}
                onChange={setLocation}
                onPick={onPickVenue}
                onClear={clearVenue}
                resolved={venueResolved}
              />
            </FormField>
            <FormField label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Oakland"
                className={inputClass}
              />
            </FormField>
          </div>
          {venueResolved && address && (
            <p className="-mt-2 text-xs text-text-muted">📍 {address}</p>
          )}

          {/* Price / Capacity / Min age — real number inputs. Price + capacity
              are always optional (blank → Free / unlimited). Min age carries a
              Require toggle: off = a recommended age shown on the event, on =
              a hard requirement enforced at RSVP. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Price ($)">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0 (Free)"
                className={inputClass}
              />
            </FormField>
            <FormField label="Capacity">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Unlimited"
                className={inputClass}
              />
            </FormField>
            <FormField
              label={
                <span className="flex items-center justify-between gap-2">
                  Min age
                  <RequireToggle on={ageRestricted} onToggle={() => setAgeRestricted((v) => !v)} />
                </span>
              }
            >
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="99"
                step="1"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="All ages"
                className={inputClass}
              />
            </FormField>
          </div>
          {ageRestricted && (
            <p className="-mt-2 text-xs text-text-muted">
              {age
                ? `Attendees under ${age} will be blocked from RSVPing.`
                : 'Set a minimum age — it will be enforced at RSVP.'}
            </p>
          )}

          {/* description + AI write */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-text-secondary">Description</span>
              <div className="flex items-center gap-1.5">
                {descPrev != null && (
                  <button
                    type="button"
                    onClick={onUndoDescription}
                    className="flex items-center gap-1 rounded-pill bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-border-light"
                    title="Restore your original text"
                  >
                    <Undo2 size={12} /> Undo
                  </button>
                )}
                <button
                  type="button"
                  onClick={onWriteDescription}
                  disabled={generateDescription.isPending}
                  className="flex items-center gap-1.5 rounded-pill bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles size={13} />
                  {generateDescription.isPending
                    ? 'Writing…'
                    : description.trim()
                      ? 'Rewrite with AI'
                      : 'Write with AI'}
                </button>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-text-muted">Tone:</span>
              {DESC_TONES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDescTone(t.key)}
                  className={cn(
                    'rounded-pill border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    descTone === t.key
                      ? 'border-primary bg-primary text-white'
                      : 'border-border-light bg-white text-text-secondary hover:border-text-muted',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (descPrev != null) setDescPrev(null)
              }}
              rows={4}
              placeholder="Tell people what to expect…"
              className={cn(inputClass, 'resize-none')}
            />
            {descError && (
              <div className="mt-2">
                <InlineAlert message={descError} />
              </div>
            )}
          </div>

          {/* AI auto-tag preview — driven by POST /api/ai/autotag. Rule-based
              server-side, refreshes on debounced title/description/price
              change. Live tags get written on publish; this row is just a
              preview so the organizer sees what the recommender will match on. */}
          <AutoTagPreview autotags={autotags} />

          {/* sports toggle — host capability only */}
          {isHost && (
            <div className="rounded-card border border-border-light p-4">
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-ink">This is a pickup run</span>
                  <p className="text-xs text-text-secondary">
                    Add roster, positions & skill level.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isSports}
                  onChange={(e) => setIsSports(e.target.checked)}
                  className="peer sr-only"
                />
                <span className="relative h-6 w-11 rounded-full bg-border-light transition-colors peer-checked:bg-primary">
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      isSports ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                  />
                </span>
              </label>

              {isSports && (
                <div className="mt-4 space-y-4 border-t border-border-light pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Players needed">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={playersNeeded}
                        onChange={(e) => setPlayersNeeded(e.target.value)}
                        placeholder="14"
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="Skill level">
                      <select
                        value={skill}
                        onChange={(e) => setSkill(e.target.value)}
                        className={inputClass}
                      >
                        <option>All Levels</option>
                        <option>Beginner</option>
                        <option>Intermediate</option>
                        <option>Advanced</option>
                      </select>
                    </FormField>
                  </div>
                  <FormField label="Positions (comma separated)">
                    <input
                      value={positions}
                      onChange={(e) => setPositions(e.target.value)}
                      placeholder={POSITION_TEMPLATE}
                      className={inputClass}
                    />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={indoor}
                      onChange={(e) => setIndoor(e.target.checked)}
                      className="h-4 w-4 rounded border-border-light text-primary"
                    />
                    Indoor court/field
                  </label>
                </div>
              )}
            </div>
          )}

          {/* inline error — right above the Publish button that triggered it */}
          <InlineAlert message={error} />

          <button
            type="button"
            onClick={onPublish}
            disabled={publish.isPending || flyerUploading}
            className="w-full rounded-button bg-accent py-3.5 text-sm font-semibold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {publish.isPending ? 'Publishing…' : 'Publish event'}
          </button>
        </div>

        {/* live preview */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Live preview
            </p>
            <EventCard event={previewEvent} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Renders the auto-tag suggestion row. `autotags` is the response from
// api.autotag(): { interests[], vibe, price_tier } or null while empty. The
// component is deliberately non-interactive — the tags land on the event when
// the organizer hits Publish, computed server-side over the same
// title+description. Showing them here is a preview of what the recommender
// will match on, so the organizer can rewrite copy that misses obvious hooks.
function AutoTagPreview({ autotags }) {
  const hasInterests = Array.isArray(autotags?.interests) && autotags.interests.length > 0
  const hasFallback = !!autotags?.category_fallback
  const hasVibe = !!autotags?.vibe
  const hasPriceTier = !!autotags?.price_tier
  const hasAny = hasInterests || hasFallback || hasVibe || hasPriceTier

  return (
    <div className="rounded-card border border-border-light bg-surface p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
        <Sparkles size={13} className="text-primary" />
        AI-suggested tags
      </p>

      {!hasAny && (
        <p className="mt-1.5 text-xs text-text-muted">
          Add a title and a few sentences of description — we&rsquo;ll suggest interest tags to help
          the right people discover your event.
        </p>
      )}

      {(hasInterests || hasFallback) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {hasInterests &&
            autotags.interests.map((i) => (
              <span
                key={i.slug}
                title={`Matched: ${i.matched_keywords.join(', ')}`}
                className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {i.label}
              </span>
            ))}
          {hasFallback && (
            <span
              title="No specific interest matched — using your category so the recommender still has something to match on. Add more detail to your description for a stronger tag."
              className="inline-flex items-center gap-1 rounded-pill bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary/80 ring-1 ring-inset ring-primary/20"
            >
              {autotags.category_fallback.label}
            </span>
          )}
        </div>
      )}

      {(hasVibe || hasPriceTier) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hasVibe && (
            <span
              title={`Matched: ${autotags.vibe.matched_keywords.join(', ')}`}
              className="inline-flex items-center gap-1 rounded-pill bg-white px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-inset ring-border-light"
            >
              Vibe: {autotags.vibe.slug}
            </span>
          )}
          {hasPriceTier && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-white px-2.5 py-1 text-xs font-medium text-text-secondary ring-1 ring-inset ring-border-light">
              Price: {autotags.price_tier}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
