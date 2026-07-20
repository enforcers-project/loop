import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, ImagePlus, Lock, MapPin, Sparkles } from 'lucide-react'
import { CATEGORY_COLOR, cn } from '../lib/utils'
import { FormField, InlineAlert, inputClass } from '../components/primitives'
import { EventCard } from '../components/EventCard'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

const CATEGORIES = ['Music', 'Nightlife', 'Sports', 'Networking', 'Food', 'Campus']

const POSITION_TEMPLATE = 'Goalkeeper, Defender, Midfielder, Forward'

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
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [age, setAge] = useState('')
  const [description, setDescription] = useState('')
  const [flyer, setFlyer] = useState(null)

  // sports
  const [isSports, setIsSports] = useState(false)
  const [playersNeeded, setPlayersNeeded] = useState('')
  const [skill, setSkill] = useState('All Levels')
  const [positions, setPositions] = useState('')
  const [indoor, setIndoor] = useState(false)

  // Inline publish error, shown right above the Publish button instead of a
  // bottom-of-screen toast. Success stays a toast (the page navigates away).
  const [error, setError] = useState('')

  const previewEvent = {
    id: 'preview',
    title: title || 'Your event title',
    category,
    poster: flyer || 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80',
    price: price ? `$${price}` : 'Free',
    isFree: !price || price === '0',
    date: date || time ? `${date || 'Date'} · ${time || 'Time'}` : 'Date · Time',
    isoDate: '',
    venueName: location || 'Venue',
    city: city || 'Oakland',
    lat: 37.8,
    lng: -122.27,
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

  // Minimum fields to publish. Sports runs also need a player count.
  const missing = []
  if (!title.trim()) missing.push('title')
  if (!date.trim()) missing.push('date')
  if (!location.trim()) missing.push('location')
  if (!city.trim()) missing.push('city')
  if (isSports && !Number(playersNeeded)) missing.push('players needed')
  const canPublish = missing.length === 0

  const publish = useMutation({
    mutationFn: () =>
      api.createEvent({
        title: title.trim(),
        category,
        date: date.trim(),
        time: time.trim(),
        location: location.trim(),
        city: city.trim(),
        price: price ? Number(price) : 0,
        capacity: Number(capacity) || null,
        ageRestriction: age ? Number(age) : null,
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
          {/* flyer upload */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">Flyer</span>
            <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border-light bg-surface text-text-muted transition-colors hover:border-primary">
              {flyer ? (
                <img src={flyer} alt="" className="h-full w-full rounded-card object-cover" />
              ) : (
                <>
                  <ImagePlus size={28} />
                  <span className="text-sm">Upload a flyer</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setFlyer(URL.createObjectURL(f))
                }}
              />
            </label>
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

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date">
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={cn(inputClass, 'pr-10')}
                />
                <Calendar
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
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

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Venue">
              <div className="relative">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Skyline Rooftop"
                  className={cn(inputClass, 'pr-10')}
                />
                <MapPin
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
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

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Price ($)">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </FormField>
            <FormField label="Capacity">
              <input
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="100"
                className={inputClass}
              />
            </FormField>
            <FormField label="Min age">
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="18"
                className={inputClass}
              />
            </FormField>
          </div>

          {/* description + AI write */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-text-secondary">Description</span>
              {/* AI assist ships in Sprint 3 (#25). Disabled placeholder for now. */}
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex cursor-not-allowed items-center gap-1.5 rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-text-muted"
              >
                <Sparkles size={13} />
                Write with AI
                <span className="ml-0.5 flex items-center gap-0.5 text-[10px] font-medium text-text-muted">
                  <Lock size={9} /> Soon
                </span>
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Tell people what to expect…"
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          {/* AI auto-tag panel — disabled placeholder; real tagging is #24 (Sprint 3). */}
          <div className="rounded-card border border-dashed border-border-light bg-surface p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-text-muted">
              <Sparkles size={13} /> AI-suggested tags
              <span className="ml-1 flex items-center gap-0.5 rounded-pill bg-white px-2 py-0.5 text-[10px] text-text-muted">
                <Lock size={9} /> Coming soon
              </span>
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              We’ll auto-suggest tags from your description once AI tagging ships.
            </p>
          </div>

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
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Players needed">
                      <input
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
            disabled={publish.isPending}
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
