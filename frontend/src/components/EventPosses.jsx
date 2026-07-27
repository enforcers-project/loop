import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { CreatePosseModal, PosseAvatars } from './PosseControls'

/* EventPosses — the posse surface on an event's detail page. Shows a "Start a
   posse" CTA plus any discoverable posses for this event (public + eligible
   mutuals + ones the viewer is already in). Highest-intent entry point for the
   feature. Renders nothing for logged-out viewers (posses are member-scoped). */
export function EventPosses({ eventId, eventTitle }) {
  const navigate = useNavigate()
  const { isLoggedIn, requireAuth } = useApp()
  const toast = useToast()
  const [posses, setPosses] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [joiningId, setJoiningId] = useState(null)

  useEffect(() => {
    if (!isLoggedIn) return
    api.posses.forEvent(eventId).then(setPosses)
  }, [eventId, isLoggedIn])

  if (!isLoggedIn) return null

  const startPosse = () => {
    if (!requireAuth()) return
    setCreateOpen(true)
  }

  const onJoin = async (posse) => {
    if (joiningId) return
    // Members / requesters just open it.
    if (posse.viewer_status) {
      navigate(`/posse/${posse.id}`)
      return
    }
    setJoiningId(posse.id)
    try {
      const res = await api.posses.join(posse.id)
      if (res?.status === 'pending') {
        toast.success('Requested to join')
        api.posses.forEvent(eventId).then(setPosses)
      } else {
        navigate(`/posse/${posse.id}`)
      }
    } catch (err) {
      toast.error(err.message || 'Could not join')
    } finally {
      setJoiningId(null)
    }
  }

  const ctaLabel = (p) => {
    if (p.viewer_status === 'active') return 'Open'
    if (p.viewer_status === 'pending') return 'Requested'
    return p.join_policy === 'ask' ? 'Ask to join' : 'Join'
  }

  return (
    <section className="mx-auto max-w-[860px]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-ink">Posses</h2>
        <button
          type="button"
          onClick={startPosse}
          className="inline-flex h-9 items-center gap-1.5 rounded-button bg-primary px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Users size={15} /> Start a posse
        </button>
      </div>

      {posses.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-light bg-surface/50 px-4 py-6 text-center text-sm text-text-muted">
          No posses yet — start one and head to this event together.
        </p>
      ) : (
        <div className="space-y-2">
          {posses.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-card border border-border-light bg-card-bg p-3 shadow-card"
            >
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                <Users size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                <p className="truncate text-xs text-text-muted">
                  {p.member_count} {p.member_count === 1 ? 'person' : 'people'}
                  {p.note ? ` · ${p.note}` : ''}
                </p>
              </div>
              <PosseAvatars members={p.members ?? []} />
              <button
                type="button"
                onClick={() => onJoin(p)}
                disabled={joiningId === p.id || p.viewer_status === 'pending'}
                className="inline-flex h-9 items-center rounded-button border border-primary bg-white px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
              >
                {joiningId === p.id ? '…' : ctaLabel(p)}
              </button>
            </div>
          ))}
        </div>
      )}

      <CreatePosseModal
        eventId={eventId}
        eventTitle={eventTitle}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(posse) => {
          setCreateOpen(false)
          if (posse?.id) navigate(`/posse/${posse.id}`)
        }}
      />
    </section>
  )
}
