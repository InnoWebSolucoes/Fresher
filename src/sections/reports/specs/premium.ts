import { addDays, format, parseISO } from 'date-fns'
import { round2 } from '@/lib/format'
import { workingWindows } from '@/lib/schedule'
import type { Ctx } from '../engine/context'
import { apptFacts, lineFacts, type ApptFact, type LineFact } from '../engine/facts'
import { applyFilters, avg, bucketsBetween, inRange, pct, statement, sum, type Line } from '../engine/helpers'
import { L } from '../engine/labels'
import type { Cell, Col, ColType, Params, Range, Result, Row, Spec } from '../engine/types'

/** Days of a range (capped so "All time" stays fast). */
export function daysOf(range: Range, cap = 400): string[] {
  const out: string[] = []
  let d = parseISO(range.from)
  const end = parseISO(range.to)
  while (d <= end && out.length < cap) {
    out.push(format(d, 'yyyy-MM-dd'))
    d = addDays(d, 1)
  }
  return out
}

/** Scheduled minutes for the bookable team (optionally one member / location) over a range. */
export function scheduledMinutes(ctx: Ctx, range: Range, memberId?: string, locationIds?: string[]): number {
  const members = (ctx.d.teamMembers ?? []).filter((m) => m.bookable && !m.archived && (!memberId || m.id === memberId))
  const locs = locationIds?.length ? locationIds : [undefined]
  let total = 0
  for (const day of daysOf(range, 120)) {
    for (const m of members) {
      for (const loc of locs) {
        for (const [a, b] of workingWindows(ctx.d, m.id, day, loc)) total += b - a
      }
    }
  }
  return total
}

const booked = (f: ApptFact) => !f.cancelled && !f.noShow

export interface PerfValues {
  lines: LineFact[]
  appts: ApptFact[]
}

/** Sales lines and appointments in range with the report filters applied. */
export function perfFacts(ctx: Ctx, p: Pick<Params, 'range' | 'filters'>): PerfValues {
  return {
    lines: applyFilters(lineFacts(ctx).filter((f) => inRange(f.date, p.range)), p.filters),
    appts: applyFilters(apptFacts(ctx).filter((f) => inRange(f.date, p.range)), p.filters),
  }
}

const LINES: Omit<Line, 'label'>[] = [
  { key: 'salesSummary', kind: 'section' },
  { key: 'services', indent: true, to: 'sales-summary' },
  { key: 'serviceAddons', indent: true },
  { key: 'products', indent: true },
  { key: 'packages', indent: true },
  { key: 'memberships', indent: true },
  { key: 'shipping', indent: true },
  { key: 'lateCancellationFees', indent: true },
  { key: 'noShowFees', indent: true },
  { key: 'totalSales', kind: 'bold' },
  { key: 'giftCards', indent: true },
  { key: 'serviceCharges', indent: true },
  { key: 'tips', indent: true },
  { key: 'totalOtherSales', kind: 'bold' },
  { key: 'totalSalesOther', kind: 'bold' },
  { key: 'salesPerformance', kind: 'section' },
  { key: 'servicesSold', indent: true, type: 'int' },
  { key: 'avgServiceValue', indent: true },
  { key: 'serviceAddonsSold', indent: true, type: 'int' },
  { key: 'avgServiceAddonValue', indent: true },
  { key: 'productsSold', indent: true, type: 'int' },
  { key: 'avgProductValue', indent: true },
  { key: 'upsell', kind: 'section' },
  { key: 'totalUpsell', indent: true },
  { key: 'pctUpsell', indent: true, type: 'pct' },
  { key: 'appointments', kind: 'section' },
  { key: 'onlineAppts', indent: true, type: 'int', to: 'appointments-list' },
  { key: 'pctOnlineAppts', indent: true, type: 'pct' },
  { key: 'offlineAppts', indent: true, type: 'int' },
  { key: 'pctOfflineAppts', indent: true, type: 'pct' },
  { key: 'totalAppts', kind: 'bold', type: 'int' },
  { key: 'pctRequested', indent: true, type: 'pct' },
  { key: 'cancelledAppts', indent: true, type: 'int' },
  { key: 'pctCancelledAppts', indent: true, type: 'pct' },
  { key: 'noShowAppts', indent: true, type: 'int' },
  { key: 'pctNoShowAppts', indent: true, type: 'pct' },
  { key: 'appointmentsValue', kind: 'section' },
  { key: 'totalApptsValue', indent: true },
  { key: 'avgServicePerAppt', indent: true, type: 'num' },
  { key: 'avgApptValue', indent: true },
  { key: 'productivity', kind: 'section' },
  { key: 'scheduledHours', indent: true, type: 'hours' },
  { key: 'bookedHours', indent: true, type: 'hours' },
  { key: 'pctOccupancy', indent: true, type: 'pct' },
  { key: 'unbookedHours', indent: true, type: 'hours' },
  { key: 'clients', kind: 'section' },
  { key: 'newClients', indent: true, type: 'int' },
  { key: 'pctNewClients', indent: true, type: 'pct' },
  { key: 'returningClients', indent: true, type: 'int' },
  { key: 'pctReturningClients', indent: true, type: 'pct' },
  { key: 'walkIns', indent: true, type: 'int' },
  { key: 'pctWalkIns', indent: true, type: 'pct' },
  { key: 'totalClients', kind: 'bold', type: 'int' },
  { key: 'clientsReviews', kind: 'section' },
  { key: 'avgRating', indent: true, type: 'num' },
  { key: 'noReviews', indent: true, type: 'int' },
]

function perfSummaryValues(ctx: Ctx, p: Params, bucket: string | null): Record<string, number> {
  const by = p.groupBy === 'location' ? 'location' : 'teamMember'
  const { lines: allLines, appts: allAppts } = perfFacts(ctx, p)
  const lines = bucket ? allLines.filter((f) => f.a[by] === bucket) : allLines
  const appts = bucket ? allAppts.filter((f) => (Array.isArray(f.a[by]) ? (f.a[by] as string[]).includes(bucket) : f.a[by] === bucket)) : allAppts
  const byType = (type: string) => lines.filter((f) => f.item.type === type)
  const net = (type: string) => sum(byType(type), (f) => f.netIncl)
  const qty = (type: string) => sum(byType(type), (f) => f.qty)
  const totalSales = sum(lines.filter((f) => !f.giftCard), (f) => f.netIncl)
  const giftCards = net('gift_card')
  const saleIds = new Set(lines.map((f) => f.sale.id))
  const tips = sum(
    [...saleIds].map((id) => ctx.byId.sale.get(id)!),
    (s) => s.tips.filter((tp) => by !== 'teamMember' || !bucket || tp.teamMemberId === bucket).reduce((x, tp) => x + tp.amount, 0),
  )
  const upsell = sum(lines.filter((f) => f.upsell), (f) => f.netIncl)
  const total = appts.length
  const online = appts.filter((f) => f.online).length
  const valid = appts.filter(booked)
  const requested = appts.filter((f) => f.appt.items.some((i) => i.preferred)).length
  const cancelled = appts.filter((f) => f.cancelled).length
  const noShow = appts.filter((f) => f.noShow).length
  const apptValue = sum(valid, (f) => f.value)
  const services = sum(valid, (f) => f.services)
  const bookedMin = sum(valid, (f) => f.durationMin)
  const locFilter = by === 'location' && bucket ? [bucket] : p.filters.location
  const scheduled = scheduledMinutes(ctx, p.range, by === 'teamMember' && bucket ? bucket : undefined, locFilter)
  const clientIds = new Set(valid.map((f) => f.appt.clientId ?? `walk_${f.appt.id}`))
  const newIds = new Set(valid.filter((f) => f.isNew && f.appt.clientId).map((f) => f.appt.clientId!))
  const walkIns = valid.filter((f) => !f.appt.clientId).length
  const returning = Math.max(0, clientIds.size - newIds.size - walkIns)
  const reviews = (ctx.d.reviews ?? []).filter((r) => inRange(ctx.day(r.at), p.range) && (by !== 'teamMember' || !bucket || r.teamMemberId === bucket))
  return {
    services: net('service'),
    serviceAddons: net('service_addon'),
    products: net('product'),
    packages: net('package'),
    memberships: net('membership'),
    shipping: net('shipping'),
    lateCancellationFees: net('late_cancellation_fee'),
    noShowFees: net('no_show_fee'),
    totalSales,
    giftCards,
    serviceCharges: 0,
    tips,
    totalOtherSales: round2(giftCards + tips),
    totalSalesOther: round2(totalSales + giftCards + tips),
    servicesSold: qty('service'),
    avgServiceValue: avg(net('service'), qty('service')),
    serviceAddonsSold: qty('service_addon'),
    avgServiceAddonValue: avg(net('service_addon'), qty('service_addon')),
    productsSold: qty('product'),
    avgProductValue: avg(net('product'), qty('product')),
    totalUpsell: upsell,
    pctUpsell: pct(upsell, totalSales),
    onlineAppts: online,
    pctOnlineAppts: pct(online, total),
    offlineAppts: total - online,
    pctOfflineAppts: pct(total - online, total),
    totalAppts: total,
    pctRequested: pct(requested, total),
    cancelledAppts: cancelled,
    pctCancelledAppts: pct(cancelled, total),
    noShowAppts: noShow,
    pctNoShowAppts: pct(noShow, total),
    totalApptsValue: apptValue,
    avgServicePerAppt: avg(services, valid.length),
    avgApptValue: avg(apptValue, valid.length),
    scheduledHours: scheduled,
    bookedHours: bookedMin,
    pctOccupancy: pct(bookedMin, scheduled),
    unbookedHours: Math.max(0, scheduled - bookedMin),
    newClients: newIds.size,
    pctNewClients: pct(newIds.size, clientIds.size),
    returningClients: returning,
    pctReturningClients: pct(returning, clientIds.size),
    walkIns,
    pctWalkIns: pct(walkIns, clientIds.size),
    totalClients: clientIds.size,
    avgRating: avg(sum(reviews, (r) => r.rating), reviews.length),
    noReviews: reviews.length,
  }
}

function buckets(ctx: Ctx, p: Params): { key: string; label: string }[] {
  if (p.groupBy === 'location') return (ctx.d.locations ?? []).filter((l) => !p.filters.location?.length || p.filters.location.includes(l.id)).map((l) => ({ key: l.id, label: l.name }))
  return (ctx.d.teamMembers ?? []).filter((m) => m.bookable && !m.archived && (!p.filters.teamMember?.length || p.filters.teamMember.includes(m.id))).map((m) => ({ key: m.id, label: `${m.firstName} ${m.lastName}` }))
}

const performanceSummary: Spec = {
  slug: 'performance-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['location', 'teamMember'],
  advanced: false,
  customize: true,
  build: (ctx, p) => statement(L('ps.salesSummary'), LINES.map((l) => ({ ...l, label: L(`ps.${l.key}`) })), buckets(ctx, p), (b) => perfSummaryValues(ctx, p, b)),
}

export const METRICS = ['totalSales', 'serviceSales', 'productSales', 'appointments', 'onlineAppts', 'newClients'] as const

function metricValue(metric: string, lines: LineFact[], appts: ApptFact[]): number {
  switch (metric) {
    case 'serviceSales':
      return sum(lines.filter((f) => f.item.type === 'service'), (f) => f.netIncl)
    case 'productSales':
      return sum(lines.filter((f) => f.item.type === 'product'), (f) => f.netIncl)
    case 'appointments':
      return appts.filter(booked).length
    case 'onlineAppts':
      return appts.filter((f) => booked(f) && f.online).length
    case 'newClients':
      return new Set(appts.filter((f) => booked(f) && f.isNew && f.appt.clientId).map((f) => f.appt.clientId)).size
    default:
      return sum(lines.filter((f) => !f.giftCard), (f) => f.netIncl)
  }
}

const performanceOverTime: Spec = {
  slug: 'performance-over-time',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['location', 'teamMember'],
  advanced: false,
  customize: true,
  selectors: [
    { key: 'metric', options: [...METRICS], default: 'totalSales' },
    { key: 'unit', options: ['day', 'week', 'month'], default: 'day' },
  ],
  build: (ctx, p): Result => {
    const metric = p.extra.metric ?? 'totalSales'
    const unit = (p.extra.unit ?? 'day') as 'day' | 'week' | 'month'
    const by = p.groupBy === 'location' ? 'location' : 'teamMember'
    const type: ColType = metric === 'totalSales' || metric === 'serviceSales' || metric === 'productSales' ? 'money' : 'int'
    const cols = bucketsBetween(unit, p.range).slice(0, 120)
    const { lines, appts } = perfFacts(ctx, p)
    const unitKey = (date: string) => (unit === 'day' ? date : unit === 'month' ? date.slice(0, 7) : format(addDays(parseISO(date), -((parseISO(date).getDay() + 6) % 7)), 'yyyy-MM-dd'))
    const columns: Col[] = [{ key: 'group', label: L(`dim.${by}`), type: 'text' }, { key: 'total', label: L(`metric.${metric}`), type }, ...cols.map((c) => ({ key: `c_${c.k}`, label: c.l, type }))]
    const has = (v: string | string[] | undefined, id: string) => (Array.isArray(v) ? v.includes(id) : v === id)
    const rowFor = (key: string, label: string, ls: LineFact[], as: ApptFact[]): Row => {
      const cells: Record<string, Cell> = { group: label, total: metricValue(metric, ls, as) }
      for (const c of cols) cells[`c_${c.k}`] = metricValue(metric, ls.filter((f) => unitKey(f.date) === c.k), as.filter((f) => unitKey(f.date) === c.k))
      return { key, cells }
    }
    const rows = buckets(ctx, p).map((b) => rowFor(b.key, b.label, lines.filter((f) => has(f.a[by], b.key)), appts.filter((f) => has(f.a[by], b.key))))
    const totalRow = rowFor('total', L('total'), lines, appts)
    return { columns, rows, total: totalRow.cells }
  },
}

export const PREMIUM_SPECS: Spec[] = [performanceSummary, performanceOverTime]
