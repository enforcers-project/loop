import { useState } from 'react'
import { Bookmark, Heart, MessageCircle, Plus, Send } from 'lucide-react'
import { cn, formatCount, pluralize, timeAgo } from '../lib/utils'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { VerifiedBadge } from './primitives'
import { EventImage } from './EventImage'

/* --------------------------------------------------------------------------
   StoriesRow — horizontal avatar ring row; labels allow 2 lines, w-16.
   `onOpen(story)` fires when a ring is tapped so the parent can mark it viewed.
   Rings the caller has already fully viewed render in a muted gray instead of
   the gradient.
-------------------------------------------------------------------------- */
export function StoriesRow({ stories, onOpen }) {
  return (
    <div className="scrollbar-hide -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
      {stories.map((s, i) => (
        <button
          key={s.id ?? i}
          onClick={() => !s.isYou && onOpen?.(s)}
          className="flex w-[68px] flex-shrink-0 flex-col items-center gap-1.5"
          aria-label={s.isYou ? 'Add to your story' : `${s.name}'s story`}
        >
          <span
            className={cn(
              'relative grid h-16 w-16 place-items-center rounded-full p-[3px]',
              s.isYou
                ? 'bg-border-light'
                : s.allViewed
                  ? 'bg-border-light'
                  : 'bg-gradient-to-tr from-accent via-primary to-networking',
            )}
          >
            <img
              src={s.avatar}
              alt=""
              className="h-full w-full rounded-full border-2 border-white bg-surface object-cover"
            />
            {s.isYou && (
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-primary text-white">
                <Plus size={12} />
              </span>
            )}
          </span>
          <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-text-secondary">
            {s.isYou ? 'Your story' : s.name}
          </span>
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------------
   PostCard — Instagram-style: header + full image + action row + comments.
   Like state is seeded from the backend (`post.likedByMe` / `post.likes`) and
   flips optimistically, reconciling against the count the API returns. The
   comment composer posts to /api/posts/:id/comments and prepends the result.
-------------------------------------------------------------------------- */
export function PostCard({ post }) {
  const { requireAuth, user } = useApp()
  const [liked, setLiked] = useState(!!post.likedByMe)
  const [likeCount, setLikeCount] = useState(post.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState(post.comments ?? [])
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const org = post.organizer

  const iconBtn = 'grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-surface'
  const when = timeAgo(post.timeAgo) || post.timeAgo

  // Optimistic like: flip + adjust the count immediately, then reconcile against
  // the server's authoritative count. Roll back both on failure.
  const onLike = async () => {
    if (!requireAuth()) return
    const next = !liked
    setLiked(next)
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)))
    try {
      const res = next ? await api.likePost(post.id) : await api.unlikePost(post.id)
      if (res?.like_count != null) setLikeCount(res.like_count)
    } catch {
      // Roll back the optimistic flip.
      setLiked(!next)
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)))
    }
  }

  const onSave = () => requireAuth() && setSaved((v) => !v)

  const submitComment = async () => {
    if (posting) return
    if (!requireAuth()) return
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    try {
      const created = await api.addComment(post.id, text)
      // Backend returns the created comment; fall back to a local echo so the
      // UI updates even if the shape is thin.
      setComments((prev) => [
        ...prev,
        created?.id ? created : { id: `local-${prev.length}`, author: user?.name ?? 'You', text },
      ])
      setDraft('')
    } catch {
      // Leave the draft in place so the user can retry.
    } finally {
      setPosting(false)
    }
  }

  return (
    <article className="overflow-hidden rounded-card border border-border-light bg-white shadow-card">
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <img
          src={org?.avatar}
          alt=""
          className="h-11 w-11 flex-shrink-0 rounded-full bg-surface object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold text-ink">{org?.name}</span>
            {org?.verified && <VerifiedBadge size={14} />}
          </div>
          {when && <span className="text-xs text-text-muted">{when} ago</span>}
        </div>
      </div>

      {/* image */}
      <div className="relative aspect-square w-full bg-surface">
        <EventImage
          src={post.image}
          alt={post.caption}
          category={post.event?.category}
          title={org?.name}
          iconSize={48}
        />
      </div>

      {/* action row — even spacing, larger tap targets */}
      <div className="flex items-center gap-1 px-3 pt-2.5">
        <button onClick={onLike} className={iconBtn} aria-label="Like" aria-pressed={liked}>
          <Heart
            size={22}
            className={cn('transition-colors', liked ? 'fill-accent text-accent' : 'text-ink')}
          />
        </button>
        <button className={iconBtn} aria-label="Comment">
          <MessageCircle size={22} className="text-ink" />
        </button>
        <button className={iconBtn} aria-label="Share">
          <Send size={20} className="text-ink" />
        </button>
        <button
          onClick={onSave}
          className={cn(iconBtn, 'ml-auto')}
          aria-label={saved ? 'Remove bookmark' : 'Bookmark'}
          aria-pressed={saved}
        >
          <Bookmark size={22} className={cn(saved ? 'fill-primary text-primary' : 'text-ink')} />
        </button>
      </div>

      {/* likes + caption + comments */}
      <div className="space-y-1.5 px-4 pb-2 pt-1.5">
        <div className="text-sm font-semibold text-ink">
          {formatCount(likeCount)} {pluralize(likeCount, 'like')}
        </div>
        <p className="text-sm leading-relaxed text-text-primary">
          <span className="font-semibold">{org?.handle?.replace('@', '')}</span> {post.caption}
        </p>
        {comments.map((c) => (
          <p key={c.id} className="text-sm leading-relaxed text-text-secondary">
            <span className="font-semibold text-ink">{c.author}</span> {c.text}
          </p>
        ))}
      </div>

      {/* comment composer */}
      <div className="flex items-center gap-2 border-t border-border-light px-4 py-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitComment()}
          placeholder="Add a comment…"
          aria-label="Add a comment"
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-placeholder"
        />
        <button
          onClick={submitComment}
          disabled={posting || !draft.trim()}
          className="text-sm font-semibold text-primary transition-opacity disabled:opacity-40"
        >
          Post
        </button>
      </div>
    </article>
  )
}
