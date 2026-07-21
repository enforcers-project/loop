import { useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  Link2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { cn, formatCount, pluralize, timeAgo } from '../lib/utils'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { inputClass, Spinner, VerifiedBadge } from './primitives'
import { EventImage } from './EventImage'
import { CommentReplies } from './CommentReplies'

const POST_KINDS = [
  { value: 'flyer', label: 'Flyer' },
  { value: 'recap', label: 'Recap' },
  { value: 'update', label: 'Update' },
]

const ACCEPT_IMAGE = 'image/png,image/jpeg,image/webp,image/gif'

/* --------------------------------------------------------------------------
   Composer — modal to create a post or a story. The image is uploaded to S3 via
   the presign flow (api.uploadSocialImage) and the resulting public URL is what
   createPost/createStory persists. When uploads aren't configured (503) the
   picker falls back to a paste-a-URL input so the feed still works in dev.
   `onCreated(kind, result)` lets the SocialFeed prepend a new post or refetch
   its story rings without a full reload.
-------------------------------------------------------------------------- */
export function Composer({ mode = 'post', onClose, onCreated }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [imageUrl, setImageUrl] = useState('') // final persisted URL (S3 or pasted)
  const [caption, setCaption] = useState('')
  const [kind, setKind] = useState('update')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Flip to a paste-a-URL input when S3 uploads aren't available (503).
  const [urlMode, setUrlMode] = useState(false)

  const isStory = mode === 'story'
  const captionMax = isStory ? 160 : 2200
  const canSubmit = imageUrl.trim() && !busy && !uploading

  // Upload the picked file to S3; on 503 (uploads unconfigured) switch to the
  // URL-input fallback instead of erroring.
  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let re-picking the same file fire onChange again
    if (!file) return
    setUploading(true)
    try {
      const url = await api.uploadSocialImage(file, isStory ? 'story' : 'post')
      setImageUrl(url)
    } catch (err) {
      if (err.status === 503) {
        setUrlMode(true)
        toast.info('Uploads unavailable — paste an image URL instead')
      } else {
        toast.error(err.message || 'Could not upload image. Please try again.')
      }
    } finally {
      setUploading(false)
    }
  }

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
          {/* image — upload to S3, with a paste-a-URL fallback when unconfigured */}
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-text-secondary">
              {isStory ? 'Story media' : 'Post image'}
            </span>

            {/* live preview once we have a URL */}
            {imageUrl.trim() && (
              <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-input bg-surface">
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setImageUrl('')}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* picker (default) or URL input (fallback) when no image yet */}
            {!imageUrl.trim() &&
              (urlMode ? (
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                  type="url"
                  autoFocus
                  className={inputClass}
                />
              ) : (
                <label
                  className={cn(
                    'flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-input border-2 border-dashed border-border-light bg-surface text-text-muted transition-colors hover:border-primary',
                    uploading && 'pointer-events-none opacity-70',
                  )}
                >
                  {uploading ? (
                    <>
                      <Spinner label="Uploading image" />
                      <span className="text-sm">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus size={28} />
                      <span className="text-sm">
                        {isStory ? 'Upload story media' : 'Upload an image'}
                      </span>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT_IMAGE}
                    className="hidden"
                    onChange={onPickFile}
                  />
                </label>
              ))}

            {/* toggle between upload and paste-a-URL */}
            {!imageUrl.trim() && !uploading && (
              <button
                type="button"
                onClick={() => setUrlMode((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Link2 size={14} />
                {urlMode ? 'Upload a file instead' : 'Paste an image URL instead'}
              </button>
            )}
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
    <div className="scrollbar-hide -mx-1 flex snap-x snap-proximity gap-4 overflow-x-auto px-1 pb-1">
      {stories.map((s, i) => (
        <button
          key={s.id ?? i}
          onClick={() => (s.isYou ? onAddStory?.() : onOpen?.(s))}
          className="flex w-[68px] flex-shrink-0 snap-start flex-col items-center gap-1.5"
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

const STORY_MS = 5000 // how long each story frame is shown before auto-advancing

/* --------------------------------------------------------------------------
   StoryViewer — full-screen Instagram-style viewer. Receives the ordered list
   of viewable groups (each `{ id, name, avatar, stories:[{id, mediaUrl,
   caption, createdAt}] }`) and the index of the group that was tapped. Frames
   auto-advance every STORY_MS; tapping the left/right half or the arrow keys
   steps between frames and rolls over into the next/previous author. Each frame
   fires `onViewed(storyId)` once so the parent can mark it seen server-side.
-------------------------------------------------------------------------- */
export function StoryViewer({ groups, startIndex = 0, onClose, onViewed }) {
  const [gi, setGi] = useState(startIndex) // current group index
  const [si, setSi] = useState(0) // current story index within the group
  const [paused, setPaused] = useState(false)
  const seenRef = useRef(new Set()) // story ids we've already reported viewed

  const group = groups[gi]
  const story = group?.stories?.[si]

  // Step forward one frame; roll into the next author, or close past the last.
  const next = () => {
    const count = group?.stories?.length ?? 0
    if (si < count - 1) {
      setSi((v) => v + 1)
    } else if (gi < groups.length - 1) {
      setGi((v) => v + 1)
      setSi(0)
    } else {
      onClose?.()
    }
  }

  // Step back one frame; roll into the previous author's last frame.
  const prev = () => {
    if (si > 0) {
      setSi((v) => v - 1)
    } else if (gi > 0) {
      const pg = gi - 1
      setGi(pg)
      setSi(Math.max(0, (groups[pg]?.stories?.length ?? 1) - 1))
    }
  }

  // Report each frame viewed exactly once as it becomes visible.
  useEffect(() => {
    if (!story?.id || seenRef.current.has(story.id)) return
    seenRef.current.add(story.id)
    onViewed?.(story.id)
  }, [story?.id, onViewed])

  // Auto-advance timer, reset whenever the frame changes; paused on hold.
  useEffect(() => {
    if (paused || !story) return
    const t = setTimeout(next, STORY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si, paused, story?.id])

  // Keyboard: arrows navigate, Esc closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si])

  if (!group || !story) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close stories"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/10"
      >
        <X size={24} />
      </button>

      {/* desktop prev/next affordances */}
      {(gi > 0 || si > 0) && (
        <button
          type="button"
          aria-label="Previous story"
          onClick={prev}
          className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 place-items-center rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:grid"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {(gi < groups.length - 1 || si < (group.stories?.length ?? 0) - 1) && (
        <button
          type="button"
          aria-label="Next story"
          onClick={next}
          className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 place-items-center rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:grid"
        >
          <ChevronRight size={24} />
        </button>
      )}

      <div className="relative flex h-full w-full max-w-[420px] flex-col overflow-hidden bg-black sm:h-[85vh] sm:rounded-card">
        {/* progress bars — one per frame in this author's group */}
        <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 px-3 pt-3">
          {group.stories.map((s, i) => (
            <div key={s.id ?? i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className={cn('h-full rounded-full bg-white', i < si && 'w-full', i > si && 'w-0')}
                style={
                  i === si
                    ? {
                        animation: paused ? 'none' : `story-progress ${STORY_MS}ms linear forwards`,
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        {/* author header */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-3 px-4 pb-3 pt-6">
          <img
            src={group.avatar}
            alt=""
            className="h-9 w-9 rounded-full border border-white/40 bg-surface object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{group.name}</p>
            {story.createdAt && (
              <p className="text-xs text-white/70">{timeAgo(story.createdAt)} ago</p>
            )}
          </div>
        </div>

        {/* media — hold to pause; tap left/right halves to navigate */}
        <div
          className="relative flex flex-1 items-center justify-center"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerLeave={() => setPaused(false)}
        >
          <img
            src={story.mediaUrl}
            alt={story.caption || ''}
            className="max-h-full max-w-full object-contain"
          />
          {/* tap zones sit above the image but below header/close */}
          <button
            type="button"
            aria-label="Previous"
            onClick={prev}
            className="absolute inset-y-0 left-0 w-1/3"
          />
          <button
            type="button"
            aria-label="Next"
            onClick={next}
            className="absolute inset-y-0 right-0 w-2/3"
          />
        </div>

        {/* caption */}
        {story.caption && (
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-10">
            <p className="text-sm leading-relaxed text-white">{story.caption}</p>
          </div>
        )}
      </div>
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
  const toast = useToast()
  const [liked, setLiked] = useState(!!post.likedByMe)
  const [likeCount, setLikeCount] = useState(post.likes ?? 0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState(post.comments ?? [])
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  // Instagram-style comment overlay — opened by the comment icon or the
  // "View all comments" link, closed by the backdrop or the X. Scoped to the
  // feed's PostCard; EventDetail keeps its own inline EventComments section.
  const [commentsOpen, setCommentsOpen] = useState(false)
  const org = post.organizer

  const iconBtn = 'grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-surface'
  const when = timeAgo(post.timeAgo) || post.timeAgo

  // Reply adapter for CommentReplies — bound to this post's endpoints. Delete is
  // the shared DELETE /api/comments/:id (comment author or the post author).
  const replyApi = {
    list: (parentId) => api.postComments(post.id, { parentId }),
    add: (body, parentId) => api.addComment(post.id, body, parentId),
    remove: (commentId) => api.deleteComment(commentId),
  }
  const canDeleteComment = (c) =>
    (user?.id && (c.authorId === user.id || post.organizer?.id === user.id)) || false

  // Soft-delete a top-level comment; optimistic with restore-on-failure.
  const removeComment = async (comment) => {
    const prev = comments
    setComments((list) => list.filter((c) => c.id !== comment.id))
    try {
      await api.deleteComment(comment.id)
    } catch {
      setComments(prev)
      toast.error('Could not delete that comment.')
    }
  }

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
        <button onClick={() => setCommentsOpen(true)} className={iconBtn} aria-label="Comment">
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
        {/* Comment entry point — mirrors Instagram's "View all N comments".
            Tapping it (or the comment icon above) opens the overlay where the
            full thread + composer live. */}
        <button
          onClick={() => setCommentsOpen(true)}
          className="text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          {comments.length > 0
            ? `View ${comments.length === 1 ? '1 comment' : `all ${comments.length} comments`}`
            : 'Add a comment…'}
        </button>
      </div>

      {commentsOpen && (
        <CommentsModal
          onClose={() => setCommentsOpen(false)}
          comments={comments}
          draft={draft}
          setDraft={setDraft}
          posting={posting}
          submitComment={submitComment}
          replyApi={replyApi}
          canDeleteComment={canDeleteComment}
          removeComment={removeComment}
        />
      )}
    </article>
  )
}

/* --------------------------------------------------------------------------
   CommentsModal — Instagram-style comment overlay for a feed post. Renders the
   full comment thread (with CommentReplies) plus the add-a-comment composer.
   The backdrop closes it (click-outside); the panel stops propagation so taps
   inside stay open. Feed-only — EventDetail uses the inline EventComments
   section instead.
-------------------------------------------------------------------------- */
function CommentsModal({
  onClose,
  comments,
  draft,
  setDraft,
  posting,
  submitComment,
  replyApi,
  canDeleteComment,
  removeComment,
}) {
  // Close on Escape, matching the app's other overlays.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-card bg-white shadow-hero sm:max-w-md sm:rounded-card"
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
          <h2 className="text-base font-bold text-ink">Comments</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface"
          >
            <X size={20} />
          </button>
        </div>

        {/* scrollable thread */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              No comments yet. Start the conversation.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id}>
                  <div className="group flex items-start gap-1.5">
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
                      <span className="font-semibold text-ink">{c.author}</span> {c.text}
                    </p>
                    {canDeleteComment(c) && (
                      <button
                        onClick={() => removeComment(c)}
                        className="mt-0.5 text-text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                        aria-label="Delete comment"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {/* Reply thread only for real (server) comments — a local echo
                      has no id the backend knows, so it can't take a parentId. */}
                  {c.authorId != null && (
                    <CommentReplies comment={c} api={replyApi} canDelete={canDeleteComment} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* composer — pinned to the bottom of the sheet */}
        <div className="flex items-center gap-2 border-t border-border-light px-4 py-3">
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
      </div>
    </div>
  )
}
