// Compact horizontal-bar breakdown for "which surface drove views" /
// "which category converts best". Hand-rolled — a recharts BarChart for a
// short row list is overkill and the labels don't sit nicely at small widths.
import { formatCount } from './AnalyticsPrimitives'

export function BarBreakdown({ rows, valueKey = 'value', labelKey = 'label', colorKey }) {
  const top = Math.max(1, ...rows.map((r) => r[valueKey] ?? 0))
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const value = r[valueKey] ?? 0
        const width = top === 0 ? 0 : (value / top) * 100
        const barColor = colorKey ? r[colorKey] : '#6d5efc'
        return (
          <li key={r.key ?? r[labelKey] ?? i}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium capitalize text-ink">{prettify(r[labelKey])}</span>
              <span className="tabular-nums text-text-secondary">{formatCount(value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, backgroundColor: barColor }}
              />
            </div>
          </li>
        )
      })}
      {rows.length === 0 && (
        <li className="rounded-card border border-dashed border-border-light bg-surface p-4 text-center text-xs text-text-muted">
          No signals yet
        </li>
      )}
    </ul>
  )
}

// Surface labels come in as backend enums ('for_you', 'event_detail'…). Show
// them as human-friendly labels.
function prettify(s) {
  if (typeof s !== 'string') return s ?? ''
  return s.replace(/_/g, ' ')
}
