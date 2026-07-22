// Organizer analytics (planning §7.7). Two endpoints:
//   GET /api/events/:id/analytics       — one event, series + funnel + surfaces
//   GET /api/organizers/:id/analytics   — self, all events rolled up
//
// Both are owner-gated and read on the fly from the InteractionEvent stream
// (indexed on (event_id, interaction_type)) rather than the `event_analytics_daily`
// rollup table — the rollup job isn't wired yet, and querying live means numbers
// stay fresh without introducing a cron dependency.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'

const router = Router()

const MAX_RANGE_DAYS = 366

function parseRange(from, to) {
  const parsedTo = to ? new Date(to) : new Date()
  const parsedFrom = from ? new Date(from) : new Date(parsedTo.getTime() - 30 * 24 * 3600 * 1000)
  if (isNaN(parsedFrom.getTime()) || isNaN(parsedTo.getTime())) return null
  if (parsedFrom > parsedTo) return null
  const spanDays = (parsedTo - parsedFrom) / (24 * 3600 * 1000)
  if (spanDays > MAX_RANGE_DAYS) return null
  parsedFrom.setUTCHours(0, 0, 0, 0)
  parsedTo.setUTCHours(23, 59, 59, 999)
  return { from: parsedFrom, to: parsedTo }
}

const dayKey = (d) => new Date(d).toISOString().slice(0, 10)

// Build [from, from+1d, …, to] in YYYY-MM-DD strings so a chart never has a hole
// on a zero-traffic day.
function eachDay(from, to) {
  const out = []
  const cursor = new Date(from)
  cursor.setUTCHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(0, 0, 0, 0)
  while (cursor <= end) {
    out.push(dayKey(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

// ---- GET /api/events/:id/analytics ----------------------------------------
router.get('/events/:id/analytics', requireAuth, async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        organizerId: true,
        title: true,
        flyerUrl: true,
        startsAt: true,
        isSports: true,
        rsvpCount: true,
        saveCount: true,
        viewCount: true,
      },
    })
    if (!event) return fail(res, 404, 'NOT_FOUND', 'Event not found')
    if (event.organizerId !== req.user.id) {
      return fail(res, 403, 'FORBIDDEN', 'You do not own this event')
    }

    const range = parseRange(req.query.from, req.query.to)
    if (!range) return fail(res, 422, 'VALIDATION_ERROR', 'Invalid date range')

    // Pull interaction signals in the window in one round-trip, then bucket
    // in-process. Cheaper than 4 separate GROUP BY queries.
    const signals = await prisma.interactionEvent.findMany({
      where: {
        eventId: event.id,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { interactionType: true, surface: true, createdAt: true },
    })

    const days = eachDay(range.from, range.to)
    const seriesMap = new Map(
      days.map((d) => [d, { date: d, views: 0, saves: 0, rsvps: 0, shares: 0 }]),
    )
    const surfaces = new Map()
    const totals = { views: 0, saves: 0, rsvpsGoing: 0, rsvpsInterested: 0, shares: 0 }

    for (const s of signals) {
      const day = dayKey(s.createdAt)
      const row = seriesMap.get(day)
      switch (s.interactionType) {
        case 'view':
          if (row) row.views++
          totals.views++
          break
        case 'save':
          if (row) row.saves++
          totals.saves++
          break
        case 'rsvp':
          if (row) row.rsvps++
          totals.rsvpsGoing++
          break
        case 'share':
          if (row) row.shares++
          totals.shares++
          break
        default:
          break
      }
      if (s.interactionType === 'view') {
        surfaces.set(s.surface, (surfaces.get(s.surface) ?? 0) + 1)
      }
    }

    // Authoritative in-window Rsvp counts (going/interested/attended). The
    // `rsvp` interaction fires on the going transition; interested/attended
    // are only visible in the Rsvp table.
    const [rsvpsInWindow, attendedCount, commentsCount] = await Promise.all([
      prisma.rsvp.groupBy({
        by: ['status'],
        where: { eventId: event.id, createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      }),
      prisma.rsvp.count({ where: { eventId: event.id, attended: true } }),
      prisma.comment.count({ where: { eventId: event.id, deletedAt: null } }),
    ])

    let going = 0
    let interested = 0
    for (const row of rsvpsInWindow) {
      if (row.status === 'going') going = row._count._all
      else if (row.status === 'interested') interested = row._count._all
    }
    // rsvpsGoing = current state, not raw signal count — a cancel must lower
    // the tile. The `rsvp` interaction stream stays in `series` for the daily
    // trend, but the KPI reflects who is actually planning to attend right now.
    totals.rsvpsGoing = going
    totals.rsvpsInterested = interested

    // Search terms whose click landed on this event, most-clicked first.
    const searchClicks = await prisma.searchQuery.groupBy({
      by: ['rawQuery'],
      where: {
        clickedEventId: event.id,
        createdAt: { gte: range.from, lte: range.to },
      },
      _count: { _all: true },
      orderBy: { _count: { rawQuery: 'desc' } },
      take: 10,
    })

    // Rec-feed CTR: how the "For You" ranker treats this event.
    const [recImpressions, recClicks] = await Promise.all([
      prisma.recommendationImpression.count({
        where: { eventId: event.id, shownAt: { gte: range.from, lte: range.to } },
      }),
      prisma.recommendationImpression.count({
        where: {
          eventId: event.id,
          shownAt: { gte: range.from, lte: range.to },
          clicked: true,
        },
      }),
    ])

    res.json({
      data: {
        eventId: event.id,
        event: {
          id: event.id,
          title: event.title,
          flyerUrl: event.flyerUrl,
          startsAt: event.startsAt,
          isSports: event.isSports,
        },
        range: { from: dayKey(range.from), to: dayKey(range.to) },
        totals: {
          views: totals.views,
          saves: totals.saves,
          rsvpsGoing: totals.rsvpsGoing,
          rsvpsInterested: totals.rsvpsInterested,
          shares: totals.shares,
          attended: attendedCount,
          comments: commentsCount,
        },
        series: Array.from(seriesMap.values()),
        funnel: {
          views: totals.views,
          saves: totals.saves,
          rsvpsGoing: totals.rsvpsGoing,
          attended: attendedCount,
        },
        surfaces: Array.from(surfaces.entries())
          .map(([surface, views]) => ({ surface, views }))
          .sort((a, b) => b.views - a.views),
        searchTerms: searchClicks.map((s) => ({ term: s.rawQuery, clicks: s._count._all })),
        recCTR: {
          impressions: recImpressions,
          clicks: recClicks,
        },
        // Lifetime denormalized counters on the event row — handy sanity check
        // for the "All time" view since InteractionEvent may not cover the full
        // history if the ranker was toggled off at any point.
        lifetime: {
          views: event.viewCount,
          saves: event.saveCount,
          rsvps: event.rsvpCount,
        },
      },
    })
  } catch (err) {
    console.error('GET /events/:id/analytics error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to load event analytics')
  }
})

// ---- GET /api/organizers/:id/analytics ------------------------------------
router.get('/organizers/:id/analytics', requireAuth, async (req, res) => {
  if (req.params.id !== req.user.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only view your own analytics')
  }
  try {
    const range = parseRange(req.query.from, req.query.to)
    if (!range) return fail(res, 422, 'VALIDATION_ERROR', 'Invalid date range')

    // All events the organizer has published. We include drafts too — the
    // organizer might want to see interest before publishing (unlikely to have
    // signals, but harmless).
    const events = await prisma.event.findMany({
      where: { organizerId: req.user.id },
      select: {
        id: true,
        title: true,
        flyerUrl: true,
        startsAt: true,
        status: true,
        category: { select: { slug: true, name: true, colorHex: true } },
      },
    })
    const eventIds = events.map((e) => e.id)

    if (eventIds.length === 0) {
      return res.json({
        data: {
          organizerId: req.user.id,
          range: { from: dayKey(range.from), to: dayKey(range.to) },
          totals: { views: 0, saves: 0, rsvps: 0, shares: 0, events: 0, followerCount: req.user.followerCount ?? 0 },
          series: eachDay(range.from, range.to).map((date) => ({
            date, views: 0, saves: 0, rsvps: 0, shares: 0, followers: 0,
          })),
          topEvents: [],
          categoryMix: [],
        },
      })
    }

    const [signals, followsInRange, followerCount] = await Promise.all([
      prisma.interactionEvent.findMany({
        where: {
          eventId: { in: eventIds },
          interactionType: { in: ['view', 'save', 'rsvp', 'share'] },
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { eventId: true, interactionType: true, createdAt: true },
      }),
      prisma.follow.findMany({
        where: {
          followeeId: req.user.id,
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { createdAt: true },
      }),
      prisma.user
        .findUnique({ where: { id: req.user.id }, select: { followerCount: true } })
        .then((u) => u?.followerCount ?? 0),
    ])

    const days = eachDay(range.from, range.to)
    const seriesMap = new Map(
      days.map((d) => [d, { date: d, views: 0, saves: 0, rsvps: 0, shares: 0, followers: 0 }]),
    )
    // Per-event totals for the "Top events" table.
    const perEvent = new Map(
      events.map((e) => [
        e.id,
        {
          eventId: e.id,
          title: e.title,
          flyerUrl: e.flyerUrl,
          startsAt: e.startsAt,
          category: e.category,
          views: 0,
          saves: 0,
          rsvps: 0,
          shares: 0,
        },
      ]),
    )
    // Category mix aggregates.
    const catMix = new Map()

    for (const s of signals) {
      const day = dayKey(s.createdAt)
      const row = seriesMap.get(day)
      const ev = perEvent.get(s.eventId)
      const key = s.interactionType === 'rsvp' ? 'rsvps' : `${s.interactionType}s`
      if (row) row[key]++
      if (ev) ev[key]++
      if (ev?.category?.slug) {
        const acc =
          catMix.get(ev.category.slug) ??
          { slug: ev.category.slug, name: ev.category.name, colorHex: ev.category.colorHex, views: 0, rsvps: 0 }
        if (s.interactionType === 'view') acc.views++
        else if (s.interactionType === 'rsvp') acc.rsvps++
        catMix.set(ev.category.slug, acc)
      }
    }
    for (const f of followsInRange) {
      const row = seriesMap.get(dayKey(f.createdAt))
      if (row) row.followers++
    }

    const totals = Array.from(seriesMap.values()).reduce(
      (acc, r) => ({
        views: acc.views + r.views,
        saves: acc.saves + r.saves,
        rsvps: acc.rsvps + r.rsvps,
        shares: acc.shares + r.shares,
        followers: acc.followers + r.followers,
      }),
      { views: 0, saves: 0, rsvps: 0, shares: 0, followers: 0 },
    )

    const topEvents = Array.from(perEvent.values())
      .sort((a, b) => (b.views + b.rsvps * 2) - (a.views + a.rsvps * 2))
      .slice(0, 10)

    res.json({
      data: {
        organizerId: req.user.id,
        range: { from: dayKey(range.from), to: dayKey(range.to) },
        totals: {
          views: totals.views,
          saves: totals.saves,
          rsvps: totals.rsvps,
          shares: totals.shares,
          events: events.length,
          followerCount,
          newFollowers: totals.followers,
        },
        series: Array.from(seriesMap.values()),
        topEvents,
        categoryMix: Array.from(catMix.values()).sort((a, b) => b.views - a.views),
      },
    })
  } catch (err) {
    console.error('GET /organizers/:id/analytics error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to load organizer analytics')
  }
})

export default router
