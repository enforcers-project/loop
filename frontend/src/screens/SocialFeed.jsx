import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { PenSquare } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { StoriesRow, StoryViewer, PostCard, Composer } from '../components/social'
import { EventImage } from '../components/EventImage'
import { FollowBtn, PageLoader, Spinner, VerifiedBadge } from '../components/primitives'
import { formatCount } from '../lib/utils'

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

// Attach each post's first few comments (the feed carries only a comment_count,
// not the bodies). Small N at demo scale.
async function hydrateComments(list) {
  return Promise.all(
    (list ?? []).map(async (p) => ({
      ...p,
      comments: p.commentCount ? await api.postComments(p.id, { limit: 3 }) : [],
    })),
  )
}

export function SocialFeed() {
  const { followingIds, toggleFollow, user, isLoggedIn, requireAuth } = useApp()
  // null while a fetch is still in flight, so we can show a page-level spinner
  // instead of an empty feed with a lonely stories row.
  const [posts, setPosts] = useState(null)
  const [events, setEvents] = useState(null)
  const [storyGroups, setStoryGroups] = useState([])
  const [cursor, setCursor] = useState(null) // next page cursor; null = no more
  const [loadingMore, setLoadingMore] = useState(false)
  const [composer, setComposer] = useState(null) // 'post' | 'story' | null
  const [viewerIndex, setViewerIndex] = useState(null) // group index being viewed, or null
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
    setCursor(null)
  }

  useEffect(() => {
    let cancelled = false
    api.feedSocial().then(async ({ posts: list, nextCursor }) => {
      const withComments = await hydrateComments(list)
      if (!cancelled) {
        setPosts(withComments)
        setCursor(nextCursor)
      }
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

  // Fetch the next page and append it, de-duping by id in case a new post was
  // prepended since the cursor was captured. Guarded so overlapping scroll
  // events don't double-fetch.
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const { posts: list, nextCursor } = await api.feedSocial({ cursor })
      const withComments = await hydrateComments(list)
      setPosts((prev) => {
        const seen = new Set((prev ?? []).map((p) => p.id))
        return [...(prev ?? []), ...withComments.filter((p) => !seen.has(p.id))]
      })
      setCursor(nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore])

  // Infinite scroll: fire loadMore when the sentinel scrolls into view.
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cursor) return
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: '400px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, loadMore])

  // The groups the viewer pages through, in the same order as the rings (minus
  // the leading "You" tile). Only groups that actually have media are viewable.
  const viewerGroups = storyGroups
    .filter((g) => (g.stories?.length ?? 0) > 0)
    .map((g) => ({
      id: g.author?.id,
      name: g.author?.name ?? '',
      avatar: g.author?.avatar ?? '',
      stories: g.stories ?? [],
    }))

  // Open the full-screen viewer at the tapped author's group. `ring` is the
  // flattened row item, whose `id` is the author id — find that author's index
  // within the viewable groups (the row's leading "You" tile has no group).
  const openStory = (ring) => {
    const idx = viewerGroups.findIndex((g) => g.id === ring.id)
    if (idx >= 0) setViewerIndex(idx)
  }

  // Mark one frame viewed server-side (idempotent). Once every frame in a group
  // has been seen, flip that ring to the muted "all viewed" state.
  const onStoryViewed = (storyId) => {
    api.viewStory(storyId)
    setStoryGroups((prev) =>
      prev.map((g) => {
        const stories = (g.stories ?? []).map((s) =>
          s.id === storyId ? { ...s, viewedByMe: true } : s,
        )
        const allViewed = stories.length > 0 && stories.every((s) => s.viewedByMe)
        return stories.some((s) => s.id === storyId) ? { ...g, stories, allViewed } : g
      }),
    )
  }

  const openComposer = (mode) => requireAuth() && setComposer(mode)

  // After a create: prepend the new post to the feed, or refetch story rings so
  // the caller's own ring appears grouped with any existing stories.
  const onCreated = (kind, result) => {
    if (kind === 'post' && result) {
      setPosts((prev) => [{ ...result, comments: [] }, ...(prev ?? [])])
    } else if (kind === 'story') {
      api.stories().then((data) => setStoryGroups(data ?? []))
    }
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
            <StoriesRow
              stories={stories}
              onOpen={openStory}
              onAddStory={() => openComposer('story')}
            />
          </div>

          {/* create-post prompt */}
          <button
            type="button"
            onClick={() => openComposer('post')}
            className="mt-6 flex w-full items-center gap-3 rounded-card border border-border-light bg-white px-4 py-3.5 text-left shadow-card transition-colors hover:border-primary"
          >
            <img
              src={user?.avatar ?? 'https://i.pravatar.cc/150?img=1'}
              alt=""
              className="h-10 w-10 flex-shrink-0 rounded-full bg-surface object-cover"
            />
            <span className="flex-1 text-sm text-text-muted">
              {isLoggedIn ? 'Share a flyer, recap or update…' : 'Sign in to post…'}
            </span>
            <PenSquare size={20} className="flex-shrink-0 text-primary" />
          </button>

          <div className="mt-6 space-y-6">
            {postList.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>

          {/* infinite-scroll sentinel + spinner */}
          {cursor && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              {loadingMore && <Spinner label="Loading more posts" />}
            </div>
          )}
          {!cursor && postList.length > 0 && (
            <p className="py-8 text-center text-sm text-text-muted">You're all caught up ✨</p>
          )}
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
                        <span className="text-xs text-text-muted">
                          {formatCount(e.rsvpCount ?? 0)} going
                        </span>
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

      <AnimatePresence>
        {composer && (
          <Composer mode={composer} onClose={() => setComposer(null)} onCreated={onCreated} />
        )}
      </AnimatePresence>

      {viewerIndex !== null && viewerGroups[viewerIndex] && (
        <StoryViewer
          groups={viewerGroups}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onViewed={onStoryViewed}
        />
      )}
    </div>
  )
}
