import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PageLoader } from '../components/primitives'
import {
  StatTile,
  RangePicker,
  ChartCard,
  ChartEmpty,
  SERIES_COLORS,
  formatCount,
} from '../components/analytics/AnalyticsPrimitives'
import { TimeSeriesChart } from '../components/analytics/TimeSeriesChart'
import { BarBreakdown } from '../components/analytics/BarBreakdown'

// Convert a range key ('7d' | '30d' | '90d' | 'all') into { from, to } ISO
// date strings the backend accepts. 'all' skips `from` — the backend defaults
// to 30 days when neither is given, so we send a wide window (~2y) instead.
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

export function OrganizerAnalytics() {
  const navigate = useNavigate()
  const { user, authReady, role } = useApp()
  const [range, setRange] = useState('30d')
  const dates = useMemo(() => rangeToDates(range), [range])

  // Only organizers see this page. Attendees who guess the URL get bounced to
  // their profile instead of a 403 wall.
  useEffect(() => {
    if (authReady && role !== 'organizer') navigate('/profile', { replace: true })
  }, [authReady, role, navigate])

  const { data, isLoading, error } = useQuery({
    enabled: !!user?.id,
    queryKey: ['analytics', 'organizer', user?.id, dates.from, dates.to],
    queryFn: () => api.organizerAnalytics(user.id, dates),
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
    return (
      <div className="loop-container py-12">
        <div className="rounded-card border border-accent/40 bg-accent/5 p-6 text-sm text-accent">
          {error.message || 'Could not load analytics.'}
        </div>
      </div>
    )
  }
  if (!data) return null

  const totals = data.totals ?? {}
  const series = data.series ?? []
  const topEvents = data.topEvents ?? []
  const categoryMix = data.categoryMix ?? []

  const hasSignals = totals.views + totals.saves + totals.rsvps + totals.shares > 0

  return (
    <div className="loop-container space-y-6 py-8">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
            <BarChart3 size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Analytics</h1>
            <p className="text-sm text-text-muted">
              {fmtDate(data.range?.from)} – {fmtDate(data.range?.to)} · across{' '}
              {formatCount(totals.events ?? 0)} event
              {totals.events === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Views" value={totals.views ?? 0} />
        <StatTile label="Saves" value={totals.saves ?? 0} />
        <StatTile label="RSVPs" value={totals.rsvps ?? 0} />
        <StatTile label="Shares" value={totals.shares ?? 0} />
        <StatTile label="Events" value={totals.events ?? 0} />
        <StatTile
          label="Followers"
          value={totals.followerCount ?? 0}
          hint={
            totals.newFollowers != null && totals.newFollowers > 0
              ? `+${totals.newFollowers} in range`
              : undefined
          }
        />
      </section>

      {/* Time series */}
      <ChartCard
        title="Engagement over time"
        subtitle="Daily behavior signals across all of your events"
      >
        {hasSignals ? (
          <TimeSeriesChart data={series} series={seriesConfig} />
        ) : (
          <ChartEmpty message="No engagement signals in this range yet. Publish or promote an event to start collecting analytics." />
        )}
      </ChartCard>

      {/* Two-column: Top events (2/3) + Category mix (1/3) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title="Top events"
            subtitle="Ranked by views + RSVPs · click a row to drill in"
          >
            {topEvents.length === 0 ? (
              <ChartEmpty message="You haven't published any events yet." />
            ) : (
              <TopEventsTable rows={topEvents} />
            )}
          </ChartCard>
        </div>
        <div>
          <ChartCard title="Category mix" subtitle="Which categories drive engagement">
            <BarBreakdown
              rows={categoryMix.map((c) => ({
                key: c.slug,
                label: c.name,
                value: c.views,
                color: c.colorHex,
              }))}
              labelKey="label"
              valueKey="value"
              colorKey="color"
            />
          </ChartCard>
        </div>
      </section>
    </div>
  )
}

function TopEventsTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border-light text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="pb-2 font-medium">Event</th>
            <th className="pb-2 pl-4 font-medium">
              <ColHeader color={SERIES_COLORS.views}>Views</ColHeader>
            </th>
            <th className="pb-2 pl-4 font-medium">
              <ColHeader color={SERIES_COLORS.saves}>Saves</ColHeader>
            </th>
            <th className="pb-2 pl-4 font-medium">
              <ColHeader color={SERIES_COLORS.rsvps}>RSVPs</ColHeader>
            </th>
            <th className="pb-2 pl-4 font-medium">
              <ColHeader color={SERIES_COLORS.shares}>Shares</ColHeader>
            </th>
            <th className="pb-2 pl-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.eventId} className="border-b border-border-light last:border-b-0">
              <td className="py-3">
                <Link
                  to={`/organizer/events/${r.eventId}/analytics`}
                  className="flex items-center gap-3"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface">
                    {r.flyerUrl ? (
                      <img
                        src={r.flyerUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{r.title}</div>
                    <div className="text-xs text-text-muted">
                      {new Date(r.startsAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </Link>
              </td>
              <td className="py-3 pl-4 tabular-nums text-ink">{formatCount(r.views)}</td>
              <td className="py-3 pl-4 tabular-nums text-ink">{formatCount(r.saves)}</td>
              <td className="py-3 pl-4 tabular-nums text-ink">{formatCount(r.rsvps)}</td>
              <td className="py-3 pl-4 tabular-nums text-ink">{formatCount(r.shares)}</td>
              <td className="py-3 pl-4 text-right">
                <Link
                  to={`/organizer/events/${r.eventId}/analytics`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Details <ChevronRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ColHeader({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {children}
    </span>
  )
}
