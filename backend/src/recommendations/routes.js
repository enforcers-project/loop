import { Router } from 'express'
import { generateRecommendations } from './engine.js'
import { handleFeedback } from './feedback.js'

const router = Router()

// POST /api/recommendations
router.post('/recommendations', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.user_id
    if (!userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }

    const { context, limit, cursor } = req.body ?? {}

    const result = await generateRecommendations(userId, { context, limit, cursor })

    res.json(result)
  } catch (err) {
    console.error('POST /api/recommendations error:', err)
    res.status(500).json({ error: { message: 'Failed to generate recommendations' } })
  }
})

// POST /api/recommendations/:recommendationId/feedback
router.post('/recommendations/:recommendationId/feedback', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.user_id
    if (!userId) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }

    const { recommendationId } = req.params
    const { action, feedPosition } = req.body ?? {}

    if (!action || !['click', 'dismiss', 'convert'].includes(action)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'action must be click, dismiss, or convert' } })
    }

    const result = await handleFeedback(userId, recommendationId, action, feedPosition)

    if (result.found === false) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recommendation not found' } })
    }
    if (result.forbidden) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your recommendation' } })
    }
    if (result.invalid) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action' } })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/recommendations/:id/feedback error:', err)
    res.status(500).json({ error: { message: 'Failed to record feedback' } })
  }
})

export default router
