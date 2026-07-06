import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Event, Organizer, Post } from '../lib/types'
import { useApp } from '../context/AppContext'
import { StoriesRow, PostCard } from '../components/social'
import { FollowBtn, RoleBadge, VerifiedBadge } from '../components/primitives'

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
    <div className="mx-auto max-w-[1240px] px-5 pb-24 pt-6 md:pb-10">
      <div className="flex justify-center gap-6">
        {/* left rail */}
        <aside className="hidden w-56 flex-shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <div className="rounded-card border border-border-light bg-white p-4 shadow-card">
              <h3 className="mb-3 text-sm font-bold text-ink">Your upcoming RSVPs</h3>
              <div className="space-y-3">
                {upcoming.map((e) => (
                  <Link
                    key={e.id}
                    to={`/event/${e.id}`}
                    className="flex items-center gap-2.5"
                  >
                    <img src={e.poster} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{e.title}</p>
                      <p className="truncate text-[11px] text-text-muted">{e.date}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-card border border-border-light bg-white p-4 shadow-card">
              <h3 className="mb-3 text-sm font-bold text-ink">Suggested follows</h3>
              <div className="space-y-3">
                {suggested.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <img src={o.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{o.name}</p>
                      <p className="truncate text-[11px] text-text-muted">{o.handle}</p>
                    </div>
                    <FollowBtn
                      following={followingIds.has(o.id)}
                      onToggle={() => toggleFollow(o.id)}
                      sm
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* center column */}
        <div className="w-full max-w-lg flex-1">
          <StoriesRow stories={stories} />
          <div className="mt-6 space-y-6">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </div>

        {/* right rail — xl only */}
        <aside className="hidden w-60 flex-shrink-0 xl:block">
          <div className="sticky top-24 space-y-6">
            <div className="rounded-card border border-border-light bg-white p-4 shadow-card">
              <h3 className="mb-3 text-sm font-bold text-ink">Trending events</h3>
              <div className="space-y-3">
                {trending.map((e) => (
                  <Link key={e.id} to={`/event/${e.id}`} className="flex items-center gap-2.5">
                    <img src={e.poster} alt="" className="h-11 w-11 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{e.title}</p>
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="text-[11px] text-text-muted">{e.rsvpCount} going</span>
                        {e.organizer?.verified && <VerifiedBadge size={11} />}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* weekend promo card */}
            <div className="rounded-card bg-gradient-to-br from-primary to-accent p-5 text-white shadow-card">
              <RoleBadge role="Promoter" />
              <h3 className="mt-3 font-display text-lg font-bold">Your weekend, sorted</h3>
              <p className="mt-1 text-sm text-white/80">
                12 events match your vibe this weekend.
              </p>
              <Link
                to="/discover"
                className="mt-4 inline-block rounded-button bg-white px-4 py-2 text-sm font-semibold text-primary"
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
