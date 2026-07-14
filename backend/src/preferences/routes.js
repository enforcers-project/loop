import { Router } from 'express'
import { buildUserVector, rebuildStaleVectors } from './builder.js'

const router = Router()

// POST /api/preferences/rebuild
// Body: { user_id: string }
// Triggers an on-demand rebuild of a single user's preference vector.
router.post('/preferences/rebuild', async (req, res) => {
  const { user_id: userId } = req.body ?? {}

  if (!userId) {
    return res.status(400).json({ error: { message: 'user_id is required' } })
  }

  try {
    const result = await buildUserVector(userId)
    res.json({ data: result })
  } catch (err) {
    console.error('POST /api/preferences/rebuild error:', err)
    res.status(500).json({ error: { message: 'Failed to rebuild preference vector' } })
  }
})

// POST /api/preferences/rebuild-stale
// Admin endpoint: rebuilds vectors for users with new signals since last compute.
router.post('/preferences/rebuild-stale', async (req, res) => {
  try {
    const result = await rebuildStaleVectors()
    res.json({ data: result })
  } catch (err) {
    console.error('POST /api/preferences/rebuild-stale error:', err)
    res.status(500).json({ error: { message: 'Failed to rebuild stale vectors' } })
  }
})

export default router
