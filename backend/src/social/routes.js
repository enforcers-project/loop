// Social layer endpoints (planning §7.5, work-plan #29 + #30):
//   GET    /api/feed/social        Instagram-style post feed, newest first,
//                                  with the caller's like state + author badge
//   POST   /api/posts              create a post (PostCard)
//   POST   /api/posts/:id/like     idempotent like (+ interaction + notification)
//   DELETE /api/posts/:id/like     remove the caller's like
//   GET    /api/posts/:id/comments threaded comments (paginated, no soft-deleted)
//   POST   /api/posts/:id/comments comment / reply (bumps comment_count)
//   GET    /api/stories            non-expired story rings grouped by author
//   POST   /api/stories            post an ephemeral story (expires in 24h)
//   POST   /api/stories/:id/view   idempotent seen-marker
//
// Mirrors src/engagement conventions: idempotent count-maintenance in a
// transaction (like_count / comment_count move only on genuine transitions),
// requireAuth + fail(), an interaction_events row per signal, and a best-effort
// notification to the content author. The feed read is public-friendly but the
// caller's like/view state only resolves when authenticated.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'
import {
  presignPutUrl,
  isConfigured as s3Configured,
  isAllowedContentType,
  bucketPublicPrefix,
} from '../lib/s3.js'
import {
  POST_SELECT,
  COMMENT_SELECT,
  AUTHOR_SELECT,
  toPost,
  toComment,
  toStory,
  toAuthorRef,
} from './serialize.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

const POST_KINDS = new Set(['flyer', 'recap', 'update'])
const STORY_TTL_MS = 24 * 60 * 60 * 1000

const clampLimit = (raw, def = 20, max = 50) => Math.min(Math.max(Number(raw) || def, 1), max)

/** Append an interaction_events row (best-effort — never blocks the mutation). */
async function emitInteraction(tx, { type, req, post }) {
  await tx.interactionEvent.create({
    data: {
      userId: req.user.id,
      sessionId: req.sessionId ?? null,
      eventId: post.eventId ?? null,
      targetUserId: post.authorId ?? null,
      interactionType: type,
      surface: 'social',
      weight: type === 'post_like' ? 0.5 : type === 'comment' ? 0.7 : 0,
    },
  })
}

/**
 * Interaction row for a comment on an EventDetail page — mirrors src/engagement
 * (surface 'event_detail', carries category_id for the recommender). Kept
 * separate from the post/social emitInteraction so each surface stays honest.
 */
async function emitEventCommentInteraction(tx, { req, event }) {
  await tx.interactionEvent.create({
    data: {
      userId: req.user.id,
      sessionId: req.sessionId ?? null,
      eventId: event.id,
      categoryId: event.categoryId ?? null,
      interactionType: 'comment',
      surface: 'event_detail',
      weight: 0.7,
    },
  })
}

/** Load a post or return null; minimal columns the mutation handlers need. */
async function loadPost(id) {
  if (!isUuid(id)) return null
  return prisma.post.findUnique({
    where: { id },
    select: { id: true, authorId: true, eventId: true },
  })
}

/**
 * Validate a post/story image URL. Accepts our own S3 bucket (uploaded via the
 * presign flow) OR an https link (users may paste an external image when S3
 * isn't configured — the URL-input fallback). Rejects anything else so we never
 * store javascript:/data: or plain-http URLs that would break or be unsafe in
 * an <img>. Returns true when acceptable.
 */
function isAcceptableImageUrl(url) {
  if (typeof url !== 'string' || !url) return false
  const prefix = bucketPublicPrefix()
  if (prefix && url.startsWith(prefix)) return true
  return /^https:\/\//i.test(url)
}

// --- POST /api/uploads/social-image — presigned PUT for post/story media -----
// Owner-scoped (keyed under the caller's id). Body: { content_type, kind } where
// kind is 'post' | 'story' (chooses the S3 folder). Returns a short-lived
// presigned PUT URL the browser uploads to directly (bytes never touch this
// server) plus the stable public URL to send back in image_url / media_url.
// 503s when S3 isn't configured so the client can fall back to a URL input.
router.post('/uploads/social-image', requireAuth, async (req, res) => {
  if (!s3Configured()) {
    return fail(res, 503, 'NOT_CONFIGURED', 'Image uploads are not configured')
  }

  const contentType = req.body?.content_type
  if (!isAllowedContentType(contentType)) {
    return fail(
      res,
      422,
      'VALIDATION_ERROR',
      'content_type must be a JPEG, PNG, WebP, or GIF image',
    )
  }
  const folder = req.body?.kind === 'story' ? 'stories' : 'posts'

  try {
    const { uploadUrl, publicUrl, key } = await presignPutUrl({
      userId: req.user.id,
      contentType,
      folder,
      stamp: Date.now(),
    })
    return res.json({
      data: { upload_url: uploadUrl, public_url: publicUrl, key, content_type: contentType },
    })
  } catch (err) {
    console.error('POST /api/uploads/social-image error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not start upload')
  }
})

// --- GET /api/feed/social — paginated post feed ------------------------------
// Newest first, cursor on created_at. `liked_by_me` is resolved for the
// authenticated caller in one extra query (the posts on this page only). The
// feed is auth-gated per spec, but a logged-out caller simply sees no like
// state — we still gate to match §7.5.
router.get('/feed/social', requireAuth, async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit)
    const where = {}
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const rows = await prisma.post.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: POST_SELECT,
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    // Resolve the caller's like state for just this page of posts.
    let likedIds = new Set()
    if (rows.length) {
      const likes = await prisma.postLike.findMany({
        where: { userId: req.user.id, postId: { in: rows.map((r) => r.id) } },
        select: { postId: true },
      })
      likedIds = new Set(likes.map((l) => l.postId))
    }

    return res.json({
      data: rows.map((p) => toPost(p, likedIds.has(p.id))),
      nextCursor,
    })
  } catch (err) {
    console.error('GET /api/feed/social error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load the social feed')
  }
})

// --- POST /api/posts — create a post -----------------------------------------
router.post('/posts', requireAuth, async (req, res) => {
  const { kind, image_url, caption, event_id } = req.body ?? {}

  if (!POST_KINDS.has(kind)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'kind must be flyer/recap/update')
  }
  if (!image_url || typeof image_url !== 'string') {
    return fail(res, 422, 'VALIDATION_ERROR', 'image_url is required')
  }
  if (!isAcceptableImageUrl(image_url)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'image_url must be an https image URL')
  }
  if (event_id != null && !isUuid(event_id)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'event_id must be a valid id')
  }

  try {
    // A linked event must exist (FK is SetNull, so we validate up front to give
    // a real 404 instead of silently dropping the link).
    if (event_id) {
      const event = await prisma.event.findUnique({ where: { id: event_id }, select: { id: true } })
      if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    }

    const created = await prisma.post.create({
      data: {
        authorId: req.user.id,
        kind,
        imageUrl: image_url,
        caption: caption?.trim() || null,
        eventId: event_id ?? null,
      },
      select: POST_SELECT,
    })

    return res.status(201).json({ data: toPost(created, false) })
  } catch (err) {
    console.error('POST /api/posts error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not create post')
  }
})

// --- POST /api/posts/:id/like — idempotent like ------------------------------
router.post('/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await loadPost(req.params.id)
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found')

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId: post.id, userId: req.user.id } },
    })

    // Idempotent: already liked — return the current count without inflating it.
    if (existing) {
      const fresh = await prisma.post.findUnique({
        where: { id: post.id },
        select: { likeCount: true },
      })
      return res.json({ data: { post_id: post.id, like_count: fresh.likeCount, liked: true } })
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.postLike.create({ data: { postId: post.id, userId: req.user.id } })
      const updated = await tx.post.update({
        where: { id: post.id },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      })
      await emitInteraction(tx, { type: 'post_like', req, post })
      return updated
    })

    // Best-effort notification to the author (skip self-likes). Never blocks.
    if (post.authorId && post.authorId !== req.user.id) {
      prisma.notification
        .create({
          data: {
            userId: post.authorId,
            type: 'social_like',
            channel: 'in_app',
            actorId: req.user.id,
            eventId: post.eventId ?? null,
            title: `${req.user.displayName || 'Someone'} liked your post`,
            metadata: { post_id: post.id },
          },
        })
        .catch(() => {})
    }

    return res.json({ data: { post_id: post.id, like_count: updated.likeCount, liked: true } })
  } catch (err) {
    console.error('POST /api/posts/:id/like error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not like post')
  }
})

// --- DELETE /api/posts/:id/like — remove like --------------------------------
router.delete('/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await loadPost(req.params.id)
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found')

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId: post.id, userId: req.user.id } },
    })

    // Idempotent: nothing to remove.
    if (!existing) {
      const fresh = await prisma.post.findUnique({
        where: { id: post.id },
        select: { likeCount: true },
      })
      return res.json({ data: { post_id: post.id, like_count: fresh.likeCount, liked: false } })
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.postLike.delete({
        where: { postId_userId: { postId: post.id, userId: req.user.id } },
      })
      return tx.post.update({
        where: { id: post.id },
        // Guard against underflow if counts ever drift.
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      })
    })

    return res.json({
      data: { post_id: post.id, like_count: Math.max(0, updated.likeCount), liked: false },
    })
  } catch (err) {
    console.error('DELETE /api/posts/:id/like error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not unlike post')
  }
})

// --- GET /api/posts/:id/comments — threaded comments -------------------------
// Public. ?parentId= scopes to replies of one comment (else top-level, where
// parent_comment_id IS NULL). Excludes soft-deleted (deleted_at IS NOT NULL).
router.get('/posts/:id/comments', async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Post not found')

  try {
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true } })
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found')

    const limit = clampLimit(req.query.limit)
    const where = { postId: id, deletedAt: null }
    where.parentCommentId = isUuid(req.query.parentId) ? req.query.parentId : null
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const rows = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: COMMENT_SELECT,
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    return res.json({ data: rows.map(toComment), nextCursor })
  } catch (err) {
    console.error('GET /api/posts/:id/comments error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load comments')
  }
})

// --- POST /api/posts/:id/comments — comment / reply --------------------------
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Post not found')

  const { body, parent_comment_id } = req.body ?? {}
  if (!body || typeof body !== 'string' || !body.trim()) {
    return fail(res, 422, 'VALIDATION_ERROR', 'body is required')
  }
  if (parent_comment_id != null && !isUuid(parent_comment_id)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'parent_comment_id must be a valid id')
  }

  try {
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, eventId: true },
    })
    if (!post) return fail(res, 404, 'NOT_FOUND', 'Post not found')

    // A reply must target a live comment on THIS post.
    if (parent_comment_id) {
      const parent = await prisma.comment.findUnique({
        where: { id: parent_comment_id },
        select: { id: true, postId: true, deletedAt: true },
      })
      if (!parent || parent.postId !== id || parent.deletedAt) {
        return fail(res, 404, 'NOT_FOUND', 'Parent comment not found')
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          authorId: req.user.id,
          postId: id,
          parentCommentId: parent_comment_id ?? null,
          body: body.trim(),
        },
        select: COMMENT_SELECT,
      })
      await tx.post.update({ where: { id }, data: { commentCount: { increment: 1 } } })
      await emitInteraction(tx, { type: 'comment', req, post })
      return created
    })

    // Notify the post author (or the parent commenter on a reply). Best-effort.
    const recipientId = post.authorId
    if (recipientId && recipientId !== req.user.id) {
      prisma.notification
        .create({
          data: {
            userId: recipientId,
            type: parent_comment_id ? 'comment_reply' : 'social_like',
            channel: 'in_app',
            actorId: req.user.id,
            eventId: post.eventId ?? null,
            title: `${req.user.displayName || 'Someone'} commented on your post`,
            body: body.trim().slice(0, 140),
            metadata: { post_id: id, comment_id: created.id },
          },
        })
        .catch(() => {})
    }

    return res.status(201).json({ data: toComment(created) })
  } catch (err) {
    console.error('POST /api/posts/:id/comments error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not add comment')
  }
})

// --- GET /api/stories — non-expired rings grouped by author ------------------
// Groups live stories (expires_at > now) by author, newest story first within
// each group and most-recently-active author first. `all_viewed` is true when
// the caller has viewed every story in the group.
router.get('/stories', requireAuth, async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit)

    const rows = await prisma.story.findMany({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        authorId: true,
        eventId: true,
        mediaUrl: true,
        caption: true,
        createdAt: true,
        expiresAt: true,
        author: { select: AUTHOR_SELECT },
      },
    })

    // Which of these stories the caller has already seen.
    let viewedIds = new Set()
    if (rows.length) {
      const views = await prisma.storyView.findMany({
        where: { viewerId: req.user.id, storyId: { in: rows.map((r) => r.id) } },
        select: { storyId: true },
      })
      viewedIds = new Set(views.map((v) => v.storyId))
    }

    // Group by author, preserving the created_at DESC order (first author seen
    // is the most recently active). Stories inside a group keep that order too.
    const groups = new Map()
    for (const s of rows) {
      let g = groups.get(s.authorId)
      if (!g) {
        g = { author: toAuthorRef(s.author), stories: [], all_viewed: true }
        groups.set(s.authorId, g)
      }
      const viewed = viewedIds.has(s.id)
      if (!viewed) g.all_viewed = false
      g.stories.push(toStory(s, viewed))
    }

    // Cursor pagination over the grouped list (by author).
    const all = [...groups.values()]
    let start = 0
    if (req.query.cursor) {
      const idx = all.findIndex((g) => g.author?.id === req.query.cursor)
      if (idx >= 0) start = idx + 1
    }
    const page = all.slice(start, start + limit)
    const nextCursor =
      start + limit < all.length ? (page[page.length - 1]?.author?.id ?? null) : null

    return res.json({ data: page, nextCursor })
  } catch (err) {
    console.error('GET /api/stories error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load stories')
  }
})

// --- POST /api/stories — post an ephemeral story -----------------------------
router.post('/stories', requireAuth, async (req, res) => {
  const { media_url, caption, event_id } = req.body ?? {}

  if (!media_url || typeof media_url !== 'string') {
    return fail(res, 422, 'VALIDATION_ERROR', 'media_url is required')
  }
  if (!isAcceptableImageUrl(media_url)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'media_url must be an https image URL')
  }
  if (caption != null && (typeof caption !== 'string' || caption.length > 160)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'caption must be ≤160 characters')
  }
  if (event_id != null && !isUuid(event_id)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'event_id must be a valid id')
  }

  try {
    if (event_id) {
      const event = await prisma.event.findUnique({ where: { id: event_id }, select: { id: true } })
      if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    }

    const created = await prisma.story.create({
      data: {
        authorId: req.user.id,
        mediaUrl: media_url,
        caption: caption?.trim() || null,
        eventId: event_id ?? null,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      },
      select: {
        id: true,
        authorId: true,
        eventId: true,
        mediaUrl: true,
        caption: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    return res.status(201).json({
      data: {
        id: created.id,
        author_id: created.authorId,
        media_url: created.mediaUrl,
        caption: created.caption,
        event_id: created.eventId,
        created_at: created.createdAt,
        expires_at: created.expiresAt,
      },
    })
  } catch (err) {
    console.error('POST /api/stories error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not post story')
  }
})

// --- POST /api/stories/:id/view — idempotent seen-marker ---------------------
router.post('/stories/:id/view', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Story not found')

  try {
    const story = await prisma.story.findUnique({ where: { id }, select: { id: true } })
    if (!story) return fail(res, 404, 'NOT_FOUND', 'Story not found')

    // Idempotent upsert — a repeat view keeps the original viewed_at.
    const view = await prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId: id, viewerId: req.user.id } },
      create: { storyId: id, viewerId: req.user.id },
      update: {},
      select: { viewedAt: true },
    })

    return res.json({ data: { story_id: id, viewed_at: view.viewedAt } })
  } catch (err) {
    console.error('POST /api/stories/:id/view error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not mark story viewed')
  }
})

// --- GET /api/events/:id/comments — threaded comments on an event -----------
// Public. ?parentId= scopes to replies of one comment (else top-level, where
// parent_comment_id IS NULL). Excludes soft-deleted (deleted_at IS NOT NULL).
// Mirrors GET /api/posts/:id/comments exactly, keyed on eventId instead.
router.get('/events/:id/comments', async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  try {
    const event = await prisma.event.findUnique({ where: { id }, select: { id: true } })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')

    const limit = clampLimit(req.query.limit)
    const where = { eventId: id, deletedAt: null }
    where.parentCommentId = isUuid(req.query.parentId) ? req.query.parentId : null
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const rows = await prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: COMMENT_SELECT,
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    return res.json({ data: rows.map(toComment), nextCursor })
  } catch (err) {
    console.error('GET /api/events/:id/comments error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load comments')
  }
})

// --- POST /api/events/:id/comments — comment / reply on an event -------------
// Events carry no denormalized comment_count column (only posts do), so there's
// no count to bump here — the visible list is the source of truth.
router.post('/events/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Event not found')

  const { body, parent_comment_id } = req.body ?? {}
  if (!body || typeof body !== 'string' || !body.trim()) {
    return fail(res, 422, 'VALIDATION_ERROR', 'body is required')
  }
  if (parent_comment_id != null && !isUuid(parent_comment_id)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'parent_comment_id must be a valid id')
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, categoryId: true, organizerId: true, title: true },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')

    // A reply must target a live comment on THIS event.
    if (parent_comment_id) {
      const parent = await prisma.comment.findUnique({
        where: { id: parent_comment_id },
        select: { id: true, eventId: true, deletedAt: true },
      })
      if (!parent || parent.eventId !== id || parent.deletedAt) {
        return fail(res, 404, 'NOT_FOUND', 'Parent comment not found')
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          authorId: req.user.id,
          eventId: id,
          parentCommentId: parent_comment_id ?? null,
          body: body.trim(),
        },
        select: COMMENT_SELECT,
      })
      await emitEventCommentInteraction(tx, { req, event })
      return created
    })

    // Notify the event's organizer (skip self-comments). Best-effort.
    if (event.organizerId && event.organizerId !== req.user.id) {
      prisma.notification
        .create({
          data: {
            userId: event.organizerId,
            type: parent_comment_id ? 'comment_reply' : 'system',
            channel: 'in_app',
            actorId: req.user.id,
            eventId: id,
            title: `${req.user.displayName || 'Someone'} commented on ${event.title}`,
            body: body.trim().slice(0, 140),
            metadata: { event_id: id, comment_id: created.id },
          },
        })
        .catch(() => {})
    }

    return res.status(201).json({ data: toComment(created) })
  } catch (err) {
    console.error('POST /api/events/:id/comments error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not add comment')
  }
})

// --- DELETE /api/comments/:id — soft-delete (event OR post comment) ----------
// Sets deleted_at (never hard-deletes, preserving thread structure for replies)
// and, for a post comment, DECREMENTS posts.comment_count so the shown count
// matches visible comments (the audit fix). Idempotent: a re-delete is a no-op
// 204. Auth: comment author OR the parent content's owner (event organizer /
// post author).
router.delete('/comments/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Comment not found')

  try {
    const comment = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        eventId: true,
        postId: true,
        deletedAt: true,
        event: { select: { organizerId: true } },
        post: { select: { authorId: true } },
      },
    })
    if (!comment) return fail(res, 404, 'NOT_FOUND', 'Comment not found')

    // Already soft-deleted — idempotent success, no double-decrement.
    if (comment.deletedAt) return res.status(204).end()

    const ownerId = comment.event?.organizerId ?? comment.post?.authorId ?? null
    const allowed = comment.authorId === req.user.id || ownerId === req.user.id
    if (!allowed) {
      return fail(res, 403, 'FORBIDDEN', 'Not allowed to delete this comment')
    }

    await prisma.$transaction(async (tx) => {
      await tx.comment.update({ where: { id }, data: { deletedAt: new Date() } })
      // Only posts track a denormalized count; keep it in step with visible rows.
      if (comment.postId) {
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 } },
        })
      }
    })

    return res.status(204).end()
  } catch (err) {
    console.error('DELETE /api/comments/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not delete comment')
  }
})

export default router
