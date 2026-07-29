// Posse UI building blocks (planning/posses_feature.md, PR 2):
//   - CreatePosseModal   — start a posse for an event
//   - InvitePosseModal   — search mutuals/people and add them (invite = join)
//   - OptionCards        — single-select card group (visibility / join policy)
//   - PosseMemberRow     — one roster row with captain controls
// The posse detail chat itself reuses ThreadView from components/messages.jsx.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { m, AnimatePresence } from 'motion/react'
import { Check, Search, UserPlus, X } from 'lucide-react'
import { api, DEFAULT_AVATAR } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'
import { backdrop, dialog } from '../lib/motion'
import { inputClass, Spinner } from './primitives'

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', description: 'Invite-only. Nobody can find it.' },
  { value: 'mutuals', label: 'Mutuals', description: 'People you both follow can find and join.' },
  { value: 'public', label: 'Public', description: 'Anyone who can see the event can find it.' },
]

const JOIN_OPTIONS = [
  { value: 'open', label: 'Open', description: 'Anyone who finds it joins instantly.' },
  { value: 'ask', label: 'Ask to join', description: 'People request; you approve.' },
]

/* Single-select card group — the app's idiomatic picker (mirrors RoleSelector).
   `value` is the selected value; `onChange(value)` on tap. */
export function OptionCards({ options, value, onChange, disabled = false }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => !active && onChange(opt.value)}
            className={cn(
              'flex items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors disabled:opacity-60',
              active
                ? 'border-primary bg-primary-light'
                : 'border-border-light bg-card-bg hover:border-text-muted',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{opt.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">
                {opt.description}
              </span>
            </span>
            {active && <Check size={16} className="mt-0.5 flex-shrink-0 text-primary" />}
          </button>
        )
      })}
    </div>
  )
}

/* Standard centered dialog shell — backdrop + dialog motion, Escape to close,
   click-out to dismiss. Mirrors AttendeeModal/FollowListModal. */
function ModalShell({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <m.div
      variants={backdrop}
      initial="hidden"
      animate="show"
      exit="hidden"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <m.div
        variants={dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-card bg-card-bg shadow-hero"
      >
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border-light px-5 py-3.5">{footer}</div>}
      </m.div>
    </m.div>
  )
}

/* --------------------------------------------------------------------------
   CreatePosseModal — start a posse for an event. On success calls
   onCreated(posse) (the caller routes to /posse/:id).
-------------------------------------------------------------------------- */
export function CreatePosseModal({ eventId, eventTitle, open, onClose, onCreated }) {
  const toast = useToast()
  const { markGoing } = useApp()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [joinPolicy, setJoinPolicy] = useState('ask')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const posse = await api.posses.create({
        eventId,
        name: trimmed,
        note: note.trim(),
        visibility,
        joinPolicy,
      })
      toast.success('Posse created')
      // Creating a posse auto-RSVPs the captain server-side (unless age-gated),
      // so sync goingIds — otherwise the event still shows "RSVP now" and a tap
      // would double-count them.
      if (!posse?.rsvp_blocked) markGoing(posse?.event_id ?? eventId)
      onCreated?.(posse)
    } catch (err) {
      toast.error(err.message || 'Could not create posse')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <ModalShell
          title="Start a posse"
          onClose={() => !busy && onClose()}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !busy && onClose()}
                className="rounded-button px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!name.trim() || busy}
                className="rounded-button bg-primary px-5 py-2 text-sm font-semibold text-white transition-opacity active:scale-95 disabled:opacity-40"
              >
                {busy ? 'Creating…' : 'Create posse'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {eventTitle && (
              <p className="text-sm text-text-secondary">
                Heading to <span className="font-semibold text-ink">{eventTitle}</span> together.
              </p>
            )}
            <div>
              <label
                htmlFor="posse-name"
                className="mb-1.5 block text-[13px] font-medium text-text-secondary"
              >
                Name
              </label>
              <input
                id="posse-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                placeholder="North gate crew"
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="posse-note"
                className="mb-1.5 block text-[13px] font-medium text-text-secondary"
              >
                Note <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="posse-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 280))}
                placeholder="Meet at the north gate at 8"
                className={inputClass}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-text-secondary">Who can find it</p>
              <OptionCards
                options={VISIBILITY_OPTIONS}
                value={visibility}
                onChange={setVisibility}
                disabled={busy}
              />
            </div>
            {visibility !== 'private' && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-text-secondary">Joining</p>
                <OptionCards
                  options={JOIN_OPTIONS}
                  value={joinPolicy}
                  onChange={setJoinPolicy}
                  disabled={busy}
                />
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

/* --------------------------------------------------------------------------
   InvitePosseModal — search people and invite them to a posse. An invite is an
   offer the recipient accepts or declines (backend creates an `invited` row);
   it does NOT add them until they accept. Calls onInvited(userId) after each
   successful invite.
-------------------------------------------------------------------------- */
export function InvitePosseModal({ posseId, open, onClose, onInvited }) {
  const { user } = useApp()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [invitedIds, setInvitedIds] = useState(() => new Set())
  const [pendingId, setPendingId] = useState(null)

  const term = q.trim()
  useEffect(() => {
    let cancelled = false
    // All setState runs in the timeout tail (never synchronously in the effect
    // body) so a keystroke doesn't cascade a render. A <2-char query just clears.
    const t = setTimeout(() => {
      if (term.length < 2) {
        if (!cancelled) setResults([])
        return
      }
      setSearching(true)
      api
        .searchUsers(term)
        .then((rows) => {
          if (!cancelled) setResults(rows ?? [])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term])

  const invite = async (person) => {
    if (pendingId) return
    setPendingId(person.id)
    try {
      await api.posses.invite(posseId, person.id)
      setInvitedIds((prev) => new Set(prev).add(person.id))
      toast.success(`Invited ${person.name || 'them'}`)
      onInvited?.(person.id)
    } catch (err) {
      toast.error(err.message || 'Could not invite them')
    } finally {
      setPendingId(null)
    }
  }

  const visible = results.filter((p) => p.id !== user?.id)

  return (
    <AnimatePresence>
      {open && (
        <ModalShell title="Invite people" onClose={onClose}>
          <div className="relative mb-3">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or @handle"
              aria-label="Search people"
              className={cn(inputClass, 'pl-9')}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner size="sm" />
              </div>
            )}
          </div>
          {term.length < 2 ? (
            <p className="py-10 text-center text-sm text-text-muted">
              Start typing a name or @handle to invite people.
            </p>
          ) : visible.length === 0 && !searching ? (
            <p className="py-10 text-center text-sm text-text-muted">No people found.</p>
          ) : (
            <div className="space-y-1">
              {visible.map((p) => {
                const done = invitedIds.has(p.id)
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-card px-2 py-2">
                    <img
                      src={p.avatar || DEFAULT_AVATAR}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 rounded-full bg-surface object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-semibold text-ink">
                          {p.name || 'Loop member'}
                        </span>
                      </div>
                      {p.handle && <p className="truncate text-xs text-text-muted">@{p.handle}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => !done && invite(p)}
                      disabled={done || pendingId === p.id}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-button px-3 text-sm font-semibold transition-colors disabled:opacity-60',
                        done
                          ? 'bg-surface text-text-secondary'
                          : 'bg-primary text-white hover:opacity-90',
                      )}
                    >
                      {pendingId === p.id ? (
                        <Spinner size="sm" />
                      ) : done ? (
                        <>
                          <Check size={15} /> Invited
                        </>
                      ) : (
                        <>
                          <UserPlus size={15} /> Invite
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

/* --------------------------------------------------------------------------
   PosseMemberRow — one roster row. Shows role, and (for the captain viewing
   others) approve/remove controls. `onApprove`/`onRemove` are omitted for rows
   the viewer can't act on.
-------------------------------------------------------------------------- */
export function PosseMemberRow({ member, onApprove, onRemove, busy }) {
  const navigate = useNavigate()
  const u = member.user
  if (!u) return null
  const pending = member.status === 'pending'
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => navigate(`/organizer/${u.id}`)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`View ${u.display_name || 'profile'}`}
      >
        <img
          src={u.avatar_url || DEFAULT_AVATAR}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded-full bg-surface object-cover"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold text-ink">
              {u.display_name || 'Loop member'}
            </span>
          </div>
          <p className="truncate text-xs text-text-muted">
            {member.role === 'captain'
              ? 'Captain'
              : pending
                ? 'Requested to join'
                : `@${u.handle || ''}`}
          </p>
        </div>
      </button>
      {pending && onApprove && (
        <button
          type="button"
          onClick={() => onApprove(u.id)}
          disabled={busy}
          className="rounded-button bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
      )}
      {onRemove && member.role !== 'captain' && (
        <button
          type="button"
          onClick={() => onRemove(u.id)}
          disabled={busy}
          aria-label="Remove"
          className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-accent disabled:opacity-50"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/* A compact "N going" avatar stack for a posse card. */
export function PosseAvatars({ members = [], max = 4 }) {
  const active = useMemo(
    () => members.filter((m) => m.status === 'active').slice(0, max),
    [members, max],
  )
  if (!active.length) return null
  return (
    <div className="flex -space-x-2">
      {active.map((m) => (
        <img
          key={m.user.id}
          src={m.user.avatar_url || DEFAULT_AVATAR}
          alt=""
          className="h-7 w-7 rounded-full border-2 border-white object-cover"
        />
      ))}
    </div>
  )
}
