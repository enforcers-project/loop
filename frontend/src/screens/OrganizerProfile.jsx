import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { cn, formatCount, isEventPast, pluralize } from '../lib/utils'
import { FollowBtn, PageLoader, RoleBadge } from '../components/primitives'
import { EventGrid } from '../components/EventCard'
import { FollowListModal } from '../components/UserSearch'

// Normalize either shape into what the screen renders: a real backend profile
// (snake_case from GET /api/users/:id) or a mock organizer (camelCase seed).
// The `role` on a real user is 'organizer'/'attendee'; the mock carries a
// display label ('Promoter', 'Sports Host') — RoleBadge handles both.
function toOrganizerShape(p) {
  if (!p) return null
  const isBackend = 'follower_count' in p || 'display_name' in p
  if (!isBackend) return { ...p, isBackend: false }
  return {
    id: p.id,
    name: p.display_name || p.handle || 'Organizer',
    handle: p.handle ? `@${p.handle}` : '',
    avatar: p.avatar_url || 'https://i.pravatar.cc/150?img=1',
    cover:
      p.cover_image_url ||
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80',
    verified: p.is_verified,
    role: p.organizer_kind || p.role,
    followers: p.follower_count ?? 0,
    followingCount: p.following_count ?? 0,
    isFollowing: p.is_following ?? false,
    bio: p.bio || '',
    events: p.events ?? [],
    isBackend: true,
  }
}

export function OrganizerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { followingIds, toggleFollow } = useApp()
  const [org, setOrg] = useState(null)
  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('upcoming')
  // Local follower count so the header updates immediately on follow/unfollow;
  // seeded from the backend's denormalized follower_count.
  const [followerCount, setFollowerCount] = useState(0)
  // Which follow list is open in the modal: 'followers' | 'following' | null.
  // Only real backend profiles expose these lists (mock organizers have none).
  const [followList, setFollowList] = useState(null)

  // Load the profile (+ the current tab's events) once per id. Real backend
  // profiles reload events on tab change (below); the mock path ignores tabs.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    api.user(id, 'upcoming').then((p) => {
      if (cancelled) return
      const shaped = toOrganizerShape(p)
      setOrg(shaped)
      setEvents(shaped?.events ?? [])
      setFollowerCount(shaped?.followers ?? 0)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Events this user is going to (public "Going" tab). Lazily loaded the first
  // time the tab is opened; null until then so we can show a spinner.
  const [attending, setAttending] = useState(null)

  // Refetch this organizer's events when the tab changes (real profiles only —
  // the backend distinguishes upcoming vs past; the mock seed has no such split).
  // The 'going' tab reads a different source (events the user RSVP'd to), so it's
  // handled by its own effect below and skipped here.
  useEffect(() => {
    if (!id || !org?.isBackend || tab === 'going') return
    let cancelled = false
    api.user(id, tab === 'past' ? 'past' : 'upcoming').then((p) => {
      if (!cancelled) setEvents(toOrganizerShape(p)?.events ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [id, tab, org?.isBackend])

  // Load the "Going" list once, when its tab is first opened.
  useEffect(() => {
    if (tab !== 'going' || !org?.isBackend || attending !== null) return
    let cancelled = false
    api.userAttending(id).then((rows) => {
      if (!cancelled) setAttending(rows)
    })
    return () => {
      cancelled = true
    }
  }, [tab, id, org?.isBackend, attending])

  if (!org) return <PageLoader label="Loading profile" />
  // Follow state: the shared context set is the source of truth once loaded, but
  // fall back to the profile's viewer-relative is_following on first paint.
  const following = followingIds.has(org.id) || (org.isFollowing ?? false)

  const onToggle = async () => {
    const result = await toggleFollow(org.id)
    if (result === null) return // gated behind login — no change
    // Keep the header count in step with the action we just took.
    setFollowerCount((c) => Math.max(0, c + (result ? 1 : -1)))
  }

  // Split by date on the upcoming/past tabs. Real backend profiles already come
  // pre-split from the API, but mock organizers return one flat list and ignore
  // the tab — this keeps a passed event out of "upcoming" (and vice versa) for
  // both. The 'going' tab renders `attending` separately, so it's untouched.
  const visibleEvents = events.filter((e) => (tab === 'past' ? isEventPast(e) : !isEventPast(e)))

  return (
    <div className="pb-24 md:pb-10">
      {/* Cover banner. Avatar is positioned separately below so it can never
          be clipped by this container's height or edge. */}
      <div className="relative h-56 md:h-72">
        <img src={org.cover} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-black/20" />
        <button
          onClick={() => navigate(-1)}
          className="absolute left-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <div className="mx-auto max-w-[1140px] px-5">
        {/* Avatar row. Uses translate-y (not negative margin) to overlap into
            the banner: the wrapper still occupies its natural space so nothing
            below shifts, and no ancestor overflow can clip the top. Name is
            centered next to the avatar on desktop, stacked below on mobile. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
            <img
              src={org.avatar}
              alt=""
              className="-translate-y-10 h-24 w-24 rounded-full border-4 border-white bg-white object-cover shadow-card sm:-translate-y-12 sm:h-32 sm:w-32 md:h-36 md:w-36"
            />
            <div className="min-w-0 sm:pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words font-display text-2xl font-bold text-ink sm:text-3xl">
                  {org.name}
                </h1>
                <RoleBadge role={org.role} />
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-text-secondary">
                {org.isBackend ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFollowList('followers')}
                      className="transition-colors hover:text-ink"
                    >
                      <strong className="text-ink">{formatCount(followerCount)}</strong>{' '}
                      {pluralize(followerCount, 'follower')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowList('following')}
                      className="transition-colors hover:text-ink"
                    >
                      <strong className="text-ink">{formatCount(org.followingCount)}</strong>{' '}
                      following
                    </button>
                  </>
                ) : (
                  <span>
                    <strong className="text-ink">{formatCount(followerCount)}</strong>{' '}
                    {pluralize(followerCount, 'follower')}
                  </span>
                )}
                <span>
                  <strong className="text-ink">{events.length}</strong>{' '}
                  {pluralize(events.length, 'event')}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-4 sm:pt-6">
            <FollowBtn following={following} onToggle={onToggle} />
          </div>
        </div>

        {/* bio */}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">{org.bio}</p>

        {/* tabs — 'going' (events this person RSVP'd to) only shows for real
            backend profiles; mock organizers have no attendance to surface. */}
        <div className="mt-6 flex gap-6 border-b border-border-light">
          {(org.isBackend ? ['upcoming', 'past', 'going'] : ['upcoming', 'past']).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 pb-3 text-sm font-semibold capitalize transition-colors',
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary',
              )}
            >
              {t === 'going' ? 'Going' : t}
            </button>
          ))}
        </div>

        {/* event grid — the 'going' tab renders the attending list (with its own
            loading state); upcoming/past render this organizer's own events. */}
        <div className="mt-6">
          {tab === 'going' ? (
            attending === null ? (
              <PageLoader label="Loading events" />
            ) : attending.length > 0 ? (
              <EventGrid events={attending} />
            ) : (
              <p className="py-16 text-center text-sm text-text-muted">
                Not going to any upcoming events.
              </p>
            )
          ) : visibleEvents.length > 0 ? (
            <EventGrid events={visibleEvents} />
          ) : (
            <p className="py-16 text-center text-sm text-text-muted">No events to show.</p>
          )}
        </div>
      </div>

      <FollowListModal
        userId={org.id}
        edge={followList ?? 'followers'}
        open={followList !== null}
        onClose={() => setFollowList(null)}
      />
    </div>
  )
}
