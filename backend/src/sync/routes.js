import { Router } from 'express'
import { fetchTicketmasterEvents } from './ticketmaster.js'
import { fetchSeatgeekEvents } from './seatgeek.js'
import { upsertSyncedEvents, getSyncStatus } from './upsert.js'

const router = Router()

// POST /api/admin/sync/ticketmaster
router.post('/sync/ticketmaster', async (req, res) => {
  try {
    const { city, lat, lng, radiusKm, dateFrom, dateTo } = req.body || {}

    const { events, error } = await fetchTicketmasterEvents({
      city,
      lat,
      lng,
      radiusKm,
      dateFrom,
      dateTo,
    })

    if (error && events.length === 0) {
      return res.status(502).json({ error: { message: error } })
    }

    const result = await upsertSyncedEvents(events, 'ticketmaster')

    res.json({
      data: { fetched: events.length, ...result, warning: error || undefined },
    })
  } catch (err) {
    console.error('Ticketmaster sync error:', err)
    res.status(500).json({ error: { message: 'Internal sync error' } })
  }
})

// POST /api/admin/sync/seatgeek
router.post('/sync/seatgeek', async (req, res) => {
  try {
    const { city, lat, lng, radiusKm, dateFrom, dateTo } = req.body || {}

    const { events, error } = await fetchSeatgeekEvents({
      city,
      lat,
      lng,
      radiusKm,
      dateFrom,
      dateTo,
    })

    if (error && events.length === 0) {
      return res.status(502).json({ error: { message: error } })
    }

    const result = await upsertSyncedEvents(events, 'seatgeek')

    res.json({
      data: { fetched: events.length, ...result, warning: error || undefined },
    })
  } catch (err) {
    console.error('SeatGeek sync error:', err)
    res.status(500).json({ error: { message: 'Internal sync error' } })
  }
})

// GET /api/admin/sync/status
router.get('/sync/status', async (_req, res) => {
  try {
    const sources = await getSyncStatus()
    res.json({ data: { sources } })
  } catch (err) {
    console.error('Sync status error:', err)
    res.status(500).json({ error: { message: 'Failed to get sync status' } })
  }
})

export default router
