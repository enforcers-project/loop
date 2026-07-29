import { useCallback, useEffect, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { cn, timeAgo } from '../lib/utils'

// Community ratings + reviews for an event (planning §7 add-on).
// Attendees who were checked in on a past event can leave a 1-5 star rating
// for the event and, optionally, a rating for its organizer plus a written
// review. Non-attendees only see the aggregate + the list.
//
// The composer only renders when the backend confirms eligibility
// (summary.eligibility.eligible = true) — mirrors the backend guard so a user
// who never actually attended can never see the form, even by fiddling.

const REASON_MESSAGE = {
  not_authenticated: 'Sign in to leave a review.',
  not_past: 'Reviews open once the event has happened.',
  not_attended: 'Only checked-in attendees can review this event.',
}

/**
 * A row of five stars used both for input (interactive) and display (readOnly).
 * On the input surface, hovering previews the score without committing so the
 * user sees exactly what they're about to save; keyboard users get the same
 * feedback via focus.
 */
export function StarRating({ value = 0, onChange, size = 22, readOnly = false, label, className }) {
  const [hover, setHover] = useState(0)
  // Read-only display honors fractional values (4.5 → 4½ stars). Interactive
  // input can only ever land on a whole star, so we snap the preview integer.
  const shown = readOnly ? Math.max(0, Math.min(5, value)) : hover || value
  const stars = [1, 2, 3, 4, 5]
  return (
    <div
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={label ?? (readOnly ? `${value} out of 5 stars` : 'Rating')}
      className={cn('inline-flex items-center gap-0.5', className)}
      onMouseLeave={readOnly ? undefined : () => setHover(0)}
    >
      {stars.map((n) => {
        if (readOnly) {
          // Fraction of THIS star that should be amber: 1 if `shown` covers it
          // entirely, 0 if `shown` hasn't reached it, otherwise the leftover
          // (e.g. shown=4.5 → star 5 gets 0.5). Rendered as an empty outline
          // with an amber overlay clipped to that fraction so half-stars,
          // quarter-stars, etc. all read as a partial fill on the same glyph.
          const fill = Math.max(0, Math.min(1, shown - (n - 1)))
          return (
            <span key={n} className="relative inline-block" aria-hidden="true">
              <Star size={size} strokeWidth={1.6} className="fill-transparent text-border-light" />
              {fill > 0 && (
                <span
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star size={size} strokeWidth={1.6} className="fill-amber-400 text-amber-400" />
                </span>
              )}
            </span>
          )
        }
        // Interactive stars — always whole. Fill = whole-star preview.
        const filled = n <= shown
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange?.(n)}
            className="cursor-pointer rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Star
              size={size}
              strokeWidth={1.6}
              className={cn(
                'transition-colors',
                filled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-border-light',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Vertical five-stem distribution — one stem per star bucket 1..5, height
 * proportional to that bucket's share of the total. Reads as "the shape of
 * what people gave", rather than the horizontal bar-chart histogram every
 * review page ships. Fills use the same amber as the stars so the panel reads
 * as one system rather than two.
 */
function Distribution({ histogram, total }) {
  return (
    <div className="flex h-16 items-end gap-1.5" role="img" aria-label="Rating distribution">
      {[1, 2, 3, 4, 5].map((n) => {
        const count = histogram?.[n] ?? 0
        const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 4
        return (
          <div key={n} className="flex w-3 flex-col items-center gap-1">
            <span
              className={cn(
                'w-full rounded-sm transition-colors',
                count > 0 ? 'bg-amber-400' : 'bg-surface',
              )}
              style={{ height: `${pct}%` }}
            />
            <span className="text-[10px] font-medium tabular-nums text-text-muted">{n}</span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Composer — only mounted when the caller is eligible. Pre-fills from the
 * caller's existing review if there is one, so editing is a simple
 * "adjust + save" rather than a fresh form.
 */
function ReviewComposer({ hasOrganizer, existing, onSubmit, onDelete, saving }) {
  const [eventRating, setEventRating] = useState(existing?.event_rating ?? 0)
  const [organizerRating, setOrganizerRating] = useState(existing?.organizer_rating ?? 0)
  const [body, setBody] = useState(existing?.body ?? '')

  const canSubmit = eventRating >= 1 && !saving
  const isEdit = Boolean(existing)

  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      eventRating,
      organizerRating: organizerRating > 0 ? organizerRating : null,
      body: body.trim() || null,
    })
  }

  return (
    <div className="rounded-card border border-border-light bg-white">
      <div className="border-b border-border-light px-5 py-4">
        <p className="font-display text-lg font-semibold text-ink">
          {isEdit ? 'Your review' : 'You were there'}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          Your name and stars appear publicly on this event.
        </p>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                The event
              </span>
              <span className="text-xs tabular-nums text-text-muted">
                {eventRating > 0 ? `${eventRating}/5` : 'required'}
              </span>
            </div>
            <StarRating
              value={eventRating}
              onChange={setEventRating}
              size={28}
              label="Rate the event"
              className="mt-2"
            />
          </div>
          {hasOrganizer && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  The organizer
                </span>
                <span className="text-xs tabular-nums text-text-muted">
                  {organizerRating > 0 ? `${organizerRating}/5` : 'optional'}
                </span>
              </div>
              <StarRating
                value={organizerRating}
                onChange={setOrganizerRating}
                size={28}
                label="Rate the organizer"
                className="mt-2"
              />
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
            Say more
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What stood out? What would you tell someone thinking of going?"
            className="w-full resize-y rounded-input border border-border-light bg-white px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-placeholder focus:border-primary"
          />
          <span className="mt-1 block text-right text-[11px] tabular-nums text-text-muted">
            {body.length}/2000
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-border-light px-5 py-3">
        {isEdit ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:opacity-80"
          >
            <Trash2 size={15} /> Remove
          </button>
        ) : (
          <span className="text-xs text-text-muted">Only visible after you post.</span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-button bg-primary px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Saving…' : isEdit ? 'Save' : 'Post'}
        </button>
      </div>
    </div>
  )
}

/**
 * One row in the reviews list — avatar, name, both scores (event + organizer
 * when present), the timestamp, and the review body.
 */
function ReviewRow({ review }) {
  const author = review.user
  const when = timeAgo(review.updated_at || review.created_at)
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <img
        src={author?.avatar_url || 'https://i.pravatar.cc/150?img=1'}
        alt=""
        className="h-9 w-9 flex-shrink-0 rounded-full bg-surface object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-ink">
            {author?.display_name || 'Attendee'}
          </span>
          <StarRating value={review.event_rating} readOnly size={13} />
          {review.organizer_rating != null && (
            <span className="inline-flex items-baseline gap-1 text-[11px] text-text-muted">
              <span className="uppercase tracking-wider">Host</span>
              <StarRating value={review.organizer_rating} readOnly size={11} />
            </span>
          )}
          {when && <span className="ml-auto text-xs text-text-muted">{when}</span>}
        </div>
        {review.body && (
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
            {review.body}
          </p>
        )}
      </div>
    </li>
  )
}

export function EventReviews({ eventId, organizerId }) {
  const { user } = useApp()
  const toast = useToast()
  const [summary, setSummary] = useState(null)
  const [reviews, setReviews] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSummary = useCallback(() => {
    if (!eventId) return
    api.eventReviewSummary(eventId).then(setSummary)
  }, [eventId])

  const loadFirstPage = useCallback(() => {
    if (!eventId) return
    api.eventReviews(eventId).then(({ data, nextCursor }) => {
      setReviews(data ?? [])
      setNextCursor(nextCursor ?? null)
    })
  }, [eventId])

  useEffect(() => {
    loadSummary()
    loadFirstPage()
  }, [loadSummary, loadFirstPage])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const { data, nextCursor: next } = await api.eventReviews(eventId, { cursor: nextCursor })
      setReviews((prev) => [...(prev ?? []), ...(data ?? [])])
      setNextCursor(next ?? null)
    } finally {
      setLoadingMore(false)
    }
  }

  const onSubmit = async ({ eventRating, organizerRating, body }) => {
    setSaving(true)
    try {
      const saved = await api.submitEventReview(eventId, { eventRating, organizerRating, body })
      toast.success(summary?.my_review ? 'Review updated' : 'Thanks for your review')
      // Refresh both — the aggregate needs to include the new row, and the list
      // must show the caller's version at the top (server-sorted by createdAt).
      loadSummary()
      loadFirstPage()
      return saved
    } catch (err) {
      if (err?.code === 'NOT_ELIGIBLE') {
        toast.error(err.message || 'Only checked-in attendees can review this event')
      } else if (err?.code === 'PROFANITY_BLOCKED') {
        toast.error(err.message)
      } else {
        toast.error(err?.message || 'Could not save your review')
      }
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    setSaving(true)
    try {
      await api.deleteEventReview(eventId)
      toast.success('Review removed')
      loadSummary()
      loadFirstPage()
    } catch (err) {
      toast.error(err?.message || 'Could not remove review')
    } finally {
      setSaving(false)
    }
  }

  if (!summary) {
    return (
      <section className="mx-auto max-w-[860px]">
        <SectionHeading count={null} />
        <p className="mt-4 text-sm text-text-muted">Loading…</p>
      </section>
    )
  }

  const count = summary.count ?? 0
  const eventAvg = summary.event_avg
  const organizerAvg = summary.organizer_avg
  const eligible = summary.eligibility?.eligible === true
  const reasonKey = summary.eligibility?.reason
  const gateMessage = !user ? REASON_MESSAGE.not_authenticated : REASON_MESSAGE[reasonKey]

  const hasOrganizer = Boolean(organizerId ?? summary.organizer_id)
  const hasScore = eventAvg != null && count > 0

  return (
    <section id="reviews" className="mx-auto max-w-[860px] scroll-mt-20">
      <SectionHeading count={count} />

      {/* Score panel — score at display scale on the left, five-stem
          distribution on the right. When there's no data yet, the panel
          shrinks to a single quiet line so the empty page doesn't feel like
          a broken chart. */}
      {hasScore ? (
        <div className="mt-5 rounded-card border border-border-light bg-white p-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-6xl font-bold leading-none text-ink tabular-nums">
                  {eventAvg.toFixed(1)}
                </span>
                <span className="text-sm text-text-muted">out of 5</span>
              </div>
              <div className="mt-3">
                <StarRating value={eventAvg} readOnly size={18} />
              </div>
              <p className="mt-2 text-xs text-text-muted">
                from {count} {count === 1 ? 'person who' : 'people who'} attended
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Distribution histogram={summary.histogram} total={count} />
              {hasOrganizer && organizerAvg != null && (
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <span className="uppercase tracking-wider">Host</span>
                  <StarRating value={organizerAvg} readOnly size={11} />
                  <span className="font-semibold text-ink tabular-nums">
                    {organizerAvg.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          No one's reviewed this yet — attendees can rate it after the event.
        </p>
      )}

      {/* Composer OR the gate line. Gate copy is one sentence, no icon, so it
          reads as a note rather than an alert. */}
      <div className="mt-6">
        {eligible ? (
          <ReviewComposer
            hasOrganizer={hasOrganizer}
            existing={summary.my_review}
            onSubmit={onSubmit}
            onDelete={onDelete}
            saving={saving}
          />
        ) : (
          gateMessage && (
            <p className="rounded-card bg-surface px-4 py-3 text-sm text-text-secondary">
              {gateMessage}
            </p>
          )
        )}
      </div>

      {/* Review list. Rows are separated by a hairline rule rather than card
          shadows — a review is text from a person, not a card. */}
      {reviews === null ? (
        <p className="mt-6 text-sm text-text-muted">Loading…</p>
      ) : reviews.length > 0 ? (
        <>
          <ul className="mt-6 divide-y divide-border-light">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
          {nextCursor && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm font-semibold text-primary hover:opacity-80 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}

/** Section heading shared by loading and loaded states. */
function SectionHeading({ count }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-2xl font-bold text-ink">Reviews</h2>
      {count != null && count > 0 && (
        <span className="text-sm text-text-muted tabular-nums">
          {count} {count === 1 ? 'review' : 'reviews'}
        </span>
      )}
    </div>
  )
}
