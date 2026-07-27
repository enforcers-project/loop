// Profanity filter — server-side moderation on every user-written text field.
//
// Uses the `obscenity` library's English dataset + recommended transformers, so
// leetspeak (`sh1t`), character swaps (`fυck`), and duplicated letters
// (`fuuuck`) all resolve to the same match.
//
// checkProfanity(text) returns one of:
//   { status: 'clean' }  publish as-is
//   { status: 'flag' }   publish, but set `flagged=true` for the mod queue
//                        (nothing visible to the user changes)
//   { status: 'block' }  refuse the write; handler returns 400 PROFANITY_BLOCKED
//
// The block set = obscenity's built-in English dataset + a small hard-block
// custom list (currently: `frick`, per moderation policy). The flag set is
// where we later add "mild" words that we want to log but not refuse.
import {
  RegExpMatcher,
  DataSet,
  parseRawPattern,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

// Words that should trigger a hard block on top of the built-in English list.
// Kept literal — leetspeak variants are already covered by the recommended
// transformer set.
const CUSTOM_BLOCK_WORDS = ['frick']

// Words that should merely flag (mod queue) rather than block. Empty by default;
// leaving the mechanism in place so the mod team can grow this without touching
// call sites.
const CUSTOM_FLAG_WORDS = []

// The "block" dataset combines obscenity's English list with our custom words.
// Word-boundary anchors (`|word|`) prevent matches inside unrelated tokens.
const blockDataset = new DataSet().addAll(englishDataset)
for (const word of CUSTOM_BLOCK_WORDS) {
  blockDataset.addPhrase((phrase) =>
    phrase.setMetadata({ originalWord: word }).addPattern(parseRawPattern(`|${word}|`)),
  )
}

const blockMatcher = new RegExpMatcher({
  ...blockDataset.build(),
  ...englishRecommendedTransformers,
})

// The "flag" matcher is only wired up if we have flag words — otherwise it's
// left null and the check short-circuits.
let flagMatcher = null
if (CUSTOM_FLAG_WORDS.length > 0) {
  const flagDataset = new DataSet()
  for (const word of CUSTOM_FLAG_WORDS) {
    flagDataset.addPhrase((phrase) =>
      phrase.setMetadata({ originalWord: word }).addPattern(parseRawPattern(`|${word}|`)),
    )
  }
  flagMatcher = new RegExpMatcher({
    ...flagDataset.build(),
    ...englishRecommendedTransformers,
  })
}

/**
 * Run the filter on one piece of user-authored text.
 *
 * @param {string | null | undefined} text
 * @returns {{ status: 'clean' | 'flag' | 'block' }}
 */
export function checkProfanity(text) {
  if (!text || typeof text !== 'string') return { status: 'clean' }
  const s = text.trim()
  if (!s) return { status: 'clean' }

  if (blockMatcher.hasMatch(s)) return { status: 'block' }
  if (flagMatcher && flagMatcher.hasMatch(s)) return { status: 'flag' }
  return { status: 'clean' }
}

/**
 * Run the filter across many fields; return the strongest verdict. Handy when
 * a single write touches multiple text columns (event title + description +
 * venue name, profile name + bio, etc.).
 *
 * @param  {Array<string | null | undefined>} fields
 * @returns {{ status: 'clean' | 'flag' | 'block' }}
 */
export function checkProfanityMany(fields) {
  let worst = 'clean'
  for (const f of fields) {
    const r = checkProfanity(f)
    if (r.status === 'block') return { status: 'block' }
    if (r.status === 'flag') worst = 'flag'
  }
  return { status: worst }
}

/** Uniform user-facing copy — same message for every surface so we don't leak
 *  which fields are stricter than others. */
export const PROFANITY_BLOCKED_MESSAGE =
  "That message can't be posted. Please revise the language and try again."

// ---------------------------------------------------------------------------
// Express helper — the same three-line dance every handler does.
// ---------------------------------------------------------------------------
import { fail } from '../auth/middleware.js'
import { recordProfanityBlock, PROFANITY_RATE_LIMIT_MESSAGE } from './profanityLimit.js'

/**
 * Enforce the filter on one or more user-authored fields for a write handler.
 *
 *   const check = enforceProfanity(req, res, [body, caption])
 *   if (check.blocked) return                    // response already sent
 *   const flagged = check.flagged                // include on the Prisma create
 *
 * On 'block': sends 400 PROFANITY_BLOCKED (or 429 RATE_LIMITED if the caller
 * has burned through too many blocks in a minute) and returns { blocked: true }.
 * On 'flag':  returns { blocked: false, flagged: true }.
 * On 'clean': returns { blocked: false, flagged: false }.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Array<string | null | undefined>} fields
 * @returns {{ blocked: boolean, flagged: boolean }}
 */
export function enforceProfanity(req, res, fields) {
  const verdict = checkProfanityMany(fields)
  if (verdict.status === 'block') {
    const limited = recordProfanityBlock(req)
    if (limited) {
      fail(res, 429, 'RATE_LIMITED', PROFANITY_RATE_LIMIT_MESSAGE)
    } else {
      fail(res, 400, 'PROFANITY_BLOCKED', PROFANITY_BLOCKED_MESSAGE)
    }
    return { blocked: true, flagged: false }
  }
  return { blocked: false, flagged: verdict.status === 'flag' }
}
