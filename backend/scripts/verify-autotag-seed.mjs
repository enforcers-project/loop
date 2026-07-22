// Run the auto-tagger against every event in the Prisma seed file. No DB. No
// network. Reports coverage: how many events got at least one interest, how
// many got a vibe, and prints the low-signal outliers (events with zero
// interest tags) so we can see which descriptions the rules miss.
//
// Run:  node backend/scripts/verify-autotag-seed.mjs

import { autotagEvent } from '../src/ai/autotag.js'

// Pull the seed events by importing the file. This is a heavy module (large
// literal array) but it's read-only + no side effects.
const seed = await import('../prisma/seed.js').catch(() => null)

// The seed file's `EVENTS` array is not exported — it's local. We'll rely on
// the module having a wrapper export, or we fall back to reading the file
// directly.
let events = seed?.EVENTS
if (!events) {
  // Fallback: read the seed file, extract the `EVENTS` array via a lightweight
  // shape match. This only works because the seed is a plain JS literal.
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const url = await import('node:url')
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  const seedPath = path.join(here, '..', 'prisma', 'seed.js')
  const source = await fs.readFile(seedPath, 'utf8')
  // Extract the EVENTS array bounds and eval it in a light sandbox. This is
  // only safe because we control the seed file's content.
  const start = source.indexOf('const EVENTS = [')
  const marker = 'const EVENTS = '
  const arrStart = source.indexOf('[', start)
  // Walk forward to the matching close-bracket (naive but correct for our
  // seed which never nests bracket-in-string in a way that would fool this).
  let depth = 0
  let end = -1
  let inStr = null
  for (let i = arrStart; i < source.length; i++) {
    const ch = source[i]
    if (inStr) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const literal = source.slice(arrStart, end + 1)
  events = eval(`(${literal})`)
}

if (!Array.isArray(events)) {
  console.error('Could not locate the EVENTS array in prisma/seed.js')
  process.exit(1)
}

let interestHits = 0
let vibeHits = 0
let priceTierHits = 0
const empty = []
const perInterest = new Map()
const perVibe = new Map()

for (const e of events) {
  const result = autotagEvent({
    title: e.title,
    description: e.description,
    isFree: e.isFree,
    priceMin: e.priceMin ?? null,
  })
  if (result.interests.length > 0) interestHits++
  if (result.vibe) vibeHits++
  if (result.priceTier) priceTierHits++
  if (result.interests.length === 0) {
    empty.push({ slug: e.slug, title: e.title })
  }
  for (const i of result.interests) {
    perInterest.set(i.slug, (perInterest.get(i.slug) ?? 0) + 1)
  }
  if (result.vibe) {
    perVibe.set(result.vibe.slug, (perVibe.get(result.vibe.slug) ?? 0) + 1)
  }
}

const n = events.length
console.log(`=== Auto-tag coverage over ${n} seed events ===\n`)
console.log(`Interests fired: ${interestHits}/${n} (${((interestHits / n) * 100).toFixed(1)}%)`)
console.log(`Vibe fired:      ${vibeHits}/${n} (${((vibeHits / n) * 100).toFixed(1)}%)`)
console.log(`Price tier:      ${priceTierHits}/${n} (${((priceTierHits / n) * 100).toFixed(1)}%)`)

console.log('\n== Per-interest hits ==')
const sortedInterest = [...perInterest.entries()].sort((a, b) => b[1] - a[1])
for (const [slug, count] of sortedInterest) {
  console.log(`  ${slug.padEnd(15)} ${count}`)
}

console.log('\n== Per-vibe hits ==')
const sortedVibe = [...perVibe.entries()].sort((a, b) => b[1] - a[1])
for (const [slug, count] of sortedVibe) {
  console.log(`  ${slug.padEnd(15)} ${count}`)
}

if (empty.length) {
  console.log(`\n== Events with ZERO interest tags (${empty.length}) ==`)
  for (const e of empty) console.log(`  ${e.slug.padEnd(38)} — ${e.title}`)
}
