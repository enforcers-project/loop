// Per-user hide index: the set of target ids this user has reported for a given
// target_type. Subtracted from list endpoints (posts feed, comments, stories)
// so a reporter never sees the item again on the surfaces where it renders.
import prisma from '../lib/prisma.js'

export async function loadHiddenIds(userId, targetType) {
  if (!userId) return new Set()
  const rows = await prisma.contentReport.findMany({
    where: { reporterId: userId, targetType },
    select: { targetId: true },
  })
  return new Set(rows.map((r) => r.targetId))
}
