// Serializers for the social layer (planning §7.5: /feed/social, /posts,
// /stories, post comments). Every row is mapped to the snake_case shape the
// client renders, matching the envelope conventions used across the API.

/** Public author bits for a post/story/comment — never over-fetch a user. */
export const AUTHOR_SELECT = {
  id: true,
  displayName: true,
  handle: true,
  avatarUrl: true,
  isVerified: true,
}

/** Map a selected author row to the compact UserRef the client expects. */
export function toAuthorRef(u) {
  if (!u) return null
  return {
    id: u.id,
    display_name: u.displayName,
    handle: u.handle,
    avatar_url: u.avatarUrl,
    is_verified: u.isVerified,
  }
}

/** Columns a feed post needs, plus its author. */
export const POST_SELECT = {
  id: true,
  authorId: true,
  eventId: true,
  kind: true,
  imageUrl: true,
  caption: true,
  likeCount: true,
  commentCount: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
}

/**
 * Map a Prisma post row (selected with POST_SELECT) to the feed item shape.
 * `likedByMe` is resolved separately (the caller's like set) and passed in —
 * it defaults to false for an anonymous or not-yet-liked viewer.
 */
export function toPost(p, likedByMe = false) {
  return {
    id: p.id,
    author: toAuthorRef(p.author),
    event_id: p.eventId,
    kind: p.kind,
    image_url: p.imageUrl,
    caption: p.caption,
    like_count: p.likeCount,
    comment_count: p.commentCount,
    liked_by_me: likedByMe,
    created_at: p.createdAt,
  }
}

/** Columns a comment needs, plus its author and reply count. */
export const COMMENT_SELECT = {
  id: true,
  authorId: true,
  postId: true,
  parentCommentId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  author: { select: AUTHOR_SELECT },
  _count: { select: { replies: true } },
}

/** Map a Prisma comment row (selected with COMMENT_SELECT) to the client shape. */
export function toComment(c) {
  return {
    id: c.id,
    author: toAuthorRef(c.author),
    body: c.body,
    parent_comment_id: c.parentCommentId,
    reply_count: c._count?.replies ?? 0,
    created_at: c.createdAt,
    edited_at: c.editedAt,
  }
}

/** Map one story row to the per-story shape inside a StoriesRow group. */
export function toStory(s, viewedByMe = false) {
  return {
    id: s.id,
    media_url: s.mediaUrl,
    caption: s.caption,
    event_id: s.eventId,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
    viewed_by_me: viewedByMe,
  }
}
