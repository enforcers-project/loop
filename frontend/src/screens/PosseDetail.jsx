import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, MapPin, Trash2, UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { useModal } from '../context/ModalContext'
import { hydrateThreads } from '../lib/messages'
import { subscribePosseEvents } from '../lib/posseEvents'
import { ThreadView } from '../components/messages'
import { InvitePosseModal, PosseMemberRow } from '../components/PosseControls'
import { PageLoader } from '../components/primitives'

/* The posse event's `date` is an ISO instant; render it as "Sat, Jul 25". */
function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/* PosseDetail (/posse/:id) — event header + roster + the group chat. The chat
   reuses ThreadView from the messaging system by handing it the posse's
   threadId; we hydrate the thread store on mount so ThreadView can render it.
   The roster updates live off posse_* SSE frames (see subscribePosseEvents),
   and the chat is realtime because it's a normal thread. */
export function PosseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useApp()
  const toast = useToast()
  const modal = useModal()

  const [posse, setPosse] = useState(null) // null = loading
  const [notFound, setNotFound] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Fetch (or refetch) the posse. setState only happens in the promise tail —
  // never synchronously in an effect body — so no cascading-render warning.
  const load = useCallback(
    () =>
      api.posses.get(id).then(
        (data) => setPosse(data),
        () => setNotFound(true),
      ),
    [id],
  )

  useEffect(() => {
    load()
  }, [load])

  // Make the posse's group thread available to ThreadView + the realtime store.
  useEffect(() => {
    if (user?.id) hydrateThreads(user.id).catch(() => {})
  }, [user?.id, posse?.thread_id])

  // Live roster: the messages SSE stream carries posse_* frames for this posse
  // (someone joined / requested / left, or it was dissolved). Refetch the roster
  // when one lands for this posse; on dissolve, bounce out.
  useEffect(() => {
    if (!posse?.id) return
    return subscribePosseEvents((frame) => {
      if (frame.posseId !== posse.id) return
      if (frame.type === 'posse_dissolved') {
        toast.error('This posse was dissolved')
        navigate('/social')
        return
      }
      load()
    })
  }, [posse?.id, load, navigate, toast])

  if (notFound) {
    return (
      <div className="loop-container flex flex-col items-center py-24 text-center">
        <p className="text-sm text-text-secondary">This posse isn&apos;t around anymore.</p>
        <Link to="/social" className="mt-4 text-sm font-semibold text-primary hover:underline">
          Back to social
        </Link>
      </div>
    )
  }
  if (!posse) return <PageLoader label="Loading posse" />

  const isCaptain = posse.viewer_role === 'captain'
  const isMember = posse.viewer_status === 'active'
  const members = posse.members ?? []
  const pending = members.filter((m) => m.status === 'pending')
  const active = members.filter((m) => m.status === 'active')

  const onApprove = async (userId) => {
    setBusy(true)
    try {
      await api.posses.approve(posse.id, userId)
      toast.success('Approved')
      await load()
    } catch (err) {
      toast.error(err.message || 'Could not approve')
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async (userId) => {
    const self = userId === user?.id
    const ok = await modal.confirm({
      title: self ? 'Leave posse?' : 'Remove member?',
      message: self
        ? 'You can rejoin later if it stays open to you. Your RSVP to the event stays.'
        : 'They will be removed from the posse and its chat.',
      confirmLabel: self ? 'Leave' : 'Remove',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await api.posses.removeMember(posse.id, userId)
      if (self) {
        toast.success(res?.dissolved ? 'Posse dissolved' : 'You left the posse')
        navigate('/social')
        return
      }
      toast.success('Removed')
      await load()
    } catch (err) {
      toast.error(err.message || 'Could not remove')
    } finally {
      setBusy(false)
    }
  }

  const onDissolve = async () => {
    const ok = await modal.confirm({
      title: 'Dissolve posse?',
      message: 'This deletes the posse and its chat for everyone. This can’t be undone.',
      confirmLabel: 'Dissolve',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.posses.dissolve(posse.id)
      toast.success('Posse dissolved')
      navigate('/social')
    } catch (err) {
      toast.error(err.message || 'Could not dissolve')
      setBusy(false)
    }
  }

  return (
    <div className="loop-container py-4 pb-24 md:pb-12">
      {/* header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-ink">{posse.name}</h1>
          {posse.note && <p className="mt-1 text-sm text-text-secondary">{posse.note}</p>}
        </div>
      </div>

      {/* event chip */}
      {posse.event && (
        <Link
          to={`/event/${posse.event.id}`}
          className="mt-4 flex items-center gap-3 rounded-card border border-border-light bg-card-bg p-3 transition-shadow hover:shadow-card-hover"
        >
          <img
            src={posse.event.poster}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded-lg bg-surface object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{posse.event.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
              {posse.event.date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} /> {shortDate(posse.event.date)}
                </span>
              )}
              {posse.event.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {posse.event.city}
                </span>
              )}
            </div>
          </div>
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* roster */}
        <aside>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              {active.length} {active.length === 1 ? 'person' : 'people'}
            </h2>
            {isMember && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <UserPlus size={15} /> Add
              </button>
            )}
          </div>

          {isCaptain && pending.length > 0 && (
            <div className="mb-3 rounded-card border border-border-light bg-surface/60 p-2">
              <p className="px-1 pb-1 text-xs font-semibold text-text-secondary">
                Requests ({pending.length})
              </p>
              {pending.map((m) => (
                <PosseMemberRow
                  key={m.user.id}
                  member={m}
                  onApprove={onApprove}
                  onRemove={onRemove}
                  busy={busy}
                />
              ))}
            </div>
          )}

          <div className="rounded-card border border-border-light bg-card-bg px-3">
            {active.map((m) => (
              <PosseMemberRow
                key={m.user.id}
                member={m}
                onRemove={isCaptain || m.user.id === user?.id ? onRemove : undefined}
                busy={busy}
              />
            ))}
          </div>

          {isCaptain && (
            <button
              type="button"
              onClick={onDissolve}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline disabled:opacity-50"
            >
              <Trash2 size={15} /> Dissolve posse
            </button>
          )}
        </aside>

        {/* chat — reuse the message-thread view by handing it the posse thread */}
        <section className="flex h-[60vh] min-h-[420px] flex-col overflow-hidden rounded-card border border-border-light bg-white shadow-card lg:h-[70vh]">
          {isMember ? (
            <ThreadView threadId={posse.thread_id} compact />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-sm text-text-secondary">Join the posse to see the chat.</p>
            </div>
          )}
        </section>
      </div>

      <InvitePosseModal
        posseId={posse.id}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => load()}
      />
    </div>
  )
}
