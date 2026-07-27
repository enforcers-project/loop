// One-off backfill: give every user with a NULL handle a unique username
// derived from their display_name (or email local-part as a fallback). Uses the
// same sanitize + collision-loop shape as auth/routes.js so backfilled handles
// pass the app's HANDLE_RE and are guaranteed unique.
//
// Run from backend/:
//   node --env-file=.env scripts/backfill-handles.mjs
import prisma from '../src/lib/prisma.js'

const HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/

function stubHandle(raw) {
  const cleaned = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  if (cleaned.length >= 3) return cleaned
  return (cleaned + 'user').slice(0, 20)
}

async function pickUniqueHandle(stub) {
  for (let i = 0; i < 500; i += 1) {
    const candidate = i === 0 ? stub : `${stub}_${i}`
    const clash = await prisma.user.findUnique({
      where: { handle: candidate },
      select: { id: true },
    })
    if (!clash) return candidate
  }
  return `${stub}_${Math.floor(Math.random() * 1e9)}`
}

async function main() {
  const targets = await prisma.user.findMany({
    where: { handle: null },
    select: { id: true, displayName: true, email: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Found ${targets.length} user(s) needing a handle.`)

  let ok = 0
  for (const u of targets) {
    const seed = u.displayName?.trim() || (u.email ? u.email.split('@')[0] : '') || 'user'
    const stub = stubHandle(seed)
    const handle = await pickUniqueHandle(stub)
    if (!HANDLE_RE.test(handle)) {
      console.warn(`✗ Skipped ${u.id}: generated "${handle}" failed HANDLE_RE`)
      continue
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { handle, handleChangedAt: new Date() },
    })
    ok += 1
    console.log(`✓ ${u.id} → @${handle}  (from "${seed}")`)
  }
  console.log(`\nBackfilled ${ok}/${targets.length} handles.`)
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
