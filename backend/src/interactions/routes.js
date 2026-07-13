import { Router } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const router = Router()

const VALID_TYPES = new Set([
  'impression', 'view', 'click', 'dwell', 'save', 'unsave',
  'rsvp', 'rsvp_cancel', 'attend', 'search', 'search_result_click',
  'follow', 'unfollow', 'share', 'category_click', 'tag_click',
  'comment', 'post_like', 'claim_spot', 'release_spot',
  'ai_query', 'rec_impression', 'rec_click', 'rec_dismiss',
])

const VALID_SURFACES = new Set([
  'for_you', 'discover', 'search', 'event_detail', 'social',
  'organizer_profile', 'user_profile', 'assistant', 'landing', 'notification',
])

const DEFAULT_WEIGHTS = {
  attend: 1.0,
  rsvp: 0.8,
  claim_spot: 0.75,
  save: 0.6,
  follow: 0.5,
  share: 0.45,
  search_result_click: 0.4,
  search: 0.35,
  ai_query: 0.35,
  category_click: 0.3,
  tag_click: 0.25,
  post_like: 0.2,
  rec_click: 0.18,
  click: 0.18,
  view: 0.15,
  dwell: 0.1,
  impression: 0.0,
  rec_impression: 0.0,
  rec_dismiss: -0.4,
  unsave: -0.3,
  rsvp_cancel: -0.35,
  unfollow: -0.25,
  release_spot: -0.3,
  comment: 0.0,
}

const MAX_BATCH_SIZE = 50

// POST /api/interactions
router.post('/interactions', async (req, res) => {
  const { events } = req.body ?? {}

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: { message: 'events must be a non-empty array' } })
  }

  if (events.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: { message: `Batch exceeds max size of ${MAX_BATCH_SIZE}` } })
  }

  // Validate each event in the batch
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (!ev.interaction_type || !VALID_TYPES.has(ev.interaction_type)) {
      return res.status(400).json({
        error: { message: `events[${i}].interaction_type is missing or invalid` },
      })
    }
    if (!ev.surface || !VALID_SURFACES.has(ev.surface)) {
      return res.status(400).json({
        error: { message: `events[${i}].surface is missing or invalid` },
      })
    }
  }

  try {
    // Step 1: Upsert anonymous sessions so FK holds.
    // Collect unique session_ids from the batch.
    const sessionIds = [...new Set(events.map((e) => e.session_id).filter(Boolean))]

    // Determine user_id from auth header if present (stub: read from body or null)
    const userId = req.body.user_id || null

    await Promise.all(
      sessionIds.map((sid) =>
        prisma.userSession.upsert({
          where: { id: sid },
          create: { id: sid, userId },
          update: {},
        })
      )
    )

    // Step 2: Insert interaction_events rows
    const rows = events.map((ev) => ({
      userId,
      sessionId: ev.session_id || null,
      eventId: ev.event_id || null,
      categoryId: ev.category_id || null,
      targetUserId: ev.target_user_id || null,
      interactionType: ev.interaction_type,
      surface: ev.surface,
      weight: ev.weight ?? DEFAULT_WEIGHTS[ev.interaction_type] ?? 0,
      dwellMs: ev.dwell_ms ?? null,
      feedPosition: ev.feed_position ?? null,
      tag: ev.tag || null,
      recommendationId: ev.recommendation_id || null,
      searchQueryId: ev.search_query_id || null,
      metadata: ev.metadata || null,
    }))

    await prisma.interactionEvent.createMany({ data: rows })

    // Step 3: Side-effects (best-effort — signal is already logged, so a
    // missing recommendation_id or search_query_id shouldn't fail the request)
    const sideEffects = []

    for (const ev of events) {
      if (ev.interaction_type === 'search_result_click' && ev.search_query_id && ev.event_id) {
        sideEffects.push(
          prisma.searchQuery.update({
            where: { id: ev.search_query_id },
            data: { clickedEventId: ev.event_id },
          }).catch(() => {})
        )
      }

      if (ev.interaction_type === 'rec_click' && ev.recommendation_id) {
        sideEffects.push(
          prisma.recommendationImpression.update({
            where: { id: ev.recommendation_id },
            data: { clicked: true, clickedAt: new Date() },
          }).catch(() => {})
        )
      }

      if (ev.interaction_type === 'rec_dismiss' && ev.recommendation_id) {
        sideEffects.push(
          prisma.recommendationImpression.update({
            where: { id: ev.recommendation_id },
            data: { clicked: false },
          }).catch(() => {})
        )
      }
    }

    await Promise.all(sideEffects)

    res.json({ data: { accepted: rows.length } })
  } catch (err) {
    console.error('POST /api/interactions error:', err)

    if (err.code === 'P2003') {
      return res.status(400).json({
        error: { message: 'Foreign key constraint failed — check event_id, category_id, or recommendation_id' },
      })
    }

    res.status(500).json({ error: { message: 'Failed to record interactions' } })
  }
})

export default router
