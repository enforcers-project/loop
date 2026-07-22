// Groq-backed conversational reply for the Ask Loop drawer.
//
// Two modes, decided per-turn:
//   • event mode  — the query is about finding / picking / attending events.
//                   We ground the answer in the events retrieval found and
//                   keep the reply short (the UI renders the event cards).
//   • chat mode   — the query is a general question about Loop (how do I RSVP,
//                   what is a pickup event, how do interests work, etc.) or a
//                   conversational reply. We answer from the app-context brief
//                   below and can use up to a short paragraph.
//
// Backend-only — the LLM key never touches the browser. Falls back to a
// deterministic template when GROQ_API_KEY is unset so local dev doesn't break.
const MODEL = 'llama-3.3-70b-versatile'
const MAX_TOKENS = 500
const TIMEOUT_MS = 10000
const HISTORY_TURNS = 8

// Everything the model needs to know about Loop to answer general questions
// without hallucinating features. Keep this factual and current — it's the
// source of truth the LLM leans on when there are no events in the response.
const APP_CONTEXT = `Loop is a mobile-first web app for discovering local events and pickup sports.
Core features:
- Discover feed: search + filter events by category (music, nightlife, sports, networking, food, campus), free/paid, date, and distance ("near me" radius).
- For You feed: personalized recommendations based on the user's interests, past RSVPs, and location.
- Event detail pages: title, poster, description, date/time, venue with map, price, organizer profile, RSVP button, comments.
- Sports pickup events: a dedicated flow for casual games (soccer, basketball, etc.) with skill level and roster size.
- Social feed: posts + comments from other attendees around events.
- Organizer profiles: view every event a host has run and follow them.
- User profile: bio, interests (chosen at onboarding, editable in settings), avatar, RSVP history.
- Onboarding: pick interests → those seed the For You recs.
- Notifications: bell icon shows RSVPs confirmed, new messages, events starting soon.
- Ask Loop (this assistant): find events in natural language ("free afrobeats party this weekend"), explain how the app works, help troubleshoot.
- Maps use OpenStreetMap; distance is straight-line ("as the crow flies").
- Sign in with email/password; auth uses standard JWT sessions.

How to answer:
- If the user is looking for events, refer only to the event list shown to you — never invent titles, dates, or venues.
- If the user is asking how something works, explain it in a friendly paragraph using the facts above.
- If the user is chatting casually or asking your opinion, respond naturally — you're a warm, curious guide, not a search box.
- Never claim features that aren't listed here. If you're unsure, say so and suggest where in the app they might look.`

const SYSTEM_PROMPT_EVENT = `You are Loop AI, a warm and concise local-events guide.
The user asked about events, and the retrieval layer has surfaced a short list below.
Answer in 1–3 short sentences. Refer only to events in the provided list — never invent titles, dates, or venues.
If the list is empty, say you didn't find a match and suggest one specific way to broaden the search (e.g. drop the price filter, try another day).
The UI renders the event cards below your reply, so don't restate the full list — a quick vibe check ("2 free jazz picks — top one is Sunday at Blue Note") is perfect.

${APP_CONTEXT}`

const SYSTEM_PROMPT_CHAT = `You are Loop AI, a friendly, knowledgeable assistant embedded in the Loop app.
Answer the user's question directly and helpfully. You can use up to ~5 sentences for how-to explanations, or a single sentence for a chat reply — match the depth of the question.
Never invent features that aren't in the app brief below. If asked something you genuinely don't know (e.g. "when will feature X ship"), say so plainly and point them to the closest existing option.
Stay in character: you're a warm local-events guide, not a generic chatbot. Prefer concrete language ("tap the sparkle icon" > "use the assistant feature").

${APP_CONTEXT}`

// Heuristics — is this turn about finding events, or is it a general question?
// A hit on any event-shopping verb OR a category keyword flips it into event
// mode; otherwise we treat it as a general chat turn.
const EVENT_INTENT_PATTERNS = [
  /\b(find|show|any|got|are there|what'?s|whats|recommend|suggest|near|tonight|tomorrow|weekend|this week|next week)\b/i,
  /\b(event|events|party|concert|show|game|pickup|meetup|gig|match|festival|brunch|dinner|mixer)\b/i,
  /\b(free|cheap|under \$|\$\d+)\b/i,
]

function isEventIntent(query) {
  return EVENT_INTENT_PATTERNS.some((re) => re.test(query))
}

function eventsForPrompt(events) {
  if (!events.length) return 'No matching events found in the catalog.'
  return events
    .slice(0, 5)
    .map((ev, i) => {
      const when = ev.startsAt ? new Date(ev.startsAt).toDateString() : 'TBA'
      const price = ev.isFree ? 'Free' : ev.priceMin != null ? `$${ev.priceMin}` : 'Ticketed'
      const cat = ev.category?.name ?? ''
      const city = ev.city ?? '—'
      return `${i + 1}. ${ev.title} — ${cat} · ${city} · ${when} · ${price}`
    })
    .join('\n')
}

function templateReply(query, events, mode) {
  if (mode === 'chat') {
    return 'I can help you find events, explain how Loop works, or point you to a screen — try asking me about a category, a vibe, or a feature.'
  }
  if (!events.length) {
    return "I couldn't find an exact match. Try broadening the vibe or the date, or clear the price filter."
  }
  const count = events.length
  const first = events[0]
  const noun = count > 1 ? `${count} events` : 'one event'
  const catBits = new Set(events.map((e) => e.category?.name).filter(Boolean))
  const cat = catBits.size === 1 ? [...catBits][0].toLowerCase() : 'options'
  return `Found ${noun} matching that ${cat} vibe — top pick is ${first.title}.`
}

function buildMessages(query, events, history, mode) {
  const systemPrompt = mode === 'event' ? SYSTEM_PROMPT_EVENT : SYSTEM_PROMPT_CHAT
  const messages = [{ role: 'system', content: systemPrompt }]

  // Recent conversation so follow-ups ("what about Saturday?", "the second
  // one") have context. Cap to the last N turns — older history rarely helps
  // and costs tokens.
  if (Array.isArray(history) && history.length) {
    const recent = history.slice(-HISTORY_TURNS)
    for (const msg of recent) {
      if (msg?.role === 'user' || msg?.role === 'assistant') {
        messages.push({ role: msg.role, content: String(msg.content ?? '').slice(0, 800) })
      }
    }
  }

  const userContent =
    mode === 'event' ? `Query: ${query}\n\nAvailable events:\n${eventsForPrompt(events)}` : query

  messages.push({ role: 'user', content: userContent })
  return messages
}

async function callGroq(messages) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.6,
    messages,
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
 * Produce a natural-language reply to a user turn. Runs in "event" mode when
 * the query looks like an event search (grounds in the passed events) and
 * "chat" mode otherwise (answers freely from the app-context brief).
 *
 * @param {string} query       — the current user message
 * @param {object[]} events    — retrieved events (Prisma rows) or []
 * @param {object[]} history   — prior messages [{role, content}, ...] or []
 * @returns {{content, model, tokensUsed, latencyMs, source, mode}}
 */
export async function generateReply(query, events, history = []) {
  const startedAt = Date.now()
  const mode = isEventIntent(query) ? 'event' : 'chat'
  const messages = buildMessages(query, events, history, mode)
  const llm = await callGroq(messages)
  const latencyMs = Date.now() - startedAt

  if (llm) {
    return {
      content: llm.content,
      model: MODEL,
      tokensUsed: llm.tokensUsed,
      latencyMs,
      source: 'groq',
      mode,
    }
  }

  return {
    content: templateReply(query, events, mode),
    model: 'template',
    tokensUsed: null,
    latencyMs: Date.now() - startedAt,
    source: 'template',
    mode,
  }
}
