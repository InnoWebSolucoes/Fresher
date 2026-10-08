import { Info } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDb } from '@/store/db'
import { Segmented, Skeleton, usePageLoading } from '@/components/ui'
import { money } from '@/lib/format'
import { now, todayISO } from '@/lib/time'
import { CHANNEL_GROUPS, buildInsights, marketplaceValue, periodRanges, type Metrics, type Period } from './insights'
import { Change, useTimeAgo } from './shared'

/** Performance insights drawer (top-bar.md §3), computed live from the store. */
export function PerformanceInsights() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading(400)
  const timeAgo = useTimeAgo()
  const [period, setPeriod] = useState<Period>('today')
  const [openedAt] = useState(() => now().toISOString())
  const [, tick] = useState(0)

  const sales = useDb((s) => s.sales)
  const appointments = useDb((s) => s.appointments)
  const teamMembers = useDb((s) => s.teamMembers)
  const shiftPatterns = useDb((s) => s.shiftPatterns)
  const shiftOverrides = useDb((s) => s.shiftOverrides)
  const closedPeriods = useDb((s) => s.closedPeriods)
  const timeOff = useDb((s) => s.timeOff)
  const clients = useDb((s) => s.clients)

  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const insights = useMemo(
    () => buildInsights({ sales, appointments, teamMembers, shiftPatterns, shiftOverrides, closedPeriods, timeOff }),
    [sales, appointments, teamMembers, shiftPatterns, shiftOverrides, closedPeriods, timeOff],
  )
  const view = useMemo(() => {
    const { current, previous, series } = periodRanges(period, now())
    return { cur: insights.metrics(current), prev: insights.metrics(previous), points: series.map((r) => ({ label: r.label, m: insights.metrics(r) })) }
  }, [insights, period])
  const marketplace = useMemo(() => marketplaceValue({ appointments, clients }, todayISO()), [appointments, clients])

  const { cur, prev, points } = view
  const chart = (pick: (m: Metrics) => number) => points.map((p) => ({ label: p.label, value: pick(p.m) }))

  return (
    <div className="flex h-full flex-col overflow-y-auto" aria-label={t('panels.insights.title')}>
      <div className="px-4 pb-4 pt-6 md:px-6">
        <h2 className="font-display text-title-2 text-ink">{t('panels.insights.title')}</h2>
        <p className="text-small text-muted">{t('panels.insights.updated', { ago: timeAgo(openedAt).toLowerCase() })}</p>
        <Segmented<Period>
          className="mt-4 flex w-full [&>button]:flex-1"
          value={period}
          onChange={setPeriod}
          items={(['yesterday', 'today', 'week', 'month'] as const).map((p) => ({ value: p, label: t(`panels.insights.periods.${p}`) }))}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-4 px-4 md:px-6" aria-busy="true">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-72 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-4 pb-8 md:px-6">
          <div>
            <h3 className="font-display text-title-3 text-ink">{t(`panels.insights.summary.${period}`)}</h3>
            <p className="text-small text-muted">{t(period === 'month' ? 'panels.insights.comparedMonth' : 'panels.insights.comparedWeek')}</p>
          </div>

          <Card>
            <CardHead title={t('panels.insights.totalSales')} info={t('panels.insights.info.totalSales')} onView={() => navigate('/sales/sales-list')} />
            <ValueLine value={money(cur.sales)} change={<Change current={cur.sales} previous={prev.sales} />} />
            <MiniBars data={chart((m) => m.sales)} format={money} />
            <h4 className="mt-4 text-body-strong text-ink">{t('panels.insights.salesByChannel')}</h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {CHANNEL_GROUPS.map((g) => (
                <li key={g} className="flex items-center gap-2 text-small">
                  <span className="text-ink">{t(`panels.insights.channels.${g}`)}</span>
                  <span className="flex-1 border-b border-dotted border-line-strong" aria-hidden />
                  <Change current={cur.byChannel[g]} previous={prev.byChannel[g]} />
                  <span className="w-16 text-right text-ink tabular">{money(cur.byChannel[g])}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Kpi title={t('panels.insights.appointments')} info={t('panels.insights.info.appointments')} value={String(cur.appointments)} change={<Change current={cur.appointments} previous={prev.appointments} />} />
            <Kpi title={t('panels.insights.avgSale')} info={t('panels.insights.info.avgSale')} value={money(cur.avgSale)} change={<Change current={cur.avgSale} previous={prev.avgSale} />} />
            <Kpi title={t('panels.insights.newClients')} info={t('panels.insights.info.newClients')} value={String(cur.newClients)} change={<Change current={cur.newClients} previous={prev.newClients} />} />
            <Kpi title={t('panels.insights.returningClients')} info={t('panels.insights.info.returningClients')} value={String(cur.returningClients)} change={<Change current={cur.returningClients} previous={prev.returningClients} />} />
          </div>

          <SectionHead title={t('panels.insights.team')} onView={() => navigate('/team/scheduled-shifts')} />
          <Card>
            <CardHead title={t('panels.insights.occupancy')} info={t('panels.insights.info.occupancy')} />
            <ValueLine value={`${cur.occupancy}%`} change={<Change current={cur.occupancy} previous={prev.occupancy} />} />
            <MiniBars data={chart((m) => m.occupancy)} format={(v) => `${v}%`} tone="accent" />
          </Card>

          <SectionHead title={t('panels.insights.clients')} onView={() => navigate('/clients/list')} />
          <Card>
            <CardHead title={t('panels.insights.clientsServed')} info={t('panels.insights.info.clientsServed')} />
            <ValueLine value={String(cur.served)} change={<Change current={cur.served} previous={prev.served} />} />
            <MiniBars data={chart((m) => m.served)} format={(v) => String(v)} />
          </Card>
          <Card>
            <h4 className="text-body-strong text-ink">{t('panels.insights.clientsByType')}</h4>
            <ul className="mt-2 flex flex-col gap-1.5">
              {(
                [
                  ['new', cur.newClients, prev.newClients],
                  ['returning', cur.returningClients, prev.returningClients],
                ] as const
              ).map(([k, c, p]) => (
                <li key={k} className="flex items-center gap-2 text-small">
                  <span className="text-ink">{t(`panels.insights.type.${k}`)}</span>
                  <span className="flex-1 border-b border-dotted border-line-strong" aria-hidden />
                  <Change current={c} previous={p} />
                  <span className="w-10 text-right text-ink tabular">{c}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title={t('panels.insights.newBySource')} info={t('panels.insights.info.newBySource')} />
            <ul className="mt-1 flex flex-col gap-1.5">
              {CHANNEL_GROUPS.map((g) => (
                <li key={g} className="flex items-center gap-2 text-small">
                  <span className="text-ink">{t(`panels.insights.channels.${g}`)}</span>
                  <span className="flex-1 border-b border-dotted border-line-strong" aria-hidden />
                  <Change current={cur.newBySource[g]} previous={prev.newBySource[g]} />
                  <span className="w-10 text-right text-ink tabular">{cur.newBySource[g]}</span>
                </li>
              ))}
            </ul>
          </Card>

          <SectionHead title={t('panels.insights.marketplace')} onView={() => navigate('/online-presence/locations')} />
          <p className="-mt-2 text-small text-muted">{t('panels.insights.marketplaceBody')}</p>
          <div className="rounded-lg bg-gradient-to-br from-primary to-primary-active p-5 text-on-primary">
            <p className="text-body-strong">{t('panels.insights.lifetimeValue')}</p>
            <p className="mt-1 font-display text-title-1">{money(marketplace.value)}</p>
            <p className="text-small opacity-90">{t('panels.insights.marketplaceClients', { count: marketplace.clients })}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="card p-4">{children}</section>
}

function CardHead({ title, info, onView }: { title: string; info?: string; onView?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1.5">
      <h4 className="text-body-strong text-ink">{title}</h4>
      {info && (
        <span title={info} aria-label={info} className="text-subtle">
          <Info size={14} aria-hidden />
        </span>
      )}
      {onView && (
        <button type="button" onClick={onView} className="ml-auto text-small font-semibold text-primary hover:underline">
          {t('panels.insights.view')}
        </button>
      )}
    </div>
  )
}

function SectionHead({ title, onView }: { title: string; onView: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 flex items-center justify-between">
      <h3 className="font-display text-title-3 text-ink">{title}</h3>
      <button type="button" onClick={onView} className="text-small font-semibold text-primary hover:underline">
        {t('panels.insights.view')}
      </button>
    </div>
  )
}

function ValueLine({ value, change }: { value: string; change: ReactNode }) {
  return (
    <p className="mt-1 flex items-baseline gap-2">
      <span className="font-display text-title-2 text-ink tabular">{value}</span>
      {change}
    </p>
  )
}

function Kpi({ title, info, value, change }: { title: string; info: string; value: string; change: ReactNode }) {
  return (
    <section className="card p-4">
      <CardHead title={title} info={info} />
      <p className="mt-2 font-display text-title-2 text-ink tabular">{value}</p>
      {change}
    </section>
  )
}

/** Single-series bar chart; the current period is the solid bar. */
function MiniBars({ data, format, tone = 'primary' }: { data: { label: string; value: number }[]; format: (v: number) => string; tone?: 'primary' | 'accent' }) {
  const last = data.length - 1
  // Size the axis to its longest label so values like "€1,400" aren't clipped.
  const max = Math.max(0, ...data.map((d) => d.value))
  const axisWidth = Math.max(28, Math.ceil(format(Math.ceil(max * 1.25)).length * 6.6) + 8)
  return (
    <div className="mt-3 h-40 text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} tick={{ fill: 'currentColor', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} width={axisWidth} tick={{ fill: 'currentColor', fontSize: 11 }} tickFormatter={(v: number) => format(v)} allowDecimals={false} />
          <Tooltip
            cursor={{ className: 'fill-sunken' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-line bg-raised px-3 py-2 text-small shadow-md">
                  <p className="text-muted">{label}</p>
                  <p className="text-body-strong text-ink">{format(Number(payload[0].value))}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((_, i) => (
              <Cell key={i} className={i === last ? (tone === 'accent' ? 'fill-accent' : 'fill-primary') : tone === 'accent' ? 'fill-accent/35' : 'fill-primary/30'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
