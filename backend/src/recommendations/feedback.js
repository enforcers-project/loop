import prisma from '../lib/prisma.js'

export async function handleFeedback(userId, recommendationId, action, feedPosition) {
  const impression = await prisma.recommendationImpression.findUnique({
    where: { id: recommendationId },
  })

  if (!impression) return { found: false }
  if (impression.userId !== userId) return { forbidden: true }

  const updates = {}
  let interactionType

  switch (action) {
    case 'click':
      updates.clicked = true
      updates.clickedAt = new Date()
      interactionType = 'rec_click'
      break
    case 'dismiss':
      updates.clicked = false
      interactionType = 'rec_dismiss'
      break
    case 'convert':
      updates.clicked = true
      updates.clickedAt = updates.clickedAt || new Date()
      updates.converted = true
      interactionType = 'rec_click'
      break
    default:
      return { invalid: true }
  }

  await prisma.recommendationImpression.update({
    where: { id: recommendationId },
    data: updates,
  })

  await prisma.interactionEvent.create({
    data: {
      userId,
      eventId: impression.eventId,
      interactionType,
      surface: 'for_you',
      weight: interactionType === 'rec_dismiss' ? -0.4 : 0.18,
      feedPosition: feedPosition ?? impression.rank,
      recommendationId,
    },
  })

  return { ok: true }
}
