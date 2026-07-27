import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { m, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { api, DEFAULT_AVATAR } from '../lib/api'
import { formatCount, pluralize } from '../lib/utils'
import { FollowBtn, Spinner, VerifiedBadge } from './primitives'
import { backdrop, dialog, fadeUp, staggerParent } from '../lib/motion'

/* Every public profile — organizer or attendee — renders through the
   /organizer/:id route (OrganizerProfile normalizes any backend user shape).
   /profile is the owner's own editable screen and takes no id. */
function profilePath(u) {
  return `/organizer/${u.id}`
}

/* Shared identity block (avatar + username + display name + verified) for a
   people result row. Instagram-style: the @username sits on top in ink weight
   as the primary handle, and the display name goes muted underneath. A user
   without a display name falls back to their follower count so the row still
   has a secondary line to read. Legacy rows with no handle fall back to
   showing the display name as the primary line. */
function Identity({ user }) {
  const primary = user.handle ? `@${user.handle}` : (user.display_name ?? 'Loop member')
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img
        src={user.avatar_url || DEFAULT_AVATAR}
        alt=""
        className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate font-semibold text-ink">{primary}</span>
          {user.is_verified && <VerifiedBadge size={14} />}
        </div>
        {user.handle && user.display_name ? (
          <p className="truncate text-[13px] text-text-secondary">{user.display_name}</p>
        ) : (
          <p className="truncate text-[13px] text-text-muted">
            {formatCount(user.follower_count ?? 0)}{' '}
            {pluralize(user.follower_count ?? 0, 'follower')}
          </p>
        )}
      </div>
    </div>
  )
}

/* A single follow control wired to the app's optimistic follow state. Hidden
   when the row is the viewer's own account (can't follow yourself) or when the
   viewer is logged out (is_following === null). */
function RowFollow({ user, sm = false }) {
  const { user: me, followingIds, toggleFollow } = useApp()
  // Can't follow yourself. A logged-out viewer still sees the button; tapping it
  // routes through toggleFollow's login gate (server sends is_following=null).
  if (me?.id === user.id) return null
  const following = followingIds.has(user.id) || user.is_following === true
  return <FollowBtn sm={sm} following={following} onToggle={() => toggleFollow(user.id)} />
}

/* --------------------------------------------------------------------------
   UserResultList — full vertical list of people, the People search results on
   the Social tab. Each row is tappable (→ profile) with an inline Follow button.
-------------------------------------------------------------------------- */
export function UserResultList({ users, emptyLabel = 'No people match your search.' }) {
  const navigate = useNavigate()
  if (!users?.length) {
    return <p className="py-16 text-center text-sm text-text-muted">{emptyLabel}</p>
  }
  return (
    <m.div variants={staggerParent} initial="hidden" animate="show" className="mt-4 space-y-2">
      {users.map((u) => (
        <m.div
          key={u.id}
          variants={fadeUp}
          className="flex items-center justify-between gap-3 rounded-card border border-border-light bg-card-bg p-3 shadow-card transition-shadow hover:shadow-card-hover"
        >
          <button
            type="button"
            onClick={() => navigate(profilePath(u))}
            className="flex min-w-0 flex-1 items-center"
            aria-label={`View ${u.display_name || 'profile'}`}
          >
            <Identity user={u} />
          </button>
          <RowFollow user={u} sm />
        </m.div>
      ))}
    </m.div>
  )
}

/* --------------------------------------------------------------------------
   AttendeeStrip — a face-pile + "N going" for an event, tappable to open the
   full attendee list in a modal. Lazily fetches the first page of attendees on
   mount (public endpoint). Renders nothing until there's at least one attendee,
   so a brand-new event doesn't show an empty widget on its detail page.
-------------------------------------------------------------------------- */
export function AttendeeStrip({ eventId }) {
  const [page, setPage] = useState(null) // { users, nextCursor } | null while loading
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.eventAttendees(eventId).then((res) => {
      if (cancelled) return
      setPage(res)
      // `total` rides the raw envelope; eventAttendees drops it, so fall back to
      // the page length when the count isn't surfaced.
      setTotal(res.total ?? res.users.length)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (page === null) return null
  if (page.users.length === 0) return null

  const faces = page.users.slice(0, 5)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-card border border-border-light bg-card-bg p-3 text-left transition-shadow hover:shadow-card-hover"
        aria-label="See who's going"
      >
        <div className="flex -space-x-2">
          {faces.map((u) => (
            <img
              key={u.id}
              src={u.avatar_url || DEFAULT_AVATAR}
              alt=""
              className="h-9 w-9 rounded-full border-2 border-white object-cover"
            />
          ))}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {formatCount(total)} {pluralize(total, 'person')} going
          </p>
          <p className="text-xs text-primary">See who's going →</p>
        </div>
      </button>
      <AttendeeModal
        eventId={eventId}
        open={open}
        onClose={() => setOpen(false)}
        initialPage={page}
        total={total}
      />
    </>
  )
}

/* Full attendee list in a centered dialog. Seeds from the strip's already-loaded
   first page, then loads more on demand via the cursor. Reuses UserResultList so
   rows look identical to search results (avatar, name, Follow). */
function AttendeeModal({ eventId, open, onClose, initialPage, total }) {
  const [users, setUsers] = useState(initialPage.users)
  const [cursor, setCursor] = useState(initialPage.nextCursor)
  const [loadingMore, setLoadingMore] = useState(false)

  // Close on Escape while open — matches the app's other dismissible overlays.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.eventAttendees(eventId, cursor)
      setUsers((prev) => [...prev, ...res.users])
      setCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          variants={backdrop}
          initial="hidden"
          animate="show"
          exit="hidden"
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <m.div
            variants={dialog}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-card bg-white shadow-hero"
          >
            <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
              <h2 className="font-display text-lg font-bold text-ink">
                {formatCount(total)} going
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1 text-text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <UserResultList users={users} emptyLabel="No one's going yet." />
              {cursor && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-button border border-border-light py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-text-muted disabled:opacity-60"
                >
                  {loadingMore ? <Spinner size="sm" /> : 'Show more'}
                </button>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/* --------------------------------------------------------------------------
   FollowListModal — a centered dialog listing a user's followers OR the people
   they follow, chosen by `edge` ('followers' | 'following'). Fetches its own
   first page when opened (so the parent only tracks which list is open), then
   paginates on demand via the cursor. Reuses UserResultList so each row looks
   identical to search results — avatar, name, and a live Follow button.
-------------------------------------------------------------------------- */
export function FollowListModal({ userId, edge, open, onClose }) {
  const [users, setUsers] = useState(null) // null = loading the first page
  const [cursor, setCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const title = edge === 'followers' ? 'Followers' : 'Following'
  const emptyLabel = edge === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'
  const fetchPage = edge === 'followers' ? api.followerList : api.followingList

  // Render-time reset (the app's setState-on-prop-change pattern): when the open
  // list changes — opened, closed, or switched between followers/following —
  // blank the page so the spinner shows before the new fetch lands, instead of
  // flashing the previous list. Keyed so the fetch effect below only runs once
  // per (open, user, edge).
  const listKey = open ? `${userId}|${edge}` : ''
  const [loadedKey, setLoadedKey] = useState('')
  if (loadedKey !== listKey) {
    setLoadedKey(listKey)
    setUsers(null)
    setCursor(null)
  }

  // Fetch the first page whenever an open list is selected. State is only set in
  // the async tail, so no cascading render on mount.
  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    fetchPage(userId).then((res) => {
      if (cancelled) return
      setUsers(res.users)
      setCursor(res.nextCursor)
    })
    return () => {
      cancelled = true
    }
    // fetchPage is derived from edge; listing both keeps it honest.
  }, [open, userId, edge]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape while open — matches the app's other dismissible overlays.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetchPage(userId, cursor)
      setUsers((prev) => [...(prev ?? []), ...res.users])
      setCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          variants={backdrop}
          initial="hidden"
          animate="show"
          exit="hidden"
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
        >
          <m.div
            variants={dialog}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-card bg-white shadow-hero"
          >
            <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
              <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1 text-text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {users === null ? (
                <div className="flex justify-center py-16">
                  <Spinner label={`Loading ${title.toLowerCase()}`} />
                </div>
              ) : (
                <>
                  <UserResultList users={users} emptyLabel={emptyLabel} />
                  {cursor && (
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-button border border-border-light py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-text-muted disabled:opacity-60"
                    >
                      {loadingMore ? <Spinner size="sm" /> : 'Show more'}
                    </button>
                  )}
                </>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
