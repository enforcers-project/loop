import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { pluralize, timeAgo } from '../lib/utils'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { VerifiedBadge } from './primitives'

// Reply thread under a single comment (planning §7.3, work-plan #30). The
// backend already stores one level of nesting (parent_comment_id) and both the
// event and post comment endpoints accept ?parentId / parent_comment_id; this
// is the UI that finally lets a user *see* and *post* those replies (main's
// #30 shipped only a static "N replies" count).
//
// Kept surface-agnostic via an injected `api` adapter so EventComments and the
// social PostCard share one implementation:
//   list(parentId)          → client-shaped replies (newest-first, like the API)
//   add(body, parentId)     → the created reply
//   remove(commentId)       → soft-delete (DELETE /api/comments/:id)
// `canDelete(reply)` decides whether a reply shows the trash affordance (author
// or content owner), matching the backend's auth rule.
export function CommentReplies({ comment, api, canDelete }) {
  const { requireAuth } = useApp()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [replies, setReplies] = useState([])
  const [count, setCount] = useState(comment.replyCount ?? 0)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  // Newest-first from the API → oldest-first so a thread reads top-to-bottom and
  // a freshly posted reply appends at the end.
  const fetchReplies = async () => {
    const rows = await api.list(comment.id)
    setReplies((rows ?? []).slice().reverse())
    setLoaded(true)
  }

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !loaded) await fetchReplies()
  }

  const submit = async () => {
    if (posting) return
    if (!requireAuth()) return
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    try {
      const created = await api.add(text, comment.id)
      if (created?.id) {
        setReplies((prev) => [...prev, created])
        setCount((c) => c + 1)
        setDraft('')
        setComposing(false)
        setOpen(true)
        setLoaded(true)
      }
    } catch {
      toast.error('Could not post your reply. Try again.')
    } finally {
      setPosting(false)
    }
  }

  const remove = async (reply) => {
    const prev = replies
    setReplies((list) => list.filter((r) => r.id !== reply.id))
    setCount((c) => Math.max(0, c - 1))
    try {
      await api.remove(reply.id)
    } catch {
      setReplies(prev)
      setCount((c) => c + 1)
      toast.error('Could not delete that reply.')
    }
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-3 text-xs font-semibold text-text-muted">
        <button onClick={() => setComposing((v) => !v)} className="transition-colors hover:text-ink">
          Reply
        </button>
        {count > 0 && (
          <button onClick={toggle} className="transition-colors hover:text-ink">
            {open ? 'Hide replies' : `View ${count} ${pluralize(count, 'reply')}`}
          </button>
        )}
      </div>

      {composing && (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={`Reply to ${comment.author}…`}
            aria-label="Write a reply"
            maxLength={2000}
            autoFocus
            className="min-w-0 flex-1 border-b border-border-light bg-transparent py-1 text-sm text-text-primary outline-none placeholder:text-placeholder focus:border-primary"
          />
          <button
            onClick={submit}
            disabled={posting || !draft.trim()}
            className="text-sm font-semibold text-primary transition-opacity disabled:opacity-40"
          >
            Post
          </button>
        </div>
      )}

      {open &&
        replies.map((r) => {
          const when = timeAgo(r.createdAt)
          return (
            <div key={r.id} className="mt-2 flex gap-2.5 border-l border-border-light pl-3">
              <img
                src={r.authorAvatar}
                alt=""
                className="h-7 w-7 flex-shrink-0 rounded-full bg-surface object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-ink">{r.author}</span>
                  {r.verified && <VerifiedBadge size={12} />}
                  {when && <span className="text-xs text-text-muted">· {when}</span>}
                  {canDelete?.(r) && (
                    <button
                      onClick={() => remove(r)}
                      className="ml-auto text-text-muted transition-colors hover:text-accent"
                      aria-label="Delete reply"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
                  {r.text}
                </p>
              </div>
            </div>
          )
        })}
    </div>
  )
}
