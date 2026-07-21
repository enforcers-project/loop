// AI flyer generation for organizers on the Create Event page.
//
// POST /api/ai/flyer  { prompt, style?, title?, category? }
//   -> { data_url, model }
//
// Auth: organizer role required (only organizers create events).
// Model: OpenAI gpt-image-1, portrait 1024x1536, medium quality (~$0.063/img).
// Rate limit: 3 generations per organizer per rolling hour (in-memory counter)
//   to guard the finite $10 credit budget. The Create Event page also caps at
//   3 per draft on the client, but the server is the source of truth.
//
// Response is a base64 data URL so the client can drop it straight into the
// existing `flyer` state (URL.createObjectURL flow), no storage plumbing yet.
import { Router } from 'express'
import { requireRole, fail } from '../auth/middleware.js'
import { isConfigured as isS3Configured, putObject } from '../lib/s3.js'

const router = Router()

const MODEL = 'gpt-image-1'
const SIZE = '1024x1536'
const QUALITY = 'medium'
const MAX_PROMPT_LEN = 500
const RATE_LIMIT_PER_HOUR = 3

// style preset → art-direction suffix appended to the organizer's prompt.
// Kept short so the organizer's own wording stays dominant.
const STYLE_PRESETS = {
  bold: 'bold graphic poster, high contrast, saturated colors, clean composition',
  minimal: 'minimalist design, generous negative space, muted palette, refined typography feel',
  retro: 'retro 80s / 90s aesthetic, grainy texture, neon accents, vintage color grading',
  photo: 'photorealistic, cinematic lighting, shallow depth of field, editorial photography',
}

// In-memory rolling-hour counter keyed by user id. Fine for a single-instance
// backend; move to Redis / DB if we ever scale horizontally.
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

function buildPrompt({ prompt, style, title, category }) {
  const parts = []
  parts.push('Design an event flyer poster.')
  if (title) parts.push(`Event title: "${title}".`)
  if (category) parts.push(`Category: ${category}.`)
  parts.push(prompt.trim())
  const styleSuffix = STYLE_PRESETS[String(style || '').toLowerCase()]
  if (styleSuffix) parts.push(styleSuffix + '.')
  parts.push('Leave clean space near the top and bottom for text overlay.')
  return parts.join(' ')
}

router.post('/flyer', requireRole('organizer'), async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return fail(res, 503, 'NOT_CONFIGURED', 'AI flyer generation is not configured')
  }

  const { prompt, style, title, category } = req.body ?? {}
  const promptStr = typeof prompt === 'string' ? prompt.trim() : ''
  if (!promptStr) return fail(res, 422, 'VALIDATION_ERROR', 'prompt is required')
  if (promptStr.length > MAX_PROMPT_LEN) {
    return fail(res, 422, 'VALIDATION_ERROR', `prompt must be under ${MAX_PROMPT_LEN} chars`)
  }

  const gate = checkRateLimit(req.user.id)
  if (!gate.ok) {
    return fail(
      res,
      429,
      'RATE_LIMITED',
      `You've hit the flyer generation limit. Try again in ${Math.ceil(gate.retryInSec / 60)} min.`,
    )
  }

  const finalPrompt = buildPrompt({
    prompt: promptStr,
    style,
    title: typeof title === 'string' ? title.trim().slice(0, 120) : '',
    category: typeof category === 'string' ? category.trim().slice(0, 60) : '',
  })

  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: finalPrompt,
        size: SIZE,
        quality: QUALITY,
        n: 1,
      }),
    })

    if (!r.ok) {
      const text = await r.text().catch(() => '')
      console.error(`[ai/flyer] OpenAI ${r.status}: ${text}`)
      const msg =
        r.status === 401
          ? 'AI image service rejected the key.'
          : r.status === 429
            ? 'AI image service is busy. Try again in a moment.'
            : 'AI image generation failed. Try again.'
      return fail(res, 502, 'UPSTREAM_ERROR', msg)
    }

    const body = await r.json()
    const b64 = body?.data?.[0]?.b64_json
    if (!b64) {
      console.error('[ai/flyer] OpenAI returned no image bytes:', JSON.stringify(body).slice(0, 400))
      return fail(res, 502, 'UPSTREAM_ERROR', 'AI service returned no image.')
    }

    // When S3 is configured, upload the PNG once and return a real URL.
    // Storing the URL on the event row (a few dozen bytes) is what keeps list
    // queries fast — vs. embedding a multi-MB data URL in every row. If S3
    // isn't configured (local dev without AWS creds), fall back to the data
    // URL so the feature still works end-to-end.
    if (isS3Configured()) {
      try {
        const bytes = Buffer.from(b64, 'base64')
        const { publicUrl } = await putObject({
          userId: req.user.id,
          contentType: 'image/png',
          stamp: Date.now(),
          folder: 'flyers',
          body: bytes,
        })
        return res.json({
          data: {
            url: publicUrl,
            model: MODEL,
            remaining_this_hour: gate.remaining,
          },
        })
      } catch (uploadErr) {
        console.error('[ai/flyer] S3 upload failed, falling back to data URL:', uploadErr)
        // Fall through to data URL — better to return the image than fail.
      }
    }

    return res.json({
      data: {
        data_url: `data:image/png;base64,${b64}`,
        model: MODEL,
        remaining_this_hour: gate.remaining,
      },
    })
  } catch (err) {
    console.error('[ai/flyer] unexpected error:', err)
    return fail(res, 500, 'INTERNAL', 'Failed to generate flyer.')
  }
})

export default router
