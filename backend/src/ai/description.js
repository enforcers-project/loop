// AI event-description writer for organizers on the Create Event page.
//
// POST /api/ai/description  { title, category?, tone?, notes? }
//   -> { text, model }
//
// Auth: organizer role required. Model: Groq llama-3.3-70b-versatile (same as
// the chat drafter). Cheap enough (~$0.0001/req) that we're generous on the
// rate limit vs the image path — 10 gens per organizer per rolling hour, mostly
// to catch runaway loops. Returns 503 when GROQ_API_KEY is unset.
import { Router } from 'express'
import { requireRole, fail } from '../auth/middleware.js'

const router = Router()

const MODEL = 'llama-3.3-70b-versatile'
const MAX_TOKENS = 260
const TIMEOUT_MS = 12000
const MAX_INPUT_LEN = 600
const RATE_LIMIT_PER_HOUR = 10

const SYSTEM_PROMPT = `You are Loop AI, a copywriter for event descriptions.
Write ONE short paragraph (3-5 sentences, ~60-90 words) that hypes the event
without exaggeration. Warm, plain-spoken, second person. Mention what people
will do and the vibe. Never invent facts the organizer didn't provide (no fake
lineups, no fake prices, no fake venues). Return only the description text — no
quotes, no headings, no bullet points, no emojis.`

const TONES = {
  hype: 'Punchy and energetic — get people excited.',
  chill: 'Relaxed and welcoming — this is a low-pressure hang.',
  professional: 'Polished and clear — networking / career audience.',
  playful: 'Light, witty, a little cheeky.',
}

const attempts = new Map() // userId -> number[] (timestamps ms)

function checkRateLimit(userId) {
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000
  const prior = (attempts.get(userId) || []).filter((t) => t > oneHourAgo)
  if (prior.length >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryInSec: Math.ceil((prior[0] + 60 * 60 * 1000 - now) / 1000) }
  }
  prior.push(now)
  attempts.set(userId, prior)
  return { ok: true, remaining: RATE_LIMIT_PER_HOUR - prior.length }
}

function buildUserPrompt({ title, category, tone, notes }) {
  const parts = []
  if (title) parts.push(`Event title: "${title}".`)
  if (category) parts.push(`Category: ${category}.`)
  const toneHint = TONES[String(tone || '').toLowerCase()]
  if (toneHint) parts.push(`Tone: ${toneHint}`)
  if (notes) {
    parts.push(`Organizer's notes / rough draft:\n${notes}`)
    parts.push('Rewrite these into the final description, keeping every concrete detail intact.')
  } else {
    parts.push('The organizer has not written anything yet — invent a plausible description from the title and category alone. Keep it generic enough not to fabricate specifics (no invented lineups, prices, or venues).')
  }
  return parts.join('\n\n')
}

async function callGroq(prompt) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[ai/description] Groq ${res.status}: ${text.slice(0, 200)}`)
      return { ok: false, status: res.status }
    }
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) return { ok: false, status: 502 }
    return { ok: true, text: content.trim() }
  } catch (err) {
    console.warn('[ai/description] Groq call failed:', err.message)
    return { ok: false, status: 502 }
  } finally {
    clearTimeout(timer)
  }
}

router.post('/description', requireRole('organizer'), async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return fail(res, 503, 'NOT_CONFIGURED', 'AI description writer is not configured')
  }

  const { title, category, tone, notes } = req.body ?? {}
  const titleStr = typeof title === 'string' ? title.trim().slice(0, 120) : ''
  const categoryStr = typeof category === 'string' ? category.trim().slice(0, 60) : ''
  const toneStr = typeof tone === 'string' ? tone.trim().toLowerCase() : ''
  const notesStr = typeof notes === 'string' ? notes.trim().slice(0, MAX_INPUT_LEN) : ''

  if (!titleStr && !notesStr) {
    return fail(res, 422, 'VALIDATION_ERROR', 'Add a title or a rough draft first.')
  }

  const gate = checkRateLimit(req.user.id)
  if (!gate.ok) {
    return fail(
      res,
      429,
      'RATE_LIMITED',
      `You've hit the AI writer limit. Try again in ${Math.ceil(gate.retryInSec / 60)} min.`,
    )
  }

  const prompt = buildUserPrompt({
    title: titleStr,
    category: categoryStr,
    tone: toneStr,
    notes: notesStr,
  })
  const result = await callGroq(prompt)
  if (!result.ok) {
    const msg =
      result.status === 401
        ? 'AI writer rejected the key.'
        : result.status === 429
          ? 'AI writer is busy. Try again in a moment.'
          : 'AI writer failed. Try again.'
    return fail(res, 502, 'UPSTREAM_ERROR', msg)
  }

  return res.json({
    data: {
      text: result.text,
      model: MODEL,
      remaining_this_hour: gate.remaining,
    },
  })
})

export default router
