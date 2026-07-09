import cron from 'node-cron'

const registry = new Map()
const history = new Map()

/**
 * Register a job with the scheduler.
 * @param {string} name - Unique job identifier
 * @param {object} opts
 * @param {string} opts.schedule - Cron expression (node-cron format)
 * @param {Function} opts.handler - Async function to execute
 * @param {boolean} [opts.enabled=true] - Whether the job runs on schedule
 */
export function registerJob(name, { schedule, handler, enabled = true }) {
  if (registry.has(name)) {
    throw new Error(`Job "${name}" is already registered`)
  }

  const job = {
    name,
    schedule,
    handler,
    enabled,
    task: null,
    running: false,
  }

  registry.set(name, job)
  history.set(name, [])
}

export function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[scheduler] disabled via DISABLE_SCHEDULER=true')
    return
  }

  for (const [name, job] of registry) {
    if (!job.enabled) continue

    job.task = cron.schedule(job.schedule, () => runJob(name), {
      scheduled: true,
    })

    console.log(`[scheduler] registered "${name}" — ${job.schedule}`)
  }

  console.log(`[scheduler] started with ${registry.size} job(s)`)
}

export function stopScheduler() {
  for (const [, job] of registry) {
    if (job.task) {
      job.task.stop()
      job.task = null
    }
  }
  console.log('[scheduler] stopped')
}

export async function runJob(name) {
  const job = registry.get(name)
  if (!job) throw new Error(`Unknown job: "${name}"`)
  if (job.running) {
    console.log(`[scheduler] "${name}" already running, skipping`)
    return { skipped: true }
  }

  job.running = true
  const startedAt = new Date().toISOString()
  console.log(`[scheduler] running "${name}"...`)

  try {
    const result = await job.handler()
    const entry = { startedAt, finishedAt: new Date().toISOString(), status: 'ok', result }
    pushHistory(name, entry)
    console.log(`[scheduler] "${name}" completed`)
    return entry
  } catch (err) {
    const entry = {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: 'error',
      error: err.message,
    }
    pushHistory(name, entry)
    console.error(`[scheduler] "${name}" failed:`, err.message)
    return entry
  } finally {
    job.running = false
  }
}

function pushHistory(name, entry) {
  const list = history.get(name)
  list.push(entry)
  if (list.length > 20) list.shift()
}

export function getSchedulerStatus() {
  const jobs = []
  for (const [name, job] of registry) {
    const runs = history.get(name) || []
    const lastRun = runs.length ? runs[runs.length - 1] : null
    jobs.push({
      name,
      schedule: job.schedule,
      enabled: job.enabled,
      running: job.running,
      lastRun,
    })
  }
  return { jobs }
}

export function listJobNames() {
  return [...registry.keys()]
}
