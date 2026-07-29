import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { timeAgo } from '../lib/utils'
import { CommentReplies } from './CommentReplies'
import { HiddenPlaceholder, ReportButton } from './ReportMenu'

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
  // Reply tally kept alongside the top-level list so the header count includes
  // replies (events have no denormalized comment_count, so we sum client-side:
  // top-level comments + this running reply delta).
  const [replyTally, setReplyTally] = useState(0)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  // Ids the viewer has reported in this session — render the Undo placeholder
  // in place of each so the item doesn't just disappear (Instagram pattern).
  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const setHidden = (id, on) =>
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

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
    } catch (err) {
      // Filter-block gets a specific message; everything else uses the
      // generic retry copy so we don't leak backend internals to the user.
      if (err?.code === 'PROFANITY_BLOCKED' || err?.code === 'RATE_LIMITED') {
        toast.error(err.message)
      } else {
        toast.error('Could not post your comment. Try again.')
      }
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

  // Total = top-level comments + their replies (from each comment's replyCount)
  // + this session's reply add/deletes, so the header matches the backend, which
  // counts replies as comments too.
  const baseReplies = (comments ?? []).reduce((sum, c) => sum + (c.replyCount ?? 0), 0)
  const count = (comments?.length ?? 0) + baseReplies + replyTally

  // Reply adapter for CommentReplies — bound to this event's endpoints. Delete
  // is the shared DELETE /api/comments/:id (author or organizer).
  const replyApi = {
    list: (parentId) => api.eventComments(eventId, { parentId }),
    add: (body, parentId) => api.addEventComment(eventId, body, parentId),
    remove: (commentId) => api.deleteComment(commentId),
  }
  const canDeleteReply = (r) =>
    (user?.id && (r.authorId === user.id || organizerId === user.id)) || false

  return (
    <section className="mx-auto max-w-[860px]">
      <h2 className="font-display text-2xl font-bold text-ink">
        Comments{count > 0 ? ` (${count})` : ''}
      </h2>

      {/* Composer — always on top so the primary action sits above the fold of
          the section. requireAuth() gates the actual post. */}
      <div className="mt-4 flex items-center gap-2 rounded-card border border-border-light bg-card-bg px-4 py-2.5">
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
            if (hiddenIds.has(c.id)) {
              return (
                <li key={c.id}>
                  <HiddenPlaceholder
                    variant="row"
                    targetType="comment"
                    targetId={c.id}
                    onRestored={(id) => setHidden(id, false)}
                  />
                </li>
              )
            }
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
                    {when && <span className="text-xs text-text-muted">· {when}</span>}
                    <div className="ml-auto flex items-center gap-1">
                      {canDelete && (
                        <button
                          onClick={() => remove(c)}
                          className="text-text-muted transition-colors hover:text-accent"
                          aria-label="Delete comment"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                      <ReportButton
                        isOwn={!!user?.id && c.authorId === user.id}
                        targetType="comment"
                        targetId={c.id}
                        onReported={(id) => setHidden(id, true)}
                        className="h-7 w-7"
                        iconSize={15}
                      />
                    </div>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
                    {c.text}
                  </p>
                  <CommentReplies
                    comment={c}
                    api={replyApi}
                    canDelete={canDeleteReply}
                    currentUserId={user?.id}
                    onCountChange={(delta) => setReplyTally((t) => t + delta)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
