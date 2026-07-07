import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Event, Interest } from '../lib/types'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/utils'
import { RoleBadge } from '../components/primitives'
import { EventGrid } from '../components/EventCard'

type Tab = 'Saved' | 'Going' | 'Interests'

export function UserProfile() {
  const { user, role, isHost, interests, savedIds, goingIds } = useApp()
  // Two logic roles + the host capability drive the display RoleBadge:
  // an organizer-host shows the green "Sports Host" tint (per planning §5).
  const roleLabel =
    role === 'organizer' ? (isHost ? 'Sports Host' : 'Organizer') : 'Attendee'
  const [tab, setTab] = useState<Tab>('Saved')
  const [events, setEvents] = useState<Event[]>([])
  const [allInterests, setAllInterests] = useState<Interest[]>([])

  useEffect(() => {
    api.events().then(setEvents)
    api.interests().then(setAllInterests)
  }, [])

  const saved = events.filter((e) => savedIds.has(e.id))
  const going = events.filter((e) => goingIds.has(e.id))
  const myInterests = allInterests.filter((i) => interests.includes(i.id))

  return (
    <div className="pb-24 md:pb-10">
      {/* cover banner */}
      <div className="relative h-36 md:h-48">
        <img
          src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1400&q=80"
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/60 to-accent/60" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1140px] px-5">
        {/* avatar overlapping cover */}
        <div className="-mt-4 flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="relative">
              <img
                src={user?.avatar ?? 'https://i.pravatar.cc/150?img=1'}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-4 ring-white"
              />
              <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-success" />
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-ink">
                  {user?.name ?? 'Demo User'}
                </h1>
                <RoleBadge role={roleLabel} />
              </div>
              <p className="mt-0.5 text-sm text-text-muted">{user?.handle ?? '@you'}</p>
              <div className="mt-1 flex items-center gap-4 text-sm text-text-secondary">
                <span>
                  <strong className="text-ink">128</strong> following
                </span>
                <span>
                  <strong className="text-ink">342</strong> followers
                </span>
              </div>
            </div>
          </div>
          <button className="rounded-button border border-border-light bg-white px-5 py-2.5 text-sm font-semibold text-text-secondary hover:border-text-muted">
            Edit profile
          </button>
        </div>

        {/* tabs */}
        <div className="mt-6 flex gap-6 border-b border-border-light">
          {(['Saved', 'Going', 'Interests'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 pb-3 text-sm font-semibold transition-colors',
                tab === t ? 'border-primary text-primary' : 'border-transparent text-text-secondary',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'Interests' ? (
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
              <p className="py-16 text-center text-sm text-text-muted">
                No interests picked yet.
              </p>
            )
          ) : tab === 'Saved' ? (
            saved.length > 0 ? (
              <EventGrid events={saved} />
            ) : (
              <p className="py-16 text-center text-sm text-text-muted">
                You haven’t saved any events yet. Tap the bookmark on a card.
              </p>
            )
          ) : going.length > 0 ? (
            <EventGrid events={going} />
          ) : (
            <p className="py-16 text-center text-sm text-text-muted">
              You’re not going to anything yet. RSVP to fill this up.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
