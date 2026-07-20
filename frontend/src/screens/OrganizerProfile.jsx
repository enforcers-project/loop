import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { cn, formatCount, pluralize } from '../lib/utils'
import { FollowBtn, PageLoader, RoleBadge, VerifiedBadge } from '../components/primitives'
import { EventGrid } from '../components/EventCard'

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

  // Refetch this organizer's events when the tab changes (real profiles only —
  // the backend distinguishes upcoming vs past; the mock seed has no such split).
  useEffect(() => {
    if (!id || !org?.isBackend) return
    let cancelled = false
    api.user(id, tab === 'past' ? 'past' : 'upcoming').then((p) => {
      if (!cancelled) setEvents(toOrganizerShape(p)?.events ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [id, tab, org?.isBackend])

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

  return (
    <div className="pb-24 md:pb-10">
      {/* cover */}
      <div className="relative h-52 md:h-64">
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
        {/* avatar overlapping cover */}
        <div className="-mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <img
              src={org.avatar}
              alt=""
              className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-card"
            />
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-bold text-ink">{org.name}</h1>
                {org.verified && <VerifiedBadge size={20} />}
                <RoleBadge role={org.role} />
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-text-secondary">
                <span>
                  <strong className="text-ink">{formatCount(followerCount)}</strong>{' '}
                  {pluralize(followerCount, 'follower')}
                </span>
                <span>
                  <strong className="text-ink">{events.length}</strong>{' '}
                  {pluralize(events.length, 'event')}
                </span>
              </div>
            </div>
          </div>
          <FollowBtn following={following} onToggle={onToggle} />
        </div>

        {/* bio */}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary">{org.bio}</p>

        {/* tabs */}
        <div className="mt-6 flex gap-6 border-b border-border-light">
          {['upcoming', 'past'].map((t) => (
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
              {t}
            </button>
          ))}
        </div>

        {/* event grid */}
        <div className="mt-6">
          {events.length > 0 ? (
            <EventGrid events={events} />
          ) : (
            <p className="py-16 text-center text-sm text-text-muted">No events to show.</p>
          )}
        </div>
      </div>
    </div>
  )
}
