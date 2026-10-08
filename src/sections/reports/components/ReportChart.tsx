import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCell } from '../engine/format'
import type { Col, Row } from '../engine/types'

const PRIMARY = '#0E6E6A'
const GRID = '#DCE4E2'

/** "Show chart" (Customize › Charts): one series of the chosen metric across the report rows. */
export function ReportChart({ rows, label, metric, kind }: { rows: Row[]; label: Col; metric: Col; kind: 'bar' | 'line' }) {
  const data = rows
    .filter((r) => !r.kind)
    .slice(0, 40)
    .map((r) => ({ name: formatCell(r.cells[label.key], label.type), value: Number(r.cells[metric.key] ?? 0) }))
  const fmt = (v: number) => formatCell(v, metric.type)
  const axis = (v: number) => (metric.type === 'money' ? `€${Math.round(v).toLocaleString('en-IE')}` : fmt(v))
  return (
    <figure className="mb-4 rounded-lg border border-line bg-surface p-5" aria-label={`${metric.label} · ${label.label}`}>
      <figcaption className="mb-3 text-body-strong text-ink">{metric.label}</figcaption>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={axis} width={64} />
              <Tooltip formatter={(v: number) => [fmt(v), metric.label]} />
              <Line type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={8} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={axis} width={64} />
              <Tooltip formatter={(v: number) => [fmt(v), metric.label]} cursor={{ fill: 'rgba(14,110,106,0.06)' }} />
              <Bar dataKey="value" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={56} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
