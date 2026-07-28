// User profile routes (planning §7). Onboarding interest commit, plus the
// public profile + follow graph (work-plan #26):
//   GET    /api/users/:id            public profile (viewer-relative is_following)
//   GET    /api/users/:id/events     an organizer's published events (profile tabs)
//   POST   /api/users/:id/follow     follow (bumps both denormalized counts)
//   DELETE /api/users/:id/follow     unfollow (decrements; leaves an unfollow signal)
//   GET    /api/users/:id/followers  paginated followers list
//   GET    /api/users/:id/following  paginated following list
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { fail, requireAuth } from '../auth/middleware.js'
import { enforceProfanity } from '../lib/profanity.js'
import { toPublicUser, PUBLIC_USER_SELECT } from './serialize.js'
import { toSelfUser } from '../auth/serialize.js'
import { toEventCard } from '../events/serialize.js'
import { scheduleRebuild } from '../preferences/coalesce.js'
import {
  presignPutUrl,
  isConfigured as s3Configured,
  isAllowedContentType,
  bucketPublicPrefix,
} from '../lib/s3.js'

const router = Router()

// Onboarding picks are explicit, so they carry full weight. The recommender's
// vector work (later) can down-weight; a hand-picked interest starts at 1.0.
const ONBOARDING_WEIGHT = 1.0

// Follow/unfollow interaction weights (mirror §9.2A / the engagement route).
const FOLLOW_WEIGHT = 0.5
const UNFOLLOW_WEIGHT = -0.25

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

// Handle rules mirror signup (auth/routes.js): 3–30 chars, letters/numbers/_.
const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/
const DISPLAY_NAME_MIN = 2
const DISPLAY_NAME_MAX = 120
const BIO_MAX = 500

// Identity fields (display_name + handle) are each rate-limited to one change
// every 7 days. Enforced against users.display_name_changed_at /
// handle_changed_at (both stamped at signup and on every accepted change).
const IDENTITY_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/** ms until the user may next change the given field, or 0 if eligible now. */
function msUntilChangeable(changedAt) {
  if (!changedAt) return 0
  const elapsed = Date.now() - new Date(changedAt).getTime()
  return Math.max(0, IDENTITY_CHANGE_COOLDOWN_MS - elapsed)
}

/** Round ms up to whole days for user-facing "try again in N days" copy. */
function daysCeil(ms) {
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

// Known notification-preference toggles. The column is a free-form Json?, so
// we pin an allowlist here: only these keys are accepted, each a boolean. A key
// left out of a request keeps its stored value (partial update), and unknown
// keys are rejected so the shape can't drift. Defaults are "on" — a user who
// has never touched prefs (null column) is treated as fully opted in.
const NOTIFICATION_KEYS = ['rsvps', 'messages', 'event_reminders', 'follows']
const DEFAULT_NOTIFICATION_PREFS = Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, true]))

// The four self-defined roles a user may switch between, each a valid triple of
// {role, organizer_kind, is_host}. Mirrors ROLE_OPTIONS in the frontend
// lib/utils.js — the client sends one of these labels and we resolve it here so
// an arbitrary combination (e.g. attendee + is_host) can never be persisted.
// Switching to attendee only changes the role flag; the user's existing events
// stay in the DB untouched, so flipping back restores their organizer surface.
const ROLE_PRESETS = {
  attendee: { role: 'attendee', organizerKind: null, isHost: false },
  organizer: { role: 'organizer', organizerKind: 'organizer', isHost: false },
  promoter: { role: 'organizer', organizerKind: 'promoter', isHost: false },
  sports_host: { role: 'organizer', organizerKind: 'organizer', isHost: true },
}

/** Resolve which of `targetIds` the viewer follows → Set. Empty when logged out. */
async function resolveFollowedSet(viewerId, targetIds) {
  if (!viewerId || targetIds.length === 0) return new Set()
  const rows = await prisma.follow.findMany({
    where: { followerId: viewerId, followeeId: { in: targetIds } },
    select: { followeeId: true },
  })
  return new Set(rows.map((r) => r.followeeId))
}

// --- GET /api/users?q= — search people by name / handle ---------------------
// Public. Trigram (pg_trgm — enabled in the schema) fuzzy match against
// display_name and handle, so "sara" finds "Sarah" and a typo'd handle still
// lands. Ranks by greatest similarity, then follower_count as a tiebreak so the
// more-established account surfaces first. Each row is a PublicUser + a
// viewer-relative `is_following` (null when logged out) — same shape the
// followers/following lists return, so the client reuses one row component.
// The viewer themselves is excluded (you can't follow yourself). `q` under two
// chars returns empty rather than scanning the whole table.
router.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 2) return res.json({ data: [] })

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
  const viewerId = req.user?.id ?? null

  try {
    // Similarity on both fields; GREATEST picks the stronger of the two so a
    // strong handle match isn't diluted by a weak name match (or vice versa).
    // The `%` trigram operator (pg_trgm) gates candidates before ranking, so
    // this rides the GIN index rather than scanning the table. handle is citext,
    // so the comparison is already case-insensitive. $queryRawUnsafe with
    // positional params matches the recommender's raw-SQL convention (social.js).
    // $1 = query text, $2 = viewer id (nullable → the AND clause no-ops), $3 = limit.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id,
              GREATEST(
                similarity(coalesce(display_name, ''), $1),
                similarity(coalesce(handle::text, ''), $1)
              ) AS sim
       FROM users
       WHERE (display_name % $1 OR handle::text % $1)
         AND ($2::uuid IS NULL OR id <> $2::uuid)
       ORDER BY sim DESC, follower_count DESC
       LIMIT $3`,
      q,
      viewerId,
      limit,
    )

    if (rows.length === 0) return res.json({ data: [] })

    // Hydrate the ranked ids into full PublicUser rows in one query, then re-sort
    // to the similarity order the raw query established (findMany won't preserve it).
    const ids = rows.map((r) => r.id)
    const order = new Map(ids.map((id, i) => [id, i]))
    const [users, followedSet] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: PUBLIC_USER_SELECT }),
      resolveFollowedSet(viewerId, ids),
    ])
    users.sort((a, b) => order.get(a.id) - order.get(b.id))

    const data = users.map((u) => toPublicUser(u, viewerId ? followedSet.has(u.id) : null))
    return res.json({ data })
  } catch (err) {
    console.error('GET /api/users?q= error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not search users')
  }
})

/** Does the viewer (if any) follow `targetId`? null when logged out. */
async function resolveIsFollowing(viewerId, targetId) {
  if (!viewerId) return null
  const row = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
    select: { followerId: true },
  })
  return !!row
}

// --- GET /api/users/:id/interests -------------------------------------------
// Owner-only. Returns the user's committed interest picks so the client can
// hydrate the interests context on login/refresh (without it, onboarding picks
// vanish from the profile the moment the user reloads or logs back in). Each
// row is a slim { id, slug, label } — same fields the onboarding chip grid uses,
// keyed by slug so the client can match against GET /api/interests which
// exposes slug ids too.
router.get('/:id/interests', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only view your own interests')
  }
  try {
    const rows = await prisma.userInterest.findMany({
      where: { userId: req.user.id, source: 'onboarding' },
      include: { interest: { select: { id: true, slug: true, label: true, isActive: true } } },
    })
    const data = rows
      .filter((r) => r.interest?.isActive)
      .map((r) => ({ id: r.interest.id, slug: r.interest.slug, label: r.interest.label }))
    return res.json({ data })
  } catch (err) {
    console.error('GET /api/users/:id/interests error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load interests')
  }
})

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

    // Interests drive the seed vector (see preferences/builder.js:computeSeedVector),
    // which is a majority of the final preference vector until the user has ≥8
    // event signals. Without this rebuild, editing interests changed no
    // recommendations until the user also saved/RSVPed something.
    await scheduleRebuild(req.user.id)

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

// --- PUT /api/users/:id/location --------------------------------------------
// Body: { city: string, lat?: number, lng?: number, place_id?: string,
//         radius_km?: number }
// Persists the caller's home location so the recommender's geo pre-filter
// (recommendations/engine.js: earth_distance radius when lat/lng present,
// else city ILIKE) actually has something to filter on. Onboarding calls this;
// a user can update it later from their profile. `radius_km` sets how wide the
// "near me" search reaches — 1–500km, defaults to the current stored value.
router.put('/:id/location', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own location')
  }

  const { city, lat, lng, place_id, radius_km } = req.body ?? {}
  if (typeof city !== 'string' || !city.trim()) {
    return fail(res, 422, 'VALIDATION_ERROR', 'city is required')
  }
  if (city.length > 120) {
    return fail(res, 422, 'VALIDATION_ERROR', 'city too long (max 120 chars)')
  }

  // Coords are optional but must arrive as a valid pair — storing one without
  // the other would leave the geo pre-filter unable to build a radius clause.
  const hasLat = lat != null
  const hasLng = lng != null
  if (hasLat !== hasLng) {
    return fail(res, 422, 'VALIDATION_ERROR', 'lat and lng must be provided together')
  }
  let latNum = null
  let lngNum = null
  if (hasLat) {
    latNum = Number(lat)
    lngNum = Number(lng)
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      return fail(res, 422, 'VALIDATION_ERROR', 'lat must be a number between -90 and 90')
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      return fail(res, 422, 'VALIDATION_ERROR', 'lng must be a number between -180 and 180')
    }
  }

  let radiusKmNum = null
  if (radius_km != null) {
    radiusKmNum = Number(radius_km)
    if (!Number.isFinite(radiusKmNum) || radiusKmNum < 1 || radiusKmNum > 500) {
      return fail(res, 422, 'VALIDATION_ERROR', 'radius_km must be between 1 and 500')
    }
    radiusKmNum = Math.round(radiusKmNum)
  }

  const placeId = typeof place_id === 'string' && place_id.trim() ? place_id.trim() : null

  try {
    const data = {
      homeCity: city.trim(),
      homeLat: latNum,
      homeLng: lngNum,
      homePlaceId: placeId,
    }
    if (radiusKmNum != null) data.locationRadiusKm = radiusKmNum
    const updated = await prisma.user.update({ where: { id: req.user.id }, data })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/location error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save location')
  }
})

// --- PUT /api/users/:id/birthdate -------------------------------------------
// Body: { birth_date: 'YYYY-MM-DD' }. Persists the caller's date of birth so
// the recommender/detail can honor age-gated events (events.age_min). We store
// the DOB (not age) because a birthday shifts age over time — a static number
// would go stale. Enforces a minimum age of 13 (COPPA) and a sane upper bound.
router.put('/:id/birthdate', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own profile')
  }

  const raw = req.body?.birth_date
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'birth_date must be YYYY-MM-DD')
  }
  // Parse as UTC noon to sidestep DST edge cases — we only care about the day.
  const dob = new Date(`${raw}T12:00:00Z`)
  if (isNaN(dob.getTime())) {
    return fail(res, 422, 'VALIDATION_ERROR', 'birth_date is not a real date')
  }
  const today = new Date()
  let age = today.getUTCFullYear() - dob.getUTCFullYear()
  const monthDelta = today.getUTCMonth() - dob.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < dob.getUTCDate())) {
    age -= 1
  }
  if (age < 13) {
    return fail(res, 422, 'VALIDATION_ERROR', 'You must be at least 13 to use Loop')
  }
  if (age > 120) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Please enter a valid date of birth')
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { birthDate: dob },
    })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/birthdate error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save birth date')
  }
})

// --- POST /api/users/:id/avatar-upload-url ----------------------------------
// Owner-only. Body: { content_type: 'image/png' | 'image/jpeg' | ... }.
// Returns a short-lived presigned PUT URL the browser uploads the image to
// directly (bytes never touch this server), plus the stable public URL the
// client PUTs back to /avatar once the upload succeeds.
router.post('/:id/avatar-upload-url', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only change your own picture')
  }
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

  try {
    const { uploadUrl, publicUrl, key } = await presignPutUrl({
      userId: req.user.id,
      contentType,
      // Uniqueness only — a request-time clock is fine and Date.now() is fine here.
      stamp: Date.now(),
    })
    return res.json({
      data: { upload_url: uploadUrl, public_url: publicUrl, key, content_type: contentType },
    })
  } catch (err) {
    console.error('POST /api/users/:id/avatar-upload-url error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not start upload')
  }
})

// --- PUT /api/users/:id/avatar -----------------------------------------------
// Owner-only. Body: { avatar_url }. Persists the final public S3 URL after the
// browser's direct upload succeeds. The URL must point at our own bucket so a
// caller can't set their avatar to an arbitrary external link.
router.put('/:id/avatar', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only change your own picture')
  }

  const avatarUrl = req.body?.avatar_url
  if (typeof avatarUrl !== 'string' || !avatarUrl) {
    return fail(res, 422, 'VALIDATION_ERROR', 'avatar_url is required')
  }
  const prefix = bucketPublicPrefix()
  if (!prefix || !avatarUrl.startsWith(prefix)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'avatar_url must point at the avatar bucket')
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
    })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/avatar error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save picture')
  }
})

// --- POST /api/users/:id/cover-upload-url -----------------------------------
// Owner-only. Body: { content_type: 'image/png' | 'image/jpeg' | ... }.
// Same presigned-PUT flow as the avatar, but stores under the 'covers/' folder
// so cover images don't collide with avatars in the bucket. Returns the upload
// URL + the stable public URL the client PUTs back to /cover on success.
router.post('/:id/cover-upload-url', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only change your own cover image')
  }
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

  try {
    const { uploadUrl, publicUrl, key } = await presignPutUrl({
      userId: req.user.id,
      contentType,
      stamp: Date.now(),
      folder: 'covers',
    })
    return res.json({
      data: { upload_url: uploadUrl, public_url: publicUrl, key, content_type: contentType },
    })
  } catch (err) {
    console.error('POST /api/users/:id/cover-upload-url error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not start upload')
  }
})

// --- PUT /api/users/:id/cover ------------------------------------------------
// Owner-only. Body: { cover_image_url }. Persists the final public S3 URL after
// the browser's direct upload succeeds. Like the avatar, the URL must point at
// our own bucket so a caller can't set their cover to an arbitrary external link.
router.put('/:id/cover', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only change your own cover image')
  }

  const coverUrl = req.body?.cover_image_url
  if (typeof coverUrl !== 'string' || !coverUrl) {
    return fail(res, 422, 'VALIDATION_ERROR', 'cover_image_url is required')
  }
  const prefix = bucketPublicPrefix()
  if (!prefix || !coverUrl.startsWith(prefix)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'cover_image_url must point at the image bucket')
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { coverImageUrl: coverUrl },
    })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/cover error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save cover image')
  }
})

// --- PUT /api/users/:id/notification-prefs ----------------------------------
// Owner-only. Body: a partial map of { rsvps?, messages?, event_reminders?,
// follows? } booleans. Merges over the stored prefs (defaulting a null column
// to all-on) so the client can send just the toggle that changed. Unknown keys
// or non-boolean values are rejected so the JSON shape stays consistent.
router.put('/:id/notification-prefs', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own preferences')
  }

  const body = req.body ?? {}
  if (typeof body !== 'object' || Array.isArray(body)) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Body must be an object of preference toggles')
  }

  const patch = {}
  for (const [key, value] of Object.entries(body)) {
    if (!NOTIFICATION_KEYS.includes(key)) {
      return fail(res, 422, 'VALIDATION_ERROR', `Unknown preference: ${key}`)
    }
    if (typeof value !== 'boolean') {
      return fail(res, 422, 'VALIDATION_ERROR', `${key} must be a boolean`)
    }
    patch[key] = value
  }
  if (Object.keys(patch).length === 0) {
    return fail(res, 422, 'VALIDATION_ERROR', 'No preferences provided')
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notificationPrefs: true },
    })
    // Merge over defaults so a previously-null column becomes a full, explicit
    // map — the client always gets every key back regardless of what it sent.
    const merged = {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...(current?.notificationPrefs ?? {}),
      ...patch,
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { notificationPrefs: merged },
    })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/notification-prefs error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save preferences')
  }
})

// --- PUT /api/users/:id/role ------------------------------------------------
// Owner-only. Body: { preset: 'attendee' | 'organizer' | 'promoter' |
// 'sports_host' }. Lets a user redefine themselves and toggle between attendee
// and organizer seamlessly. We accept a named preset (not raw role/kind/host
// fields) so only the four valid combinations can ever be stored. Returns the
// refreshed SelfUser so the client can adopt the new role/kind/host at once.
router.put('/:id/role', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only change your own role')
  }

  const preset = req.body?.preset
  if (typeof preset !== 'string' || !Object.prototype.hasOwnProperty.call(ROLE_PRESETS, preset)) {
    return fail(
      res,
      422,
      'VALIDATION_ERROR',
      'preset must be one of: attendee, organizer, promoter, sports_host',
    )
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: ROLE_PRESETS[preset],
    })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    console.error('PUT /api/users/:id/role error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not update role')
  }
})

// --- PATCH /api/users/:id — edit own profile --------------------------------
// Owner-only. Body may include any of { display_name, handle, bio }; only the
// keys present are updated (partial patch). Rules:
//   • display_name — required, 2–120 chars, NOT unique (two people can share
//     the same one). No cooldown.
//   • handle (username) — required, 3–30 chars [a-zA-Z0-9_], unique across all
//     users (case-insensitive citext). One change every 7 days (429 on retry).
//   • bio — optional, empty string clears.
router.patch('/:id', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only edit your own profile')
  }

  const body = req.body ?? {}
  const data = {}
  // Whether the caller is trying to change the username (drives cooldown check
  // + stamps the change timestamp on success).
  let touchesHandle = false

  // Load the current row so we can compare (no-op writes shouldn't burn the
  // cooldown) and enforce the 7-day window on username changes.
  const current = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { handle: true, handleChangedAt: true },
  })
  if (!current) return fail(res, 404, 'NOT_FOUND', 'User not found')

  if ('display_name' in body) {
    const v = body.display_name
    if (typeof v !== 'string') {
      return fail(res, 422, 'VALIDATION_ERROR', 'display_name must be a string')
    }
    const trimmed = v.trim()
    if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
      return fail(
        res,
        422,
        'VALIDATION_ERROR',
        `display_name must be ${DISPLAY_NAME_MIN}–${DISPLAY_NAME_MAX} characters`,
      )
    }
    data.displayName = trimmed
  }

  if ('handle' in body) {
    const v = body.handle
    if (typeof v !== 'string') {
      return fail(res, 422, 'VALIDATION_ERROR', 'username must be a string')
    }
    const trimmed = v.trim().replace(/^@/, '')
    if (!HANDLE_RE.test(trimmed)) {
      return fail(res, 422, 'VALIDATION_ERROR', 'username must be 3–30 chars (letters, numbers, _)')
    }
    // Skip the cooldown check when the value hasn't actually changed (citext
    // makes handle uniqueness case-insensitive, mirror that here).
    if (trimmed.toLowerCase() !== (current.handle ?? '').toLowerCase()) {
      const wait = msUntilChangeable(current.handleChangedAt)
      if (wait > 0) {
        return fail(
          res,
          429,
          'RATE_LIMITED',
          `You can change your username again in ${daysCeil(wait)} day(s)`,
          { field: 'handle', retry_after_ms: wait },
        )
      }
      data.handle = trimmed
      data.handleChangedAt = new Date()
      touchesHandle = true
    }
  }

  if ('bio' in body) {
    const v = body.bio
    if (v != null && typeof v !== 'string') {
      return fail(res, 422, 'VALIDATION_ERROR', 'bio must be a string')
    }
    const trimmed = typeof v === 'string' ? v.trim() : ''
    if (trimmed.length > BIO_MAX) {
      return fail(res, 422, 'VALIDATION_ERROR', `bio too long (max ${BIO_MAX})`)
    }
    data.bio = trimmed || null
  }

  if (Object.keys(data).length === 0) {
    return fail(res, 422, 'VALIDATION_ERROR', 'No editable fields provided')
  }

  // Identity fields are hard-block only — a "flagged" display name/username
  // would still be visible to everyone, so if it trips the filter we refuse the save.
  if (enforceProfanity(req, res, [data.displayName, data.handle, data.bio]).blocked) return

  try {
    const updated = await prisma.user.update({ where: { id: req.user.id }, data })
    return res.json({ data: toSelfUser(updated) })
  } catch (err) {
    // Unique-index collision on handle. display_name has no unique index.
    if (err.code === 'P2002') {
      const target = err.meta?.target
      const key = Array.isArray(target) ? target[0] : target
      if (key === 'handle' || touchesHandle) {
        return fail(res, 409, 'CONFLICT', 'That username is already taken', { field: 'handle' })
      }
      return fail(res, 409, 'CONFLICT', 'That value is already taken')
    }
    console.error('PATCH /api/users/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not save profile')
  }
})

// --- GET /api/users/search?q= — people picker search ------------------------
// Case-insensitive prefix/substring match against display_name and handle. Used
// by the new-message picker + group composer, so the caller (their own row)
// is excluded from results and the response is capped so a giant DB never
// spills through. Requires auth — messaging is a member feature. Public columns
// only (PUBLIC_USER_SELECT), so nothing PII leaks.
router.get('/search', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 30)
  if (!q) return res.json({ data: [] })

  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ isVerified: 'desc' }, { followerCount: 'desc' }, { displayName: 'asc' }],
      take: limit,
      select: PUBLIC_USER_SELECT,
    })
    return res.json({ data: users.map((u) => toPublicUser(u, null)) })
  } catch (err) {
    console.error('GET /api/users/search error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not search users')
  }
})

// --- GET /api/users/:id — public profile ------------------------------------
// Powers OrganizerProfile. Public; `is_following` is viewer-relative (null when
// logged out). 400 for a non-UUID id so a stray mock `org-*` id 404s cleanly.
router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return fail(res, 404, 'NOT_FOUND', 'User not found')
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: PUBLIC_USER_SELECT,
    })
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found')

    const isFollowing = await resolveIsFollowing(req.user?.id, user.id)
    return res.json({ data: toPublicUser(user, isFollowing) })
  } catch (err) {
    console.error('GET /api/users/:id error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load user')
  }
})

// --- GET /api/users/:id/events — an organizer's events ----------------------
// ?status=upcoming|past (default upcoming), cursor-paginated. Public.
router.get('/:id/events', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return fail(res, 404, 'NOT_FOUND', 'User not found')
  }
  try {
    const status = req.query.status === 'past' ? 'past' : 'upcoming'
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const now = new Date()

    const where = {
      organizerId: req.params.id,
      status: 'published',
      startsAt: status === 'past' ? { lt: now } : { gte: now },
    }
    if (req.query.cursor) where.id = { gt: req.query.cursor }

    const events = await prisma.event.findMany({
      where,
      orderBy:
        status === 'past'
          ? [{ startsAt: 'desc' }, { id: 'asc' }]
          : [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { category: true, organizer: true, sportsDetail: true },
    })

    let nextCursor = null
    if (events.length > limit) {
      events.pop()
      nextCursor = events[events.length - 1].id
    }
    return res.json({ data: events.map((e) => toEventCard(e)), nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/events error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load events')
  }
})

// --- GET /api/users/:id/rsvps — a user's own RSVPs --------------------------
// Owner-only (self); optional ?status= filter, cursor-paginated by created_at.
// Powers RSVP-state hydration on the client (the "Going" highlight after a
// reload) and the UserProfile "Going" tab. Each item is { rsvp, event:EventCard }.
const RSVP_STATUSES = new Set(['going', 'interested', 'waitlisted', 'cancelled'])

router.get('/:id/rsvps', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only view your own RSVPs')
  }
  const { status } = req.query
  if (status != null && !RSVP_STATUSES.has(status)) {
    return fail(
      res,
      422,
      'VALIDATION_ERROR',
      'status must be going/interested/waitlisted/cancelled',
    )
  }

  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const where = { userId: req.params.id }
    // Default to active RSVPs only — a cancelled RSVP shouldn't light up "Going".
    if (status) where.status = status
    else where.status = { not: 'cancelled' }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.createdAt = { lt: cur }
    }

    const rows = await prisma.rsvp.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { event: { include: { category: true, organizer: true, sportsDetail: true } } },
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].createdAt.toISOString()
    }

    const data = rows.map((r) => ({
      rsvp: {
        id: r.id,
        status: r.status,
        guests_count: r.guestsCount,
        attended: r.attended,
        created_at: r.createdAt,
      },
      event: toEventCard(r.event),
    }))
    return res.json({ data, nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/rsvps error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load RSVPs')
  }
})

// --- GET /api/users/:id/saved — a user's own saved events -------------------
// Owner-only (self); cursor-paginated by saved_at desc. Powers the client's
// saved-state hydration (the bookmark highlight after a reload) and the
// UserProfile "Saved" tab. Each item is an EventCard, newest save first. Unlike
// /events, it isn't restricted to upcoming/published, so an event saved from
// search or a direct link still appears here.
router.get('/:id/saved', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (req.user.id !== req.params.id) {
    return fail(res, 403, 'FORBIDDEN', 'You can only view your own saved events')
  }

  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const where = { userId: req.params.id }
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.savedAt = { lt: cur }
    }

    const rows = await prisma.savedEvent.findMany({
      where,
      orderBy: { savedAt: 'desc' },
      take: limit + 1,
      include: { event: { include: { category: true, organizer: true, sportsDetail: true } } },
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].savedAt.toISOString()
    }

    const data = rows.map((r) => ({
      saved_at: r.savedAt,
      event: toEventCard(r.event),
    }))
    return res.json({ data, nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/saved error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load saved events')
  }
})

// --- GET /api/users/:id/attending — a user's public upcoming events ---------
// Public (attendance is public). Unlike /:id/rsvps (owner-only, exposes every
// status including cancelled/interested), this returns ONLY upcoming events the
// user is *going* to — the safe, public subset that powers the "Attending" tab
// on someone else's profile. Cursor-paginated by event start time (soonest
// first). Each item is an EventCard.
router.get('/:id/attending', async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
    const now = new Date()
    const where = {
      userId: req.params.id,
      status: 'going',
      event: { status: 'published', startsAt: { gte: now } },
    }
    // Cursor is the event start time (ISO) of the last row — stable for the
    // soonest-first order the tab renders.
    if (req.query.cursor) {
      const cur = new Date(req.query.cursor)
      if (!isNaN(cur)) where.event.startsAt = { gte: now, gt: cur }
    }

    const rows = await prisma.rsvp.findMany({
      where,
      orderBy: { event: { startsAt: 'asc' } },
      take: limit + 1,
      include: { event: { include: { category: true, organizer: true, sportsDetail: true } } },
    })

    let nextCursor = null
    if (rows.length > limit) {
      rows.pop()
      nextCursor = rows[rows.length - 1].event.startsAt.toISOString()
    }

    return res.json({ data: rows.map((r) => toEventCard(r.event)), nextCursor })
  } catch (err) {
    console.error('GET /api/users/:id/attending error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not load attending events')
  }
})

// --- POST /api/users/:id/follow — follow ------------------------------------
// Inserts follows(follower=me, followee=:id), bumps follower_count on the
// followee and following_count on me, and appends a `follow` interaction signal.
// Idempotent: already-following returns 409. Self-follow is 422.
router.post('/:id/follow', requireAuth, async (req, res) => {
  const followeeId = req.params.id
  const followerId = req.user.id

  if (!isUuid(followeeId)) return fail(res, 404, 'NOT_FOUND', 'User not found')
  if (followeeId === followerId) {
    return fail(res, 422, 'VALIDATION_ERROR', 'You cannot follow yourself')
  }

  try {
    const followee = await prisma.user.findUnique({
      where: { id: followeeId },
      select: { id: true },
    })
    if (!followee) return fail(res, 404, 'NOT_FOUND', 'User not found')

    const existing = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
      select: { createdAt: true },
    })
    if (existing) {
      return fail(res, 409, 'CONFLICT', 'You already follow this user')
    }

    const { follow, followerCount } = await prisma.$transaction(async (tx) => {
      const follow = await tx.follow.create({
        data: { followerId, followeeId },
      })
      const updatedFollowee = await tx.user.update({
        where: { id: followeeId },
        data: { followerCount: { increment: 1 } },
        select: { followerCount: true },
      })
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      })
      await tx.interactionEvent.create({
        data: {
          userId: followerId,
          sessionId: req.sessionId ?? null,
          targetUserId: followeeId,
          interactionType: 'follow',
          surface: 'organizer_profile',
          weight: FOLLOW_WEIGHT,
        },
      })
      return { follow, followerCount: updatedFollowee.followerCount }
    })

    return res.status(201).json({
      data: {
        follower_id: follow.followerId,
        followee_id: follow.followeeId,
        created_at: follow.createdAt,
        is_following: true,
        followee: { id: followeeId, follower_count: followerCount },
      },
    })
  } catch (err) {
    // Concurrent double-follow can still lose the race to the unique PK.
    if (err.code === 'P2002') {
      return fail(res, 409, 'CONFLICT', 'You already follow this user')
    }
    console.error('POST /api/users/:id/follow error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not follow user')
  }
})

// --- DELETE /api/users/:id/follow — unfollow --------------------------------
// Deletes the follows row, decrements both counts, and appends an `unfollow`
// signal (reversal = supersede, §10). 404 if not currently following.
router.delete('/:id/follow', requireAuth, async (req, res) => {
  const followeeId = req.params.id
  const followerId = req.user.id

  if (!isUuid(followeeId)) return fail(res, 404, 'NOT_FOUND', 'User not found')

  try {
    const existing = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
      select: { followerId: true },
    })
    if (!existing) return fail(res, 404, 'NOT_FOUND', 'You do not follow this user')

    await prisma.$transaction(async (tx) => {
      await tx.follow.delete({
        where: { followerId_followeeId: { followerId, followeeId } },
      })
      await tx.user.update({
        where: { id: followeeId },
        data: { followerCount: { decrement: 1 } },
      })
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      })
      await tx.interactionEvent.create({
        data: {
          userId: followerId,
          sessionId: req.sessionId ?? null,
          targetUserId: followeeId,
          interactionType: 'unfollow',
          surface: 'organizer_profile',
          weight: UNFOLLOW_WEIGHT,
        },
      })
    })

    return res.status(204).end()
  } catch (err) {
    console.error('DELETE /api/users/:id/follow error:', err)
    return fail(res, 500, 'INTERNAL', 'Could not unfollow user')
  }
})

// --- GET /api/users/:id/followers | /following — paginated lists ------------
// Shared handler; `edge` picks which side of the follow graph to walk. Public.
// Each item is a PublicUser + { is_following, followed_at } relative to the
// viewer. Cursor is the follow row's created_at (ISO) for stable ordering.
function followListHandler(edge) {
  return async (req, res) => {
    const id = req.params.id
    if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'User not found')

    try {
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true } })
      if (!target) return fail(res, 404, 'NOT_FOUND', 'User not found')

      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
      // followers: rows where this user is the followee, return the follower.
      // following: rows where this user is the follower, return the followee.
      const where = edge === 'followers' ? { followeeId: id } : { followerId: id }
      if (req.query.cursor) {
        const cur = new Date(req.query.cursor)
        if (!isNaN(cur)) where.createdAt = { lt: cur }
      }

      const rows = await prisma.follow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: {
          [edge === 'followers' ? 'follower' : 'followee']: { select: PUBLIC_USER_SELECT },
        },
      })

      let nextCursor = null
      if (rows.length > limit) {
        rows.pop()
        nextCursor = rows[rows.length - 1].createdAt.toISOString()
      }

      // Resolve the viewer's follow state against everyone in the page in one query.
      const people = rows.map((r) => (edge === 'followers' ? r.follower : r.followee))
      let followedSet = new Set()
      if (req.user?.id && people.length) {
        const mine = await prisma.follow.findMany({
          where: { followerId: req.user.id, followeeId: { in: people.map((p) => p.id) } },
          select: { followeeId: true },
        })
        followedSet = new Set(mine.map((m) => m.followeeId))
      }

      const data = rows.map((r) => {
        const person = edge === 'followers' ? r.follower : r.followee
        const isFollowing = req.user?.id ? followedSet.has(person.id) : null
        return { user: toPublicUser(person, isFollowing), followed_at: r.createdAt }
      })
      return res.json({ data, nextCursor })
    } catch (err) {
      console.error(`GET /api/users/:id/${edge} error:`, err)
      return fail(res, 500, 'INTERNAL', 'Could not load list')
    }
  }
}

router.get('/:id/followers', followListHandler('followers'))
router.get('/:id/following', followListHandler('following'))

export default router
