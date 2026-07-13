// User profile routes (planning §7). Currently: commit onboarding interest
// picks. PUT /api/users/:id/interests replaces the caller's onboarding-sourced
// interests with the submitted set (picks only — no preference vector yet, per
// work-plan #7) and stamps onboarding_completed_at.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { fail, requireAuth } from '../auth/middleware.js'

const router = Router()

// Onboarding picks are explicit, so they carry full weight. The recommender's
// vector work (later) can down-weight; a hand-picked interest starts at 1.0.
const ONBOARDING_WEIGHT = 1.0

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

// --- PUT /api/users/:id/interests -------------------------------------------
// Body: { interest_ids: string[] } — each id may be an Interest UUID or its
// slug (the seed lookup at GET /api/interests exposes slug ids to the client).
router.put('/:id/interests', requireAuth, async (req, res) => {
  // Authz: a user may only edit their own interests.
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own interests')
  }

  const raw = req.body?.interest_ids
  if (!Array.isArray(raw)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'interest_ids must be an array')
  }

  // De-dupe and split submitted ids into UUIDs vs slugs so the id filter never
  // receives a non-UUID string (Postgres would reject it).
  const ids = [...new Set(raw.filter((v) => typeof v === 'string' && v.length))]
  const uuids = ids.filter(isUuid)
  const slugs = ids.filter((v) => !isUuid(v))

  try {
    // Resolve to real, active interests; silently drop anything unrecognized.
    const interests = await prisma.interest.findMany({
      where: {
        isActive: true,
        OR: [{ id: { in: uuids } }, { slug: { in: slugs } }],
      },
      select: { id: true, slug: true },
    })
    const interestIds = interests.map((i) => i.id)

    await prisma.$transaction([
      // Drop onboarding picks the user has now deselected (leave inferred/
      // user_added rows untouched — those come from other sources).
      prisma.userInterest.deleteMany({
        where: {
          userId: req.user.id,
          source: 'onboarding',
          interestId: {
            notIn: interestIds.length ? interestIds : ['00000000-0000-0000-0000-000000000000'],
          },
        },
      }),
      // Upsert each selected pick as an onboarding-sourced interest.
      ...interestIds.map((interestId) =>
        prisma.userInterest.upsert({
          where: { userId_interestId: { userId: req.user.id, interestId } },
          create: {
            userId: req.user.id,
            interestId,
            source: 'onboarding',
            weight: ONBOARDING_WEIGHT,
          },
          update: { source: 'onboarding', weight: ONBOARDING_WEIGHT },
        }),
      ),
      // Mark onboarding complete on first commit (idempotent thereafter).
      prisma.user.update({
        where: { id: req.user.id },
        data: { onboardingCompletedAt: new Date() },
      }),
    ])

    return res.json({
      data: {
        interest_ids: interests.map((i) => i.slug),
        count: interests.length,
      },
    })
  } catch (err) {
    console.error('PUT /api/users/:id/interests error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save interests')
  }
})

export default router
