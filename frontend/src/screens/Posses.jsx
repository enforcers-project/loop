import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { PosseAvatars } from '../components/PosseControls'
import { PageLoader } from '../components/primitives'

/* One "your posses" row — deep-links to the posse. */
function MinePosseRow({ posse }) {
  return (
    <Link
      to={`/posse/${posse.id}`}
      className="flex items-center gap-3 rounded-card border border-border-light bg-card-bg p-3 shadow-card transition-shadow hover:shadow-card-hover"
    >
      {posse.event?.poster ? (
        <img
          src={posse.event.poster}
          alt=""
          className="h-12 w-12 flex-shrink-0 rounded-lg bg-surface object-cover"
        />
      ) : (
        <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
          <Users size={20} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{posse.name}</p>
        <p className="truncate text-xs text-text-muted">
          {posse.event?.title ?? 'Event'}
          {posse.viewer_status === 'pending' && ' · requested'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <PosseAvatars members={posse.members ?? []} />
        <span className="text-xs font-medium text-text-secondary">{posse.member_count}</span>
      </div>
    </Link>
  )
}

/* Posses (/posses) — your posses (active/pending) plus a discovery feed of
   public + reciprocal-mutuals posses you can join or request. */
export function Posses() {
  const navigate = useNavigate()
  const toast = useToast()
  const { markGoing } = useApp()
  const [mine, setMine] = useState(null) // null = loading
  const [discover, setDiscover] = useState([])
  const [joiningId, setJoiningId] = useState(null)

  useEffect(() => {
    api.posses.mine().then(setMine)
    api.posses.discover().then(setDiscover)
  }, [])

  if (mine === null) return <PageLoader label="Loading posses" />

  const onJoin = async (posse) => {
    if (joiningId) return
    setJoiningId(posse.id)
    try {
      const res = await api.posses.join(posse.id)
      if (res?.status === 'pending') {
        toast.success('Requested to join')
        // Drop it from discover; it'll show under "your posses" as pending.
        setDiscover((prev) => prev.filter((p) => p.id !== posse.id))
        api.posses.mine().then(setMine)
      } else {
        // Open-join auto-RSVPs server-side (unless age-gated); sync goingIds so
        // the event won't show "RSVP now" and let the user double-count.
        if (!res?.rsvp_blocked) markGoing(res?.event_id ?? posse.event_id)
        navigate(`/posse/${posse.id}`)
      }
    } catch (err) {
      toast.error(err.message || 'Could not join')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="loop-container py-6 pb-24 md:pb-12">
      <h1 className="font-display text-2xl font-bold text-ink">Your posses</h1>
      <p className="mt-1 text-sm text-text-secondary">Groups heading to events together.</p>

      {mine.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-card border border-dashed border-border-light bg-surface/50 px-6 py-12 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-light text-primary">
            <Users size={28} />
          </span>
          <h2 className="mt-5 font-display text-lg font-bold text-ink">No posses yet</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-text-secondary">
            Find an event you&apos;re into and start a posse to head there together.
          </p>
          <button
            onClick={() => navigate('/discover')}
            className="mt-6 inline-flex h-11 items-center rounded-button bg-primary px-6 text-sm font-semibold text-white transition-transform active:scale-95 hover:opacity-90"
          >
            Discover events
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {mine.map((p) => (
            <MinePosseRow key={p.id} posse={p} />
          ))}
        </div>
      )}

      {discover.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-bold text-ink">Discover posses</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Public posses and ones from people you follow.
          </p>
          <div className="mt-4 space-y-2">
            {discover.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-card border border-border-light bg-card-bg p-3 shadow-card"
              >
                {p.event?.poster ? (
                  <img
                    src={p.event.poster}
                    alt=""
                    className="h-12 w-12 flex-shrink-0 rounded-lg bg-surface object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
                    <Users size={20} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                  <p className="truncate text-xs text-text-muted">
                    {p.event?.title ?? 'Event'} · {p.member_count}{' '}
                    {p.member_count === 1 ? 'person' : 'people'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onJoin(p)}
                  disabled={joiningId === p.id}
                  className="inline-flex h-9 items-center rounded-button border border-primary bg-white px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                >
                  {joiningId === p.id ? '…' : p.join_policy === 'ask' ? 'Ask to join' : 'Join'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
