import clsx from 'clsx'
import { differenceInCalendarDays, differenceInMinutes, format, parseISO, subDays, subMonths, subYears } from 'date-fns'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown, Gem, Info, SlidersHorizontal, Star } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { REPORTS } from '@/app/reportCatalog'
import { Button, Modal, PageSkeleton, Select, resolvePreset, usePageLoading, type DateRangeValue } from '@/components/ui'
import { findAddOn, isAddOnOn } from '@/api/addons'
import { money2, round2 } from '@/lib/format'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import { useUiStore } from '@/store/ui'
import { FiltersDrawer } from '../components/FiltersDrawer'
import { Pill } from '../components/Popover'
import { ReportDateRange } from '../components/ReportDateRange'
import { useCtx, type Ctx } from '../engine/context'
import { apptFacts, lineFacts, type ApptFact, type LineFact } from '../engine/facts'
import { applyFilters, avg, bucketRange, bucketsBetween, inRange, pct, sum, timeBucket } from '../engine/helpers'
import type { Filters, Range } from '../engine/types'
import { scheduledMinutes } from '../specs/premium'
import { SPECS } from '../specs'

export const DASHBOARDS = ['performance', 'online-presence', 'loyalty_dashboard']

const LOADED_AT = new Date()
const C = { primary: '#0E6E6A', accent: '#E0A21C', blue: '#3B82D6', lavender: '#9C86DB', coral: '#E8735A', grey: '#9AA9A6', grid: '#DCE4E2', comparison: '#9DBFBC' }
const CHANNEL_COLORS: Record<string, string> = { offline: C.grey, marketplace: C.primary, book_now_link: C.blue, social: C.coral, marketing: C.accent }
const CHANNELS = ['offline', 'marketplace', 'book_now_link', 'social', 'marketing'] as const
const ONLINE = ['marketplace', 'book_now_link', 'social', 'marketing'] as const
const TYPES = ['service', 'service_addon', 'product', 'no_show_fee', 'late_cancellation_fee', 'membership', 'package', 'shipping'] as const

type CompareMode = 'previous_period' | 'previous_year' | 'none'
type Channel = (typeof CHANNELS)[number]

const channelGroup = (channel: string): Channel =>
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

/** "↕ 0%" / "↑ 12%" / "↓ 100%" delta chip. */
function DeltaChip({ value }: { value: number | null }) {
  if (value === null) return null
  const Icon = value === 0 ? ArrowUpDown : value > 0 ? ArrowUp : ArrowDown
  return (
    <span className={clsx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-caption font-semibold', value === 0 ? 'bg-sunken text-muted' : value > 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger')}>
      <Icon size={12} aria-hidden />
      {Math.abs(value).toLocaleString('en-IE', { maximumFractionDigits: 1 })}%
    </span>
  )
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  return (
    <p className="mt-2 flex items-center gap-2 text-small text-muted">
      <DeltaChip value={value} />
      {label}
    </p>
  )
}

function DashCard({ title, value, delta, deltaLabel, report, children, className, hint }: { title: string; value?: ReactNode; delta?: number | null; deltaLabel?: string; report?: string; children?: ReactNode; className?: string; hint?: string }) {
  const { t } = useTranslation()
  return (
    <section className={clsx('card flex flex-col p-6', className)} aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-body-strong text-ink">
          {title}
          {hint && (
            <span title={hint} aria-label={hint}>
              <Info size={14} className="text-subtle" aria-hidden />
            </span>
          )}
        </h2>
        {report && (
          <Link to={`/reports/table/${report}`} className="shrink-0 text-small font-semibold text-primary hover:underline">
            {t('reports.dash.viewReport')}
          </Link>
        )}
      </div>
      {value !== undefined && <p className="mt-2 font-display text-title-1 text-ink tabular">{value}</p>}
      {delta !== undefined && <Delta value={delta} label={deltaLabel ?? t('reports.dash.vsComp')} />}
      {children && <div className="mt-4 flex-1">{children}</div>}
    </section>
  )
}

function Breakdown({ rows }: { rows: { label: string; value: string; color?: string; delta?: number | null }[] }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 text-body">
          <dt className="flex items-center gap-2 text-ink">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden />}
            {r.label}
          </dt>
          <dd className="flex items-center gap-2">
            <span className="tabular font-semibold text-ink">{r.value}</span>
            {r.delta !== undefined && <DeltaChip value={r.delta} />}
          </dd>
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

type Fmt = 'money' | 'int' | 'pct' | 'rating'
const fmtValue = (v: number, f: Fmt) => (f === 'money' ? money2(v) : f === 'pct' ? `${round2(v)}%` : f === 'rating' ? round2(v).toFixed(1) : String(Math.round(v * 100) / 100))
const fmtAxis = (v: number, f: Fmt) => (f === 'money' ? `€${Math.round(v).toLocaleString('en-IE')}` : f === 'pct' ? `${v}%` : String(v))

function TimeChart({ data, series, kind = 'line', format: f = 'int', height = 240, stacked }: { data: Record<string, string | number>[]; series: Series[]; kind?: 'line' | 'bar'; format?: Fmt; height?: number; stacked?: boolean }) {
  const legend = (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  )
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtAxis(v, f)} width={56} allowDecimals={f !== 'int'} />
              <Tooltip formatter={(v: number | string) => fmtValue(Number(v), f)} />
              {series.map((s) => (
                <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={{ r: 2 }} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtAxis(v, f)} width={56} allowDecimals={f !== 'int'} />
              <Tooltip formatter={(v: number | string) => fmtValue(Number(v), f)} cursor={{ fill: 'rgba(14,110,106,0.06)' }} />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} radius={stacked ? undefined : [3, 3, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {legend}
    </div>
  )
}

/** One point per bucket of the range; `fn` gets the facts of that bucket. */
function seriesOver<F extends { date: string }>(range: Range, facts: F[], fn: (fs: F[], key: string) => number, unit = unitFor(range)) {
  const buckets = bucketsBetween(unit as 'day' | 'week' | 'month', range)
  const by = new Map<string, F[]>()
  for (const f of facts) {
    const k = timeBucket(unit as 'day', f.date).k
    const list = by.get(k)
    if (list) list.push(f)
    else by.set(k, [f])
  }
  return buckets.map((b) => ({ key: b.k, label: unit === 'day' ? format(parseISO(b.k), 'MMM d, yyyy') : b.l, value: fn(by.get(b.k) ?? [], b.k) }))
}

/** Current period vs comparison period, aligned by position. */
function compareSeries<F extends { date: string }>(range: Range, cmp: Range | null, cur: F[], prev: F[] | null, fn: (fs: F[], key: string) => number) {
  const unit = unitFor(range)
  const a = seriesOver(range, cur, fn, unit)
  const b = cmp && prev ? seriesOver(cmp, prev, fn, unit) : []
  return a.map((p, i) => ({ label: p.label, current: p.value, ...(cmp ? { comparison: b[i]?.value ?? 0 } : {}) }))
}

// ─── Metrics ───────────────────────────────────────────────────────────────

const valid = (f: ApptFact) => !f.cancelled && !f.noShow
const salesTotal = (ls: LineFact[]) => sum(ls.filter((f) => !f.giftCard), (f) => f.netIncl)
const saleCount = (ls: LineFact[]) => new Set(ls.filter((f) => !f.refund && !f.giftCard).map((f) => f.sale.id)).size

function clientMix(appts: ApptFact[]) {
  const ok = appts.filter(valid)
  const walkIns = ok.filter((f) => !f.appt.clientId).length
  const known = ok.filter((f) => f.appt.clientId)
  const newC = new Set(known.filter((f) => f.isNew).map((f) => f.appt.clientId)).size
  const allC = new Set(known.map((f) => f.appt.clientId)).size
  const returning = Math.max(0, allC - newC)
  return { newC, returning, walkIns, rate: pct(returning, allC + walkIns) }
}

function perfMetrics(ctx: Ctx, range: Range, filters: Filters) {
  const lines = applyFilters(lineFacts(ctx).filter((f) => inRange(f.date, range)), filters)
  const appts = applyFilters(apptFacts(ctx).filter((f) => inRange(f.date, range)), filters)
  const total = salesTotal(lines)
  const byType = Object.fromEntries(TYPES.map((k) => [k, sum(lines.filter((f) => f.item.type === k), (f) => f.netIncl)])) as Record<(typeof TYPES)[number], number>
  const byChannel = Object.fromEntries(CHANNELS.map((c) => [c, sum(lines.filter((f) => !f.giftCard && channelGroup(f.sale.channel) === c), (f) => f.netIncl)])) as Record<Channel, number>
  const ok = appts.filter(valid)
  const scheduled = scheduledMinutes(ctx, range, undefined, filters.location)
  const bookedMin = sum(ok, (f) => f.durationMin)
  const mix = clientMix(appts)
  const status = {
    cancelled: appts.filter((f) => f.cancelled).length,
    completed: appts.filter((f) => f.appt.status === 'completed').length,
    notCompleted: appts.filter((f) => ['booked', 'confirmed', 'arrived', 'started'].includes(f.appt.status)).length,
    noShow: appts.filter((f) => f.noShow).length,
  }
  return { lines, appts, total, byType, byChannel, online: round2(total - byChannel.offline), avgSale: avg(total, saleCount(lines)), apptCount: ok.length, status, scheduled, bookedMin, occupancy: pct(bookedMin, scheduled), ...mix }
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
  const sales = SPECS['sales-summary']
  const filterKeys = slug === 'performance' ? sales.filters : ['location']
  const filterCount = Object.values(filters).reduce((s, v) => s + v.length, 0)
  const minutesAgo = Math.max(1, differenceInMinutes(now(), LOADED_AT) + 1)

  if (loading) return <div className="mx-auto max-w-[1400px] px-8 py-8"><PageSkeleton /></div>

  return (
    <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Button icon={<ArrowLeft size={16} />} className="rounded-full" onClick={() => navigate('/reports/report-group/1?category=all')}>
          {t('reports.page.back')}
        </Button>
        <nav aria-label={t('reports.page.breadcrumb')} className="text-body text-muted">
          <Link to="/reports/report-group/1?category=all" className="hover:text-ink hover:underline">{t('reports.landing.groups.all')}</Link> · <span className="text-ink" aria-current="page">{def?.name ?? slug}</span>
        </nav>
      </div>
      <div className="mb-6">
        <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
          {def?.name ?? slug}
          <button type="button" className="icon-btn h-9 w-9" aria-label={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} title={t(fav ? 'reports.removeFavourite' : 'reports.addFavourite')} aria-pressed={fav} onClick={() => toggleFav(slug)}>
            <Star size={22} className={fav ? 'fill-accent text-accent' : 'text-ink'} aria-hidden />
          </button>
        </h1>
        <p className="mt-1 text-body-lg text-muted">
          {def?.description}
          {slug !== 'loyalty_dashboard' && ` ${t('reports.page.dataFrom', { count: minutesAgo })}`}
        </p>
      </div>
      {slug !== 'loyalty_dashboard' && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <ReportDateRange value={range} onChange={setRange} />
          {slug === 'performance' && (
            <Pill onClick={() => { setDraftCompare(compare); setCompareOpen(true) }} open={compareOpen}>
              {t('reports.dash.compareTo', { range: cmp ? fmtRange(cmp) : t('reports.dash.noComparison') })}
              <ChevronDown size={16} aria-hidden />
            </Pill>
          )}
          <Pill onClick={() => setFiltersOpen(true)} active={filterCount > 0}>
            <SlidersHorizontal size={18} aria-hidden />
            {t('reports.page.filters')}
            {filterCount > 0 && <span className="rounded-full bg-primary px-2 text-caption text-on-primary">{filterCount}</span>}
          </Pill>
          {filterCount > 0 && (
            <Button variant="ghost" onClick={() => setFilters({})}>
              {t('reports.page.clearFilters')}
            </Button>
          )}
        </div>
      )}
      <FiltersDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} ctx={ctx} keys={filterKeys} premiumKeys={slug === 'performance' ? sales.premiumFilters : undefined} locked={!isAddOnOn(findAddOn(ctx.d.addOns, 'insights'))} filters={filters} ranges={{}} onApply={(f) => setFilters(f)} />
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title={t('reports.dash.compareTitle')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setCompareOpen(false)}>{t('reports.dash.cancel')}</Button>
            <Button variant="primary" onClick={() => { setCompare(draftCompare); setCompareOpen(false) }}>
              {t('reports.dash.apply')}
            </Button>
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
  const d = (a: number, b: number | undefined) => (prev ? change(a, b) : null)
  const series: Series[] = [{ key: 'current', name: fmtRange(range), color: C.primary }, ...(cmp ? [{ key: 'comparison', name: t('reports.dash.comparison', { range: fmtRange(cmp) }), color: C.comparison, dashed: true }] : [])]
  const charts = useMemo(() => {
    const unit = unitFor(range)
    const occ = (fs: ApptFact[], key: string) => pct(sum(fs.filter(valid), (f) => f.durationMin), scheduledMinutes(ctx, unit === 'day' ? { from: key, to: key } : (bucketRange(unit, key) ?? { from: key, to: key }), undefined, filters.location))
    return {
      sales: compareSeries(range, cmp, cur.lines, prev?.lines ?? null, salesTotal),
      appts: compareSeries(range, cmp, cur.appts, prev?.appts ?? null, (fs) => fs.filter(valid).length),
      occupancy: compareSeries(range, cmp, cur.appts, prev?.appts ?? null, occ),
      returning: compareSeries(range, cmp, cur.appts, prev?.appts ?? null, (fs) => clientMix(fs).rate),
      channels: seriesOver(range, cur.lines, () => 0).map((b) => {
        const inB = cur.lines.filter((f) => timeBucket(unitFor(range) as 'day', f.date).k === b.key && !f.giftCard)
        return { label: b.label, ...Object.fromEntries(CHANNELS.map((c) => [c, sum(inB.filter((f) => channelGroup(f.sale.channel) === c), (f) => f.netIncl)])) }
      }),
    }
  }, [ctx, range, cmp, cur, prev, filters.location])
  const kpis = [
    { key: 'averageSaleValue', value: money2(cur.avgSale), delta: d(cur.avgSale, prev?.avgSale), report: 'sales-list' },
    { key: 'onlineSales', value: money2(cur.online), delta: d(cur.online, prev?.online), report: 'sales-summary?groupBy=channel' },
    { key: 'appointments', value: String(cur.apptCount), delta: d(cur.apptCount, prev?.apptCount), report: 'appointment-summary' },
    { key: 'occupancyRate', value: `${cur.occupancy}%`, delta: d(cur.occupancy, prev?.occupancy), report: 'working-hours-summary' },
    { key: 'returningClientRate', value: `${cur.rate}%`, delta: d(cur.rate, prev?.rate), report: 'client-summary' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <DashCard title={t('reports.dash.totalSales')} hint={t('reports.dash.hints.totalSales')} value={money2(cur.total)} delta={d(cur.total, prev?.total)} report="sales-summary">
          <Breakdown rows={TYPES.map((k) => ({ label: t(`reports.dash.types.${k}`), value: money2(cur.byType[k]), delta: d(cur.byType[k], prev?.byType[k]) }))} />
        </DashCard>
        <DashCard title={t('reports.dash.totalSalesOverTime')} hint={t('reports.dash.hints.overTime')} className="lg:col-span-2" report="sales-summary">
          <TimeChart data={charts.sales} format="money" height={300} series={series} />
        </DashCard>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <DashCard key={k.key} title={t(`reports.dash.${k.key}`)} hint={t(`reports.dash.hints.${k.key}`)} value={k.value} delta={k.delta} />
        ))}
      </div>
      <DashCard title={t('reports.dash.salesByChannel')} hint={t('reports.dash.hints.salesByChannel')} report="sales-summary?groupBy=channel">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div>
            <p className="font-display text-title-1 text-ink tabular">{money2(cur.total)}</p>
            <Delta value={d(cur.total, prev?.total)} label={t('reports.dash.vsComp')} />
            <div className="mt-5">
              <Breakdown rows={CHANNELS.map((c) => ({ label: t(`reports.dash.channels.${c}`), value: money2(cur.byChannel[c]), color: CHANNEL_COLORS[c], delta: d(cur.byChannel[c], prev?.byChannel[c]) }))} />
            </div>
          </div>
          <TimeChart data={charts.channels} kind="bar" stacked format="money" height={280} series={CHANNELS.map((c) => ({ key: c, name: t(`reports.dash.channels.${c}`), color: CHANNEL_COLORS[c] }))} />
        </div>
      </DashCard>
      <DashCard title={t('reports.dash.appointments')} hint={t('reports.dash.hints.appointments')} report="appointment-summary">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div>
            <p className="font-display text-title-1 text-ink tabular">{cur.apptCount}</p>
            <Delta value={d(cur.apptCount, prev?.apptCount)} label={t('reports.dash.vsComp')} />
            <div className="mt-5">
              <Breakdown rows={(['cancelled', 'completed', 'notCompleted', 'noShow'] as const).map((k) => ({ label: t(`reports.dash.apptStatus.${k}`), value: String(cur.status[k]), delta: d(cur.status[k], prev?.status[k]) }))} />
            </div>
          </div>
          <TimeChart data={charts.appts} height={280} series={series} />
        </div>
      </DashCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <DashCard title={t('reports.dash.occupancyRate')} hint={t('reports.dash.hints.occupancyRate')} report="working-hours-summary">
          <div className="flex items-center gap-3">
            <p className="font-display text-title-1 text-ink tabular">{cur.occupancy}%</p>
            <DeltaChip value={d(cur.occupancy, prev?.occupancy)} />
            {prev && <span className="text-small text-muted">{t('reports.dash.vsComp')}</span>}
          </div>
          <div className="mt-4">
            <TimeChart data={charts.occupancy} format="pct" height={220} series={series} />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <Breakdown rows={[{ label: t('reports.dash.workingHours'), value: hrs(cur.scheduled) }, { label: t('reports.dash.bookedHours'), value: hrs(cur.bookedMin) }, { label: t('reports.dash.unbookedHours'), value: hrs(Math.max(0, cur.scheduled - cur.bookedMin)) }]} />
          </div>
        </DashCard>
        <DashCard title={t('reports.dash.returningClientRate')} hint={t('reports.dash.hints.returningClientRate')} report="client-summary">
          <div className="flex items-center gap-3">
            <p className="font-display text-title-1 text-ink tabular">{cur.rate}%</p>
            <DeltaChip value={d(cur.rate, prev?.rate)} />
            {prev && <span className="text-small text-muted">{t('reports.dash.vsComp')}</span>}
          </div>
          <div className="mt-4">
            <TimeChart data={charts.returning} format="pct" height={220} series={series} />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <Breakdown rows={[{ label: t('reports.dash.newCustomers'), value: String(cur.newC) }, { label: t('reports.dash.returningCustomers'), value: String(cur.returning) }, { label: t('reports.dash.walkIns'), value: String(cur.walkIns) }]} />
          </div>
        </DashCard>
      </div>
    </div>
  )
}

// ─── Online presence (reports.md §3.2) ─────────────────────────────────────

interface ChannelCardDef {
  key: string
  report?: string
  format: Fmt
  kind: 'line' | 'bar'
  /** Value of a set of facts. */
  calc: (as: ApptFact[], ls: LineFact[], rs: { rating: number }[]) => number
  /** Include offline in the list and chart (Clients by channel). */
  withOffline?: boolean
  /** Show the online vs offline delta. */
  vsOffline?: boolean
}

function OnlinePresence({ ctx, range, filters }: { ctx: Ctx; range: Range; filters: Filters }) {
  const { t } = useTranslation()
  const data = useMemo(() => {
    const allAppts = applyFilters(apptFacts(ctx), filters)
    const appts = allAppts.filter((f) => inRange(f.date, range))
    const lines = applyFilters(lineFacts(ctx).filter((f) => inRange(f.date, range) && !f.giftCard), filters)
    const apptById = new Map(ctx.d.appointments.map((a) => [a.id, a]))
    const reviews = (ctx.d.reviews ?? [])
      .filter((r) => inRange(ctx.day(r.at), range))
      .map((r) => ({ date: ctx.day(r.at), rating: r.rating, channel: channelGroup(apptById.get(r.appointmentId ?? '')?.channel ?? 'offline') }))
    const marketplace = allAppts.filter((f) => valid(f) && channelGroup(f.appt.channel) === 'marketplace')
    return { appts, lines, reviews, marketplace }
  }, [ctx, range, filters])
  // Facts split by channel, and by channel and time bucket, computed once per data change.
  const split = useMemo(() => {
    type Bag = { as: ApptFact[]; ls: LineFact[]; rs: typeof data.reviews }
    const empty = (): Bag => ({ as: [], ls: [], rs: [] })
    const unit = unitFor(range) as 'day'
    const keys: (Channel | 'online')[] = [...CHANNELS, 'online']
    const whole = Object.fromEntries(keys.map((k) => [k, empty()])) as Record<Channel | 'online', Bag>
    const buckets = new Map<string, Record<Channel, Bag>>()
    const bucket = (date: string) => {
      const k = timeBucket(unit, date).k
      let b = buckets.get(k)
      if (!b) {
        b = Object.fromEntries(CHANNELS.map((c) => [c, empty()])) as Record<Channel, Bag>
        buckets.set(k, b)
      }
      return b
    }
    const add = (ch: Channel, date: string, put: (bag: Bag) => void) => {
      put(whole[ch])
      if (ch !== 'offline') put(whole.online)
      put(bucket(date)[ch])
    }
    for (const f of data.appts) add(channelGroup(f.appt.channel), f.date, (bag) => bag.as.push(f))
    for (const f of data.lines) add(channelGroup(f.sale.channel), f.date, (bag) => bag.ls.push(f))
    for (const r of data.reviews) add(r.channel, r.date, (bag) => bag.rs.push(r))
    return { whole, buckets, empty }
  }, [data, range])
  const ofChannel = (c: Channel | 'online') => split.whole[c]
  const newClients = (as: ApptFact[]) => new Set(as.filter((f) => valid(f) && f.isNew && f.appt.clientId).map((f) => f.appt.clientId)).size
  const defs: Record<string, ChannelCardDef> = {
    newClients: { key: 'onlineNewClients', report: 'client-summary', format: 'int', kind: 'bar', calc: (as) => newClients(as), vsOffline: true },
    appointments: { key: 'onlineAppointments', report: 'appointment-summary', format: 'int', kind: 'bar', calc: (as) => as.filter(valid).length, vsOffline: true },
    avgSale: { key: 'onlineAvgSale', report: 'sales-summary?groupBy=channel', format: 'money', kind: 'line', calc: (_as, ls) => avg(salesTotal(ls), saleCount(ls)), vsOffline: true },
    returning: { key: 'onlineReturning', report: 'client-summary', format: 'pct', kind: 'line', calc: (as) => clientMix(as).rate, vsOffline: true },
    ratings: { key: 'onlineRatings', format: 'rating', kind: 'line', calc: (_as, _ls, rs) => avg(sum(rs, (r) => r.rating), rs.length), vsOffline: true },
    noShows: { key: 'onlineNoShows', report: 'appointment-cns-ns-summary', format: 'pct', kind: 'line', calc: (as) => pct(as.filter((f) => f.noShow).length, as.length), vsOffline: true },
    cancellations: { key: 'onlineCancellations', report: 'appointment-cns-ns-summary', format: 'pct', kind: 'line', calc: (as) => pct(as.filter((f) => f.cancelled).length, as.length), vsOffline: true },
    clients: { key: 'clientsByChannel', report: 'client-list', format: 'int', kind: 'bar', calc: (as) => new Set(as.filter((f) => valid(f) && f.appt.clientId).map((f) => f.appt.clientId)).size, withOffline: true },
  }
  const headline = (def: ChannelCardDef) => {
    const on = ofChannel('online')
    const off = ofChannel('offline')
    const value = def.withOffline ? def.calc(data.appts, data.lines, data.reviews) : def.calc(on.as, on.ls, on.rs)
    return { value, delta: def.vsOffline ? change(value, def.calc(off.as, off.ls, off.rs)) : undefined }
  }
  const card = (id: string, extraClass?: string) => {
    const def = defs[id]
    const channels = def.withOffline ? CHANNELS : ONLINE
    const h = headline(def)
    const chart = bucketsBetween(unitFor(range) as 'day', range).map((b) => {
      const row: Record<string, string | number> = { label: unitFor(range) === 'day' ? format(parseISO(b.k), 'MMM d, yyyy') : b.l }
      for (const c of channels) {
        const x = split.buckets.get(b.k)?.[c] ?? split.empty()
        row[c] = def.calc(x.as, x.ls, x.rs)
      }
      return row
    })
    return (
      <DashCard key={id} title={t(`reports.dash.${def.key}OverTime`, { defaultValue: t(`reports.dash.${def.key}`) })} hint={t('reports.dash.hints.online')} report={def.report} className={extraClass}>
        <div className="-mt-2 mb-4 flex items-center gap-3">
          <p className="font-display text-title-1 text-ink tabular">{fmtValue(h.value, def.format)}{def.format === 'rating' && ' ★'}</p>
          {h.delta !== undefined && <DeltaChip value={h.delta} />}
          {h.delta !== undefined && <span className="text-small text-muted">{t('reports.dash.vsOffline')}</span>}
        </div>
        <TimeChart data={chart} kind={def.kind} stacked={def.kind === 'bar'} format={def.format} height={220} series={channels.map((c) => ({ key: c, name: t(`reports.dash.channels.${c}`), color: CHANNEL_COLORS[c] }))} />
        <div className="mt-5 border-t border-line pt-4">
          <Breakdown
            rows={channels.map((c) => {
              const x = ofChannel(c)
              const v = def.calc(x.as, x.ls, x.rs)
              return { label: t(`reports.dash.channels.${c}`), value: `${fmtValue(v, def.format)}${def.format === 'rating' ? ' ★' : ''}`, color: CHANNEL_COLORS[c] }
            })}
          />
        </div>
      </DashCard>
    )
  }
  const lifetime = sum(data.marketplace, (f) => f.value)
  let running = sum(data.marketplace.filter((f) => f.date < range.from), (f) => f.value)
  const lifetimeSeries = seriesOver(range, data.marketplace.filter((f) => inRange(f.date, range)), (fs) => {
    running = round2(running + sum(fs, (f) => f.value))
    return running
  }).map((p) => ({ label: p.label, value: p.value }))
  const salesByChannel = Object.fromEntries(CHANNELS.map((c) => [c, salesTotal(ofChannel(c).ls)])) as Record<Channel, number>
  const channelBars = seriesOver(range, data.lines, () => 0).map((b) => {
    const inB = data.lines.filter((f) => timeBucket(unitFor(range) as 'day', f.date).k === b.key)
    return { label: b.label, ...Object.fromEntries(CHANNELS.map((c) => [c, salesTotal(inB.filter((f) => channelGroup(f.sale.channel) === c))])) }
  })
  const kpis = ['appointments', 'avgSale', 'returning', 'ratings', 'noShows'].map((id) => ({ id, def: defs[id], h: headline(defs[id]) }))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="grid gap-4">
          <DashCard title={t('reports.dash.lifetimeMarketplace')} hint={t('reports.dash.hints.lifetime')} value={money2(lifetime)} />
          <DashCard title={t('reports.dash.onlineNewClients')} hint={t('reports.dash.hints.online')} value={headline(defs.newClients).value} delta={headline(defs.newClients).delta ?? null} deltaLabel={t('reports.dash.vsOffline')} />
        </div>
        <DashCard title={t('reports.dash.salesByChannel')} hint={t('reports.dash.hints.salesByChannel')} report="sales-summary?groupBy=channel">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <div>
              <p className="font-display text-title-1 text-ink tabular">{money2(salesTotal(data.lines))}</p>
              <div className="mt-5">
                <Breakdown rows={CHANNELS.map((c) => ({ label: t(`reports.dash.channels.${c}`), value: money2(salesByChannel[c]), color: CHANNEL_COLORS[c] }))} />
              </div>
            </div>
            <TimeChart data={channelBars} kind="bar" stacked format="money" height={240} series={CHANNELS.map((c) => ({ key: c, name: t(`reports.dash.channels.${c}`), color: CHANNEL_COLORS[c] }))} />
          </div>
        </DashCard>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map(({ id, def, h }) => (
          <DashCard key={id} title={t(`reports.dash.${def.key}`)} hint={t('reports.dash.hints.online')} value={`${fmtValue(h.value, def.format)}${def.format === 'rating' ? ' ★' : ''}`} delta={h.delta ?? null} deltaLabel={t('reports.dash.vsOffline')} />
        ))}
      </div>
      <DashCard title={t('reports.dash.lifetimeOverTime')} hint={t('reports.dash.hints.lifetime')} value={money2(lifetime)} report="appointment-list">
        <TimeChart data={lifetimeSeries} format="money" height={240} series={[{ key: 'value', name: t('reports.dash.channels.marketplace'), color: C.primary }]} />
      </DashCard>
      <div className="grid gap-4 lg:grid-cols-2">
        {['clients', 'newClients', 'appointments', 'avgSale', 'returning', 'ratings', 'noShows', 'cancellations'].map((id) => card(id))}
      </div>
    </div>
  )
}

// ─── Loyalty (reports.md §3.3) ─────────────────────────────────────────────

function Loyalty({ ctx }: { ctx: Ctx }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loyaltyOn = isAddOnOn(findAddOn(useDb((s) => s.addOns), 'loyalty'))
  const m = useMemo(() => {
    const referrers = new Set<string>()
    const referred = new Set<string>()
    for (const c of ctx.d.clients ?? []) {
      if (c.referredById) {
        referred.add(c.id)
        referrers.add(c.referredById)
      }
    }
    const engagedIds = new Set([...referrers, ...referred])
    const lines = lineFacts(ctx).filter((f) => !f.giftCard)
    const isLoyal = (f: LineFact) => Boolean(f.sale.clientId && engagedIds.has(f.sale.clientId))
    const loyal = lines.filter(isLoyal)
    // A referral reward is the discounted first sale of a referred client.
    const firstSale = new Map<string, string>()
    for (const f of [...lines].sort((a, b) => a.sale.createdAt.localeCompare(b.sale.createdAt))) if (f.sale.clientId && referred.has(f.sale.clientId) && !firstSale.has(f.sale.clientId)) firstSale.set(f.sale.clientId, f.sale.id)
    const referralLines = lines.filter((f) => f.sale.clientId && firstSale.get(f.sale.clientId) === f.sale.id)
    const referredLines = lines.filter((f) => f.sale.clientId && referred.has(f.sale.clientId))
    const sixMonths = { from: format(subMonths(parseISO(ctx.today), 5), 'yyyy-MM-01'), to: ctx.today }
    const monthly = bucketsBetween('month', sixMonths).map((b) => {
      const inM = lines.filter((f) => f.date.startsWith(b.k))
      return { label: format(parseISO(`${b.k}-01`), 'MMM yyyy'), points: 0, tiers: 0, referral: salesTotal(inM.filter((f) => referralLines.includes(f))), referred: salesTotal(inM.filter((f) => f.sale.clientId && referred.has(f.sale.clientId))) }
    })
    const clients = (ctx.d.clients ?? []).filter((c) => !c.deletedAt)
    const visits = new Map<string, string[]>()
    for (const f of apptFacts(ctx)) if (valid(f) && f.appt.clientId && f.date <= ctx.today) visits.set(f.appt.clientId, [...(visits.get(f.appt.clientId) ?? []), f.date])
    const group = (engaged: boolean) => {
      const ids = new Set(clients.filter((c) => engagedIds.has(c.id) === engaged).map((c) => c.id))
      const ls = lines.filter((f) => f.sale.clientId && ids.has(f.sale.clientId))
      const gaps: number[] = []
      for (const id of ids) {
        const ds = [...new Set(visits.get(id) ?? [])].sort()
        if (ds.length > 1) gaps.push(differenceInCalendarDays(parseISO(ds[ds.length - 1]), parseISO(ds[0])) / (ds.length - 1))
      }
      return { total: ids.size, avgSale: avg(salesTotal(ls), saleCount(ls)), freq: Math.round(avg(sum(gaps, (g) => g), gaps.length)) }
    }
    const totalLoyal = salesTotal(loyal)
    const discount = sum(loyal, (f) => f.itemDisc + f.cartDisc)
    return {
      totalLoyal,
      referralReward: salesTotal(referralLines),
      lifetimeReferred: salesTotal(referredLines),
      monthly,
      share: pct(totalLoyal, salesTotal(lines)),
      engaged: engagedIds.size,
      avgDiscount: pct(discount, sum(loyal, (f) => f.grossIncl)),
      rows: [
        { key: 'engaged', ...group(true) },
        { key: 'nonEngaged', ...group(false) },
      ],
    }
  }, [ctx])
  const LOYALTY_COLORS = { points: C.lavender, tiers: C.blue, referral: C.coral, referred: C.accent }

  return (
    <div className="flex flex-col gap-4">
      {!loyaltyOn && (
        <div className="flex flex-wrap items-center gap-6 rounded-xl bg-gradient-to-r from-primary to-info p-8 text-on-primary">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-small font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-xs bg-surface text-primary">
                <Gem size={14} aria-hidden />
              </span>
              {t('reports.dash.loyaltyBannerTag')}
            </p>
            <p className="mt-2 font-display text-title-1">{t('reports.dash.loyaltyBannerTitle')}</p>
            <p className="mt-1 text-body-lg opacity-90">{t('reports.dash.loyaltyBannerBody')}</p>
            <Button className="mt-6 rounded-full border-0 bg-ink text-canvas hover:bg-ink/90" iconRight={<ArrowRight size={16} aria-hidden />} onClick={() => navigate('/add-ons/add-on/loyalty/intro?return=/reports/table/loyalty_dashboard')}>
              {t('reports.page.learnMore')}
            </Button>
          </div>
          <span className="hidden h-36 w-36 items-center justify-center rounded-[40px] bg-surface/20 md:flex" aria-hidden>
            <Gem size={72} />
          </span>
        </div>
      )}
      <DashCard title={t('reports.dash.totalLoyaltySales')} hint={t('reports.dash.hints.loyalty')} report="sales-summary?groupBy=loyalty">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div>
            <p className="-mt-2 font-display text-title-1 text-ink tabular">{money2(m.totalLoyal)}</p>
            <div className="mt-5">
              <Breakdown
                rows={[
                  { label: t('reports.dash.pointsReward'), value: money2(0), color: LOYALTY_COLORS.points },
                  { label: t('reports.dash.tiersReward'), value: money2(0), color: LOYALTY_COLORS.tiers },
                  { label: t('reports.dash.referralReward'), value: money2(m.referralReward), color: LOYALTY_COLORS.referral },
                  { label: t('reports.dash.lifetimeReferred'), value: money2(m.lifetimeReferred), color: LOYALTY_COLORS.referred },
                ]}
              />
            </div>
          </div>
          <TimeChart
            data={m.monthly}
            kind="bar"
            format="money"
            height={260}
            series={[
              { key: 'points', name: t('reports.dash.pointsReward'), color: LOYALTY_COLORS.points },
              { key: 'tiers', name: t('reports.dash.tiersReward'), color: LOYALTY_COLORS.tiers },
              { key: 'referral', name: t('reports.dash.referralReward'), color: LOYALTY_COLORS.referral },
              { key: 'referred', name: t('reports.dash.lifetimeReferred'), color: LOYALTY_COLORS.referred },
            ]}
          />
        </div>
      </DashCard>
      <div className="grid gap-4 sm:grid-cols-3">
        <DashCard title={t('reports.dash.loyaltyShare')} hint={t('reports.dash.hints.loyalty')} value={`${m.share}%`} />
        <DashCard title={t('reports.dash.engagedClients')} hint={t('reports.dash.hints.loyalty')} value={m.engaged} />
        <DashCard title={t('reports.dash.avgLoyaltyDiscount')} hint={t('reports.dash.hints.loyalty')} value={`${m.avgDiscount}%`} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-line">
              <th className="px-6 py-4 text-body-strong">{t('reports.dash.clientType')}</th>
              <th className="px-6 py-4 text-right text-body-strong">{t('reports.dash.totalClients')}</th>
              <th className="px-6 py-4 text-right text-body-strong">{t('reports.dash.avgSaleValue')}</th>
              <th className="px-6 py-4 text-right text-body-strong">{t('reports.dash.avgBookingFrequency')}</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className="px-6 py-4">{t(`reports.dash.${r.key}`)}</td>
                <td className="px-6 py-4 text-right tabular">{r.total}</td>
                <td className="px-6 py-4 text-right tabular">{money2(r.avgSale)}</td>
                <td className="px-6 py-4 text-right tabular">{t('reports.dash.days', { count: r.freq })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
