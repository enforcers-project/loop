import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { StoriesRow, PostCard } from '../components/social'
import { EventImage } from '../components/EventImage'
import { FollowBtn, PageLoader, VerifiedBadge } from '../components/primitives'

/* Small square event thumbnail with the branded fallback baked in. */
function Thumb({ event, size }) {
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

function SidebarCard({ title, children }) {
  return (
    <section className="rounded-card border border-border-light bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  )
}

export function SocialFeed() {
  const { followingIds, toggleFollow, user } = useApp()
  // null while a fetch is still in flight, so we can show a page-level spinner
  // instead of an empty feed with a lonely stories row.
  const [posts, setPosts] = useState(null)
  const [events, setEvents] = useState(null)
  const [storyGroups, setStoryGroups] = useState([])
  const loading = posts === null || events === null

  const near = nearForUser(user)
  const nearKey = near?.lat != null ? `${near.lat},${near.lng}` : (near?.city ?? '')

  // Render-time reset when the geo key changes so we don't flash the prior
  // location's feed under the new context; see FeaturedCard for the pattern.
  const [fetchedKey, setFetchedKey] = useState('')
  if (fetchedKey !== nearKey) {
    setFetchedKey(nearKey)
    setPosts(null)
    setEvents(null)
    setStoryGroups([])
  }

  useEffect(() => {
    let cancelled = false
    // Load the feed, then hydrate each post's comments (the feed carries only a
    // comment_count, not the comment bodies). Small N at demo scale.
    api.feedSocial().then(async (list) => {
      const withComments = await Promise.all(
        (list ?? []).map(async (p) => ({
          ...p,
          comments: p.commentCount ? await api.postComments(p.id, { limit: 3 }) : [],
        })),
      )
      if (!cancelled) setPosts(withComments)
    })
    api.stories().then((data) => {
      if (!cancelled) setStoryGroups(data ?? [])
    })
    api.events({ sort: 'popular', near: nearForUser(user) }).then((data) => {
      if (!cancelled) setEvents(data)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearKey])

  // Mark a story group viewed when its ring is tapped (idempotent server-side),
  // then flip it to the muted "all viewed" state locally.
  const openStory = (group) => {
    const ids = (group.stories ?? []).map((s) => s.id).filter(Boolean)
    ids.forEach((id) => api.viewStory(id))
    setStoryGroups((prev) =>
      prev.map((g) => (g.author?.id === group.author?.id ? { ...g, allViewed: true } : g)),
    )
  }

  const postList = posts ?? []
  const eventList = events ?? []
  const stories = [
    { name: 'You', avatar: user?.avatar ?? 'https://i.pravatar.cc/150?img=1', isYou: true },
    ...storyGroups.map((g) => ({
      id: g.author?.id,
      name: g.author?.name ?? '',
      avatar: g.author?.avatar ?? '',
      allViewed: g.allViewed,
      stories: g.stories,
    })),
  ]

  const suggested = eventList
    .map((e) => e.organizer)
    .filter((o) => !!o)
    .filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i)
    .slice(0, 4)

  const upcoming = eventList.slice(0, 3)
  const trending = eventList.slice(0, 4)

  if (loading) {
    return (
      <div className="loop-container pb-24 pt-6 md:pb-12">
        <PageLoader label="Loading social feed" />
      </div>
    )
  }

  return (
    <div className="loop-container pb-24 pt-6 md:pb-12">
      <div className="flex justify-center gap-7 xl:gap-8">
        {/* left rail */}
        <aside className="hidden w-[260px] flex-shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <SidebarCard title="Your upcoming RSVPs">
              <div className="space-y-3.5">
                {upcoming.map((e) => (
                  <Link key={e.id} to={`/event/${e.id}`} className="group flex items-center gap-3">
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
            <StoriesRow stories={stories} onOpen={openStory} />
          </div>
          <div className="mt-6 space-y-6">
            {postList.map((p) => (
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
