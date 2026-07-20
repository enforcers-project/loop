// Groq-backed short reply grounded in the events the retrieval step found.
// Backend-only — the LLM key never touches the browser. Falls back to a
// deterministic template when GROQ_API_KEY is unset so local dev doesn't break.
const MODEL = 'llama-3.3-70b-versatile'
const MAX_TOKENS = 220
const TIMEOUT_MS = 8000

const SYSTEM_PROMPT = `You are Loop AI, a concise local-events guide.
Answer in ONE or TWO short sentences (never more), and never invent events —
you are shown a short list of events; refer only to those.
If the list is empty, say you didn't find a match and suggest broadening the search.
Do not restate the list; the UI renders the event cards below your reply.
Be warm, plain-spoken, and specific (mention the count or the vibe of the picks).`

function eventsForPrompt(events) {
  if (!events.length) return 'No matching events found in the catalog.'
  return events
    .slice(0, 5)
    .map((ev, i) => {
      const when = ev.startsAt ? new Date(ev.startsAt).toDateString() : 'TBA'
      const price = ev.isFree ? 'Free' : ev.priceMin != null ? `$${ev.priceMin}` : 'Ticketed'
      const cat = ev.category?.name ?? ''
      return `${i + 1}. ${ev.title} — ${cat} · ${ev.city ?? '—'} · ${when} · ${price}`
    })
    .join('\n')
}

function templateReply(query, events) {
  if (!events.length) {
    return "I couldn't find an exact match. Try broadening the vibe or the date."
  }
  const count = events.length
  const first = events[0]
  const noun = count > 1 ? `${count} events` : 'one event'
  const catBits = new Set(events.map((e) => e.category?.name).filter(Boolean))
  const cat = catBits.size === 1 ? [...catBits][0].toLowerCase() : 'options'
  return `Found ${noun} matching that ${cat} vibe — top pick is ${first.title}.`
}

async function callGroq(query, events) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Query: ${query}\n\nAvailable events:\n${eventsForPrompt(events)}`,
      },
    ],
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.warn(`[ai/chat] Groq ${res.status}: ${errBody.slice(0, 200)}`)
      return null
    }

    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    const tokensUsed = json?.usage?.total_tokens ?? null
    if (typeof content !== 'string' || !content.trim()) return null
    return { content: content.trim(), tokensUsed }
  } catch (err) {
    console.warn('[ai/chat] Groq call failed:', err.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Produce a short natural-language reply grounded in the given events. Returns
 * `{ content, model, tokensUsed, latencyMs, source }` where source is 'groq'
 * when the LLM answered and 'template' when it fell back.
 */
export async function generateReply(query, events) {
  const startedAt = Date.now()
  const llm = await callGroq(query, events)
  const latencyMs = Date.now() - startedAt

  if (llm) {
    return {
      content: llm.content,
      model: MODEL,
      tokensUsed: llm.tokensUsed,
      latencyMs,
      source: 'groq',
    }
  }

  return {
    content: templateReply(query, events),
    model: 'template',
    tokensUsed: null,
    latencyMs: Date.now() - startedAt,
    source: 'template',
  }
}
