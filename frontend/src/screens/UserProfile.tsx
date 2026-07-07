import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, CalendarHeart, Sparkles, type LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import type { Event, Interest } from '../lib/types'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/utils'
import { RoleBadge } from '../components/primitives'
import { EventGrid } from '../components/EventCard'
import { EventImage } from '../components/EventImage'

type Tab = 'Saved' | 'Going' | 'Interests'

/* Designed empty state — icon, heading, description and a routed CTA. Sized to
   fill the tab area so an empty profile never looks broken. */
function EmptyState({
  Icon,
  title,
  description,
  cta,
  onCta,
}: {
  Icon: LucideIcon
  title: string
  description: string
  cta: string
  onCta: () => void
}) {
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
  const { user, role, isHost, interests, savedIds, goingIds } = useApp()
  // Two logic roles + the host capability drive the display RoleBadge:
  // an organizer-host shows the green "Sports Host" tint (per planning §5).
  const roleLabel = role === 'organizer' ? (isHost ? 'Sports Host' : 'Organizer') : 'Attendee'
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
  const displayName = user?.name?.trim() || 'Alex Carter'

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
              <img
                src={user?.avatar ?? 'https://i.pravatar.cc/150?img=1'}
                alt=""
                className="h-28 w-28 rounded-full bg-surface object-cover ring-4 ring-white"
              />
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
                  <strong className="font-semibold text-ink">128</strong> following
                </span>
                <span>
                  <strong className="font-semibold text-ink">342</strong> followers
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
          {(['Saved', 'Going', 'Interests'] as Tab[]).map((t) => (
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
    </div>
  )
}
