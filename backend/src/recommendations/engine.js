import { randomUUID } from 'node:crypto'
import prisma from '../lib/prisma.js'
import { toEventCard } from '../events/serialize.js'
import { computeSocialScores } from './social.js'
import { haversine, proximityScore } from './proximity.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const PRE_FILTER_LIMIT = 400
const KNN_K = 80
const DEFAULT_RADIUS_KM = 40
const CHURN_GUARD_DAYS = 3
const COLD_START_THRESHOLD = 5

const WEIGHTS = {
  normal: {
    cosSim: 0.43,
    affinity: 0.12,
    recency: 0.1,
    popularity: 0.08,
    freshness: 0.06,
    social: 0.11,
    proximity: 0.1,
  },
  coldStart: {
    cosSim: 0.3,
    affinity: 0.1,
    recency: 0.12,
    popularity: 0.13,
    freshness: 0.06,
    social: 0.16,
    proximity: 0.13,
  },
}

const EXPLORATION_RATE = 0.1
const EXPLORATION_BUMP = 0.15

const MMR_LAMBDA = 0.7
const MAX_CONSECUTIVE_SAME_CATEGORY = 3
const MAX_CATEGORY_SHARE = 0.4

const RATIONALE_TEMPLATES = {
  save: (label) => `Because you saved ${label}`,
  rsvp: (label) => `Because you're going to ${label}`,
  follow: (label) => `Because you follow ${label}`,
  click: (label) => `Because you showed interest in ${label}`,
  view: (label) => `Because you viewed ${label}`,
  category_click: (label) => `Because you like ${label}`,
  tag_click: (label) => `Because you're into ${label}`,
  share: (label) => `Because you shared ${label}`,
  claim_spot: (label) => `Because you joined ${label}`,
}

const SOCIAL_RATIONALE = {
  friends_going: (count) => `${count} friend${count > 1 ? 's' : ''} going`,
  friends_saved: (count) => `${count} friend${count > 1 ? 's' : ''} saved this`,
  followed_organizer: () => 'Hosted by someone you follow',
  org_followed_by_friends: (count) => `${count} friend${count > 1 ? 's' : ''} follow the host`,
  repeat_attendees: (count) => `${count} friend${count > 1 ? 's' : ''} you've been out with`,
  shared_category_momentum: () => 'Your friends are into this lately',
}

export async function generateRecommendations(userId, options = {}) {
  const { context = {}, limit: rawLimit } = options
  const limit = Math.min(Math.max(Number(rawLimit) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  const userVector = await fetchUserVector(userId)
  const affinities = await fetchAffinities(userId)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { homeLat: true, homeLng: true, homeCity: true, locationRadiusKm: true },
  })

  if (!userVector && affinities.length === 0) {
    return fallbackPopularityFeed(userId, user, context, limit)
  }

  const candidates = await preFilter(userId, user, context)

  if (candidates.length === 0) {
    return fallbackPopularityFeed(userId, user, context, limit)
  }

  let ranked
  if (userVector) {
    ranked = await knnRank(userVector.embedding, candidates)
  } else {
    ranked = candidates.map((c) => ({ ...c, cosSim: 0 }))
  }

  const affinityMap = new Map(affinities.map((a) => [a.categoryId, Number(a.score)]))
  const maxAffinity = Math.max(1, ...affinities.map((a) => Number(a.score)))

  const signalCount = userVector?.signalCount ?? 0
  const isColdStart = signalCount < COLD_START_THRESHOLD
  const w = isColdStart ? WEIGHTS.coldStart : WEIGHTS.normal

  const socialScores = await computeSocialScores(userId, ranked)

  const userLat = user?.homeLat ? Number(user.homeLat) : null
  const userLng = user?.homeLng ? Number(user.homeLng) : null

  const reRanked = reRank(ranked, affinityMap, maxAffinity, w, socialScores, userLat, userLng)

  const diverse = applyMMR(reRanked, limit)

  const feedRunId = randomUUID()
  const topSignals = await fetchTopSignals(userId)

  const results = diverse.map((item, idx) => {
    const rationale = generateRationale(item, affinityMap, topSignals, socialScores)
    return {
      event: item.event,
      score: item.finalScore,
      rank: idx + 1,
      rationale,
      feedRunId,
      distanceMiles: item.distanceMiles,
    }
  })

  await persistImpressions(userId, results, feedRunId, signalCount)

  return {
    data: results.map((r) => ({
      ...toEventCard(r.event),
      score: r.score,
      rationale: r.rationale,
      recommendationId: r.impressionId,
      distanceMiles: r.distanceMiles,
    })),
    feedRunId,
    nextCursor: null,
  }
}

async function fetchUserVector(userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT embedding::text as embedding_text, signal_count, model, vector_version
     FROM user_preference_vectors WHERE user_id = $1::uuid`,
    userId,
  )
  if (rows.length === 0) return null
  return {
    embedding: rows[0].embedding_text,
    signalCount: rows[0].signal_count,
    model: rows[0].model,
  }
}

async function fetchAffinities(userId) {
  return prisma.userCategoryAffinity.findMany({
    where: { userId },
    orderBy: { score: 'desc' },
  })
}

async function preFilter(userId, user, context) {
  const lat = user?.homeLat ? Number(user.homeLat) : null
  const lng = user?.homeLng ? Number(user.homeLng) : null
  const radiusKm = user?.locationRadiusKm ?? DEFAULT_RADIUS_KM
  const categoryFilter = context?.category ?? null

  let geoClause = ''
  const params = [userId, CHURN_GUARD_DAYS]
  let paramIdx = 3

  if (lat && lng) {
    geoClause = `AND earth_distance(
      ll_to_earth(e.lat, e.lng),
      ll_to_earth($${paramIdx}::float, $${paramIdx + 1}::float)
    ) <= $${paramIdx + 2}::float * 1000`
    params.push(lat, lng, radiusKm)
    paramIdx += 3
  } else if (user?.homeCity) {
    geoClause = `AND e.city ILIKE $${paramIdx}`
    params.push(user.homeCity)
    paramIdx += 1
  }

  let categoryClause = ''
  if (categoryFilter) {
    categoryClause = `AND e.category_id = (SELECT id FROM categories WHERE slug = $${paramIdx})`
    params.push(categoryFilter)
    paramIdx += 1
  }

  const query = `
    SELECT e.id, e.title, e.slug, e.flyer_url, e.starts_at, e.ends_at, e.timezone,
           e.venue_name, e.city, e.lat, e.lng, e.price_min, e.price_max, e.is_free,
           e.currency, e.age_label, e.capacity, e.is_sports, e.rsvp_count, e.save_count,
           e.view_count, e.external_url, e.external_organizer_name, e.source, e.category_id,
           e.organizer_id, e.description,
           c.slug as cat_slug, c.name as cat_name, c.color_hex as cat_color_hex,
           sd.players_needed, sd.players_signed_up
    FROM events e
    JOIN categories c ON c.id = e.category_id
    LEFT JOIN sports_details sd ON sd.event_id = e.id
    WHERE e.status = 'published'
      AND e.starts_at BETWEEN now() AND now() + interval '30 days'
      ${geoClause}
      ${categoryClause}
      AND e.id NOT IN (
        SELECT event_id FROM rsvps WHERE user_id = $1::uuid AND status = 'going'
      )
      AND e.id NOT IN (
        SELECT event_id FROM recommendation_impressions
        WHERE user_id = $1::uuid AND shown_at > now() - interval '${CHURN_GUARD_DAYS} days'
          AND clicked = false
      )
    ORDER BY e.starts_at ASC
    LIMIT ${PRE_FILTER_LIMIT}
  `

  const rows = await prisma.$queryRawUnsafe(query, ...params)
  return rows.map(rowToCandidate)
}

function rowToCandidate(row) {
  return {
    event: {
      id: row.id,
      title: row.title,
      slug: row.slug,
      flyerUrl: row.flyer_url,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      venueName: row.venue_name,
      city: row.city,
      lat: row.lat ? Number(row.lat) : null,
      lng: row.lng ? Number(row.lng) : null,
      priceMin: row.price_min,
      priceMax: row.price_max,
      isFree: row.is_free,
      currency: row.currency,
      ageLabel: row.age_label,
      capacity: row.capacity,
      isSports: row.is_sports,
      rsvpCount: row.rsvp_count,
      saveCount: row.save_count,
      viewCount: row.view_count,
      externalUrl: row.external_url,
      externalOrganizerName: row.external_organizer_name,
      source: row.source,
      categoryId: row.category_id,
      organizerId: row.organizer_id,
      description: row.description,
      category: { slug: row.cat_slug, name: row.cat_name, colorHex: row.cat_color_hex },
      organizer: null,
      sportsDetail:
        row.players_needed != null
          ? { playersNeeded: row.players_needed, playersSignedUp: row.players_signed_up }
          : null,
    },
    categoryId: row.category_id,
    rsvpCount: row.rsvp_count ?? 0,
    saveCount: row.save_count ?? 0,
    playersSignedUp: row.players_signed_up ?? 0,
    startsAt: new Date(row.starts_at),
  }
}

async function knnRank(userEmbeddingText, candidates) {
  if (candidates.length === 0) return []

  const eventIds = candidates.map((c) => c.event.id)

  const rows = await prisma.$queryRawUnsafe(
    `SELECT event_id, (embedding <=> $1::vector) AS cos_dist
     FROM event_embeddings
     WHERE event_id = ANY($2::uuid[])
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    userEmbeddingText,
    eventIds,
    KNN_K,
  )

  const distMap = new Map(rows.map((r) => [r.event_id, Number(r.cos_dist)]))

  const ranked = candidates
    .map((c) => {
      const dist = distMap.get(c.event.id)
      if (dist === undefined) return { ...c, cosSim: 0 }
      return { ...c, cosSim: 1 - dist }
    })
    .sort((a, b) => b.cosSim - a.cosSim)
    .slice(0, KNN_K)

  return ranked
}

function reRank(
  candidates,
  affinityMap,
  maxAffinity,
  w,
  socialScores = new Map(),
  userLat = null,
  userLng = null,
) {
  const maxPopularity = Math.max(
    1,
    ...candidates.map((c) => c.rsvpCount + c.playersSignedUp + 2 * c.saveCount),
  )
  const now = Date.now()

  return candidates
    .map((c) => {
      const recencyDays = Math.max(0, (c.startsAt.getTime() - now) / (1000 * 60 * 60 * 24))
      const recency = Math.exp(-recencyDays / 14)

      const rawAffinity = affinityMap.get(c.categoryId) ?? 0
      const affinity = maxAffinity > 0 ? rawAffinity / maxAffinity : 0

      const rawPop = c.rsvpCount + c.playersSignedUp + 2 * c.saveCount
      const popularity = Math.log1p(rawPop) / Math.log1p(maxPopularity)

      const freshness = 1.0

      const social = socialScores.get(c.event.id)?.score ?? 0

      let proximity = 0.5
      let distanceMiles = null
      if (userLat != null && userLng != null && c.event.lat != null && c.event.lng != null) {
        distanceMiles = haversine(userLat, userLng, c.event.lat, c.event.lng)
        proximity = proximityScore(distanceMiles)
      }

      const isExploration = Math.random() < EXPLORATION_RATE
      const epsilon = isExploration ? EXPLORATION_BUMP : 0

      const score =
        w.cosSim * c.cosSim +
        w.affinity * affinity +
        w.recency * recency +
        w.popularity * popularity +
        w.freshness * freshness +
        w.social * social +
        w.proximity * proximity +
        epsilon

      return {
        ...c,
        finalScore: score,
        affinity,
        recency,
        popularity,
        social,
        proximity,
        distanceMiles,
      }
    })
    .sort((a, b) => b.finalScore - a.finalScore)
}

function applyMMR(candidates, limit) {
  if (candidates.length === 0) return []

  const selected = []
  const remaining = [...candidates]
  const categoryCount = new Map()
  let consecutiveSameCategory = 0
  let lastCategoryId = null

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = -1
    let bestMmr = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]

      const catId = candidate.categoryId
      const catTotal = categoryCount.get(catId) ?? 0
      if (catTotal >= Math.ceil(limit * MAX_CATEGORY_SHARE)) continue
      if (catId === lastCategoryId && consecutiveSameCategory >= MAX_CONSECUTIVE_SAME_CATEGORY)
        continue

      let maxSimToSelected = 0
      if (selected.length > 0) {
        for (const s of selected) {
          if (s.categoryId === candidate.categoryId) {
            maxSimToSelected = Math.max(maxSimToSelected, 0.5)
          }
        }
      }

      const mmr = MMR_LAMBDA * candidate.finalScore - (1 - MMR_LAMBDA) * maxSimToSelected
      if (mmr > bestMmr) {
        bestMmr = mmr
        bestIdx = i
      }
    }

    if (bestIdx === -1) break

    const pick = remaining.splice(bestIdx, 1)[0]
    selected.push(pick)

    const catId = pick.categoryId
    categoryCount.set(catId, (categoryCount.get(catId) ?? 0) + 1)

    if (catId === lastCategoryId) {
      consecutiveSameCategory++
    } else {
      consecutiveSameCategory = 1
      lastCategoryId = catId
    }
  }

  return selected
}

async function fetchTopSignals(userId) {
  const rows = await prisma.interactionEvent.findMany({
    where: {
      userId,
      interactionType: {
        in: [
          'save',
          'rsvp',
          'follow',
          'click',
          'share',
          'claim_spot',
          'category_click',
          'tag_click',
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { event: { select: { id: true, title: true, categoryId: true } } },
  })
  return rows
}

function generateRationale(item, affinityMap, topSignals, socialScores = new Map()) {
  const eventCategoryId = item.categoryId
  const socialData = socialScores.get(item.event.id)

  if (socialData && socialData.topSignal && socialData.score > 0.1) {
    const templateFn = SOCIAL_RATIONALE[socialData.topSignal]
    if (templateFn) {
      const count = socialData.raw[signalKeyFromTop(socialData.topSignal)] ?? 1
      const text = templateFn(count)
      return { text, signal: null, socialSignal: socialData.topSignal }
    }
  }

  const matchingSignal = topSignals.find((s) => {
    if (s.eventId === item.event.id) return true
    if (s.event?.categoryId === eventCategoryId) return true
    if (s.categoryId === eventCategoryId) return true
    return false
  })

  if (matchingSignal) {
    const templateFn = RATIONALE_TEMPLATES[matchingSignal.interactionType]
    if (templateFn) {
      const label = matchingSignal.event?.title || item.event.category?.name || 'events like this'
      const text = templateFn(label)
      return {
        text: text.length > 168 ? text.slice(0, 165) + '...' : text,
        signal: matchingSignal.interactionType,
      }
    }
  }

  const categoryAffinity = affinityMap.get(eventCategoryId)
  if (categoryAffinity && categoryAffinity > 0) {
    const catName = item.event.category?.name || 'this category'
    return { text: `Popular in ${catName} near you`, signal: 'category_click' }
  }

  if (item.popularity > 0.5) {
    return { text: 'Trending nearby', signal: null }
  }

  return { text: 'Popular near you', signal: null }
}

function signalKeyFromTop(topSignal) {
  const map = {
    friends_going: 'friendsGoing',
    friends_saved: 'friendsSaved',
    followed_organizer: 'followedOrganizer',
    org_followed_by_friends: 'orgFollowedByFriends',
    repeat_attendees: 'repeatAttendees',
    shared_category_momentum: 'sharedCategoryMomentum',
  }
  return map[topSignal] ?? 'friendsGoing'
}

async function persistImpressions(userId, results, feedRunId, signalCount) {
  if (results.length === 0) return

  const modelVersion = `rec-engine-v1/signal_count:${signalCount}`

  const values = results.map((r, idx) => {
    const id = randomUUID()
    r.impressionId = id
    return `('${id}', '${userId}', '${r.event.id}', '${feedRunId}', ${idx + 1}, ${r.score.toFixed(6)}, ${escapeLiteral(r.rationale.text)}, ${r.rationale.signal ? `'${r.rationale.signal}'` : 'NULL'}, '${modelVersion}', 'for_you', now(), false, false)`
  })

  const query = `
    INSERT INTO recommendation_impressions
      (id, user_id, event_id, feed_run_id, rank, score, rationale_text, rationale_signal, model_version, surface, shown_at, clicked, converted)
    VALUES ${values.join(',\n')}
  `

  try {
    await prisma.$executeRawUnsafe(query)
  } catch (err) {
    console.error('Failed to persist recommendation impressions:', err.message)
  }
}

function escapeLiteral(str) {
  if (!str) return 'NULL'
  return `'${str.replace(/'/g, "''")}'`
}

async function fallbackPopularityFeed(userId, user, context, limit) {
  const cityFilter = user?.homeCity ? `AND e.city ILIKE '${user.homeCity.replace(/'/g, "''")}'` : ''
  const categoryClause = context?.category
    ? `AND c.slug = '${context.category.replace(/'/g, "''")}'`
    : ''

  const query = `
    SELECT e.id, e.title, e.slug, e.flyer_url, e.starts_at, e.ends_at, e.timezone,
           e.venue_name, e.city, e.lat, e.lng, e.price_min, e.price_max, e.is_free,
           e.currency, e.age_label, e.capacity, e.is_sports, e.rsvp_count, e.save_count,
           e.view_count, e.external_url, e.external_organizer_name, e.source, e.category_id,
           e.organizer_id, e.description,
           c.slug as cat_slug, c.name as cat_name, c.color_hex as cat_color_hex,
           sd.players_needed, sd.players_signed_up
    FROM events e
    JOIN categories c ON c.id = e.category_id
    LEFT JOIN sports_details sd ON sd.event_id = e.id
    WHERE e.status = 'published'
      AND e.starts_at > now()
      ${cityFilter}
      ${categoryClause}
    ORDER BY (e.rsvp_count + 2 * e.save_count) DESC, e.starts_at ASC
    LIMIT ${limit}
  `

  const rows = await prisma.$queryRawUnsafe(query)
  const events = rows.map(rowToCandidate)

  const feedRunId = randomUUID()
  const data = events.map((item, idx) => ({
    ...toEventCard(item.event),
    score: 0,
    rationale: { text: 'Popular near you', signal: null },
    recommendationId: null,
    rank: idx + 1,
  }))

  return { data, feedRunId, nextCursor: null }
}
