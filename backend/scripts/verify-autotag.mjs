// Offline smoke test for the rule-based auto-tagger. No DB. No network.
// Runs the tagger against a hand-picked spread of realistic event
// title+description pairs and reports which tags fired. If a row that clearly
// should tag as X comes back with no interests, the rule map needs another
// keyword.
//
// Run:  node backend/scripts/verify-autotag.mjs

import { autotagEvent } from '../src/ai/autotag.js'

const CASES = [
  {
    title: 'Afro Nation Rooftop: Amapiano Edition',
    description:
      'The rooftop is back. Amapiano and Afrobeats all night with a live percussion set, skyline views and the best crowd in the Bay. Dress to impress.',
    isFree: false,
    priceMin: 25,
    expect: ['afrobeats', 'rooftop', 'vibe:upscale'],
  },
  {
    title: 'Warehouse: Deep House Sessions',
    description:
      "An intimate warehouse night with a rotating cast of the Bay's best house DJs. Big sound system, low lights, all vibes.",
    isFree: false,
    priceMin: 15,
    expect: ['house', 'vibe:hype'],
  },
  {
    title: 'Sunday Pickup Soccer — 7v7',
    description:
      'Casual 7v7 run every Sunday morning. Bring a light and dark shirt. All skill levels welcome — we mix teams to keep it fair.',
    isFree: true,
    priceMin: null,
    expect: ['soccer', 'vibe:casual', 'tier:free'],
  },
  {
    title: 'Founders & Funders Mixer',
    description:
      'Meet founders, angels and operators over drinks. Lightning intros at 7, open networking after. RSVP required.',
    isFree: true,
    priceMin: null,
    expect: ['startups', 'vibe:social', 'tier:free'],
  },
  {
    title: 'Night Market: Global Street Eats',
    description:
      '40+ vendors serving street food from around the world, live DJs and a natural-wine bar. Family friendly until 8pm.',
    isFree: false,
    priceMin: 10,
    expect: ['foodie', 'vibe:upscale'],
  },
  {
    title: 'Friday Night Hoops — Open Run',
    description:
      'Full-court 5v5, winner stays on. Indoor court, $5 at the door. Get there early to get in the first games.',
    isFree: false,
    priceMin: 5,
    expect: ['basketball', 'vibe:competitive'],
  },
  {
    title: 'Bottomless Brunch & Beats',
    description:
      'Two hours of bottomless mimosas, a live sax player and a menu of brunch classics with a twist. 21+ after 3pm.',
    isFree: false,
    priceMin: 35,
    expect: ['brunch', 'vibe:chill'],
  },
  {
    title: 'Welcome Week Block Party',
    description:
      'Kick off the semester with food trucks, a DJ, club fair and games on the quad. Free for all students with ID.',
    isFree: true,
    priceMin: null,
    expect: ['campus-life', 'tier:free'],
  },
  // Edge case: unambiguous "no match" — a description with no keywords should
  // return zero interests but still derive a price tier.
  {
    title: 'A vague event with no keywords',
    description: 'Come hang out with us.',
    isFree: true,
    priceMin: null,
    expect: ['tier:free'],
  },
  // Edge case: "brunching" must NOT trigger brunch (word-boundary check).
  {
    title: 'Something else entirely',
    description: 'People will be brunching later, but that is not what this is.',
    isFree: false,
    priceMin: 12,
    expect_missing: ['brunch'],
  },
  // Real regression from user report: "futureforce yacht party" (Nightlife
  // category, no obvious keyword) should tag as day-party via yacht-party rule.
  {
    title: 'futureforce yacht party',
    description: 'Futureforce launchpad yacht party',
    isFree: false,
    priceMin: 234,
    categorySlug: 'nightlife',
    expect: ['day-party', 'tier:$$$'],
  },
  // Category fallback: novel event that hits ZERO keyword rules should still
  // get its category as a fallback tag so the recommender has something.
  {
    title: 'Something Nobody Has Named Yet',
    description: 'A gathering.',
    isFree: false,
    priceMin: 30,
    categorySlug: 'networking',
    expect: ['category:networking', 'tier:$$'],
  },
]

let failed = 0

for (const c of CASES) {
  const result = autotagEvent(c)
  const gotSlugs = result.tagWrites.map((t) => t.slug)

  const missing = (c.expect ?? []).filter((s) => !gotSlugs.includes(s))
  const shouldMiss = (c.expect_missing ?? []).filter((s) => gotSlugs.includes(s))

  const ok = missing.length === 0 && shouldMiss.length === 0
  console.log(`${ok ? 'OK' : 'FAIL'}  ${c.title}`)
  console.log(`      got: ${gotSlugs.join(', ') || '(none)'}`)
  if (missing.length) console.log(`      missing: ${missing.join(', ')}`)
  if (shouldMiss.length) console.log(`      unexpected: ${shouldMiss.join(', ')}`)

  // Also show top interest rationale for the ones that fired.
  for (const i of result.interests) {
    console.log(
      `        interest=${i.slug.padEnd(14)} conf=${i.confidence.toFixed(2)}  from: ${i.matchedKeywords.join(' | ')}`,
    )
  }
  if (result.vibe) {
    console.log(
      `        vibe=${result.vibe.slug.padEnd(14)} conf=${result.vibe.confidence.toFixed(2)}  from: ${result.vibe.matchedKeywords.join(' | ')}`,
    )
  }
  if (result.priceTier) console.log(`        tier=${result.priceTier}`)

  if (!ok) failed++
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`)
process.exit(failed === 0 ? 0 : 1)
