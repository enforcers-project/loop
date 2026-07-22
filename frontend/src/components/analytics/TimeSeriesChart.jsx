import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { SERIES_COLORS, formatCount } from './AnalyticsPrimitives'

// Multi-series time-series chart. `series` is an array of { key, label } where
// `key` matches a numeric field on each `data` row and `label` is what shows in
// the legend + tooltip. Colors come from the shared SERIES_COLORS map so
// identity is stable across every chart on the page.
//
// Design choices:
// - 2px lines, 3px dot markers on hover — mark specs from the dataviz skill.
// - Y-axis starts at 0 (never truncate a count axis).
// - Grid is recessive (dashed, border-light), axes are hidden except for tick
//   labels in muted ink.
// - Legend renders our own custom pills so identity is a dot + text token,
//   never the mark's color running behind the label.
export function TimeSeriesChart({ data, series, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border-light)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDay}
          stroke="var(--color-border-light)"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          tickMargin={8}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke="var(--color-border-light)"
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          tickFormatter={formatCount}
          axisLine={false}
          tickLine={false}
          width={40}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-primary)', strokeOpacity: 0.15, strokeWidth: 24 }}
          content={<CustomTooltip series={series} />}
        />
        <Legend content={<CustomLegend series={series} />} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES_COLORS[s.key] ?? 'var(--color-primary)'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function fmtDay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Text tokens on the label, mark color on the dot only. Follows the dataviz
// rule: identity is the dot, values wear the text token, never the series hue.
function CustomTooltip({ active, payload, label, series }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-card border border-border-light bg-white p-3 shadow-card-hover">
      <div className="mb-1 text-xs font-medium text-text-secondary">{fmtDay(label)}</div>
      <ul className="space-y-1">
        {series.map((s) => {
          const row = payload.find((p) => p.dataKey === s.key)
          const value = row?.value ?? 0
          return (
            <li key={s.key} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-2 text-text-secondary">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[s.key] }}
                />
                {s.label}
              </span>
              <span className="font-medium tabular-nums text-ink">{formatCount(value)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CustomLegend({ series }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: SERIES_COLORS[s.key] }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  )
}
