import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Event, Organizer, Post } from '../lib/types'
import { useApp } from '../context/AppContext'
import { StoriesRow, PostCard } from '../components/social'
import { EventImage } from '../components/EventImage'
import { FollowBtn, VerifiedBadge } from '../components/primitives'

/* Small square event thumbnail with the branded fallback baked in. */
function Thumb({ event, size }: { event: Event; size: number }) {
  return (
    <div
      className="relative flex-shrink-0 overflow-hidden rounded-lg"
      style={{ width: size, height: size }}
    >
      <EventImage
        src={event.poster}
        alt={event.title}
        category={event.category}
        title={event.title}
        iconSize={18}
        showLabel={false}
      />
    </div>
  )
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border-light bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  )
}

export function SocialFeed() {
  const { followingIds, toggleFollow } = useApp()
  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    api.posts().then(setPosts)
    api.events({ sort: 'popular' }).then(setEvents)
  }, [])

  const stories = [
    { name: 'You', avatar: 'https://i.pravatar.cc/150?img=1', isYou: true },
    ...posts.map((p) => ({
      name: p.organizer?.name ?? '',
      avatar: p.organizer?.avatar ?? '',
    })),
    ...events.slice(0, 4).map((e) => ({
      name: e.organizer?.name ?? '',
      avatar: e.organizer?.avatar ?? '',
    })),
  ]

  const suggested: Organizer[] = events
    .map((e) => e.organizer)
    .filter((o): o is Organizer => !!o)
    .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i)
    .slice(0, 4)

  const upcoming = events.slice(0, 3)
  const trending = events.slice(0, 4)

  return (
    <div className="loop-container pb-24 pt-6 md:pb-12">
      <div className="flex justify-center gap-7 xl:gap-8">
        {/* left rail */}
        <aside className="hidden w-[260px] flex-shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <SidebarCard title="Your upcoming RSVPs">
              <div className="space-y-3.5">
                {upcoming.map((e) => (
                  <Link
                    key={e.id}
                    to={`/event/${e.id}`}
                    className="group flex items-center gap-3"
                  >
                    <Thumb event={e} size={44} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink group-hover:text-primary">
                        {e.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">{e.date}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </SidebarCard>

            <SidebarCard title="Suggested follows">
              <div className="space-y-3.5">
                {suggested.map((o) => (
                  <div key={o.id} className="flex items-center gap-3">
                    <img
                      src={o.avatar}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded-full bg-surface object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="truncate text-[13px] font-semibold text-ink">{o.name}</p>
                        {o.verified && <VerifiedBadge size={12} />}
                      </div>
                      <p className="truncate text-xs text-text-muted">{o.handle}</p>
                    </div>
                    <FollowBtn
                      following={followingIds.has(o.id)}
                      onToggle={() => toggleFollow(o.id)}
                      sm
                    />
                  </div>
                ))}
              </div>
            </SidebarCard>
          </div>
        </aside>

        {/* center column */}
        <div className="w-full max-w-[600px] flex-1">
          {/* stories scroll horizontally *inside* this column */}
          <div className="rounded-card border border-border-light bg-white p-4 shadow-card">
            <StoriesRow stories={stories} />
          </div>
          <div className="mt-6 space-y-6">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </div>

        {/* right rail — xl only */}
        <aside className="hidden w-[280px] flex-shrink-0 xl:block">
          <div className="sticky top-24 space-y-6">
            <SidebarCard title="Trending events">
              <div className="space-y-3.5">
                {trending.map((e) => (
                  <Link key={e.id} to={`/event/${e.id}`} className="group flex items-center gap-3">
                    <Thumb event={e} size={48} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink group-hover:text-primary">
                        {e.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-xs text-text-muted">{e.rsvpCount} going</span>
                        {e.organizer?.verified && <VerifiedBadge size={11} />}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </SidebarCard>

            {/* weekend promo card */}
            <div className="rounded-card bg-gradient-to-br from-primary to-accent p-5 text-white shadow-card">
              <span className="inline-flex items-center rounded-pill bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                For you
              </span>
              <h3 className="mt-3 font-display text-lg font-bold leading-snug">
                Your weekend, sorted
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/90">
                12 events match your vibe this weekend.
              </p>
              <Link
                to="/discover"
                className="mt-4 inline-flex h-10 items-center rounded-button bg-white px-4 text-sm font-semibold text-primary transition-transform active:scale-95"
              >
                See them all
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
