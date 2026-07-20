import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { pluralize, timeAgo } from '../lib/utils'
import { VerifiedBadge } from './primitives'

// Threaded comments on an EventDetail page (planning §7.3, work-plan #30).
// Reads GET /api/events/:id/comments, posts via POST …/comments, and lets a
// comment's author (or the event organizer) soft-delete via DELETE
// /api/comments/:id. Kept as its own component so EventDetail stays a layout
// shell and this owns all the comment state + optimistic updates.
//
// `organizerId` is passed so the organizer sees a delete affordance on every
// comment (they moderate their own event), matching the backend's auth rule
// (comment author OR event owner).
export function EventComments({ eventId, organizerId }) {
  const { user, requireAuth } = useApp()
  const toast = useToast()
  const [comments, setComments] = useState(null) // null = loading
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  // Backend returns newest-first; reverse to oldest-first so the thread reads
  // top-to-bottom and a freshly posted comment appends naturally at the end.
  const load = useCallback(() => {
    if (!eventId) return
    api.eventComments(eventId).then((list) => setComments((list ?? []).slice().reverse()))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    if (posting) return
    if (!requireAuth()) return
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    try {
      const created = await api.addEventComment(eventId, text)
      if (created?.id) {
        setComments((prev) => [...(prev ?? []), created])
        setDraft('')
      }
    } catch {
      toast.error('Could not post your comment. Try again.')
    } finally {
      setPosting(false)
    }
  }

  const remove = async (comment) => {
    // Optimistic removal; restore on failure so a rejected delete never
    // silently drops the comment from view.
    const prev = comments
    setComments((list) => (list ?? []).filter((c) => c.id !== comment.id))
    try {
      await api.deleteComment(comment.id)
    } catch {
      setComments(prev)
      toast.error('Could not delete that comment.')
    }
  }

  const count = comments?.length ?? 0

  return (
    <section className="mx-auto max-w-[860px]">
      <h2 className="font-display text-2xl font-bold text-ink">
        Comments{count > 0 ? ` (${count})` : ''}
      </h2>

      {/* Composer — always on top so the primary action sits above the fold of
          the section. requireAuth() gates the actual post. */}
      <div className="mt-4 flex items-center gap-2 rounded-card border border-border-light bg-white px-4 py-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          maxLength={2000}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-placeholder"
        />
        <button
          onClick={submit}
          disabled={posting || !draft.trim()}
          className="text-sm font-semibold text-primary transition-opacity disabled:opacity-40"
        >
          Post
        </button>
      </div>

      {/* List / empty / loading. Empty state invites the first commenter rather
          than faking activity. */}
      {comments === null ? (
        <p className="mt-4 text-sm text-text-muted">Loading comments…</p>
      ) : count === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-card border border-dashed border-border-light bg-surface px-6 py-10 text-center">
          <MessageSquare size={24} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">Be the first to say something</p>
          <p className="max-w-sm text-xs text-text-muted">
            Ask a question or share why you&apos;re excited — the organizer gets notified.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {comments.map((c) => {
            const canDelete =
              (user?.id && (c.authorId === user.id || organizerId === user.id)) || false
            const when = timeAgo(c.createdAt)
            return (
              <li key={c.id} className="flex gap-3">
                <img
                  src={c.authorAvatar}
                  alt=""
                  className="h-9 w-9 flex-shrink-0 rounded-full bg-surface object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-ink">{c.author}</span>
                    {c.verified && <VerifiedBadge size={14} />}
                    {when && <span className="text-xs text-text-muted">· {when}</span>}
                    {canDelete && (
                      <button
                        onClick={() => remove(c)}
                        className="ml-auto text-text-muted transition-colors hover:text-accent"
                        aria-label="Delete comment"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
                    {c.text}
                  </p>
                  {c.replyCount > 0 && (
                    <span className="mt-1 inline-block text-xs text-text-muted">
                      {c.replyCount} {pluralize(c.replyCount, 'reply')}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
