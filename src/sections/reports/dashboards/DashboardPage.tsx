import clsx from 'clsx'
import { differenceInCalendarDays, format, parseISO, subDays, subMonths, subYears } from 'date-fns'
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Award, SlidersHorizontal, Star } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell as PieCell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { REPORTS } from '@/app/reportCatalog'
import { Button, DateRangeButton, Modal, PageSkeleton, Select, resolvePreset, usePageLoading, type DateRangeValue, type PresetKey } from '@/components/ui'
import { findAddOn, isAddOnOn } from '@/api/addons'
import { money2, round2 } from '@/lib/format'
import { useDb } from '@/store/db'
import { useUiStore } from '@/store/ui'
import { FiltersDrawer } from '../components/FiltersDrawer'
import { useCtx, type Ctx } from '../engine/context'
import { apptFacts, lineFacts, type ApptFact, type LineFact } from '../engine/facts'
import { applyFilters, avg, bucketsBetween, inRange, pct, sum, timeBucket } from '../engine/helpers'
import type { Filters, Range } from '../engine/types'
import { scheduledMinutes } from '../specs/premium'

export const DASHBOARDS = ['performance', 'online-presence', 'loyalty_dashboard']

const PRESETS: PresetKey[] = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_week', 'last_month', 'last_3_months', 'last_6_months', 'last_year', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date', 'all_time']
const C = { primary: '#0E6E6A', accent: '#E0A21C', blue: '#3B82D6', lavender: '#9C86DB', coral: '#E8735A', grey: '#9AA9A6', grid: '#DCE4E2' }
const CHANNEL_COLORS: Record<string, string> = { offline: C.primary, marketplace: C.accent, book_now_link: C.blue, social: C.lavender, marketing: C.coral }
const CHANNELS = ['offline', 'marketplace', 'book_now_link', 'social', 'marketing'] as const

type CompareMode = 'previous_period' | 'previous_year' | 'none'

const channelGroup = (channel: string) =>
  channel === 'marketplace' || channel === 'google' ? 'marketplace' : channel === 'book_now_link' || channel === 'store' ? 'book_now_link' : channel === 'facebook' || channel === 'instagram' ? 'social' : channel === 'automations' || channel === 'blast' ? 'marketing' : 'offline'

const fmtRange = (r: Range) => `${format(parseISO(r.from), 'MMM d')} - ${format(parseISO(r.to), 'MMM d, yyyy')}`

function compareRange(r: Range, mode: CompareMode): Range | null {
  if (mode === 'none') return null
  const from = parseISO(r.from)
  const to = parseISO(r.to)
  if (mode === 'previous_year') return { from: format(subYears(from, 1), 'yyyy-MM-dd'), to: format(subYears(to, 1), 'yyyy-MM-dd') }
  const days = differenceInCalendarDays(to, from) + 1
  return { from: format(subDays(from, days), 'yyyy-MM-dd'), to: format(subDays(from, 1), 'yyyy-MM-dd') }
}

const change = (cur: number, prev: number | null | undefined) => (prev === null || prev === undefined ? null : prev === 0 ? (cur === 0 ? 0 : 100) : round2(((cur - prev) / Math.abs(prev)) * 100))

/** Time unit that keeps a chart readable for the range. */
const unitFor = (r: Range) => {
  const days = differenceInCalendarDays(parseISO(r.to), parseISO(r.from)) + 1
  return days <= 62 ? 'day' : days <= 400 ? 'week' : 'month'
}

// ─── Building blocks ───────────────────────────────────────────────────────

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <p className="mt-1 flex items-center gap-1 text-small text-muted">
      <span className={clsx('inline-flex items-center gap-0.5 font-semibold', value === 0 ? 'text-muted' : up ? 'text-success' : 'text-danger')}>
        {value !== 0 && (up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />)}
        {Math.abs(value).toLocaleString('en-IE', { maximumFractionDigits: 1 })}%
      </span>
      {label}
    </p>
  )
}

function DashCard({ title, value, delta, deltaLabel, report, children, className }: { title: string; value?: ReactNode; delta?: number | null; deltaLabel?: string; report?: string; children?: ReactNode; className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <section className={clsx('card flex flex-col p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-body-strong text-ink">{title}</h2>
        {report && (
          <button type="button" className="shrink-0 text-small font-semibold text-primary hover:underline" onClick={() => navigate(`/reports/table/${report}`)}>
            {t('reports.dash.viewReport')}
          </button>
        )}
      </div>
      {value !== undefined && <p className="mt-2 font-display text-title-1 text-ink tabular">{value}</p>}
      {delta !== undefined && <Delta value={delta} label={deltaLabel ?? t('reports.dash.vsComp')} />}
      {children && <div className="mt-4 flex-1">{children}</div>}
    </section>
  )
}

function Breakdown({ rows }: { rows: { label: string; value: string; color?: string }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-2 text-body">
          <dt className="flex items-center gap-2 text-muted">
            {r.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} aria-hidden />}
            {r.label}
          </dt>
          <dd className="tabular text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface Series {
  key: string
  name: string
  color: string
  dashed?: boolean
}

function TimeChart({ data, series, kind = 'line', money, height = 220, stacked }: { data: Record<string, string | number>[]; series: Series[]; kind?: 'line' | 'bar'; money?: boolean; height?: number; stacked?: boolean }) {
  const fmt = (v: number) => (money ? `€${Math.round(v).toLocaleString('en-IE')}` : String(v))
  const tooltip = (v: number | string) => (money ? money2(Number(v)) : String(v))
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={56} />
            <Tooltip formatter={tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} />)}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={56} />
            <Tooltip formatter={tooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} radius={stacked ? undefined : [3, 3, 0, 0]} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function Donut({ data, money }: { data: { name: string; value: number; color: string }[]; money?: boolean }) {
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
            {data.filter((d) => d.value > 0).map((d) => <PieCell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v: number) => (money ? money2(v) : String(v))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/** One point per bucket of the range; `fn` gets the facts of that bucket. */
function seriesOver<F extends { date: string }>(range: Range, facts: F[], fn: (fs: F[]) => number, unit = unitFor(range)) {
  const buckets = bucketsBetween(unit as 'day' | 'week' | 'month', range)
  const by = new Map<string, F[]>()
  for (const f of facts) {
    const k = timeBucket(unit as 'day', f.date).k
    const list = by.get(k)
    if (list) list.push(f)
    else by.set(k, [f])
  }
  return buckets.map((b) => ({ key: b.k, label: unit === 'day' ? format(parseISO(b.k), 'd MMM') : b.l, value: fn(by.get(b.k) ?? []) }))
}

// ─── Metrics ───────────────────────────────────────────────────────────────

const valid = (f: ApptFact) => !f.cancelled && !f.noShow
const salesTotal = (ls: LineFact[]) => sum(ls.filter((f) => !f.giftCard), (f) => f.netIncl)

function perfMetrics(ctx: Ctx, range: Range, filters: Filters) {
  const lines = applyFilters(lineFacts(ctx).filter((f) => inRange(f.date, range)), filters)
  const appts = applyFilters(apptFacts(ctx).filter((f) => inRange(f.date, range)), filters)
  const total = salesTotal(lines)
  const saleCount = new Set(lines.filter((f) => !f.refund && !f.giftCard).map((f) => f.sale.id)).size
  const byType = Object.fromEntries(['service', 'service_addon', 'product', 'no_show_fee', 'late_cancellation_fee', 'membership', 'package', 'shipping'].map((k) => [k, sum(lines.filter((f) => f.item.type === k), (f) => f.netIncl)]))
  const byChannel = Object.fromEntries(CHANNELS.map((c) => [c, sum(lines.filter((f) => !f.giftCard && channelGroup(f.sale.channel) === c), (f) => f.netIncl)]))
  const online = round2(total - byChannel.offline)
  const ok = appts.filter(valid)
  const scheduled = scheduledMinutes(ctx, range, undefined, filters.location)
  const bookedMin = sum(ok, (f) => f.durationMin)
  const walkIns = ok.filter((f) => !f.appt.clientId).length
  const known = ok.filter((f) => f.appt.clientId)
  const newC = new Set(known.filter((f) => f.isNew).map((f) => f.appt.clientId)).size
  const allC = new Set(known.map((f) => f.appt.clientId)).size
  const returning = Math.max(0, allC - newC)
  return {
    lines,
    appts,
    total,
    byType,
    byChannel,
    online,
    avgSale: avg(total, saleCount),
    apptCount: ok.length,
    apptStatus: {
      cancelled: appts.filter((f) => f.cancelled).length,
      completed: appts.filter((f) => f.appt.status === 'completed').length,
      notCompleted: appts.filter((f) => ['booked', 'confirmed', 'arrived', 'started'].includes(f.appt.status)).length,
      noShow: appts.filter((f) => f.noShow).length,
    },
    scheduled,
    bookedMin,
    occupancy: pct(bookedMin, scheduled),
    newC,
    returning,
    walkIns,
    returningRate: pct(returning, allC + walkIns),
  }
}

const hrs = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`

// ─── Page ──────────────────────────────────────────────────────────────────

export function DashboardPage({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const ctx = useCtx()
  const def = REPORTS.find((r) => r.slug === slug)
  const favourites = useUiStore((s) => s.favouriteReports)
  const toggleFav = useUiStore((s) => s.toggleFavouriteReport)
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('last_30_days'))
  const [compare, setCompare] = useState<CompareMode>('previous_period')
  const [compareOpen, setCompareOpen] = useState(false)
  const [draftCompare, setDraftCompare] = useState<CompareMode>('previous_period')
  const [filters, setFilters] = useState<Filters>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const fav = favourites.includes(slug)
  const cmp = compareRange(range, compare)
  const filterKeys = slug === 'performance' ? ['location', 'status', 'channel', 'type', 'loyalty', 'teamMember', 'clientSegments'] : ['location']
  const filterCount = Object.values(filters).reduce((s, v) => s + v.length, 0)

  if (loading) return <div className="mx-auto max-w-[1400px] px-8 py-8"><PageSkeleton /></div>

  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/reports/report-group/6')}>{t('reports.page.back')}</Button>
        <span className="text-body text-muted">{t('reports.groups.6')} · <span className="text-ink">{def?.name ?? slug}</span></span>
      </div>
      <div className="mb-6">
        <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
          {def?.name ?? slug}
          <button type="button" className="icon-btn h-8 w-8" aria-label={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} aria-pressed={fav} onClick={() => toggleFav(slug)}>
            <Star size={20} className={fav ? 'fill-accent text-accent' : 'text-muted'} aria-hidden />
          </button>
        </h1>
        <p className="mt-1 text-body-lg text-muted">{def?.description} {t('reports.page.dataFrom', { count: 15 })}</p>
      </div>
      {slug !== 'loyalty_dashboard' && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <DateRangeButton value={range} onChange={setRange} presets={PRESETS} />
          {slug === 'performance' && (
            <Button className="rounded-full" onClick={() => { setDraftCompare(compare); setCompareOpen(true) }}>
              {t('reports.dash.compareTo', { range: cmp ? fmtRange(cmp) : t('reports.dash.noComparison') })}
            </Button>
          )}
          <Button icon={<SlidersHorizontal size={16} />} className="rounded-full" onClick={() => setFiltersOpen(true)}>
            {t('reports.page.filters')}
            {filterCount > 0 && <span className="ml-1 rounded-full bg-primary px-2 text-caption text-on-primary">{filterCount}</span>}
          </Button>
          {filterCount > 0 && <Button variant="ghost" onClick={() => setFilters({})}>{t('reports.page.clearFilters')}</Button>}
        </div>
      )}
      <FiltersDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} ctx={ctx} keys={filterKeys} locked={false} filters={filters} ranges={{}} onApply={(f) => setFilters(f)} />
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title={t('reports.dash.compareTitle')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setCompareOpen(false)}>{t('reports.dash.cancel')}</Button>
            <Button variant="primary" onClick={() => { setCompare(draftCompare); setCompareOpen(false) }}>{t('reports.dash.apply')}</Button>
          </>
        }
      >
        <Select
          aria-label={t('reports.dash.compareTitle')}
          value={draftCompare}
          onChange={(e) => setDraftCompare(e.target.value as CompareMode)}
          options={[
            { value: 'previous_period', label: t('reports.dash.previousPeriod') },
            { value: 'previous_year', label: t('reports.dash.previousYear') },
            { value: 'none', label: t('reports.dash.noComparison') },
          ]}
        />
        <p className="mt-3 text-body text-muted">{t('reports.dash.compareTo', { range: compareRange(range, draftCompare) ? fmtRange(compareRange(range, draftCompare)!) : t('reports.dash.noComparison') })}</p>
      </Modal>
      {slug === 'performance' && <Performance ctx={ctx} range={range} cmp={cmp} filters={filters} />}
      {slug === 'online-presence' && <OnlinePresence ctx={ctx} range={range} filters={filters} />}
      {slug === 'loyalty_dashboard' && <Loyalty ctx={ctx} />}
    </div>
  )
}

// ─── Performance (reports.md §3.1) ─────────────────────────────────────────

function Performance({ ctx, range, cmp, filters }: { ctx: Ctx; range: Range; cmp: Range | null; filters: Filters }) {
  const { t } = useTranslation()
  const cur = useMemo(() => perfMetrics(ctx, range, filters), [ctx, range, filters])
  const prev = useMemo(() => (cmp ? perfMetrics(ctx, cmp, filters) : null), [ctx, cmp, filters])
  const d = (k: 'total' | 'avgSale' | 'online' | 'apptCount' | 'occupancy' | 'returningRate') => (prev ? change(cur[k], prev[k]) : null)
  const overTime = useMemo(() => {
    const a = seriesOver(range, cur.lines, salesTotal, 'day')
    const b = cmp && prev ? seriesOver(cmp, prev.lines, salesTotal, 'day') : []
    return a.map((p, i) => ({ label: p.label, current: p.value, comparison: b[i]?.value ?? 0 }))
  }, [range, cmp, cur, prev])
  const channelData = CHANNELS.map((c) => ({ name: t(`reports.dash.channels.${c}`), value: cur.byChannel[c], color: CHANNEL_COLORS[c] }))
  const statusData = [{ label: '', ...Object.fromEntries(Object.entries(cur.apptStatus)) }]

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <DashCard title={t('reports.dash.totalSales')} value={money2(cur.total)} delta={d('total')} report="sales-summary">
        <Breakdown rows={Object.entries(cur.byType).map(([k, v]) => ({ label: t(`reports.dash.types.${k}`), value: money2(v) }))} />
      </DashCard>
      <DashCard title={t('reports.dash.totalSalesOverTime')} className="lg:col-span-2" report="sales-summary">
        <TimeChart
          data={overTime}
          money
          height={300}
          series={[{ key: 'current', name: fmtRange(range), color: C.primary }, ...(cmp ? [{ key: 'comparison', name: t('reports.dash.comparison', { range: fmtRange(cmp) }), color: C.grey, dashed: true }] : [])]}
        />
      </DashCard>
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-5">
        <DashCard title={t('reports.dash.averageSaleValue')} value={money2(cur.avgSale)} delta={d('avgSale')} />
        <DashCard title={t('reports.dash.onlineSales')} value={money2(cur.online)} delta={d('online')} />
        <DashCard title={t('reports.dash.appointments')} value={cur.apptCount} delta={d('apptCount')} />
        <DashCard title={t('reports.dash.occupancyRate')} value={`${cur.occupancy}%`} delta={d('occupancy')} />
        <DashCard title={t('reports.dash.returningClientRate')} value={`${cur.returningRate}%`} delta={d('returningRate')} />
      </div>
      <DashCard title={t('reports.dash.salesByChannel')} value={money2(cur.total)} delta={d('total')} report="sales-summary">
        <Donut data={channelData} money />
        <Breakdown rows={channelData.map((c) => ({ label: c.name, value: money2(c.value), color: c.color }))} />
      </DashCard>
      <DashCard title={t('reports.dash.appointments')} value={cur.apptCount} delta={d('apptCount')} report="appointments-summary">
        <TimeChart
          data={statusData}
          kind="bar"
          height={160}
          series={[
            { key: 'cancelled', name: t('reports.dash.apptStatus.cancelled'), color: C.coral },
            { key: 'completed', name: t('reports.dash.apptStatus.completed'), color: C.primary },
            { key: 'notCompleted', name: t('reports.dash.apptStatus.notCompleted'), color: C.blue },
            { key: 'noShow', name: t('reports.dash.apptStatus.noShow'), color: C.accent },
          ]}
        />
        <Breakdown rows={(['cancelled', 'completed', 'notCompleted', 'noShow'] as const).map((k) => ({ label: t(`reports.dash.apptStatus.${k}`), value: String(cur.apptStatus[k]) }))} />
      </DashCard>
      <div className="grid gap-4">
        <DashCard title={t('reports.dash.occupancyRate')} value={`${cur.occupancy}%`} delta={d('occupancy')} report="working-hours-summary">
          <Donut data={[{ name: t('reports.dash.bookedHours'), value: cur.bookedMin, color: C.primary }, { name: t('reports.dash.unbookedHours'), value: Math.max(0, cur.scheduled - cur.bookedMin), color: C.grid }]} />
          <Breakdown rows={[{ label: t('reports.dash.workingHours'), value: hrs(cur.scheduled) }, { label: t('reports.dash.bookedHours'), value: hrs(cur.bookedMin) }, { label: t('reports.dash.unbookedHours'), value: hrs(Math.max(0, cur.scheduled - cur.bookedMin)) }]} />
        </DashCard>
        <DashCard title={t('reports.dash.returningClientRate')} value={`${cur.returningRate}%`} delta={d('returningRate')} report="client-summary">
          <Donut data={[{ name: t('reports.dash.newCustomers'), value: cur.newC, color: C.accent }, { name: t('reports.dash.returningCustomers'), value: cur.returning, color: C.primary }, { name: t('reports.dash.walkIns'), value: cur.walkIns, color: C.grey }]} />
          <Breakdown rows={[{ label: t('reports.dash.newCustomers'), value: String(cur.newC), color: C.accent }, { label: t('reports.dash.returningCustomers'), value: String(cur.returning), color: C.primary }, { label: t('reports.dash.walkIns'), value: String(cur.walkIns), color: C.grey }]} />
        </DashCard>
      </div>
    </div>
  )
}

// ─── Online presence (reports.md §3.2) ─────────────────────────────────────

function OnlinePresence({ ctx, range, filters }: { ctx: Ctx; range: Range; filters: Filters }) {
  const { t } = useTranslation()
  const m = useMemo(() => {
    const allAppts = applyFilters(apptFacts(ctx), filters)
    const appts = allAppts.filter((f) => inRange(f.date, range))
    const lines = applyFilters(lineFacts(ctx).filter((f) => inRange(f.date, range) && !f.giftCard), filters)
    const on = appts.filter((f) => f.online)
    const off = appts.filter((f) => !f.online)
    const marketplace = allAppts.filter((f) => valid(f) && channelGroup(f.appt.channel) === 'marketplace')
    const newOf = (fs: ApptFact[]) => new Set(fs.filter((f) => valid(f) && f.isNew && f.appt.clientId).map((f) => f.appt.clientId)).size
    const retOf = (fs: ApptFact[]) => {
      const known = fs.filter((f) => valid(f) && f.appt.clientId)
      const all = new Set(known.map((f) => f.appt.clientId)).size
      return pct(Math.max(0, all - newOf(fs)), all)
    }
    const avgOf = (ls: LineFact[]) => avg(salesTotal(ls), new Set(ls.map((f) => f.sale.id)).size)
    const onLines = lines.filter((f) => f.sale.channel !== 'offline')
    const offLines = lines.filter((f) => f.sale.channel === 'offline')
    const noShowPct = (fs: ApptFact[]) => pct(fs.filter((f) => f.noShow).length, fs.length)
    const reviews = (ctx.d.reviews ?? []).filter((r) => inRange(ctx.day(r.at), range))
    const clientsByChannel = CHANNELS.map((c) => ({ c, n: new Set(appts.filter((f) => valid(f) && f.appt.clientId && channelGroup(f.appt.channel) === c).map((f) => f.appt.clientId)).size }))
    const salesByChannel = seriesOver(range, lines, () => 0, unitFor(range) === 'day' ? 'week' : unitFor(range)).map((b) => b)
    const unit = unitFor(range) === 'day' ? 'week' : unitFor(range)
    const channelSeries = salesByChannel.map((b) => {
      const inB = lines.filter((f) => timeBucket(unit as 'week', f.date).k === b.key)
      return { label: b.label, ...Object.fromEntries(CHANNELS.map((c) => [c, sum(inB.filter((f) => channelGroup(f.sale.channel) === c), (f) => f.netIncl)])) }
    })
    let running = sum(marketplace.filter((f) => f.date < range.from), (f) => f.value)
    const lifetime = seriesOver(range, marketplace.filter((f) => inRange(f.date, range)), (fs) => {
      running = round2(running + sum(fs, (f) => f.value))
      return running
    })
    return {
      lifetime: sum(marketplace, (f) => f.value),
      lifetimeSeries: lifetime,
      newOn: newOf(on),
      newOff: newOf(off),
      apptsOn: on.filter(valid).length,
      apptsOff: off.filter(valid).length,
      avgOn: avgOf(onLines),
      avgOff: avgOf(offLines),
      retOn: retOf(on),
      retOff: retOf(off),
      rating: avg(sum(reviews, (r) => r.rating), reviews.length),
      reviews: reviews.length,
      noShowOn: noShowPct(on),
      noShowOff: noShowPct(off),
      channelSeries,
      clientsByChannel,
      newSeries: seriesOver(range, on, newOf),
      apptSeries: seriesOver(range, on, (fs) => fs.filter(valid).length),
      avgSeries: seriesOver(range, onLines, avgOf),
    }
  }, [ctx, range, filters])
  const vs = t('reports.dash.vsOffline')
  const one = (data: { label: string; value: number }[], name: string, money?: boolean, kind: 'line' | 'bar' = 'line') => <TimeChart data={data} money={money} kind={kind} height={200} series={[{ key: 'value', name, color: C.primary }]} />

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <DashCard title={t('reports.dash.lifetimeMarketplace')} value={money2(m.lifetime)} />
      <DashCard title={t('reports.dash.onlineNewClients')} value={m.newOn} delta={change(m.newOn, m.newOff)} deltaLabel={vs} report="client-summary" />
      <DashCard title={t('reports.dash.onlineAppointments')} value={m.apptsOn} delta={change(m.apptsOn, m.apptsOff)} deltaLabel={vs} report="appointments-summary" />
      <DashCard title={t('reports.dash.salesByChannel')} className="lg:col-span-2" report="sales-summary">
        <TimeChart data={m.channelSeries} kind="bar" stacked money height={260} series={CHANNELS.map((c) => ({ key: c, name: t(`reports.dash.channels.${c}`), color: CHANNEL_COLORS[c] }))} />
      </DashCard>
      <div className="grid gap-4">
        <DashCard title={t('reports.dash.onlineAvgSale')} value={money2(m.avgOn)} delta={change(m.avgOn, m.avgOff)} deltaLabel={vs} />
        <DashCard title={t('reports.dash.onlineReturning')} value={`${m.retOn}%`} delta={change(m.retOn, m.retOff)} deltaLabel={vs} />
      </div>
      <DashCard title={t('reports.dash.onlineRatings')} value={m.rating ? `${m.rating.toFixed(1)} ★` : '-'}>
        <p className="text-body text-muted">{t('reports.dash.reviews', { count: m.reviews })}</p>
      </DashCard>
      <DashCard title={t('reports.dash.onlineNoShows')} value={`${m.noShowOn}%`} delta={change(m.noShowOn, m.noShowOff)} deltaLabel={vs} />
      <DashCard title={t('reports.dash.clientsByChannel')}>
        <Donut data={m.clientsByChannel.map(({ c, n }) => ({ name: t(`reports.dash.channels.${c}`), value: n, color: CHANNEL_COLORS[c] }))} />
        <Breakdown rows={m.clientsByChannel.map(({ c, n }) => ({ label: t(`reports.dash.channels.${c}`), value: String(n), color: CHANNEL_COLORS[c] }))} />
      </DashCard>
      <DashCard title={t('reports.dash.lifetimeOverTime')} className="lg:col-span-3">{one(m.lifetimeSeries, t('reports.dash.lifetimeMarketplace'), true)}</DashCard>
      <DashCard title={t('reports.dash.onlineNewOverTime')}>{one(m.newSeries, t('reports.dash.onlineNewClients'), false, 'bar')}</DashCard>
      <DashCard title={t('reports.dash.onlineApptsOverTime')}>{one(m.apptSeries, t('reports.dash.onlineAppointments'), false, 'bar')}</DashCard>
      <DashCard title={t('reports.dash.onlineAvgOverTime')}>{one(m.avgSeries, t('reports.dash.onlineAvgSale'), true)}</DashCard>
    </div>
  )
}

// ─── Loyalty (reports.md §3.3) ─────────────────────────────────────────────

function Loyalty({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loyaltyOn = isAddOnOn(findAddOn(useDb((s) => s.addOns), 'loyalty'))
  const m = useMemo(() => {
    const engagedIds = new Set<string>()
    for (const c of ctx.d.clients ?? []) {
      if (c.referredById) {
        engagedIds.add(c.id)
        engagedIds.add(c.referredById)
      }
    }
    const lines = lineFacts(ctx).filter((f) => !f.giftCard)
    const isLoyal = (f: LineFact) => Boolean(f.sale.clientId && engagedIds.has(f.sale.clientId))
    const loyal = lines.filter(isLoyal)
    const referred = lines.filter((f) => (f.a.loyalty as string[] | undefined)?.includes('referred'))
    const sixMonths = { from: format(subMonths(parseISO(ctx.today), 5), 'yyyy-MM-01'), to: ctx.today }
    const monthly = bucketsBetween('month', sixMonths).map((b) => {
      const inM = lines.filter((f) => f.date.startsWith(b.k))
      return { label: format(parseISO(`${b.k}-01`), 'MMM yyyy'), loyalty: salesTotal(inM.filter(isLoyal)), other: salesTotal(inM.filter((f) => !isLoyal(f))) }
    })
    const clients = (ctx.d.clients ?? []).filter((c) => !c.deletedAt)
    const appts = apptFacts(ctx).filter(valid)
    const group = (engaged: boolean) => {
      const ids = new Set(clients.filter((c) => engagedIds.has(c.id) === engaged).map((c) => c.id))
      const ls = lines.filter((f) => f.sale.clientId && ids.has(f.sale.clientId))
      const visits = appts.filter((f) => f.appt.clientId && ids.has(f.appt.clientId)).length
      return { total: ids.size, avgSale: avg(salesTotal(ls), new Set(ls.map((f) => f.sale.id)).size), freq: avg(visits, ids.size) }
    }
    const totalLoyal = salesTotal(loyal)
    return {
      totalLoyal,
      referralReward: sum(loyal.filter((f) => f.itemDisc + f.cartDisc > 0 && Boolean(f.sale.clientId && ctx.byId.client.get(f.sale.clientId)?.referredById)), (f) => f.netIncl),
      lifetimeReferred: salesTotal(referred),
      monthly,
      share: pct(totalLoyal, salesTotal(lines)),
      engaged: engagedIds.size,
      avgDiscount: avg(sum(loyal, (f) => f.itemDisc + f.cartDisc), new Set(loyal.map((f) => f.sale.id)).size),
      rows: [
        { key: 'engaged', ...group(true) },
        { key: 'nonEngaged', ...group(false) },
      ],
    }
  }, [ctx])

  return (
    <div className="flex flex-col gap-4">
      {!loyaltyOn && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-primary-subtle p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-primary"><Award size={24} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold text-primary">{t('reports.dash.loyaltyBannerTag')}</p>
            <p className="text-body-strong text-ink">{t('reports.dash.loyaltyBannerTitle')}</p>
            <p className="text-body text-muted">{t('reports.dash.loyaltyBannerBody')}</p>
          </div>
          <Button variant="primary" onClick={() => navigate('/add-ons/add-on/loyalty/intro')}>{t('reports.page.learnMore')}</Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <DashCard title={t('reports.dash.totalLoyaltySales')} value={money2(m.totalLoyal)} />
        <DashCard title={t('reports.dash.pointsReward')} value={money2(0)} />
        <DashCard title={t('reports.dash.tiersReward')} value={money2(0)} />
        <DashCard title={t('reports.dash.referralReward')} value={money2(m.referralReward)} />
        <DashCard title={t('reports.dash.lifetimeReferred')} value={money2(m.lifetimeReferred)} />
      </div>
      <DashCard title={t('reports.dash.monthlyLoyalty')}>
        <TimeChart data={m.monthly} kind="bar" stacked money height={260} series={[{ key: 'loyalty', name: t('reports.dash.loyaltySales'), color: C.primary }, { key: 'other', name: t('reports.dash.otherSales'), color: C.grid }]} />
      </DashCard>
      <div className="grid gap-4 sm:grid-cols-3">
        <DashCard title={t('reports.dash.loyaltyShare')} value={`${m.share}%`} />
        <DashCard title={t('reports.dash.engagedClients')} value={m.engaged} />
        <DashCard title={t('reports.dash.avgLoyaltyDiscount')} value={money2(m.avgDiscount)} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-3 text-body-strong">{t('reports.dash.clientType')}</th>
              <th className="px-4 py-3 text-right text-body-strong">{t('reports.dash.totalClients')}</th>
              <th className="px-4 py-3 text-right text-body-strong">{t('reports.dash.avgSaleValue')}</th>
              <th className="px-4 py-3 text-right text-body-strong">{t('reports.dash.avgBookingFrequency')}</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{t(`reports.dash.${r.key}`)}</td>
                <td className="px-4 py-3 text-right tabular">{r.total}</td>
                <td className="px-4 py-3 text-right tabular">{money2(r.avgSale)}</td>
                <td className="px-4 py-3 text-right tabular">{r.freq.toLocaleString('en-IE', { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
