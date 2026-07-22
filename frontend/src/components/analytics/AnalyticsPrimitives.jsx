// Small building blocks for the organizer analytics screens. Kept in one file
// because each is a lightweight presentational component (~30 LOC) that only
// makes sense in an analytics context — a StatTile / RangePicker / FunnelCard
// isn't reused elsewhere.
import { Fragment } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn, formatCount as baseFormatCount } from '../../lib/utils'

// Categorical palette for time-series. Fixed order — never cycled: Views is
// always primary, Saves accent, RSVPs success, Shares amber. Validated with the
// dataviz palette script (light + dark surfaces): CVD ΔE ≥ 6.2 for the worst
// adjacent pair, so identity is direct-labeled + dot-marked in the legend +
// tooltip, never carried by hue alone.
export const SERIES_COLORS = {
  views: '#6d5efc', // --color-primary
  saves: '#ff2e74', // --color-accent
  rsvps: '#16c784', // --color-success
  shares: '#f59e0b', // amber — 4th slot, distinct from status green
  followers: '#0ea5e9', // sky — used on the org overview only
}

// Wrap the shared formatCount to guard against null/NaN — analytics KPIs can
// arrive undefined during the initial render, and "—" reads cleaner than "0"
// as a "no data yet" indicator.
export function formatCount(n) {
  if (n == null || isNaN(n)) return '—'
  return baseFormatCount(n)
}

// KPI tile — label + big number + optional delta chip. Delta is optional so
// the same component works for "First-time-published, no prior range" states.
export function StatTile({ label, value, delta, hint }) {
  const arrow =
    delta == null ? null : delta > 0 ? (
      <ArrowUp size={12} />
    ) : delta < 0 ? (
      <ArrowDown size={12} />
    ) : (
      <Minus size={12} />
    )
  const tone =
    delta == null
      ? 'text-text-muted bg-surface'
      : delta > 0
        ? 'text-success bg-success/10'
        : delta < 0
          ? 'text-accent bg-accent/10'
          : 'text-text-muted bg-surface'

  return (
    <div className="rounded-card border border-border-light bg-white p-4 shadow-card">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-ink tabular-nums">{formatCount(value)}</span>
        {delta != null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
              tone,
            )}
          >
            {arrow}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-text-muted">{hint}</div>}
    </div>
  )
}

// Pill-button range picker. `value` is one of '7d' | '30d' | '90d' | 'all'.
// Kept purely presentational — the parent owns the state and the query.
const RANGES = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
]

export function RangePicker({ value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Date range"
      className="inline-flex rounded-pill border border-border-light bg-white p-1 shadow-card"
    >
      {RANGES.map((r) => {
        const active = r.key === value
        return (
          <button
            key={r.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.key)}
            className={cn(
              'rounded-pill px-3 py-1 text-sm font-medium transition-colors',
              active ? 'bg-primary text-white' : 'text-text-secondary hover:text-ink',
            )}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}

// A conversion funnel — Views → Saves → Going → Attended (or a subset).
// Horizontal bars are painted at `count/top` width and labeled with both the
// raw count and the % of the top stage. Rate-of-drop between adjacent stages
// sits below the label so an organizer can spot the leakiest step at a glance.
export function FunnelCard({ stages }) {
  const top = Math.max(1, ...stages.map((s) => s.count))
  return (
    <div className="rounded-card border border-border-light bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Conversion funnel</h3>
        <span className="text-xs text-text-muted">
          {stages[0]?.count ?? 0} → {stages[stages.length - 1]?.count ?? 0}
        </span>
      </div>
      <div className="space-y-3">
        {stages.map((s, i) => {
          const pctOfTop = top === 0 ? 0 : Math.round((s.count / top) * 100)
          const prev = i > 0 ? stages[i - 1].count : null
          const dropPct = prev != null && prev > 0 ? Math.round(100 - (s.count / prev) * 100) : null
          return (
            <Fragment key={s.key}>
              <div>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink">{s.label}</span>
                  <span className="tabular-nums text-text-secondary">
                    {formatCount(s.count)}
                    <span className="ml-2 text-xs text-text-muted">{pctOfTop}%</span>
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pctOfTop}%`,
                      backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                    }}
                  />
                </div>
                {i > 0 && dropPct != null && (
                  <div className="mt-1 text-xs text-text-muted">
                    {dropPct > 0
                      ? `↓ ${dropPct}% drop from ${stages[i - 1].label}`
                      : `↑ ${Math.abs(dropPct)}% lift from ${stages[i - 1].label}`}
                  </div>
                )}
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

// Funnel bars fade toward the accent as the user commits harder — a subtle cue
// that "attended" is the goal without cycling categorical hues.
const FUNNEL_COLORS = ['#6d5efc', '#8a7dfd', '#ff5e91', '#ff2e74']

// Card wrapper — a consistent chart-surface container. Every chart lives in
// one so borders/padding/shadows match across the page.
export function ChartCard({ title, subtitle, right, children }) {
  return (
    <div className="rounded-card border border-border-light bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// Empty-state block for a card when the range has zero signals. Better than a
// blank chart — tells the organizer the query worked but there's no data yet.
export function ChartEmpty({ message = 'No activity in this range yet.' }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-card border border-dashed border-border-light bg-surface text-sm text-text-muted">
      {message}
    </div>
  )
}
