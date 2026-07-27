// Manually trigger a full external-event sync (Ticketmaster + SeatGeek) across
// all markets derived from user home locations. Same code path the scheduled
// `sync-external-events` job runs. Usage: node scripts/run-external-sync.mjs
import 'dotenv/config'
import { runExternalSync, deriveMarketsFromUsers } from '../src/sync/run.js'

const markets = await deriveMarketsFromUsers()
console.log(`Syncing ${markets.length} market(s):`)
for (const m of markets) {
  console.log(`  • ${m.city ?? `${m.lat},${m.lng}`} (r=${m.radiusKm}km)`)
}

const result = await runExternalSync({ maxPages: 4 })
console.log('\n=== Sync summary ===')
console.log(JSON.stringify(result, null, 2))
process.exit(0)
