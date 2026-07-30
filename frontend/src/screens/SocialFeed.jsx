import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { PenSquare, Search, Users, X } from 'lucide-react'
import { api, nearForUser } from '../lib/api'
import { useApp } from '../context/AppContext'
import { StoriesRow, StoryViewer, PostCard, Composer } from '../components/social'
import { EventImage } from '../components/EventImage'
import { FollowBtn, PageLoader, Spinner } from '../components/primitives'
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
    <section className="rounded-card border border-border-light bg-card-bg p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  )
}

// A compact person row: tappable avatar + username (→ profile) with an inline
// Follow button. Used both in the sidebar "Suggested follows" and in the
// people-search dropdown. Instagram-style layout — @username on top in ink,
// display name muted underneath. `onNavigate` (optional) fires when a link is
// tapped, letting the search dropdown close itself. `user.handle` here is the
// bare stored value (no leading '@') — the row renders one, falling back to
// the display name for legacy accounts that never set a handle.
function FollowRow({ user, following, onToggle, onNavigate, bareHandle }) {
  const bare = user.handle ? user.handle.replace(/^@+/, '') : ''
  const primary = user.handle ? (bareHandle ? bare : `@${bare}`) : user.name
  return (
    <div className="flex items-center gap-3">
      <Link
        to={`/organizer/${user.id}`}
        onClick={onNavigate}
        aria-label={`Open ${primary}'s profile`}
      >
        <img
          src={user.avatar}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded-full bg-surface object-cover transition-transform hover:scale-[1.03]"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <Link
            to={`/organizer/${user.id}`}
            onClick={onNavigate}
            className="truncate text-[13px] font-semibold text-ink transition-colors hover:text-primary"
          >
            {primary}
          </Link>
        </div>
        {user.handle && user.name ? (
          <p className="truncate text-xs text-text-muted">{user.name}</p>
        ) : null}
      </div>
      <FollowBtn following={following} onToggle={onToggle} sm />
    </div>
  )
}

// How many result rows the dropdown shows before "See more" is tapped.
const PEOPLE_PREVIEW_COUNT = 3
// Don't search until the query is at least this long — a single letter matches
// almost everyone and isn't a useful result set.
const PEOPLE_MIN_QUERY = 2

// Debounced people-search with an inline results dropdown. Matches surface in a
// panel *below* the input (absolutely positioned, so the feed underneath — the
// stories row, composer, and every post — stays exactly where it is) rather
// than replacing the page. The dropdown previews the first few matches; "See
// more" expands it to the full list. TODO: if a dedicated "browse people"
// endpoint is ever added, swap `api.searchUsers` for it; the shape is the same.
function PeopleSearch() {
  const { followingIds, toggleFollow } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = no active query
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(false) // panel visible while focused
  const wrapRef = useRef(null)
  const term = query.trim()

  useEffect(() => {
    // Wait for a meaningful query; shorter terms are handled in onChange.
    if (term.length < PEOPLE_MIN_QUERY) return
    let cancelled = false
    const t = setTimeout(() => {
      setLoading(true)
      api.searchUsers(term).then(
        (list) => {
          if (cancelled) return
          setResults(list ?? [])
          setLoading(false)
        },
        () => {
          if (!cancelled) setLoading(false)
        },
      )
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term])

  // Dismiss the dropdown on an outside click or Escape — it's an overlay, so it
  // shouldn't linger once the user's attention moves elsewhere.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onChange = (e) => {
    const next = e.target.value
    setQuery(next)
    setShowAll(false) // a new query collapses back to the preview
    if (next.trim().length < PEOPLE_MIN_QUERY) {
      // Below the search threshold: drop stale results immediately, without
      // waiting on a fetch that won't fire.
      setResults(null)
      setLoading(false)
    }
  }

  const clear = () => {
    setQuery('')
    setResults(null)
    setShowAll(false)
  }

  const showPanel = open && term.length >= PEOPLE_MIN_QUERY && results !== null
  const visible = results ? (showAll ? results : results.slice(0, PEOPLE_PREVIEW_COUNT)) : []
  const hiddenCount = results ? results.length - visible.length : 0

  return (
    <div ref={wrapRef} className="relative z-20 mb-3.5">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        onChange={onChange}
        onFocus={() => setOpen(true)}
        placeholder="Search people"
        aria-label="Search people"
        className="h-9 w-full rounded-pill border border-border-light bg-surface pl-8 pr-8 text-[13px] text-ink placeholder:text-text-muted focus:border-primary focus:bg-card-bg focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {loading ? (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          <Spinner size="sm" label="Searching people" />
        </div>
      ) : (
        query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X size={14} />
          </button>
        )
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-card border border-border-light bg-card-bg py-1 shadow-hero">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">No people found</p>
          ) : (
            <>
              <div className="max-h-[60vh] overflow-y-auto">
                {visible.map((o) => (
                  <div key={o.id} className="px-3 py-2 transition-colors hover:bg-surface">
                    <FollowRow
                      user={o}
                      following={followingIds.has(o.id)}
                      onToggle={() => toggleFollow(o.id)}
                      onNavigate={() => setOpen(false)}
                    />
                  </div>
                ))}
              </div>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-0.5 w-full border-t border-border-light py-2.5 text-center text-[13px] font-semibold text-primary transition-colors hover:bg-surface"
                >
                  See more ({hiddenCount})
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
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
  const [myPosses, setMyPosses] = useState([]) // for the left-rail "Your posses" card
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

  // Posses the viewer is in — for the left-rail card. Loaded once; independent
  // of the geo-keyed feed reset above.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    api.posses.mine().then((rows) => {
      if (!cancelled) setMyPosses(rows)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

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
    // Never suggest the viewer themselves — you can't follow your own account
    // (the backend 422s it), so a Follow button on your own row is a dead end.
    .filter((o) => o.id !== user?.id)
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

            {myPosses.length > 0 && (
              <SidebarCard title="Your posses">
                <div className="space-y-3.5">
                  {myPosses.slice(0, 4).map((p) => (
                    <Link
                      key={p.id}
                      to={`/posse/${p.id}`}
                      className="group flex items-center gap-3"
                    >
                      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
                        <Users size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink group-hover:text-primary">
                          {p.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-muted">
                          {p.event?.title ?? 'Event'}
                          {p.viewer_status === 'pending' && ' · requested'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </SidebarCard>
            )}

            <SidebarCard title="Suggested follows">
              <div className="space-y-3.5">
                {suggested.map((o) => (
                  <FollowRow
                    key={o.id}
                    user={o}
                    following={followingIds.has(o.id)}
                    onToggle={() => toggleFollow(o.id)}
                    bareHandle
                  />
                ))}
              </div>
            </SidebarCard>
          </div>
        </aside>

        {/* center column */}
        <div className="w-full max-w-[600px] flex-1">
          {/* people search — pinned at the top of the feed. Matches surface in a
              dropdown below the input (preview of a few, "See more" to expand),
              leaving the stories row, composer, and posts below untouched. */}
          <PeopleSearch />

          {/* stories scroll horizontally *inside* this column */}
          <div className="mt-4 rounded-card border border-border-light bg-card-bg p-4 shadow-card">
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
            className="mt-6 flex w-full items-center gap-3 rounded-card border border-border-light bg-card-bg px-4 py-3.5 text-left shadow-card transition-colors hover:border-primary"
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
                className="mt-4 inline-flex h-10 items-center rounded-button bg-[#ffffff] px-4 text-sm font-semibold text-primary transition-transform active:scale-95"
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
