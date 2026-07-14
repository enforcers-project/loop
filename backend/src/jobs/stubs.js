import { registerJob } from './scheduler.js'
import { embedPendingEvents } from '../embeddings/pipeline.js'
import { rebuildStaleVectors } from '../preferences/builder.js'

// Each stub logs and returns a summary. Real implementations replace these in later sprints.

registerJob('sync-external-events', {
  schedule: '0 */4 * * *', // every 4 hours
  handler: async () => {
    console.log('[job:sync-external-events] stub — would pull Ticketmaster + SeatGeek')
    return { stub: true }
  },
})

registerJob('flip-past-events', {
  schedule: '*/15 * * * *', // every 15 minutes
  handler: async () => {
    console.log(
      '[job:flip-past-events] stub — would set status=past for events where starts_at < now()',
    )
    return { stub: true }
  },
})

registerJob('rebuild-user-vectors', {
  schedule: '*/15 * * * *', // every 15 minutes (watermark-driven)
  handler: async () => {
    console.log('[job:rebuild-user-vectors] rebuilding stale user preference vectors...')
    const result = await rebuildStaleVectors()
    console.log(
      `[job:rebuild-user-vectors] done — ${result.built} built, ${result.skipped} skipped, ${result.errors} errors`,
    )
    return result
  },
})

registerJob('embed-pending-events', {
  schedule: '*/5 * * * *', // every 5 minutes
  handler: async () => {
    console.log('[job:embed-pending-events] embedding un-embedded published events...')
    const result = await embedPendingEvents()
    console.log(`[job:embed-pending-events] done — processed ${result.processed} event(s)`)
    return result
  },
})

registerJob('dispatch-reminders', {
  schedule: '* * * * *', // every minute
  handler: async () => {
    console.log('[job:dispatch-reminders] stub — would scan due reminders and emit notifications')
    return { stub: true }
  },
})

registerJob('expire-stories', {
  schedule: '0 * * * *', // every hour
  handler: async () => {
    console.log('[job:expire-stories] stub — would mark stories older than 24h as expired')
    return { stub: true }
  },
})
