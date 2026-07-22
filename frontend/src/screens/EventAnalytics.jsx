import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PageLoader } from '../components/primitives'
import {
  StatTile,
  RangePicker,
  ChartCard,
  ChartEmpty,
  FunnelCard,
  formatCount,
} from '../components/analytics/AnalyticsPrimitives'
import { TimeSeriesChart } from '../components/analytics/TimeSeriesChart'
import { BarBreakdown } from '../components/analytics/BarBreakdown'

function rangeToDates(range) {
  const to = new Date()
  const from = new Date()
  switch (range) {
    case '7d':
      from.setUTCDate(from.getUTCDate() - 6)
      break
    case '30d':
      from.setUTCDate(from.getUTCDate() - 29)
      break
    case '90d':
      from.setUTCDate(from.getUTCDate() - 89)
      break
    case 'all':
    default:
      from.setUTCFullYear(from.getUTCFullYear() - 2)
      break
  }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function EventAnalytics() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { authReady, role } = useApp()
  const [range, setRange] = useState('30d')
  const dates = useMemo(() => rangeToDates(range), [range])

  useEffect(() => {
    if (authReady && role !== 'organizer') navigate('/profile', { replace: true })
  }, [authReady, role, navigate])

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    enabled: !!id,
    queryKey: ['analytics', 'event', id, dates.from, dates.to],
    queryFn: () => api.eventAnalytics(id, dates),
  })

  const seriesConfig = useMemo(
    () => [
      { key: 'views', label: 'Views' },
      { key: 'saves', label: 'Saves' },
      { key: 'rsvps', label: 'RSVPs' },
      { key: 'shares', label: 'Shares' },
    ],
    [],
  )

  if (!authReady || (isLoading && !data)) return <PageLoader label="Loading analytics" />
  if (error) {
    const message =
      error.status === 403
        ? "You don't have access to this event's analytics."
        : error.message || 'Could not load analytics.'
    return (
      <div className="loop-container py-12">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-ink"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-card border border-accent/40 bg-accent/5 p-6 text-sm text-accent">
          {message}
        </div>
      </div>
    )
  }
  if (!data) return null

  const totals = data.totals ?? {}
  const series = data.series ?? []
  const funnel = data.funnel ?? {}
  const surfaces = data.surfaces ?? []
  const searchTerms = data.searchTerms ?? []
  const recCTR = data.recCTR ?? { impressions: 0, clicks: 0 }
  const event = data.event ?? {}
  const attendanceRate =
    totals.rsvpsGoing > 0 ? Math.round(((totals.attended ?? 0) / totals.rsvpsGoing) * 100) : null
  const ctr =
    recCTR.impressions > 0 ? Math.round((recCTR.clicks / recCTR.impressions) * 100) : null

  const hasSignals =
    (totals.views ?? 0) + (totals.saves ?? 0) + (totals.rsvpsGoing ?? 0) + (totals.shares ?? 0) > 0

  return (
    <div className="loop-container space-y-6 py-8">
      {/* Back + range picker */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate('/organizer/analytics')}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-ink"
        >
          <ArrowLeft size={16} /> All analytics
        </button>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {/* Event header */}
      <header className="flex flex-wrap items-start gap-4 rounded-card border border-border-light bg-white p-5 shadow-card">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface">
          {event.flyerUrl ? (
            <img src={event.flyerUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Event analytics
          </div>
          <h1 className="mt-1 text-xl font-semibold text-ink">{event.title}</h1>
          <div className="mt-1 text-sm text-text-muted">
            {event.startsAt ? fmtDate(event.startsAt) : ''} · {fmtDate(data.range?.from)} –{' '}
            {fmtDate(data.range?.to)}
          </div>
        </div>
        <Link
          to={`/event/${event.id}`}
          className="inline-flex items-center gap-1 rounded-button border border-border-light bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          View event <ExternalLink size={14} />
        </Link>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Views" value={totals.views ?? 0} />
        <StatTile label="Saves" value={totals.saves ?? 0} />
        <StatTile label="Going" value={totals.rsvpsGoing ?? 0} />
        <StatTile label="Interested" value={totals.rsvpsInterested ?? 0} />
        <StatTile label="Shares" value={totals.shares ?? 0} />
        <StatTile
          label="Attended"
          value={totals.attended ?? 0}
          hint={attendanceRate != null ? `${attendanceRate}% of Going` : undefined}
        />
      </section>

      {/* Time series */}
      <ChartCard
        title="Signals over time"
        subtitle="Daily view / save / RSVP / share activity"
      >
        {hasSignals ? (
          <TimeSeriesChart data={series} series={seriesConfig} />
        ) : (
          <ChartEmpty />
        )}
      </ChartCard>

      {/* Funnel + Surfaces side-by-side */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FunnelCard
          stages={[
            { key: 'views', label: 'Views', count: funnel.views ?? 0 },
            { key: 'saves', label: 'Saves', count: funnel.saves ?? 0 },
            { key: 'rsvps', label: 'RSVPs (going)', count: funnel.rsvpsGoing ?? 0 },
            { key: 'attended', label: 'Attended', count: funnel.attended ?? 0 },
          ]}
        />
        <ChartCard
          title="Where views came from"
          subtitle="Traffic source across the app"
        >
          <BarBreakdown
            rows={surfaces.map((s) => ({
              key: s.surface,
              label: s.surface,
              value: s.views,
            }))}
          />
        </ChartCard>
      </section>

      {/* Search terms + Rec performance side-by-side */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Search terms that clicked in"
          subtitle="What people typed before landing here"
        >
          {searchTerms.length === 0 ? (
            <ChartEmpty message="No search-driven clicks in this range." />
          ) : (
            <ul className="divide-y divide-border-light">
              {searchTerms.map((t) => (
                <li
                  key={t.term}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="truncate text-ink">“{t.term}”</span>
                  <span className="ml-3 shrink-0 tabular-nums text-text-secondary">
                    {formatCount(t.clicks)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard
          title='"For You" performance'
          subtitle="How the ranker treated this event"
        >
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Impressions" value={recCTR.impressions} />
            <StatTile label="Clicks" value={recCTR.clicks} />
            <StatTile
              label="CTR"
              value={ctr ?? 0}
              hint={ctr != null ? '%' : 'no impressions'}
            />
          </div>
        </ChartCard>
      </section>

      {/* Comment count footer note (data already loaded on the card totals). */}
      {totals.comments > 0 && (
        <p className="text-xs text-text-muted">
          {formatCount(totals.comments)} comment{totals.comments === 1 ? '' : 's'} on this event ·{' '}
          <Link to={`/event/${event.id}#comments`} className="text-primary hover:underline">
            read them →
          </Link>
        </p>
      )}
    </div>
  )
}
