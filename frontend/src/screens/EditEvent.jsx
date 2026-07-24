import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EventForm, EMPTY_DRAFT } from '../components/EventForm'
import { PageLoader } from '../components/primitives'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'

// Convert the client event shape (from api.event, run through toEventCardShape)
// back into the flat draft the form owns. Only fields the form actually reads
// need to be pre-populated; everything else falls back to EMPTY_DRAFT defaults.
function eventToDraft(event) {
  if (!event) return EMPTY_DRAFT
  const isoDate = event.isoDate ? new Date(event.isoDate) : null
  const yyyyMmDd = isoDate ? isoDate.toISOString().slice(0, 10) : ''
  const hhMm = isoDate
    ? `${String(isoDate.getHours()).padStart(2, '0')}:${String(isoDate.getMinutes()).padStart(2, '0')}`
    : ''
  return {
    ...EMPTY_DRAFT,
    title: event.title || '',
    category: event.category || EMPTY_DRAFT.category,
    date: yyyyMmDd,
    time: hhMm,
    location: event.venueName || '',
    address: event.address || '',
    lat: event.lat ?? null,
    lng: event.lng ?? null,
    placeId: event.placeId ?? null,
    venueResolved: Boolean(event.lat != null && event.lng != null),
    city: event.city || '',
    price: event.priceMin != null ? String(event.priceMin) : '',
    capacity: event.capacity != null ? String(event.capacity) : '',
    age: event.ageMin != null ? String(event.ageMin) : '',
    ageRestricted: Boolean(event.ageRestricted),
    description: event.description || '',
    flyer: event.poster || null,
    isSports: Boolean(event.isSports),
    playersNeeded: event.playersNeeded != null ? String(event.playersNeeded) : '',
    skill: event.skillLevel || EMPTY_DRAFT.skill,
    positions: '',
    indoor: Boolean(event.indoor),
  }
}

// Only send keys that actually changed. Compares the submitted draft against
// the hydrated one so a save with no edits is a no-op PATCH the backend can
// short-circuit into an empty diff (no notification).
function diffDraft(initial, next) {
  const out = {}
  const keys = [
    'title',
    'category',
    'date',
    'time',
    'location',
    'address',
    'lat',
    'lng',
    'placeId',
    'city',
    'price',
    'capacity',
    'ageRestriction',
    'ageRestricted',
    'description',
    'flyer',
  ]
  for (const k of keys) {
    const iv = initial[k]
    const nv = next[k]
    if (iv === nv) continue
    if (iv == null && (nv == null || nv === '')) continue
    if (nv == null && (iv == null || iv === '')) continue
    out[k] = nv
  }
  return out
}

export function EditEvent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user, isHost } = useApp()

  const [error, setError] = useState('')

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => api.event(id),
    enabled: !!id,
  })

  // Redirect non-organizers away rather than render an unusable form. We wait
  // for both the event and the user context to hydrate so a still-loading auth
  // check doesn't bounce a real organizer.
  useEffect(() => {
    if (!event || !user) return
    if (event.organizerId && event.organizerId !== user.id) {
      toast.error('Only the organizer can edit this event.')
      navigate(`/event/${id}`, { replace: true })
    } else if (event.status === 'cancelled') {
      toast.info('Cancelled events cannot be edited.')
      navigate(`/event/${id}`, { replace: true })
    }
  }, [event, user, id, navigate, toast])

  const initialDraft = useMemo(() => eventToDraft(event), [event])
  // Baseline used by diffDraft — mirrors the shape the form's buildDraft()
  // returns (numeric price/capacity/ageRestriction, trimmed strings, etc.)
  // so a re-submit with no edits diffs to an empty patch instead of firing
  // spurious "changed" fields.
  const baselineDraft = useMemo(() => {
    if (!event) return null
    return {
      title: (event.title || '').trim(),
      category: event.category || null,
      date: initialDraft.date,
      time: initialDraft.time,
      location: (event.venueName || '').trim(),
      address: (event.address || '').trim() || null,
      lat: event.lat ?? null,
      lng: event.lng ?? null,
      placeId: event.placeId ?? null,
      city: (event.city || '').trim(),
      price: event.priceMin != null ? Number(event.priceMin) : 0,
      capacity: event.capacity ?? null,
      ageRestriction: event.ageMin ?? null,
      ageRestricted: Boolean(event.ageRestricted && event.ageMin),
      description: (event.description || '').trim(),
      flyer: event.poster || null,
    }
  }, [event, initialDraft])

  const save = useMutation({
    mutationFn: (patch) => api.updateEvent(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event', id] })
      toast.success('Event updated.')
      navigate(`/event/${id}`)
    },
    onError: (err) => setError(err?.message || 'Could not save — please try again.'),
  })

  if (isLoading || !event) return <PageLoader label="Loading event" />

  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-6 md:pb-10">
      <h1 className="font-display text-3xl font-bold text-ink">Edit event</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Attendees who have RSVPed will be notified when you change the schedule, venue, price,
        capacity, or age policy.
      </p>

      <EventForm
        mode="edit"
        isHost={isHost}
        initialValues={initialDraft}
        submitPending={save.isPending}
        submitError={error}
        onSubmit={(nextDraft) => {
          setError('')
          const patch = baselineDraft ? diffDraft(baselineDraft, nextDraft) : nextDraft
          if (Object.keys(patch).length === 0) {
            toast.info('No changes to save.')
            return
          }
          save.mutate(patch)
        }}
      />
    </div>
  )
}
