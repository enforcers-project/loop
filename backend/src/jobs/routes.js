import { Router } from 'express'
import { getSchedulerStatus, runJob, listJobNames } from './scheduler.js'

const router = Router()

// GET /api/admin/jobs — list all registered jobs + last run info
router.get('/jobs', (_req, res) => {
  res.json({ data: getSchedulerStatus() })
})

// POST /api/admin/jobs/:name/run — manually trigger a job
router.post('/jobs/:name/run', async (req, res) => {
  const { name } = req.params
  const names = listJobNames()

  if (!names.includes(name)) {
    return res.status(404).json({ error: { message: `Unknown job: "${name}"` } })
  }

  try {
    const result = await runJob(name)
    res.json({ data: result })
  } catch (err) {
    res.status(500).json({ error: { message: err.message } })
  }
})

export default router
