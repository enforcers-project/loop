import prisma from '../lib/prisma.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const SWEEP_INTERVAL_MS = 10 * 60 * 1000

const friendCache = new Map()

const SIGNAL_WEIGHTS = {
  friendsGoing: 0.3,
  friendsSaved: 0.2,
  followedOrganizer: 0.2,
  orgFollowedByFriends: 0.12,
  sharedCategoryMomentum: 0.1,
  repeatAttendees: 0.08,
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of friendCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) friendCache.delete(key)
  }
}, SWEEP_INTERVAL_MS).unref()

async function getFriendIds(userId) {
  const cached = friendCache.get(userId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT followee_id FROM follows WHERE follower_id = $1::uuid`,
    userId,
  )
  const ids = rows.map((r) => r.followee_id)
  friendCache.set(userId, { data: ids, timestamp: Date.now() })
  return ids
}

export async function computeSocialScores(userId, candidates) {
  const friendIds = await getFriendIds(userId)
  if (friendIds.length === 0) {
    return new Map()
  }

  const eventIds = candidates.map((c) => c.event.id)
  if (eventIds.length === 0) return new Map()

  const categoryIds = [...new Set(candidates.map((c) => c.categoryId).filter(Boolean))]

  const [friendRsvps, friendSaves, followedOrgs, orgFollowers, categoryMomentum, repeatAtt] =
    await Promise.all([
      queryFriendsGoing(friendIds, eventIds),
      queryFriendsSaved(friendIds, eventIds),
      queryFollowedOrganizer(userId, eventIds),
      queryOrgFollowedByFriends(friendIds, eventIds),
      querySharedCategoryMomentum(friendIds, categoryIds),
      queryRepeatAttendees(userId, friendIds, eventIds),
    ])

  const maxFriends = friendIds.length
  const scores = new Map()

  for (const candidate of candidates) {
    const eid = candidate.event.id
    const catId = candidate.categoryId

    const raw = {
      friendsGoing: friendRsvps.get(eid) ?? 0,
      friendsSaved: friendSaves.get(eid) ?? 0,
      followedOrganizer: followedOrgs.has(eid) ? 1 : 0,
      orgFollowedByFriends: orgFollowers.get(eid) ?? 0,
      sharedCategoryMomentum: categoryMomentum.get(catId) ?? 0,
      repeatAttendees: repeatAtt.get(eid) ?? 0,
    }

    const normalized = {
      friendsGoing: Math.log1p(raw.friendsGoing) / Math.log1p(maxFriends),
      friendsSaved: Math.log1p(raw.friendsSaved) / Math.log1p(maxFriends),
      followedOrganizer: raw.followedOrganizer,
      orgFollowedByFriends: Math.log1p(raw.orgFollowedByFriends) / Math.log1p(maxFriends),
      sharedCategoryMomentum: Math.log1p(raw.sharedCategoryMomentum) / Math.log1p(maxFriends),
      repeatAttendees: Math.log1p(raw.repeatAttendees) / Math.log1p(maxFriends),
    }

    let score = 0
    for (const [key, weight] of Object.entries(SIGNAL_WEIGHTS)) {
      score += weight * normalized[key]
    }

    scores.set(eid, { score, raw, topSignal: pickTopSignal(raw) })
  }

  return scores
}

function pickTopSignal(raw) {
  if (raw.friendsGoing >= 2) return 'friends_going'
  if (raw.followedOrganizer) return 'followed_organizer'
  if (raw.friendsGoing === 1) return 'friends_going'
  if (raw.friendsSaved >= 2) return 'friends_saved'
  if (raw.orgFollowedByFriends >= 2) return 'org_followed_by_friends'
  if (raw.repeatAttendees >= 2) return 'repeat_attendees'
  if (raw.sharedCategoryMomentum >= 3) return 'shared_category_momentum'
  if (raw.friendsSaved === 1) return 'friends_saved'
  return null
}

async function queryFriendsGoing(friendIds, eventIds) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT event_id, COUNT(*)::int AS cnt
     FROM rsvps
     WHERE user_id = ANY($1::uuid[]) AND event_id = ANY($2::uuid[]) AND status = 'going'
     GROUP BY event_id`,
    friendIds,
    eventIds,
  )
  return new Map(rows.map((r) => [r.event_id, r.cnt]))
}

async function queryFriendsSaved(friendIds, eventIds) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT event_id, COUNT(*)::int AS cnt
     FROM saved_events
     WHERE user_id = ANY($1::uuid[]) AND event_id = ANY($2::uuid[])
     GROUP BY event_id`,
    friendIds,
    eventIds,
  )
  return new Map(rows.map((r) => [r.event_id, r.cnt]))
}

async function queryFollowedOrganizer(userId, eventIds) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.id AS event_id
     FROM events e
     JOIN follows f ON f.followee_id = e.organizer_id AND f.follower_id = $1::uuid
     WHERE e.id = ANY($2::uuid[]) AND e.organizer_id IS NOT NULL`,
    userId,
    eventIds,
  )
  return new Set(rows.map((r) => r.event_id))
}

async function queryOrgFollowedByFriends(friendIds, eventIds) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.id AS event_id, COUNT(DISTINCT f.follower_id)::int AS cnt
     FROM events e
     JOIN follows f ON f.followee_id = e.organizer_id AND f.follower_id = ANY($1::uuid[])
     WHERE e.id = ANY($2::uuid[]) AND e.organizer_id IS NOT NULL
     GROUP BY e.id`,
    friendIds,
    eventIds,
  )
  return new Map(rows.map((r) => [r.event_id, r.cnt]))
}

async function querySharedCategoryMomentum(friendIds, categoryIds) {
  if (categoryIds.length === 0) return new Map()
  const rows = await prisma.$queryRawUnsafe(
    `SELECT category_id, COUNT(DISTINCT user_id)::int AS cnt
     FROM interaction_events
     WHERE user_id = ANY($1::uuid[])
       AND category_id = ANY($2::uuid[])
       AND interaction_type IN ('rsvp', 'save', 'click', 'claim_spot')
       AND created_at > now() - interval '14 days'
     GROUP BY category_id`,
    friendIds,
    categoryIds,
  )
  return new Map(rows.map((r) => [r.category_id, r.cnt]))
}

async function queryRepeatAttendees(userId, friendIds, eventIds) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT candidate.event_id, COUNT(DISTINCT candidate.user_id)::int AS cnt
     FROM rsvps candidate
     WHERE candidate.event_id = ANY($3::uuid[])
       AND candidate.status = 'going'
       AND candidate.user_id = ANY($2::uuid[])
       AND candidate.user_id IN (
         SELECT past_friend.user_id
         FROM rsvps past_user
         JOIN rsvps past_friend ON past_friend.event_id = past_user.event_id
           AND past_friend.user_id = ANY($2::uuid[])
           AND past_friend.status = 'going'
         WHERE past_user.user_id = $1::uuid AND past_user.status = 'going'
       )
     GROUP BY candidate.event_id`,
    userId,
    friendIds,
    eventIds,
  )
  return new Map(rows.map((r) => [r.event_id, r.cnt]))
}

export { SIGNAL_WEIGHTS, getFriendIds, pickTopSignal }
export function clearCache() {
  friendCache.clear()
}
