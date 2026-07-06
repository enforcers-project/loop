import { useState } from 'react'
import { Bookmark, Heart, MessageCircle, Plus, Send } from 'lucide-react'
import type { Post } from '../lib/types'
import { cn, formatCount } from '../lib/utils'
import { VerifiedBadge } from './primitives'

/* --------------------------------------------------------------------------
   StoriesRow — horizontal avatar ring row; labels allow 2 lines, w-16
-------------------------------------------------------------------------- */
export function StoriesRow({
  stories,
}: {
  stories: { name: string; avatar: string; isYou?: boolean }[]
}) {
  return (
    <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-1">
      {stories.map((s, i) => (
        <button key={i} className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5">
          <span
            className={cn(
              'relative grid h-16 w-16 place-items-center rounded-full p-[3px]',
              s.isYou
                ? 'bg-border-light'
                : 'bg-gradient-to-tr from-accent via-primary to-networking',
            )}
          >
            <img
              src={s.avatar}
              alt=""
              className="h-full w-full rounded-full border-2 border-white object-cover"
            />
            {s.isYou && (
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-primary text-white">
                <Plus size={12} />
              </span>
            )}
          </span>
          <span className="text-center text-[11px] leading-tight text-text-secondary">
            {s.isYou ? 'Your story' : s.name}
          </span>
        </button>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------------
   PostCard — Instagram-style: header + full image + action row + comments
-------------------------------------------------------------------------- */
export function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const org = post.organizer

  return (
    <article className="overflow-hidden rounded-card border border-border-light bg-white shadow-card">
      {/* header */}
      <div className="flex items-center gap-3 p-4">
        <img src={org?.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-ink">{org?.name}</span>
            {org?.verified && <VerifiedBadge size={14} />}
          </div>
          <span className="text-xs text-text-muted">{post.timeAgo} ago</span>
        </div>
      </div>

      {/* image */}
      <img src={post.image} alt="" className="aspect-square w-full object-cover" />

      {/* action row */}
      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={() => setLiked((v) => !v)} aria-label="Like">
          <Heart
            size={24}
            className={cn(
              'transition-colors',
              liked ? 'fill-accent text-accent' : 'text-ink',
            )}
          />
        </button>
        <button aria-label="Comment">
          <MessageCircle size={24} className="text-ink" />
        </button>
        <button aria-label="Share">
          <Send size={22} className="text-ink" />
        </button>
        <button
          onClick={() => setSaved((v) => !v)}
          className="ml-auto"
          aria-label="Save"
        >
          <Bookmark
            size={24}
            className={cn(saved ? 'fill-primary text-primary' : 'text-ink')}
          />
        </button>
      </div>

      {/* likes + caption + comments */}
      <div className="space-y-1 px-4 pb-4 pt-2">
        <div className="text-sm font-semibold text-ink">
          {formatCount(post.likes + (liked ? 1 : 0))} likes
        </div>
        <p className="text-sm text-text-primary">
          <span className="font-semibold">{org?.handle.replace('@', '')}</span> {post.caption}
        </p>
        {post.comments.map((c) => (
          <p key={c.id} className="text-sm text-text-secondary">
            <span className="font-semibold text-ink">{c.author}</span> {c.text}
          </p>
        ))}
      </div>
    </article>
  )
}
