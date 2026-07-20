import { useState } from 'react'
import { Bookmark, Heart, ImagePlus, MessageCircle, Plus, Send, X } from 'lucide-react'
import { cn, formatCount, timeAgo } from '../lib/utils'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { inputClass, VerifiedBadge } from './primitives'
import { EventImage } from './EventImage'

const POST_KINDS = [
  { value: 'flyer', label: 'Flyer' },
  { value: 'recap', label: 'Recap' },
  { value: 'update', label: 'Update' },
]

/* --------------------------------------------------------------------------
   Composer — modal to create a post or a story. Both need a persistable image
   URL (there's no post-image upload endpoint yet), so the image is entered as a
   URL and previewed live. `onCreated(kind, result)` lets the SocialFeed prepend
   a new post or refetch its story rings without a full reload.
-------------------------------------------------------------------------- */
export function Composer({ mode = 'post', onClose, onCreated }) {
  const toast = useToast()
  const [imageUrl, setImageUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [kind, setKind] = useState('update')
  const [busy, setBusy] = useState(false)

  const isStory = mode === 'story'
  const captionMax = isStory ? 160 : 2200
  const canSubmit = imageUrl.trim() && !busy

  const submit = async () => {
    const url = imageUrl.trim()
    if (!url || busy) return
    setBusy(true)
    try {
      if (isStory) {
        await api.createStory({ mediaUrl: url, caption: caption.trim() || undefined })
        toast.success('Story posted')
        onCreated?.('story')
      } else {
        const post = await api.createPost({
          kind,
          imageUrl: url,
          caption: caption.trim() || undefined,
        })
        toast.success('Post published')
        onCreated?.('post', post)
      }
      onClose?.()
    } catch (err) {
      toast.error(
        err.message || `Could not publish ${isStory ? 'story' : 'post'}. Please try again.`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isStory ? 'Add to your story' : 'Create a post'}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-card bg-white shadow-hero"
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
          <h2 className="text-base font-bold text-ink">
            {isStory ? 'Add to your story' : 'Create a post'}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => !busy && onClose?.()}
            className="grid h-8 w-8 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* image URL + live preview */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
              {isStory ? 'Media URL' : 'Image URL'}
            </span>
            {imageUrl.trim() ? (
              <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-input bg-surface">
                <img
                  src={imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  onLoad={(e) => {
                    e.currentTarget.style.display = 'block'
                  }}
                />
              </div>
            ) : (
              <div className="mb-2 flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-input border-2 border-dashed border-border-light bg-surface text-text-muted">
                <ImagePlus size={28} />
                <span className="text-sm">Paste an image URL below</span>
              </div>
            )}
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              type="url"
              className={inputClass}
            />
          </div>

          {/* kind — posts only */}
          {!isStory && (
            <div className="flex gap-2">
              {POST_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={cn(
                    'rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors',
                    kind === k.value
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary hover:bg-border-light',
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}

          {/* caption */}
          <div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, captionMax))}
              placeholder={isStory ? 'Add a caption…' : 'Write a caption…'}
              rows={3}
              className={cn(inputClass, 'resize-none')}
            />
            <div className="mt-1 text-right text-xs text-text-muted">
              {caption.length}/{captionMax}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-border-light px-5 py-3.5">
          <button
            type="button"
            onClick={() => !busy && onClose?.()}
            className="rounded-button px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-button bg-primary px-5 py-2 text-sm font-semibold text-white transition-opacity active:scale-95 disabled:opacity-40"
          >
            {busy ? 'Posting…' : isStory ? 'Share story' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   StoriesRow — horizontal avatar ring row; labels allow 2 lines, w-16.
   `onOpen(story)` fires when a ring is tapped so the parent can mark it viewed;
   `onAddStory()` fires when the caller taps their own "Your story" tile.
   Rings the caller has already fully viewed render in a muted gray instead of
   the gradient.
-------------------------------------------------------------------------- */
export function StoriesRow({ stories, onOpen, onAddStory }) {
  return (
    <div className="scrollbar-hide -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
      {stories.map((s, i) => (
        <button
          key={s.id ?? i}
          onClick={() => (s.isYou ? onAddStory?.() : onOpen?.(s))}
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
        <div className="text-sm font-semibold text-ink">{formatCount(likeCount)} likes</div>
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
