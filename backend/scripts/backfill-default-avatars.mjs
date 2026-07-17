// One-off backfill: give every existing user with no avatar the shared default
// silhouette. New signups already get DEFAULT_AVATAR_URL (auth/routes.js); this
// catches rows created before that change.
//
// Prereq: DATABASE_URL + DEFAULT_AVATAR_URL in the env. Run from backend/:
//   node --env-file=.env scripts/backfill-default-avatars.mjs
import prisma from '../src/lib/prisma.js'
import { DEFAULT_AVATAR_URL } from '../src/lib/s3.js'

async function main() {
  if (!DEFAULT_AVATAR_URL) {
    console.error('✗ DEFAULT_AVATAR_URL is not set — nothing to backfill to. Aborting.')
    process.exitCode = 1
    return
  }

  const result = await prisma.user.updateMany({
    where: { avatarUrl: null },
    data: { avatarUrl: DEFAULT_AVATAR_URL },
  })
  console.log(`✓ Set default avatar on ${result.count} user(s) → ${DEFAULT_AVATAR_URL}`)
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
