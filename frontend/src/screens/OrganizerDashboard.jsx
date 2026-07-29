import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ExternalLink, UserCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { PageLoader, Spinner } from '../components/primitives'
import { StatTile } from '../components/analytics/AnalyticsPrimitives'
import { cn } from '../lib/utils'

// How many attendees to pull per page. The list is organizer-scoped (only your
// own event's RSVPs) so it stays small; a "Load more" button is plenty — no
// need for the infinite-scroll observer the public social feed uses.
const PAGE_SIZE = 30

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'going', label: 'Going' },
  { key: 'interested', label: 'Interested' },
  { key: 'waitlisted', label: 'Waitlisted' },
]

// Status → pill tint. Mirrors the analytics palette (going=success,
// interested=primary) with amber for the waitlist and a muted grey for the
// rare cancelled row a status filter might surface.
const STATUS_PILL = {
  going: 'bg-success/10 text-success',
  interested: 'bg-primary/10 text-primary',
  waitlisted: 'bg-amber-500/10 text-amber-600',
  cancelled: 'bg-surface text-text-muted',
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * OrganizerDashboard (work-plan #32) — the event owner's roster of who RSVP'd,
 * with one-tap check-in. Backend is owner-gated (GET/PATCH both 403 for a
 * non-owner), and check-in is intentionally one-way: PATCH sets attended=true
 * and fires the ranker's top-weight `attend` signal (an append-only interaction
 * event), so there's no "un-check-in" — the button becomes a static "Checked
 * in" chip once tapped. Reached from the per-event analytics header.
 */
export function OrganizerDashboard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user, authReady, role } = useApp()

  const [status, setStatus] = useState('all')
  // userIds with an in-flight check-in — drives the per-row spinner and guards
  // against a double-tap firing two PATCHes.
  const [checkingIn, setCheckingIn] = useState(() => new Set())

  // Organizers only. Attendees who guess the URL get bounced to their profile
  // rather than a 403 wall — same treatment as the analytics screens.
  useEffect(() => {
    if (authReady && role !== 'organizer') navigate('/profile', { replace: true })
  }, [authReady, role, navigate])

  // Event header (title / flyer / ownership). Throws on 403/404 so a wrong-owner
  // or missing event surfaces as an error panel instead of a blank roster.
  const {
    data: event,
    isLoading: eventLoading,
    error: eventError,
  } = useQuery({
    enabled: !!id,
    queryKey: ['event', id],
    queryFn: () => api.event(id),
  })

  // Confirm the caller owns the event. An organizer viewing someone else's
  // event (or an external-organizer event with no owner) sees an access panel —
  // the RSVP client swallows its own 403 into an empty envelope, so this is the
  // check that actually gates the roster.
  const notOwner = !!event && event.organizerId !== user?.id

  // Cursor-paginated roster. useInfiniteQuery owns the loading/reset/append
  // lifecycle (no hand-rolled effect + setState), and re-keys on `status` so
  // switching tabs refetches from the first page automatically. `attended` on
  // an item flips optimistically via the mutation's cache write below.
  const rosterStatus = status === 'all' ? undefined : status
  const {
    data: rosterData,
    isLoading: rosterLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    enabled: !!id && !notOwner,
    queryKey: ['event-rsvps', id, status],
    queryFn: ({ pageParam }) =>
      api.eventRsvps(id, { status: rosterStatus, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  // Flatten pages, de-duping by row id in case the roster shifted between pages.
  const pages = rosterData?.pages ?? []
  const seen = new Set()
  const rows = []
  for (const p of pages) {
    for (const r of p.data ?? []) {
      if (!seen.has(r.id)) {
        seen.add(r.id)
        rows.push(r)
      }
    }
  }
  // Whole-event counts come back identically on every page; the first is fine.
  const counts = pages[0]?.counts ?? { going: 0, interested: 0, waitlisted: 0, attended: 0 }

  // Optimistically flip the row to checked-in in the query cache, then PATCH.
  // On failure the cache is rolled back and we toast — the server is the source
  // of truth, the optimistic write is just instant feedback. We patch attended
  // on the row AND bump counts.attended across every cached page so the "Checked
  // in" KPI tracks without a refetch.
  const patchCache = (userId, { attended, checkedInAt, deltaAttended }) =>
    queryClient.setQueryData(['event-rsvps', id, status], (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          counts: {
            ...page.counts,
            attended: Math.max(0, (page.counts?.attended ?? 0) + deltaAttended),
          },
          data: (page.data ?? []).map((r) =>
            r.user?.id === userId ? { ...r, attended, checked_in_at: checkedInAt } : r,
          ),
        })),
      }
    })

  const checkIn = useMutation({
    mutationFn: (userId) => api.checkInAttendee(id, userId),
    onSuccess: (_data, userId) => {
      const who = rows.find((r) => r.user?.id === userId)?.user?.display_name || 'Attendee'
      toast.success(`${who} checked in`)
    },
    onError: (err, userId) => {
      // Roll the optimistic flip back.
      patchCache(userId, { attended: false, checkedInAt: null, deltaAttended: -1 })
      toast.error(
        err?.status === 403
          ? 'Only the organizer can check attendees in.'
          : 'Could not check in. Please try again.',
      )
    },
  })

  const handleCheckIn = (attendee) => {
    const userId = attendee.user?.id
    if (!userId || attendee.attended || checkingIn.has(userId)) return
    setCheckingIn((prev) => new Set(prev).add(userId))
    // Optimistic flip. new Date().toISOString() is fine here (a click handler,
    // not render) for an instant "checked in at HH:MM" label.
    patchCache(userId, {
      attended: true,
      checkedInAt: new Date().toISOString(),
      deltaAttended: 1,
    })
    checkIn.mutate(userId, {
      onSettled: () =>
        setCheckingIn((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        }),
    })
  }

  const totalRsvps = (counts.going ?? 0) + (counts.interested ?? 0) + (counts.waitlisted ?? 0)
  const attendanceRate =
    counts.going > 0 ? Math.round(((counts.attended ?? 0) / counts.going) * 100) : null

  if (!authReady || (eventLoading && !event)) return <PageLoader label="Loading dashboard" />

  if (eventError || notOwner) {
    const message =
      eventError?.status === 403 || notOwner
        ? "You don't have access to this event's dashboard."
        : eventError?.message || 'Could not load this event.'
    return (
      <div className="loop-container py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-ink"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-card border border-accent/40 bg-accent/5 p-6 text-sm text-accent">
          {message}
        </div>
      </div>
    )
  }
  if (!event) return null

  return (
    <div className="loop-container space-y-6 py-8">
      {/* Back to this event's analytics */}
      <div className="flex items-center justify-between gap-4">
        <Link
          to={`/organizer/events/${event.id}/analytics`}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-ink"
        >
          <ArrowLeft size={16} /> Analytics
        </Link>
        <Link
          to={`/event/${event.id}`}
          className="inline-flex items-center gap-1 rounded-button border border-border-light bg-card-bg px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          View event <ExternalLink size={14} />
        </Link>
      </div>

      {/* Event header */}
      <header className="flex flex-wrap items-start gap-4 rounded-card border border-border-light bg-card-bg p-5 shadow-card">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface">
          {event.poster ? (
            <img src={event.poster} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Attendees & check-in
          </div>
          <h1 className="mt-1 text-xl font-semibold text-ink">{event.title}</h1>
          <div className="mt-1 text-sm text-text-muted">
            {event.date} · {totalRsvps} RSVP{totalRsvps === 1 ? '' : 's'}
          </div>
        </div>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Going" value={counts.going ?? 0} />
        <StatTile label="Interested" value={counts.interested ?? 0} />
        <StatTile label="Waitlisted" value={counts.waitlisted ?? 0} />
        <StatTile
          label="Checked in"
          value={counts.attended ?? 0}
          hint={attendanceRate != null ? `${attendanceRate}% of Going` : undefined}
        />
      </section>

      {/* Status filter */}
      <div
        role="tablist"
        aria-label="RSVP status"
        className="inline-flex rounded-pill border border-border-light bg-card-bg p-1 shadow-card"
      >
        {STATUS_TABS.map((t) => {
          const active = t.key === status
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(t.key)}
              className={cn(
                'rounded-pill px-3 py-1 text-sm font-medium transition-colors',
                active ? 'bg-primary text-white' : 'text-text-secondary hover:text-ink',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Roster */}
      <section className="overflow-hidden rounded-card border border-border-light bg-card-bg shadow-card">
        {rosterLoading ? (
          <div className="grid place-items-center py-16">
            <Spinner label="Loading attendees" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-text-muted">
            {status === 'all' ? 'No RSVPs yet.' : `No ${status} RSVPs.`}
          </p>
        ) : (
          <ul className="divide-y divide-border-light">
            {rows.map((r) => (
              <AttendeeRow
                key={r.id}
                row={r}
                busy={checkingIn.has(r.user?.id)}
                onCheckIn={() => handleCheckIn(r)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Load more */}
      {hasNextPage && !rosterLoading && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="inline-flex items-center gap-2 rounded-button border border-border-light bg-card-bg px-4 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {isFetchingNextPage && <Spinner size="sm" />}
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function AttendeeRow({ row, busy, onCheckIn }) {
  const u = row.user ?? {}
  const guests = row.guests_count ?? 0
  const pill = STATUS_PILL[row.status] ?? STATUS_PILL.cancelled

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <img
        src={u.avatar_url || 'https://i.pravatar.cc/150?img=12'}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-border-light bg-surface object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">
            {u.display_name || 'Someone'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {u.handle && <span className="truncate">@{u.handle}</span>}
          {guests > 0 && (
            <span className="shrink-0">
              +{guests} guest{guests === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <span
        className={cn(
          'hidden shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium capitalize sm:inline-block',
          pill,
        )}
      >
        {row.status}
      </span>

      {row.attended ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-button bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <Check size={15} />
          <span className="hidden sm:inline">Checked in</span>
          {row.checked_in_at && (
            <span className="hidden text-xs font-normal text-success/70 md:inline">
              {fmtTime(row.checked_in_at)}
            </span>
          )}
        </span>
      ) : (
        <button
          onClick={onCheckIn}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-button bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Spinner size="sm" /> : <UserCheck size={15} />}
          <span className="hidden sm:inline">Check in</span>
        </button>
      )}
    </li>
  )
}
