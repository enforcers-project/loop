import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, MapPin, Users } from 'lucide-react'
import { api } from '../lib/api'
import { CATEGORY_COLOR, cn } from '../lib/utils'
import { PageLoader, VerifiedBadge } from '../components/primitives'

const SKILL_STYLE = {
  Beginner: { bg: '#F0EFFE', text: '#6D5EFC' },
  Intermediate: { bg: '#FFF3D6', text: '#B57900' },
  Advanced: { bg: '#DFF7EC', text: '#16C784' },
}

function SkillBadge({ skill }) {
  const s = SKILL_STYLE[skill]
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {skill}
    </span>
  )
}

export function SportsPickupDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [position, setPosition] = useState(null)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    if (id) api.event(id).then(setEvent)
  }, [id])

  if (!event || !event.isSports) return <PageLoader label="Loading run" />

  const signed = (event.playersSignedUp ?? 0) + (joined ? 1 : 0)
  const needed = event.playersNeeded ?? 0
  const pct = needed ? Math.min(100, Math.round((signed / needed) * 100)) : 0
  const roster = event.roster ?? []
  const claimed = roster.filter((p) => p.status === 'claimed')
  const waitlist = roster.filter((p) => p.status === 'waitlist')

  return (
    <div className="pb-24 md:pb-10">
      {/* dark header */}
      <div className="relative overflow-hidden bg-ink">
        <img
          src={event.poster}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-md"
        />
        <div className="relative mx-auto max-w-[1140px] px-5 py-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-6 flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
          >
            <ArrowLeft size={18} /> Back
          </button>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_360px]">
            {/* info */}
            <div className="text-white">
              <span
                className="inline-block rounded-pill px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: CATEGORY_COLOR.Sports }}
              >
                {event.sport} · {event.indoor ? 'Indoor' : 'Outdoor'}
              </span>
              <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-5xl">
                {event.title}
              </h1>
              <div className="mt-6 space-y-3 text-sm text-white/85">
                <div className="flex items-center gap-2.5">
                  <Calendar size={18} className="text-white/60" /> {event.date}
                </div>
                <div className="flex items-center gap-2.5">
                  <MapPin size={18} className="text-white/60" /> {event.venueName}, {event.city}
                </div>
                <div className="flex items-center gap-2.5">
                  <Users size={18} className="text-white/60" /> Skill: {event.skillLevel}
                </div>
              </div>
            </div>

            {/* counter card */}
            <div className="rounded-card bg-white p-5 shadow-hero">
              <div className="flex items-end justify-between">
                <span className="font-display text-4xl font-bold text-ink">
                  {signed}
                  <span className="text-text-muted">/{needed}</span>
                </span>
                <span className="text-sm font-medium text-text-secondary">{event.price} entry</span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">players signed up</p>

              {/* progress bar */}
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>

              {/* position picker grid */}
              <p className="mb-2 mt-5 text-sm font-semibold text-ink">Pick your position</p>
              <div className="grid grid-cols-2 gap-2">
                {(event.positions ?? []).map((p) => {
                  const full = p.filled >= p.capacity
                  const active = position === p.label
                  return (
                    <button
                      key={p.label}
                      disabled={full && !active}
                      onClick={() => setPosition(p.label)}
                      className={cn(
                        'rounded-button border px-3 py-2.5 text-left text-sm transition-colors',
                        active
                          ? 'border-primary bg-primary text-white'
                          : full
                            ? 'cursor-not-allowed border-border-light bg-surface text-text-muted'
                            : 'border-border-light bg-white text-text-primary hover:border-primary',
                      )}
                    >
                      <span className="block font-semibold">{p.label}</span>
                      <span className={cn('text-xs', active ? 'text-white/80' : 'text-text-muted')}>
                        {full ? 'Full' : `${p.capacity - p.filled} open`}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* join CTA */}
              <button
                disabled={!position && !joined}
                onClick={() => setJoined((v) => !v)}
                className={cn(
                  'mt-4 w-full rounded-button py-3 text-sm font-semibold transition-transform active:scale-95',
                  joined
                    ? 'border border-accent bg-white text-accent'
                    : position
                      ? 'bg-accent text-white'
                      : 'cursor-not-allowed bg-surface text-text-muted',
                )}
              >
                {joined
                  ? 'You’re in ✓ — leave run'
                  : position
                    ? `Join as ${position}`
                    : 'Pick a position'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* light body: roster */}
      <div className="mx-auto max-w-[1140px] px-5 py-10">
        <h2 className="font-display text-xl font-bold text-ink">
          Roster ({claimed.length}/{needed})
        </h2>

        <div className="mt-4 overflow-hidden rounded-card border border-border-light">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Player</th>
                <th className="px-4 py-3 font-semibold">Position</th>
                <th className="px-4 py-3 font-semibold">Skill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {claimed.map((p, i) => (
                <tr key={i} className="bg-white">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <img src={p.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                      <span className="font-medium text-ink">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{p.position}</td>
                  <td className="px-4 py-3">
                    <SkillBadge skill={p.skill} />
                  </td>
                </tr>
              ))}
              {/* open slots */}
              {Array.from({ length: Math.max(0, needed - claimed.length) }).map((_, i) => (
                <tr key={`open-${i}`} className="bg-surface/40">
                  <td className="px-4 py-3 text-text-muted" colSpan={3}>
                    <span className="flex items-center gap-2">
                      <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-border-light text-text-muted">
                        +
                      </span>
                      Open slot
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* waitlist */}
        {waitlist.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold text-ink">
              Waitlist
              <VerifiedBadge size={14} />
            </h3>
            <div className="space-y-2">
              {waitlist.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-button border border-border-light bg-white px-4 py-2.5"
                >
                  <span className="w-5 text-xs font-semibold text-text-muted">#{i + 1}</span>
                  <img src={p.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  <span className="flex-1 text-sm font-medium text-ink">{p.name}</span>
                  <SkillBadge skill={p.skill} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
