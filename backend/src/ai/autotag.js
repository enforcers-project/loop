// Rule-based event auto-tagger. Zero-cost, deterministic, no LLM.
//
// Given a native event's title + description (+ any organizer-supplied tags), we
// return:
//   - interestSlugs[]  → written as EventTag rows with source='ai', so the
//                        recommender's user-interest ↔ event-tag overlap match
//                        actually has data to work with (schema §6.3 EventTag).
//   - vibe             → one of a fixed enum ('hype' | 'chill' | 'upscale' |
//                        'casual' | 'competitive' | 'social') — also emitted as
//                        a `vibe:<x>` tag so it flows through the same table
//                        (no schema change).
//   - priceTier        → derived, not "AI": 'free' | '$' | '$$' | '$$$'.
//                        Emitted as `tier:<x>` for consistency.
//   - rationale        → short list of which words fired which tag, so the
//                        organizer submit form can render "we tagged this
//                        Afrobeats because your description says 'amapiano'"
//                        instead of a black box.
//
// Design notes:
//   - Rules over LLM: our taxonomy is tiny (24 interests + 6 categories) and
//     the whole point of auto-tagging is deterministic, explainable input to
//     the recommender. A model that occasionally misclassifies would poison
//     the cold-start vector for everyone.
//   - Word-boundary matches. "brunching" must NOT trigger `brunch` unless the
//     token boundary is real. "afro" alone does not fire `afrobeats` — the
//     phrase list has to be specific enough to avoid false positives on
//     something like "afro-cuban jazz". Prefer overspecific keywords.
//   - Confidence is proportional to hit count, capped at 0.95. It's a hint for
//     downstream ranking, not a threshold — we don't drop matches below a
//     score. Cold-start needs recall > precision.

const INTEREST_RULES = [
  // ── Music
  { slug: 'afrobeats', category: 'music', keywords: ['afrobeats', 'amapiano', 'afrobeat', 'afro nation', 'afro house', 'burna boy', 'wizkid', 'davido', 'rema'] },
  { slug: 'hiphop',    category: 'music', keywords: ['hip-hop', 'hip hop', 'hiphop', 'rap', 'cypher', 'freestyle', 'trap', 'drill'] },
  { slug: 'house',     category: 'music', keywords: ['house music', 'deep house', 'edm', 'techno', 'dj set', 'rave', 'warehouse night'] },
  { slug: 'live-bands', category: 'music', keywords: ['live band', 'live bands', 'live jazz', 'jazz night', 'acoustic', 'open mic', 'indie rock', 'reggae', 'r&b', 'karaoke', 'salsa', 'bachata', 'merengue', 'live music'] },

  // ── Nightlife
  { slug: 'rooftop',   category: 'nightlife', keywords: ['rooftop', 'skyline'] },
  // "cdjs" and "open decks" are the giveaway signals for a DJ/nightclub event
  // even when the copy avoids the word "club" itself.
  { slug: 'clubbing',  category: 'nightlife', keywords: ['nightclub', 'club night', 'clubbing', 'silent disco', 'disco', 'cdj', 'cdjs', 'open decks', 'dj community'] },
  // "wine bar" is too broad — a night market with a wine bar isn't a lounge.
  // Require the venue kind to be the subject, not a stall description.
  { slug: 'lounges',   category: 'nightlife', keywords: ['lounge', 'speakeasy', 'cocktail bar', 'wine lounge'] },
  { slug: 'day-party', category: 'nightlife', keywords: ['day party', 'day-party', 'pool party', 'sunset party', 'yacht party', 'boat party', 'booze cruise', 'cruise party', 'catamaran'] },

  // ── Sports
  // 5v5/7v7/11v11 don't imply soccer — 5v5 is the standard basketball pickup
  // format. Keep the specific soccer signals and drop the ambiguous scorelines.
  // 5-a-side is unambiguously soccer.
  { slug: 'soccer',    category: 'sports', keywords: ['soccer', 'futbol', 'football pickup', '7v7', '11v11', '5-a-side', '5 a side'] },
  { slug: 'basketball', category: 'sports', keywords: ['basketball', 'hoops', 'pickup basketball', 'open run', '5v5'] },
  { slug: 'volleyball', category: 'sports', keywords: ['volleyball', 'beach volleyball'] },
  { slug: 'running',   category: 'sports', keywords: ['run club', 'running club', 'running group', 'morning run', 'trail run', '5k', '10k'] },

  // ── Networking
  { slug: 'startups',  category: 'networking', keywords: ['startup', 'startups', 'founder', 'founders', 'pitch night', 'demo day', 'vc mixer'] },
  { slug: 'tech',      category: 'networking', keywords: ['tech meetup', 'tech talk', 'engineering', 'developer', 'ai agents', 'hackathon', 'ai meetup', 'lightning talks', 'design critique', 'ux', 'ui', 'figma', 'coworking', 'co-working', 'indie hackers', 'agent architectures'] },
  { slug: 'career',    category: 'networking', keywords: ['career fair', 'job fair', 'hiring', 'recruiter'] },
  { slug: 'creators',  category: 'networking', keywords: ['creator mixer', 'creators', 'content creator', 'influencer'] },

  // ── Food
  { slug: 'foodie',    category: 'food', keywords: ['food festival', 'food fest', 'night market', 'street food', 'foodie', 'food crawl', 'taco', 'tacos', 'taqueria'] },
  { slug: 'brunch',    category: 'food', keywords: ['brunch', 'bottomless brunch', 'mimosa'] },
  { slug: 'popups',    category: 'food', keywords: ['pop-up', 'popup', 'pop up dinner', 'supper club'] },
  { slug: 'tastings',  category: 'food', keywords: ['tasting', 'wine tasting', 'cupping', 'flight'] },

  // ── Campus
  { slug: 'campus-life', category: 'campus', keywords: ['welcome week', 'block party', 'quad', 'campus life', 'student union'] },
  { slug: 'greek',       category: 'campus', keywords: ['greek life', 'fraternity', 'sorority', 'rush week'] },
  { slug: 'clubs-orgs',  category: 'campus', keywords: ['student club', 'clubs & orgs', 'club fair'] },
  { slug: 'study-jams',  category: 'campus', keywords: ['study jam', 'study group', 'midterms', 'finals week'] },
]

const VIBE_RULES = [
  { slug: 'hype',        keywords: ['warehouse', 'rave', 'massive', 'sold out', 'lineup', 'headliner', 'wall of sound', 'go crazy', 'turn up'] },
  { slug: 'upscale',     keywords: ['rooftop', 'skyline', 'cocktail', 'speakeasy', 'wine bar', 'dress code', 'dress to impress', 'natural wine', 'tasting menu'] },
  { slug: 'chill',       keywords: ['acoustic', 'lounge', 'low-key', 'low key', 'intimate', 'sunset', 'jazz', 'coffee', 'sax', 'saxophone', 'brunch'] },
  { slug: 'competitive', keywords: ['tournament', 'league', 'bracket', 'winner stays', 'match play', 'ranked'] },
  { slug: 'casual',      keywords: ['pickup', 'all levels', 'all skill levels', 'beginner friendly', 'no experience', 'just show up', 'casual'] },
  { slug: 'social',      keywords: ['mixer', 'meet and greet', 'networking', 'meetup', 'social hour', 'happy hour', 'open networking'] },
]

// Escape a keyword for use in a regex. All keywords are lowercase, ASCII, and
// mostly whitespace/hyphens — but users can add new ones and forget to escape.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Match keyword with token boundaries so "brunching" doesn't fire "brunch".
// For multi-word phrases we anchor to whitespace/punctuation boundaries. For
// single words we use \b. Case-insensitive throughout.
function matchesKeyword(haystack, keyword) {
  const escaped = escapeRegex(keyword)
  // Multi-word phrase: rely on space/punctuation surroundings.
  if (/\s/.test(keyword)) {
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
  }
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack)
}

/**
 * Given the free-form text of an event, return which INTEREST_RULES entries
 * matched and which keywords fired for each — the array is deduped by slug and
 * carries the specific phrases that hit, so the UI can render "tagged
 * afrobeats because your description says 'amapiano'".
 */
function findInterestMatches(text) {
  const hits = []
  for (const rule of INTEREST_RULES) {
    const matchedKeywords = rule.keywords.filter((kw) => matchesKeyword(text, kw))
    if (matchedKeywords.length > 0) {
      hits.push({
        slug: rule.slug,
        category: rule.category,
        matchedKeywords,
        // Confidence: more matches → higher, capped at 0.95. A single keyword
        // is 0.6 (still worth surfacing), two is 0.75, three+ approaches 0.95.
        confidence: Math.min(0.95, 0.45 + 0.15 * matchedKeywords.length),
      })
    }
  }
  return hits
}

/**
 * Best-guess vibe from the freeform text, using the same keyword matcher.
 * Returns { slug, matchedKeywords, confidence } or null if nothing hits.
 * When multiple vibes match, the one with the most keyword hits wins. Ties
 * break in VIBE_RULES declaration order — hype > upscale > chill > ... — which
 * is intentional: the more specific vibes are declared first.
 */
function findVibe(text) {
  let best = null
  for (const rule of VIBE_RULES) {
    const matchedKeywords = rule.keywords.filter((kw) => matchesKeyword(text, kw))
    if (matchedKeywords.length === 0) continue
    if (!best || matchedKeywords.length > best.matchedKeywords.length) {
      best = {
        slug: rule.slug,
        matchedKeywords,
        confidence: Math.min(0.9, 0.5 + 0.15 * matchedKeywords.length),
      }
    }
  }
  return best
}

/**
 * Derive a coarse price tier from priceMin/priceMax/isFree. NOT AI — pure
 * bucketing. Emitted as a tag (`tier:free` etc.) so it flows through the same
 * EventTag surface without a schema change.
 *
 * - isFree === true  → 'free'  (never falls through to price bucketing)
 * - priceMin null    → null    (unknown price stays unknown; do not guess free)
 * - 0                → 'free'
 * - < $20            → '$'
 * - < $50            → '$$'
 * - else             → '$$$'
 */
function derivePriceTier({ isFree, priceMin }) {
  if (isFree === true) return 'free'
  if (priceMin == null) return null
  const p = Number(priceMin)
  if (!Number.isFinite(p)) return null
  if (p === 0) return 'free'
  if (p < 20) return '$'
  if (p < 50) return '$$'
  return '$$$'
}

/**
 * The public API. Runs the full tag pipeline over an event's text + price and
 * returns a normalized shape ready to be written as EventTag rows (or shown as
 * suggestions in the create-event form before persist).
 *
 * @param {object} event
 * @param {string} event.title
 * @param {string} [event.description]
 * @param {boolean} [event.isFree]
 * @param {number|null} [event.priceMin]
 * @param {string} [event.categorySlug]  Canonical category slug ('music',
 *   'nightlife', ...). Used as a fallback: if no specific keyword rules match,
 *   we still emit a low-confidence "category:<slug>" tag so the event carries
 *   at least one interest-side signal — a novel event ("futureforce yacht
 *   party") deserves to be discoverable by users who picked its category at
 *   onboarding even before the recommender has learned its shape.
 * @param {string[]} [event.organizerTags]  Freeform hashtag-style tags the
 *   organizer typed. We fold them into the matching text so a stray `#house`
 *   still triggers the `house` interest even if the description doesn't say
 *   it.
 *
 * @returns {{
 *   interests: {slug: string, label?: string, confidence: number, matchedKeywords: string[]}[],
 *   vibe:     {slug: string, confidence: number, matchedKeywords: string[]} | null,
 *   priceTier: 'free'|'$'|'$$'|'$$$' | null,
 *   categoryFallback: {slug: string, label: string} | null,
 *   tagWrites: {slug: string, label: string, source: string, confidence: number|null}[],
 * }}
 */
export function autotagEvent(event) {
  const text = [
    event.title ?? '',
    event.description ?? '',
    ...(event.organizerTags ?? []),
  ]
    .join('\n')
    .toLowerCase()

  const interests = findInterestMatches(text)
  const vibe = findVibe(text)
  const priceTier = derivePriceTier({
    isFree: event.isFree,
    priceMin: event.priceMin,
  })

  // Category fallback: only kicks in when no interest keyword matched. We
  // don't want it competing with real matches — a keyword-matched interest is
  // strictly more informative than "this event's category is Nightlife," so
  // adding both would just dilute the recommender signal.
  const categorySlug = normalizeCategorySlug(event.categorySlug)
  const categoryFallback =
    interests.length === 0 && categorySlug
      ? { slug: categorySlug, label: CATEGORY_LABELS[categorySlug] ?? categorySlug }
      : null

  // Build the tagWrites array — the exact shape the DB layer needs. Slug is
  // required-unique per (event, slug) so we normalize everything here.
  const tagWrites = []
  for (const i of interests) {
    tagWrites.push({
      slug: i.slug,
      label: humanLabelForInterest(i.slug),
      source: 'ai',
      confidence: i.confidence,
    })
  }
  if (categoryFallback) {
    tagWrites.push({
      slug: `category:${categoryFallback.slug}`,
      label: categoryFallback.label,
      // 'system' since it comes from the organizer's dropdown pick, not from
      // the language model interpreting free text. Low confidence so the
      // recommender treats it as a weak hint, not a strong signal.
      source: 'system',
      confidence: 0.3,
    })
  }
  if (vibe) {
    tagWrites.push({
      slug: `vibe:${vibe.slug}`,
      label: `Vibe: ${capitalize(vibe.slug)}`,
      source: 'ai',
      confidence: vibe.confidence,
    })
  }
  if (priceTier) {
    tagWrites.push({
      slug: `tier:${priceTier}`,
      label: `Price: ${priceTier}`,
      // priceTier is deterministic, not inferred — mark it as 'system' so the
      // rec engine can weight it differently from noisy AI tags if we ever
      // want to. Confidence is null (not applicable).
      source: 'system',
      confidence: null,
    })
  }

  return { interests, vibe, priceTier, categoryFallback, tagWrites }
}

// Accept either the slug ('nightlife') or the human name ('Nightlife') and
// return the canonical slug (or null when unknown). The frontend send-shape
// varies between the preview endpoint (uses the display name from the picker)
// and the event write path (uses the DB uuid, no slug at all); the persist
// layer resolves either into the DB slug before calling us.
function normalizeCategorySlug(input) {
  if (!input) return null
  const norm = String(input).trim().toLowerCase()
  if (CATEGORY_LABELS[norm]) return norm
  return null
}

const CATEGORY_LABELS = {
  music: 'Music',
  nightlife: 'Nightlife',
  sports: 'Sports',
  networking: 'Networking',
  food: 'Food',
  campus: 'Campus',
}

// Human labels for the 24 canonical interests — used when the tag row is the
// only thing an EventTag consumer has (some read paths don't join the
// Interest table). Kept in-file so the tagger has no cross-module dep.
const INTEREST_LABELS = {
  afrobeats: 'Afrobeats',
  hiphop: 'Hip-Hop',
  house: 'House / EDM',
  'live-bands': 'Live Bands',
  rooftop: 'Rooftop Parties',
  clubbing: 'Clubbing',
  lounges: 'Lounges',
  'day-party': 'Day Parties',
  soccer: 'Soccer',
  basketball: 'Basketball',
  volleyball: 'Volleyball',
  running: 'Running Clubs',
  startups: 'Startups',
  tech: 'Tech Meetups',
  career: 'Career Fairs',
  creators: 'Creator Mixers',
  foodie: 'Food Festivals',
  brunch: 'Brunch',
  popups: 'Pop-ups',
  tastings: 'Tastings',
  'campus-life': 'Campus Life',
  greek: 'Greek Life',
  'clubs-orgs': 'Clubs & Orgs',
  'study-jams': 'Study Jams',
}

function humanLabelForInterest(slug) {
  return INTEREST_LABELS[slug] ?? slug
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Named exports for tests + the preview endpoint.
export const _internal = {
  INTEREST_RULES,
  VIBE_RULES,
  findInterestMatches,
  findVibe,
  derivePriceTier,
  matchesKeyword,
}
