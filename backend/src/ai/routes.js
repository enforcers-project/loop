// Conversational AI assistant drawer — planning §7.6 (work-plan #31).
//
// Three endpoints:
//   POST /api/ai/conversations                    — start a thread (auth)
//   GET  /api/ai/conversations/:id                — fetch a thread + messages (owner)
//   POST /api/ai/conversations/:id/messages       — send a user turn; returns
//                                                   the persisted assistant reply
//                                                   with eventRefs (uuid[]) that
//                                                   the drawer resolves to
//                                                   inline EventCards.
//
// Every user turn runs the retrieval pipeline (retrieve.js): parse cheap NL
// filters → pgvector kNN over event_embeddings (or keyword fallback), then
// chat.js drafts a short grounded reply (Groq → template fallback). Both the
// user + assistant rows are persisted; the assistant call is logged in
// ai_generation_logs (type='chat') for provenance/cost tracking.
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth, fail } from '../auth/middleware.js'
import { retrieveEvents, serializeHits } from './retrieve.js'
import { generateReply } from './chat.js'

const router = Router()

const MAX_MESSAGE_LEN = 500
const MESSAGE_PAGE_SIZE = 50

function serializeMessage(m) {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    event_refs: Array.isArray(m.eventRefs) ? m.eventRefs : [],
    created_at: m.createdAt,
  }
}

function titleFromQuery(q) {
  const clean = String(q ?? '').trim().slice(0, 60)
  return clean || 'New chat'
}

// POST /api/ai/conversations  — start a thread
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 120) : null
    const conv = await prisma.aiConversation.create({
      data: { userId: req.user.id, title },
    })
    res.json({
      data: {
        id: conv.id,
        title: conv.title,
        created_at: conv.createdAt,
      },
    })
  } catch (err) {
    console.error('POST /api/ai/conversations error:', err)
    fail(res, 500, 'INTERNAL', 'Failed to start conversation')
  }
})

// GET /api/ai/conversations/:id  — fetch a thread + its messages (owner only)
router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conv = await prisma.aiConversation.findUnique({
      where: { id: req.params.id },
    })
    if (!conv) return fail(res, 404, 'NOT_FOUND', 'Conversation not found')
    if (conv.userId !== req.user.id) return fail(res, 403, 'FORBIDDEN', 'Not your conversation')

    const messages = await prisma.aiMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' },
      take: MESSAGE_PAGE_SIZE,
    })

    res.json({
      data: {
        id: conv.id,
        title: conv.title,
        created_at: conv.createdAt,
        updated_at: conv.updatedAt,
        messages: messages.map(serializeMessage),
      },
    })
  } catch (err) {
    console.error('GET /api/ai/conversations/:id error:', err)
    fail(res, 500, 'INTERNAL', 'Failed to fetch conversation')
  }
})

// POST /api/ai/conversations/:id/messages  — send a user turn
router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (!content) return fail(res, 400, 'VALIDATION_ERROR', 'Message content is required')
    if (content.length > MAX_MESSAGE_LEN) {
      return fail(res, 400, 'VALIDATION_ERROR', `Message must be under ${MAX_MESSAGE_LEN} chars`)
    }

    const conv = await prisma.aiConversation.findUnique({ where: { id: req.params.id } })
    if (!conv) return fail(res, 404, 'NOT_FOUND', 'Conversation not found')
    if (conv.userId !== req.user.id) return fail(res, 403, 'FORBIDDEN', 'Not your conversation')

    // Persist the user turn immediately so a downstream retrieval failure still
    // leaves the thread coherent.
    await prisma.aiMessage.create({
      data: { conversationId: conv.id, role: 'user', content },
    })

    // Retrieve grounding events + draft a reply.
    const startedAt = Date.now()
    const retrieval = await retrieveEvents(content)
    const eventRefs = retrieval.events.map((e) => e.id)
    const reply = await generateReply(content, retrieval.events)

    const assistant = await prisma.aiMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        content: reply.content,
        eventRefs,
      },
    })

    // Bump conversation.updated_at + set title from the first user message.
    await prisma.aiConversation.update({
      where: { id: conv.id },
      data: {
        updatedAt: new Date(),
        ...(conv.title ? {} : { title: titleFromQuery(content) }),
      },
    })

    // Provenance / cost log (planning §7.6).
    await prisma.aiGenerationLog
      .create({
        data: {
          type: 'chat',
          userId: req.user.id,
          model: reply.model,
          prompt: content,
          output: {
            reply: reply.content,
            event_refs: eventRefs,
            retrieval: retrieval.retrieval,
            source: reply.source,
          },
          tokensUsed: reply.tokensUsed,
          latencyMs: Date.now() - startedAt,
        },
      })
      .catch((e) => console.warn('[ai/routes] log write failed:', e.message))

    res.json({
      data: {
        message: serializeMessage(assistant),
        event_refs: eventRefs,
        events: serializeHits(retrieval.events),
      },
    })
  } catch (err) {
    console.error('POST /api/ai/conversations/:id/messages error:', err)
    fail(res, 500, 'INTERNAL', 'Failed to send message')
  }
})

export default router
