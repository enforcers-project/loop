import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { cn, formatCount } from '../lib/utils'
import { FollowBtn, RoleBadge, VerifiedBadge } from '../components/primitives'
import { EventGrid } from '../components/EventCard'

export function OrganizerProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { followingIds, toggleFollow } = useApp()
  const [org, setOrg] = useState(null)
  const [tab, setTab] = useState('upcoming')

  useEffect(() => {
    if (id) api.organizer(id).then(setOrg)
  }, [id])

  if (!org) return <div className="py-24 text-center text-text-muted">Loading…</div>

  const events = org.events ?? []
  const following = followingIds.has(org.id)

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
                <h1 className="font-display text-2xl font-bold text-ink">{org.name}</h1>
                {org.verified && <VerifiedBadge size={20} />}
                <RoleBadge role={org.role} />
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-text-secondary">
                <span>
                  <strong className="text-ink">{formatCount(org.followers)}</strong> followers
                </span>
                <span>
                  <strong className="text-ink">{events.length}</strong> events
                </span>
              </div>
            </div>
          </div>
          <FollowBtn following={following} onToggle={() => toggleFollow(org.id)} />
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
