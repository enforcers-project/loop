// Reminder dispatcher (planning §7.5, work-plan #28). Scans due scheduled
// reminders (remind_at <= now, status='scheduled') and, for each, emits an
// `event_reminder` notification and flips the reminder to 'sent' in one
// transaction — so a crash mid-run can never double-send: a row is only marked
// sent once its notification is committed alongside it.
//
// Skips reminders whose event was cancelled since scheduling (the attendee
// shouldn't be nudged toward a dead event) — those are marked 'cancelled'
// instead. Called every minute by the `dispatch-reminders` job (jobs/stubs.js)
// and directly in tests.
import prisma from '../lib/prisma.js'

// Cap per run so a backlog (e.g. after downtime) drains over several ticks
// rather than building one giant transaction set. The job runs every minute.
const BATCH_LIMIT = 200

/** Build the notification title/body for a due reminder. */
function reminderContent(event, offsetMinutes) {
  const title = `Reminder: ${event.title}`
  const when =
    offsetMinutes >= 1440
      ? `${Math.round(offsetMinutes / 1440)} day(s)`
      : offsetMinutes >= 60
        ? `${Math.round(offsetMinutes / 60)} hour(s)`
        : `${offsetMinutes} minutes`
  return { title, body: `Starts in about ${when}.` }
}

/**
 * Dispatch all currently-due reminders. Returns a summary
 * `{ scanned, sent, cancelled, errors }`. Never throws — a single bad row is
 * counted in `errors` and the rest still process.
 */
export async function dispatchDueReminders(now = new Date()) {
  const due = await prisma.eventReminder.findMany({
    where: { status: 'scheduled', remindAt: { lte: now } },
    orderBy: { remindAt: 'asc' },
    take: BATCH_LIMIT,
    select: {
      id: true,
      userId: true,
      channel: true,
      offsetMinutes: true,
      event: { select: { id: true, title: true, status: true, startsAt: true } },
    },
  })

  let sent = 0
  let cancelled = 0
  let errors = 0

  for (const r of due) {
    try {
      // Event vanished (shouldn't happen — FK cascade) or was cancelled since
      // scheduling: retire the reminder without notifying.
      if (!r.event || r.event.status === 'cancelled') {
        await prisma.eventReminder.update({
          where: { id: r.id },
          data: { status: 'cancelled' },
        })
        cancelled += 1
        continue
      }

      const { title, body } = reminderContent(r.event, r.offsetMinutes)

      await prisma.$transaction(async (tx) => {
        // Re-check inside the tx and flip only if still scheduled, so two
        // overlapping dispatcher runs can't both send the same row.
        const updated = await tx.eventReminder.updateMany({
          where: { id: r.id, status: 'scheduled' },
          data: { status: 'sent', sentAt: now },
        })
        if (updated.count === 0) return // another run already claimed it

        await tx.notification.create({
          data: {
            userId: r.userId,
            type: 'event_reminder',
            channel: r.channel,
            eventId: r.event.id,
            title,
            body,
            metadata: { reminder_id: r.id },
          },
        })
        sent += 1
      })
    } catch (err) {
      errors += 1
      console.error(`[reminders] dispatch failed for ${r.id}:`, err.message)
    }
  }

  return { scanned: due.length, sent, cancelled, errors }
}
