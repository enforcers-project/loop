import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { api } from '../lib/api'
import { PosseAvatars } from '../components/PosseControls'
import { PageLoader } from '../components/primitives'

/* Posses (/posses) — the index of posses the viewer is in (active) or has
   requested (pending). Each row deep-links to /posse/:id. */
export function Posses() {
  const navigate = useNavigate()
  const [posses, setPosses] = useState(null) // null = loading

  useEffect(() => {
    api.posses.mine().then(setPosses)
  }, [])

  if (posses === null) return <PageLoader label="Loading posses" />

  return (
    <div className="loop-container py-6 pb-24 md:pb-12">
      <h1 className="font-display text-2xl font-bold text-ink">Your posses</h1>
      <p className="mt-1 text-sm text-text-secondary">Groups heading to events together.</p>

      {posses.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-card border border-dashed border-border-light bg-surface/50 px-6 py-16 text-center">
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
          {posses.map((p) => (
            <Link
              key={p.id}
              to={`/posse/${p.id}`}
              className="flex items-center gap-3 rounded-card border border-border-light bg-card-bg p-3 shadow-card transition-shadow hover:shadow-card-hover"
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
                  {p.event?.title ?? 'Event'}
                  {p.viewer_status === 'pending' && ' · requested'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PosseAvatars members={p.members ?? []} />
                <span className="text-xs font-medium text-text-secondary">{p.member_count}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
