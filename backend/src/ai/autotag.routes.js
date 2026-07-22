// POST /api/ai/autotag  — preview endpoint for the Create Event form.
//
// Given a draft {title, description, is_free?, price_min?} the caller gets
// back the exact tags we WOULD write if they hit Publish now. Renders under
// the description field as chips the organizer can accept/edit. No DB writes.
//
// Deliberately public-ish (no requireAuth): organizers hit it before their
// first save when the event doesn't exist yet, and we don't want a 401 in
// the middle of the compose flow. It's purely a computation over posted text
// — no user data, no PII, no cost.

import { Router } from 'express'
import { autotagEvent } from './autotag.js'
import { fail } from '../auth/middleware.js'

const router = Router()

const MAX_TITLE_LEN = 200
const MAX_DESCRIPTION_LEN = 4000

router.post('/autotag', (req, res) => {
  const b = req.body ?? {}
  const title = typeof b.title === 'string' ? b.title.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''

  if (!title && !description) {
    return fail(res, 400, 'VALIDATION_ERROR', 'title or description is required')
  }
  if (title.length > MAX_TITLE_LEN) {
    return fail(res, 400, 'VALIDATION_ERROR', `title must be under ${MAX_TITLE_LEN} chars`)
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    return fail(
      res,
      400,
      'VALIDATION_ERROR',
      `description must be under ${MAX_DESCRIPTION_LEN} chars`,
    )
  }

  const result = autotagEvent({
    title,
    description,
    isFree: b.is_free === true,
    priceMin: b.price_min != null ? Number(b.price_min) : null,
    // Frontend sends the display name ("Nightlife"); the tagger lowercases +
    // normalizes to the slug. Accepting either form keeps callers honest.
    categorySlug: typeof b.category === 'string' ? b.category : null,
  })

  // Reshape into a UI-friendly envelope. Interests come first (they're the
  // recommendation-critical ones), vibe second, price_tier as a distinct
  // field (the UI already renders price separately from tags). The category
  // fallback is only present when no interest keyword matched — the UI can
  // render it as a lighter chip so the organizer sees the recommender will
  // still find them via their category pick.
  res.json({
    data: {
      interests: result.interests.map((i) => ({
        slug: i.slug,
        label: labelFor(i.slug),
        confidence: Number(i.confidence.toFixed(3)),
        matched_keywords: i.matchedKeywords,
      })),
      vibe: result.vibe
        ? {
            slug: result.vibe.slug,
            confidence: Number(result.vibe.confidence.toFixed(3)),
            matched_keywords: result.vibe.matchedKeywords,
          }
        : null,
      price_tier: result.priceTier,
      category_fallback: result.categoryFallback,
    },
  })
})

// Duplicated small label lookup so the routes file doesn't reach into
// autotag.js internals. The autotag module keeps the canonical map — this is a
// short mirror for the preview response only.
const LABELS = {
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

function labelFor(slug) {
  return LABELS[slug] ?? slug
}

export default router
