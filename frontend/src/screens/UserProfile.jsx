import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, CalendarHeart, Sparkles, Camera, X } from 'lucide-react'
import { api, DEFAULT_AVATAR } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { cn, formatCount } from '../lib/utils'
import { RoleBadge, Spinner } from '../components/primitives'
import { EventGrid } from '../components/EventCard'
import { EventImage } from '../components/EventImage'

// Max upload size — S3 accepts anything, but a profile picture shouldn't be
// huge, and rejecting client-side gives a friendlier error than a failed PUT.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

/* Full-screen avatar viewer with a "Change picture" action. Clicking the profile
   photo opens this; the button opens the OS file picker, uploads to S3 via the
   presigned-URL flow, and closes on success. */
function AvatarModal({ src, onClose, onUpload, uploading }) {
  const fileRef = useRef(null)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={22} />
      </button>

      <img
        src={src}
        alt="Profile"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[70vh] w-auto max-w-[90vw] rounded-2xl object-contain shadow-hero"
      />

      <div className="mt-6" onClick={(e) => e.stopPropagation()}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset so re-picking the same file still fires onChange.
            e.target.value = ''
            if (file) onUpload(file)
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-11 items-center gap-2 rounded-button bg-white px-6 text-sm font-semibold text-ink transition-transform active:scale-95 hover:opacity-90 disabled:opacity-60"
        >
          <Camera size={18} />
          {uploading ? 'Uploading…' : 'Change picture'}
        </button>
      </div>
    </div>
  )
}

/* Designed empty state — icon, heading, description and a routed CTA. Sized to
   fill the tab area so an empty profile never looks broken. */
function EmptyState({ Icon, title, description, cta, onCta }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-light bg-surface/50 px-6 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-light text-primary">
        <Icon size={28} strokeWidth={2} />
      </span>
      <h3 className="mt-5 font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-secondary">{description}</p>
      <button
        onClick={onCta}
        className="mt-6 inline-flex h-11 items-center rounded-button bg-primary px-6 text-sm font-semibold text-white transition-transform active:scale-95 hover:opacity-90"
      >
        {cta}
      </button>
    </div>
  )
}

export function UserProfile() {
  const navigate = useNavigate()
  const { user, role, isHost, interests, savedIds, goingIds, updateAvatar } = useApp()
  const toast = useToast()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const avatarSrc = user?.avatar || DEFAULT_AVATAR

  // Upload a picked image to S3 (presigned-URL flow in api.uploadAvatar), then
  // let context adopt the refreshed user so the new photo shows everywhere.
  const onUpload = async (file) => {
    if (!file.type?.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image is too large (max 5MB).')
      return
    }
    setUploading(true)
    try {
      await updateAvatar(file)
      toast.success('Profile picture updated.')
      setAvatarOpen(false)
    } catch (err) {
      toast.error(err.message || 'Could not update picture. Please try again.')
    } finally {
      setUploading(false)
    }
  }
  // Two logic roles + the host capability drive the display RoleBadge:
  // an organizer-host shows the green "Sports Host" tint (per planning §5).
  const roleLabel = role === 'organizer' ? (isHost ? 'Sports Host' : 'Organizer') : 'Attendee'
  const [tab, setTab] = useState('Saved')
  // null while a fetch is in flight, so the tab area can show a spinner
  // instead of empty-state cards flashing in before real data arrives.
  const [savedEvents, setSavedEvents] = useState(null)
  const [goingEvents, setGoingEvents] = useState(null)
  const [allInterests, setAllInterests] = useState(null)

  // Render-time reset when the profile owner changes so we don't flash the
  // previous user's saved/going lists before the new fetch lands. See
  // FeaturedCard for the same pattern.
  const [fetchedUserId, setFetchedUserId] = useState('__init__')
  if (fetchedUserId !== (user?.id ?? null)) {
    setFetchedUserId(user?.id ?? null)
    setAllInterests(null)
    setSavedEvents(null)
    setGoingEvents(null)
  }

  // Load the user's *actual* saved / going events from the backend — not a
  // filter over the generic upcoming-events feed (which capped at 20 upcoming
  // rows, so events saved from search / direct links / past events never showed).
  useEffect(() => {
    let cancelled = false
    api.interests().then((data) => {
      if (!cancelled) setAllInterests(data)
    })
    if (!user?.id) return
    api.savedEventCards(user.id).then((data) => {
      if (!cancelled) setSavedEvents(data)
    })
    api.goingEventCards(user.id).then((data) => {
      if (!cancelled) setGoingEvents(data)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Still gate on the live sets so an in-session unsave / cancel hides a card
  // immediately, before a refetch — the fetched list is the source of truth,
  // the Set is the just-now override.
  const saved = (savedEvents ?? []).filter((e) => savedIds.has(e.id))
  const going = (goingEvents ?? []).filter((e) => goingIds.has(e.id))
  const myInterests = (allInterests ?? []).filter((i) => interests.includes(i.id))
  const displayName = user?.name?.trim() || 'Alex Carter'
  const tabLoading =
    (tab === 'Saved' && savedEvents === null) ||
    (tab === 'Going' && goingEvents === null) ||
    (tab === 'Interests' && allInterests === null)

  return (
    <div className="pb-24 md:pb-12">
      {/* cover banner — controlled height, doesn't overpower the content */}
      <div className="relative h-[200px] md:h-[240px]">
        <EventImage
          src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=80"
          alt=""
          showLabel={false}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/55 to-accent/55" />
      </div>

      <div className="loop-container relative z-10 max-w-[1100px]">
        {/* profile header */}
        <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setAvatarOpen(true)}
                aria-label="View profile picture"
                className="group block rounded-full ring-4 ring-white focus:outline-none focus-visible:ring-primary"
              >
                <img
                  src={avatarSrc}
                  alt=""
                  className="h-28 w-28 rounded-full bg-surface object-cover"
                />
                {/* hover hint that the photo is editable */}
                <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera size={22} />
                </span>
              </button>
              <span className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full border-2 border-white bg-success" />
            </div>
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-ink">{displayName}</h1>
                <RoleBadge role={roleLabel} />
              </div>
              <p className="mt-1 text-sm font-medium text-text-secondary">
                {user?.handle ?? '@you'}
              </p>
              <div className="mt-3 flex items-center gap-5 text-sm text-text-secondary">
                <span>
                  <strong className="font-semibold text-ink">
                    {formatCount(user?.following ?? 0)}
                  </strong>{' '}
                  following
                </span>
                <span>
                  <strong className="font-semibold text-ink">
                    {formatCount(user?.followers ?? 0)}
                  </strong>{' '}
                  followers
                </span>
              </div>
            </div>
          </div>
          <button className="inline-flex h-11 flex-shrink-0 items-center rounded-button border border-border-light bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:border-text-muted hover:text-ink">
            Edit profile
          </button>
        </div>

        {/* tabs */}
        <div className="mt-8 flex gap-7 border-b border-border-light">
          {['Saved', 'Going', 'Interests'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors',
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-ink',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* content — always tall enough that an empty tab never looks broken */}
        <div className="mt-8 min-h-[340px]">
          {tabLoading ? (
            <div className="flex min-h-[340px] items-center justify-center">
              <Spinner size="lg" label="Loading" />
            </div>
          ) : tab === 'Interests' ? (
            myInterests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {myInterests.map((i) => (
                  <span
                    key={i.id}
                    className="rounded-pill border border-primary bg-primary px-4 py-2 text-sm font-medium text-white"
                  >
                    {i.label}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyState
                Icon={Sparkles}
                title="No interests selected yet"
                description="Choose a few interests so Loop can recommend better events."
                cta="Add interests"
                onCta={() => navigate('/onboarding')}
              />
            )
          ) : tab === 'Saved' ? (
            saved.length > 0 ? (
              <EventGrid events={saved} />
            ) : (
              <EmptyState
                Icon={Bookmark}
                title="No saved events yet"
                description="Bookmark events you like and they'll show up here."
                cta="Discover events"
                onCta={() => navigate('/discover')}
              />
            )
          ) : going.length > 0 ? (
            <EventGrid events={going} />
          ) : (
            <EmptyState
              Icon={CalendarHeart}
              title="No upcoming plans yet"
              description="RSVP to events and they'll appear here."
              cta="Find events"
              onCta={() => navigate('/discover')}
            />
          )}
        </div>
      </div>

      {avatarOpen && (
        <AvatarModal
          src={avatarSrc}
          uploading={uploading}
          onUpload={onUpload}
          onClose={() => !uploading && setAvatarOpen(false)}
        />
      )}
    </div>
  )
}
