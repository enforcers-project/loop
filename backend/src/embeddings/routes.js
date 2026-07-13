import { Router } from 'express'
import { embedEvent, rebuildEmbeddings } from './pipeline.js'

const router = Router()

// POST /api/ai/embeddings/rebuild
// Body: { target: "events", eventIds?: string[], force?: boolean }
router.post('/embeddings/rebuild', async (req, res) => {
  try {
    const { target, eventIds, force } = req.body ?? {}

    if (target && target !== 'events') {
      return res.status(400).json({ error: { message: 'Only target "events" is supported' } })
    }

    const result = await rebuildEmbeddings({ eventIds, force: force === true })
    res.json({ data: result })
  } catch (err) {
    console.error('POST /api/ai/embeddings/rebuild error:', err)
    res.status(500).json({ error: { message: 'Embedding rebuild failed' } })
  }
})

// POST /api/ai/embeddings/event/:id  (single event embed — used by publish/edit triggers)
router.post('/embeddings/event/:id', async (req, res) => {
  try {
    const { force } = req.body ?? {}
    const result = await embedEvent(req.params.id, { force: force === true })
    res.json({ data: result })
  } catch (err) {
    console.error('POST /api/ai/embeddings/event/:id error:', err)
    res.status(500).json({ error: { message: 'Embedding generation failed' } })
  }
})

export default router
