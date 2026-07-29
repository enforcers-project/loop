import { useEffect, useState } from 'react'
import { MoreHorizontal, Flag, EyeOff } from 'lucide-react'
import { m, AnimatePresence } from 'motion/react'
import { backdrop, sheet } from '../lib/motion'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useApp } from '../context/AppContext'
import { cn } from '../lib/utils'

// Instagram-style "report this" for social content. Exports:
//   <ReportButton isOwn targetType targetId onReported />
//     a ⋯ button that opens the report sheet. Hides itself when `isOwn` is
//     true (the author sees a Delete affordance instead — Report is a
//     viewer-only action).
//   <ReportSheet />
//     the modal itself; the button opens it internally, but exported for
//     tests / callers that want to trigger it from a custom trigger.
//   <HiddenPlaceholder variant targetType targetId onRestored />
//     Instagram-style "Post hidden · Undo" placeholder. Renders in place of
//     the reported item so it doesn't just vanish — the user gets a chance
//     to undo. Tapping Undo calls DELETE /api/reports and fires onRestored.
//
// On successful report `onReported(targetId)` fires so the parent can swap in
// the placeholder (the server side is idempotent and filters subsequent list
// fetches, so the report persists across reloads).

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'misinfo', label: 'False information' },
  { value: 'other', label: 'Something else' },
]

const TARGET_LABEL = { post: 'post', comment: 'comment', story: 'story' }

export function ReportSheet({ targetType, targetId, onClose, onReported }) {
  const toast = useToast()
  const [reason, setReason] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!reason || submitting) return
    setSubmitting(true)
    try {
      await api.reportContent({
        targetType,
        targetId,
        reason,
        ...(reason === 'other' && note.trim() ? { note: note.trim() } : {}),
      })
      toast.success("Report sent. You won't see this again.")
      onReported?.(targetId)
      onClose?.()
    } catch (err) {
      toast.error(err?.message || 'Could not send that report. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const label = TARGET_LABEL[targetType] ?? 'post'

  return (
    <m.div
      variants={backdrop}
      initial="hidden"
      animate="show"
      exit="exit"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation()
        onClose?.()
      }}
    >
      <m.div
        variants={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Report this ${label}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full overflow-hidden rounded-t-card bg-card-bg p-4 shadow-hero sm:max-w-sm sm:rounded-card"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-accent">
            <Flag size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">Report this {label}</h3>
            <p className="text-xs text-text-muted">
              Your report is anonymous. This {label} will be hidden from you.
            </p>
          </div>
        </div>

        <ul className="max-h-[52vh] space-y-1 overflow-y-auto">
          {REASONS.map((r) => {
            const active = reason === r.value
            return (
              <li key={r.value}>
                <button
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-input px-3 py-2.5 text-left text-sm transition-colors',
                    active
                      ? 'bg-primary-light font-semibold text-primary'
                      : 'text-ink hover:bg-surface',
                  )}
                >
                  <span>{r.label}</span>
                  {active && <span aria-hidden="true">•</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {reason === 'other' && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Tell us more (optional)"
            className="mt-2 w-full resize-none rounded-input border border-border-light bg-card-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-placeholder focus:border-primary"
          />
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-input border border-border-light px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || submitting}
            className="flex-1 rounded-input bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {submitting ? 'Reporting…' : 'Report'}
          </button>
        </div>
      </m.div>
    </m.div>
  )
}

// "Post/comment/story hidden · Undo" placeholder. Rendered in place of the
// original item after a successful report so the item doesn't just disappear
// without a trace. `variant` picks the shell:
//   'card'    — full-width card matching PostCard's footprint (feed)
//   'row'     — compact inline row (comments + replies)
//   'overlay' — centered overlay for the story viewer
export function HiddenPlaceholder({ variant = 'row', targetType, targetId, onRestored, message }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const label = TARGET_LABEL[targetType] ?? 'post'
  const copy = message ?? `${label[0].toUpperCase()}${label.slice(1)} hidden`

  const undo = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.unreportContent({ targetType, targetId })
      onRestored?.(targetId)
    } catch (err) {
      toast.error(err?.message || 'Could not undo. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'card') {
    return (
      <article className="flex items-center gap-3 rounded-card border border-border-light bg-surface px-4 py-6 text-sm text-text-secondary shadow-card">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-card-bg text-text-muted">
          <EyeOff size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{copy}</p>
          <p className="text-xs text-text-muted">You won&apos;t see this again.</p>
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={busy}
          className="text-sm font-semibold text-primary transition-opacity disabled:opacity-40"
        >
          {busy ? 'Undoing…' : 'Undo'}
        </button>
      </article>
    )
  }

  if (variant === 'overlay') {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white/90">
          <EyeOff size={22} />
        </span>
        <p className="text-base font-semibold text-white">{copy}</p>
        <p className="text-sm text-white/70">You won&apos;t see this again.</p>
        <button
          type="button"
          onClick={undo}
          disabled={busy}
          className="mt-1 rounded-pill bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:bg-white/20 disabled:opacity-40"
        >
          {busy ? 'Undoing…' : 'Undo'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-input bg-surface px-3 py-2 text-xs text-text-secondary">
      <EyeOff size={13} className="flex-shrink-0 text-text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">{copy}</span>
      <button
        type="button"
        onClick={undo}
        disabled={busy}
        className="text-xs font-semibold text-primary transition-opacity disabled:opacity-40"
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  )
}

export function ReportButton({
  isOwn,
  targetType,
  targetId,
  onReported,
  className,
  iconSize = 20,
}) {
  const { requireAuth } = useApp()
  const [open, setOpen] = useState(false)

  if (isOwn || !targetId) return null

  const openSheet = () => {
    if (!requireAuth()) return
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label={`Report this ${TARGET_LABEL[targetType] ?? 'post'}`}
        className={cn(
          'grid place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-ink',
          className,
        )}
      >
        <MoreHorizontal size={iconSize} />
      </button>
      <AnimatePresence>
        {open && (
          <ReportSheet
            targetType={targetType}
            targetId={targetId}
            onClose={() => setOpen(false)}
            onReported={onReported}
          />
        )}
      </AnimatePresence>
    </>
  )
}
