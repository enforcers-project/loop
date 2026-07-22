import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'

// Reminder picker on EventDetail (planning §7.5, work-plan #28). Shown after a
// user RSVPs or saves — offers a few preset lead times, and once one is set,
// shows the active reminder with a cancel affordance. A preset is hidden when
// its fire time (start − offset) has already passed, so we never offer a
// reminder that would fire instantly.
const PRESETS = [
  { label: '1 hour before', minutes: 60 },
  { label: '3 hours before', minutes: 180 },
  { label: '1 day before', minutes: 1440 },
  { label: '2 days before', minutes: 2880 },
]

export function ReminderPicker({ eventId, startsAt }) {
  const { user, requireAuth } = useApp()
  const toast = useToast()
  // undefined = not yet loaded, null = none, else the active reminder row.
  const [reminder, setReminder] = useState(undefined)
  const [busy, setBusy] = useState(false)
  // Clock snapshot taken once at mount (lazy initializer — evaluated outside the
  // render path) so the preset filter below is pure and stable across renders.
  const [mountedAt] = useState(() => Date.now())

  // Load the user's existing scheduled reminder for THIS event (if any) so the
  // picker reflects reality on mount and across refreshes. A logged-out caller
  // resolves to no reminder. setState happens only in the async continuation.
  const load = useCallback(() => {
    const uid = user?.id
    const resolve = uid
      ? api.reminders.list(uid, { status: 'scheduled' }).then((rows) => rows)
      : Promise.resolve([])
    return resolve.then((rows) => rows.find((r) => r.event_id === eventId) ?? null)
  }, [user?.id, eventId])

  useEffect(() => {
    let cancelled = false
    load().then((found) => {
      if (!cancelled) setReminder(found)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Presets whose fire time (start − offset) is still in the future, so we never
  // offer a reminder that would fire instantly.
  const available = useMemo(() => {
    const startMs = startsAt ? Date.parse(startsAt) : NaN
    return PRESETS.filter((p) => !isNaN(startMs) && startMs - p.minutes * 60000 > mountedAt)
  }, [startsAt, mountedAt])

  const schedule = async (minutes) => {
    if (!requireAuth()) return
    setBusy(true)
    try {
      const created = await api.reminders.create(eventId, minutes)
      setReminder(created)
      toast.success("Reminder set — we'll nudge you before it starts.")
    } catch (err) {
      const msg =
        err?.status === 409
          ? 'You already have a reminder for this event.'
          : err?.status === 422
            ? 'That reminder time has already passed — pick a shorter lead time.'
            : 'Could not set the reminder. Try again.'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!reminder) return
    setBusy(true)
    const prev = reminder
    setReminder(null) // optimistic
    try {
      await api.reminders.cancel(reminder.id)
      toast.info('Reminder cancelled.')
    } catch {
      setReminder(prev)
      toast.error('Could not cancel the reminder.')
    } finally {
      setBusy(false)
    }
  }

  // Still loading, or the event is too soon for any preset and none is set.
  if (reminder === undefined) return null
  if (!reminder && available.length === 0) return null

  // Active reminder — show it with a cancel button.
  if (reminder) {
    const preset = PRESETS.find((p) => p.minutes === reminder.offset_minutes)
    return (
      <div className="mt-4 flex items-center gap-2 rounded-card border border-primary/30 bg-primary-light px-4 py-3">
        <BellRing size={18} className="flex-shrink-0 text-primary" />
        <span className="text-sm font-medium text-ink">
          Reminder set{preset ? ` · ${preset.label}` : ''}
        </span>
        <button
          onClick={cancel}
          disabled={busy}
          className="ml-auto text-sm font-semibold text-primary transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    )
  }

  // No reminder yet — offer the presets.
  return (
    <div className="mt-4 rounded-card border border-border-light bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Bell size={16} className="text-text-secondary" />
        Remind me before this event
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {available.map((p) => (
          <button
            key={p.minutes}
            onClick={() => schedule(p.minutes)}
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-1 rounded-pill border border-border-light px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors',
              'hover:border-primary hover:text-primary disabled:opacity-40',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
