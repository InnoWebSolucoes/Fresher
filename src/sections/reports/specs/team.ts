import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { round2 } from '@/lib/format'
import { rawShifts, timeOffOn, workingWindows } from '@/lib/schedule'
import { toClock, toMinutes } from '@/lib/time'
import type { ID, Sale, TeamMember, Timesheet } from '@/types'
import type { Ctx } from '../engine/context'
import { channelLabel, clientAttrs, lineFacts, payFacts, typeLabel, type LineFact } from '../engine/facts'
import { applyFilters, bucketsBetween, listResult, pct, statement, sum, summarize, timeBucket, type Dim, type DimVal, type Line, type Measure } from '../engine/helpers'
import { L } from '../engine/labels'
import type { Params, Range, Spec } from '../engine/types'
import { apptLink, clientLink, inR, saleLink } from './common'

const one = (k: string, l: string, s?: string | number): DimVal => ({ k, l, s })
const activeMembers = (ctx: Ctx) => (ctx.d.teamMembers ?? []).filter((m) => !m.archived)

/** Dates of a range, clamped so "All time" stays fast. */
function daysOf(ctx: Ctx, r: Range, maxFuture = 90): string[] {
  const earliest = (ctx.d.shiftPatterns ?? []).reduce((m, p) => (p.startDate < m ? p.startDate : m), ctx.today)
  const from = r.from < earliest ? earliest : r.from
  const cap = format(addDays(parseISO(ctx.today), maxFuture), 'yyyy-MM-dd')
  const to = r.to > cap ? cap : r.to
  const out: string[] = []
  for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 1)) out.push(format(d, 'yyyy-MM-dd'))
  return out
}

// ─── Timesheets ────────────────────────────────────────────────────────────

const breakMins = (ctx: Ctx, t: Timesheet, paid: boolean) =>
  t.breaks.filter((b) => b.end && (ctx.d.blockedTimeTypes.find((x) => x.id === b.typeId)?.paid ?? false) === paid).reduce((s, b) => s + (toMinutes(b.end!) - toMinutes(b.start)), 0)

function tsFacts(ctx: Ctx, p: Params) {
  return applyFilters(
    (ctx.d.timesheets ?? [])
      .filter((t) => inR(t.date, p.range))
      .map((t) => {
        const windows = workingWindows(ctx.d, t.teamMemberId, t.date)
        const expectedStart = windows[0]?.[0]
        const expectedEnd = windows[windows.length - 1]?.[1]
        const scheduled = windows.reduce((s, w) => s + (w[1] - w[0]), 0)
        const end = t.clockOut ? toMinutes(t.clockOut) : toMinutes(format(parseISO(ctx.nowIso), 'HH:mm'))
        const paidBreaks = breakMins(ctx, t, true)
        const unpaidBreaks = breakMins(ctx, t, false)
        const worked = Math.max(0, end - toMinutes(t.clockIn) - paidBreaks - unpaidBreaks)
        const inDev = expectedStart === undefined ? 0 : toMinutes(t.clockIn) - expectedStart
        const outDev = expectedEnd === undefined || !t.clockOut ? 0 : toMinutes(t.clockOut) - expectedEnd
        return { t, member: ctx.byId.member.get(t.teamMemberId), expectedStart, expectedEnd, scheduled, worked, paidBreaks, unpaidBreaks, paid: worked + paidBreaks, inDev, outDev, a: { teamMember: t.teamMemberId, location: t.locationId, sourceType: 'timesheet', clockInType: 'manual', clockOutType: 'manual', compensation: ['paid', 'unpaid'] } }
      })
      .sort((a, b) => b.t.date.localeCompare(a.t.date) || a.t.teamMemberId.localeCompare(b.t.teamMemberId)),
    p.filters,
  )
}

const deviation = (mins: number) => (Math.abs(mins) <= 5 ? L('onTime') : mins > 0 ? L('minsLate', { count: mins }) : L('minsEarly', { count: -mins }))
const clock = (m: number | undefined) => (m === undefined ? '-' : toClock(m))

const workingHoursActivity: Spec = {
  slug: 'working-hours-activity',
  range: 'month_to_date',
  filters: ['teamMember', 'location', 'sourceType', 'clockInType', 'clockOutType'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      tsFacts(ctx, p),
      [
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.t.teamMemberId) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.t.locationId) },
        { key: 'date', type: 'date', get: (f) => f.t.date },
        { key: 'source', type: 'text', get: () => L('opt.sourceType.timesheet') },
        { key: 'expectedStart', type: 'time', get: (f) => clock(f.expectedStart) },
        { key: 'clockIn', type: 'time', get: (f) => f.t.clockIn },
        { key: 'clockInType', type: 'text', get: () => L('opt.clockType.manual') },
        { key: 'clockInDeviation', type: 'text', get: (f) => deviation(f.inDev) },
        { key: 'expectedEnd', type: 'time', get: (f) => clock(f.expectedEnd) },
        { key: 'clockOut', type: 'time', get: (f) => f.t.clockOut ?? '-' },
        { key: 'clockOutType', type: 'text', get: () => L('opt.clockType.manual') },
        { key: 'clockOutDeviation', type: 'text', get: (f) => (f.t.clockOut ? deviation(f.outDev) : '-') },
        { key: 'scheduled', type: 'hours', get: (f) => f.scheduled },
        { key: 'worked', type: 'hours', get: (f) => f.worked },
        { key: 'paidBreaks', type: 'hours', get: (f) => f.paidBreaks },
        { key: 'unpaidBreaks', type: 'hours', get: (f) => f.unpaidBreaks },
        { key: 'totalPaidHours', type: 'hours', get: (f) => f.paid },
      ],
      (f) => f.t.id,
      { total: true },
    ),
}

const breakActivity: Spec = {
  slug: 'break-activity',
  range: 'month_to_date',
  filters: ['teamMember', 'location', 'sourceType', 'compensation'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const rows = (ctx.d.timesheets ?? [])
      .filter((t) => inR(t.date, p.range))
      .flatMap((t) =>
        t.breaks.map((b) => {
          const type = ctx.d.blockedTimeTypes.find((x) => x.id === b.typeId)
          const expected = (ctx.d.blockedTimes ?? []).find((x) => x.teamMemberId === t.teamMemberId && x.date === t.date && x.typeId === b.typeId)
          return { t, b, type, expected, a: { teamMember: t.teamMemberId, location: t.locationId, sourceType: 'timesheet', compensation: type?.paid ? 'paid' : 'unpaid' } }
        }),
      )
      .sort((a, b) => b.t.date.localeCompare(a.t.date))
    return listResult(
      applyFilters(rows, p.filters),
      [
        { key: 'teamMember', type: 'text', get: (r) => ctx.memberName(r.t.teamMemberId) },
        { key: 'location', type: 'text', get: (r) => ctx.locationName(r.t.locationId) },
        { key: 'date', type: 'date', get: (r) => r.t.date },
        { key: 'source', type: 'text', get: () => L('opt.sourceType.timesheet') },
        { key: 'type', type: 'text', get: (r) => r.type?.name ?? L('break') },
        { key: 'compensation', type: 'text', get: (r) => L(`opt.compensation.${r.a.compensation}`) },
        { key: 'expectedStart', type: 'time', get: (r) => r.expected?.start ?? '-' },
        { key: 'actualStart', type: 'time', get: (r) => r.b.start },
        { key: 'expectedEnd', type: 'time', get: (r) => r.expected?.end ?? '-' },
        { key: 'actualEnd', type: 'time', get: (r) => r.b.end ?? '-' },
        { key: 'expectedDuration', type: 'hours', get: (r) => (r.expected ? toMinutes(r.expected.end) - toMinutes(r.expected.start) : (r.type?.durationMin ?? 0)) },
        { key: 'actualDuration', type: 'hours', get: (r) => (r.b.end ? toMinutes(r.b.end) - toMinutes(r.b.start) : 0) },
      ],
      (r) => r.b.id,
      { total: true },
    )
  },
}

const attendanceSummary: Spec = {
  slug: 'attendance-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['teamMember', 'location'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const tracked = activeMembers(ctx).filter((m) => m.wages.enabled || (ctx.d.timesheets ?? []).some((t) => t.teamMemberId === m.id))
    const days = daysOf(ctx, p.range, 0).filter((d) => d <= ctx.today)
    const facts = applyFilters(
      tracked.flatMap((m) =>
        days
          .map((date) => {
            const windows = workingWindows(ctx.d, m.id, date)
            if (!windows.length) return null
            const loc = rawShifts(ctx.d, m.id, date)[0]?.locationId ?? m.locationIds[0]
            const ts = (ctx.d.timesheets ?? []).find((t) => t.teamMemberId === m.id && t.date === date)
            const inDev = ts ? toMinutes(ts.clockIn) - windows[0][0] : 0
            const outDev = ts?.clockOut ? toMinutes(ts.clockOut) - windows[windows.length - 1][1] : 0
            return { m, date, ts, inDev, outDev, past: date < ctx.today, a: { teamMember: m.id, location: loc } }
          })
          .filter(Boolean),
      ) as { m: TeamMember; date: string; ts?: Timesheet; inDev: number; outDev: number; past: boolean; a: { teamMember: string; location: string } }[],
      p.filters,
    )
    type F = (typeof facts)[number]
    const dims: Record<string, Dim<F>> = {
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'location', get: (f) => one(f.m.id, `${f.m.firstName} ${f.m.lastName}`) },
      location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.a.location, ctx.locationName(f.a.location)) },
    }
    const ins = (fs: F[]) => fs.filter((f) => f.ts)
    const ms: Measure<F>[] = [
      { key: 'scheduledShifts', type: 'int', calc: (fs) => fs.length },
      { key: 'onTimeClockIns', type: 'int', calc: (fs) => ins(fs).filter((f) => Math.abs(f.inDev) <= 5).length },
      { key: 'earlyClockIns', type: 'int', calc: (fs) => ins(fs).filter((f) => f.inDev < -5).length },
      { key: 'lateClockIns', type: 'int', calc: (fs) => ins(fs).filter((f) => f.inDev > 5).length },
      { key: 'onTimeClockOuts', type: 'int', calc: (fs) => ins(fs).filter((f) => f.ts?.clockOut && Math.abs(f.outDev) <= 5).length },
      { key: 'earlyClockOuts', type: 'int', calc: (fs) => ins(fs).filter((f) => f.ts?.clockOut && f.outDev < -5).length },
      { key: 'lateClockOuts', type: 'int', calc: (fs) => ins(fs).filter((f) => f.ts?.clockOut && f.outDev > 5).length },
      { key: 'punctuality', type: 'pct', calc: (fs) => pct(ins(fs).filter((f) => f.inDev <= 5).length, ins(fs).length) },
      { key: 'missedShifts', type: 'int', calc: (fs) => fs.filter((f) => f.past && !f.ts).length },
      { key: 'attendance', type: 'pct', calc: (fs) => pct(ins(fs).length, fs.filter((f) => f.past || f.ts).length) },
    ]
    return summarize(facts, dims[p.groupBy] ?? dims.teamMember, ms)
  },
}

// ─── Wages ─────────────────────────────────────────────────────────────────

function wageFacts(ctx: Ctx, p: Params) {
  return tsFacts(ctx, p)
    .filter((f) => f.member?.wages.enabled)
    .map((f) => {
      const rate = f.member!.wages.hourlyRate
      const overtime = f.member!.wages.overtime ? Math.max(0, f.paid - 8 * 60) : 0
      const regular = f.paid - overtime
      return { ...f, rate, otRate: round2(rate * 1.5), regular, overtime, wages: round2((regular / 60) * rate + (overtime / 60) * rate * 1.5) }
    })
}

type WF = ReturnType<typeof wageFacts>[number]

const WAGE_MEASURES: Measure<WF>[] = [
  { key: 'hoursWorked', type: 'hours', calc: (fs) => fs.reduce((s, f) => s + f.worked, 0) },
  { key: 'paidBreaks', type: 'hours', calc: (fs) => fs.reduce((s, f) => s + f.paidBreaks, 0) },
  { key: 'unpaidBreaks', type: 'hours', calc: (fs) => fs.reduce((s, f) => s + f.unpaidBreaks, 0) },
  { key: 'regularPaidHours', type: 'hours', calc: (fs) => fs.reduce((s, f) => s + f.regular, 0) },
  { key: 'overtimePaidHours', type: 'hours', calc: (fs) => fs.reduce((s, f) => s + f.overtime, 0) },
  { key: 'totalPaidHours', type: 'hours', calc: (fs) => fs.reduce((s, f) => s + f.paid, 0) },
  { key: 'regularRate', type: 'money', calc: (fs) => (new Set(fs.map((f) => f.rate)).size === 1 ? fs[0].rate : 0) },
  { key: 'overtimeRate', type: 'money', calc: (fs) => (new Set(fs.map((f) => f.otRate)).size === 1 ? fs[0].otRate : 0) },
  { key: 'totalWages', type: 'money', calc: (fs) => sum(fs, (f) => f.wages) },
]

const wagesDetail: Spec = {
  slug: 'wages-detail',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'day' }, { key: 'week' }, { key: 'month' }],
  filters: ['teamMember', 'location'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const unit = (['day', 'week', 'month'].includes(p.groupBy) ? p.groupBy : 'day') as 'day' | 'week' | 'month'
    const facts = applyFilters(wageFacts(ctx, p), p.filters)
    const groups = new Map<string, { b: DimVal; f: WF[] }>()
    for (const f of facts) {
      const b = timeBucket(unit, f.t.date)
      const k = `${b.k}|${f.t.teamMemberId}|${f.t.locationId}`
      const g = groups.get(k)
      if (g) g.f.push(f)
      else groups.set(k, { b, f: [f] })
    }
    const list = [...groups.entries()].sort((a, b) => String(b[1].b.s).localeCompare(String(a[1].b.s)))
    const cols = [
      { key: unit, type: 'text' as const, get: (g: (typeof list)[number]) => (unit === 'day' ? g[1].b.k : g[1].b.l) },
      { key: 'teamMember', type: 'text' as const, get: (g: (typeof list)[number]) => ctx.memberName(g[1].f[0].t.teamMemberId) },
      { key: 'location', type: 'text' as const, get: (g: (typeof list)[number]) => ctx.locationName(g[1].f[0].t.locationId) },
      ...WAGE_MEASURES.map((m) => ({ key: m.key, type: m.type, total: m.type === 'hours' || m.key === 'totalWages', get: (g: (typeof list)[number]) => m.calc(g[1].f) })),
    ]
    const res = listResult(list, cols, (g) => g[0], { total: true })
    res.columns[0].label = L(`dim.${unit}`)
    return res
  },
}

const wagesSummary: Spec = {
  slug: 'wages-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['teamMember', 'location'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims: Record<string, Dim<WF>> = {
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'location', get: (f) => one(f.t.teamMemberId, ctx.memberName(f.t.teamMemberId)) },
      location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.t.locationId, ctx.locationName(f.t.locationId)) },
    }
    return summarize(applyFilters(wageFacts(ctx, p), p.filters), dims[p.groupBy] ?? dims.teamMember, WAGE_MEASURES)
  },
}

// ─── Fee deductions ────────────────────────────────────────────────────────

interface FeeFact {
  key: string
  sale: Sale
  date: string
  memberId: ID
  deduction: 'processing' | 'new_client'
  detail: 'in_person' | 'online' | 'new_client'
  fee: number
  portion: number
  amount: number
  a: Record<string, string | string[]>
}

const feeStore = new WeakMap<Ctx, FeeFact[]>()

function feeFacts(ctx: Ctx): FeeFact[] {
  let out = feeStore.get(ctx)
  if (out) return out
  out = []
  for (const sale of ctx.d.sales ?? []) {
    if (sale.kind !== 'sale' || sale.status === 'draft' || sale.status === 'voided') continue
    const memberTotals = new Map<ID, number>()
    for (const i of sale.items) if (i.teamMemberId && ctx.byId.member.get(i.teamMemberId)?.commission.enabled) memberTotals.set(i.teamMemberId, (memberTotals.get(i.teamMemberId) ?? 0) + i.unitPrice * i.quantity)
    const itemsTotal = sale.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
    if (!memberTotals.size || !itemsTotal) continue
    const date = ctx.day(sale.createdAt)
    const pays = ctx.salePayments.get(sale.id) ?? []
    for (const pay of pays) {
      if (pay.status !== 'succeeded' || pay.amount <= 0) continue
      const inPerson = pay.method === 'card_terminal'
      const online = ['online_card', 'self_checkout', 'qr_code', 'manual_card'].includes(pay.method)
      if (!inPerson && !online) continue
      const fee = round2(inPerson ? pay.amount * 0.0109 + 0.1 : pay.amount * 0.0129 + 0.2)
      for (const [memberId, total] of memberTotals) {
        const portion = round2((total / itemsTotal) * 100)
        out.push({ key: `${pay.id}_${memberId}`, sale, date, memberId, deduction: 'processing', detail: inPerson ? 'in_person' : 'online', fee, portion, amount: round2((fee * portion) / 100), a: { teamMember: memberId, location: sale.locationId, deductionType: 'processing', detailedFeeType: inPerson ? 'in_person' : 'online' } })
      }
    }
    const client = sale.clientId ? ctx.byId.client.get(sale.clientId) : undefined
    if (client?.marketplace && sale.channel === 'marketplace' && ctx.firstVisit.get(client.id) === date && sale.appointmentId) {
      const fee = round2(Math.max(6, itemsTotal * 0.2))
      for (const [memberId, total] of memberTotals) {
        const portion = round2((total / itemsTotal) * 100)
        out.push({ key: `${sale.id}_nc_${memberId}`, sale, date, memberId, deduction: 'new_client', detail: 'new_client', fee, portion, amount: round2((fee * portion) / 100), a: { teamMember: memberId, location: sale.locationId, deductionType: 'new_client', detailedFeeType: 'new_client' } })
      }
    }
  }
  feeStore.set(ctx, out)
  return out
}

const feeDeductionActivity: Spec = {
  slug: 'fee-deduction-activity',
  range: 'month_to_date',
  filters: ['teamMember', 'location', 'deductionType', 'detailedFeeType'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      applyFilters(feeFacts(ctx).filter((f) => inR(f.date, p.range)), p.filters).sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt)),
      [
        { key: 'apptRefShort', type: 'text', get: (f) => (f.sale.appointmentId ? (ctx.byId.appointment.get(f.sale.appointmentId)?.ref ?? '-') : '-'), link: (f) => apptLink(f.sale.appointmentId) },
        { key: 'saleNo', type: 'text', get: (f) => String(f.sale.number), link: (f) => saleLink(f.sale.id) },
        { key: 'date', type: 'datetime', get: (f) => f.sale.createdAt },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.memberId) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.sale.locationId) },
        { key: 'deductionType', type: 'text', get: (f) => L(`opt.deductionType.${f.deduction}`) },
        { key: 'detailedFeeType', type: 'text', get: (f) => L(`opt.detailedFeeType.${f.detail}`) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.sale.clientId), link: (f) => clientLink(f.sale.clientId) },
        { key: 'feeAmount', type: 'money', get: (f) => f.fee },
        { key: 'feePortion', type: 'pct', total: false, get: (f) => f.portion },
        { key: 'feeDeduction', type: 'money', get: (f) => f.amount },
      ],
      (f) => f.key,
      { total: true },
    ),
}

const feeDeductionSummary: Spec = {
  slug: 'fee-deduction-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['teamMember', 'location', 'deductionType'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims: Record<string, Dim<FeeFact>> = {
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'location', get: (f) => one(f.memberId, ctx.memberName(f.memberId)) },
      location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.sale.locationId, ctx.locationName(f.sale.locationId)) },
    }
    return summarize(applyFilters(feeFacts(ctx).filter((f) => inR(f.date, p.range)), p.filters), dims[p.groupBy] ?? dims.teamMember, [
      { key: 'paymentProcessingFees', type: 'money', calc: (fs) => sum(fs.filter((f) => f.deduction === 'processing'), (f) => f.amount) },
      { key: 'newClientFees', type: 'money', calc: (fs) => sum(fs.filter((f) => f.deduction === 'new_client'), (f) => f.amount) },
      { key: 'totalFees', type: 'money', calc: (fs) => sum(fs, (f) => f.amount) },
    ])
  },
}

// ─── Commissions ───────────────────────────────────────────────────────────

const commissionRate = (ctx: Ctx, f: LineFact) => {
  const m = f.item.teamMemberId ? ctx.byId.member.get(f.item.teamMemberId) : undefined
  if (!m?.commission.enabled) return 0
  if (f.item.type === 'service' || f.item.type === 'service_addon') return m.commission.serviceRate
  if (f.item.type === 'product') return m.commission.productRate
  return 0
}

function commissionFacts(ctx: Ctx, p: Params) {
  const deductCost = ctx.d.settings.commissions?.deductServiceCost || ctx.d.settings.commissions?.deductProductCost
  return applyFilters(
    lineFacts(ctx)
      .filter((f) => !f.giftCard && inR(f.date, p.range))
      .map((f) => {
        const rate = commissionRate(ctx, f)
        const base = round2(f.net - (deductCost ? f.cost : 0))
        return { ...f, rate, base, commission: round2(base * rate) }
      })
      .filter((f) => f.rate > 0),
    p.filters,
  )
}

type CF = ReturnType<typeof commissionFacts>[number]

const commissionActivity: Spec = {
  slug: 'advanced-commission-activity',
  range: 'month_to_date',
  filters: ['teamMember', 'location', 'type', 'serviceCategory', 'item'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      commissionFacts(ctx, p).sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt)),
      [
        { key: 'saleNo', type: 'text', get: (f) => String(f.sale.number), link: (f) => saleLink(f.sale.id) },
        { key: 'saleDate', type: 'datetime', get: (f) => f.sale.createdAt },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.sale.clientId), link: (f) => clientLink(f.sale.clientId) },
        { key: 'campaign', type: 'text', get: (f) => (f.sale.channel === 'blast' || f.sale.channel === 'automations' ? channelLabel(f.sale.channel) : '-') },
        { key: 'type', type: 'text', get: (f) => typeLabel(f.item.type) },
        { key: 'item', type: 'text', get: (f) => f.item.name },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.item.teamMemberId) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.sale.locationId) },
        { key: 'grossSales', type: 'money', get: (f) => f.gross },
        { key: 'tax', type: 'money', get: (f) => f.tax },
        { key: 'discounts', type: 'money', get: (f) => -round2(f.itemDiscEx + f.cartDiscEx) },
        { key: 'cost', type: 'money', get: (f) => f.cost },
        { key: 'commissionBase', type: 'money', get: (f) => f.base },
        { key: 'commission', type: 'money', get: (f) => f.commission },
        { key: 'pctCommission', type: 'pct', total: false, get: (f) => round2(f.rate * 100) },
      ],
      (f) => `${f.sale.id}_${f.item.id}`,
      { total: true },
    ),
}

const commissionSummary: Spec = {
  slug: 'advanced-commission-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }, { key: 'type' }, { key: 'item' }],
  filters: ['teamMember', 'location', 'type', 'serviceCategory', 'item'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims: Record<string, Dim<CF>> = {
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'item', get: (f) => one(String(f.item.teamMemberId), ctx.memberName(f.item.teamMemberId)) },
      location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.sale.locationId, ctx.locationName(f.sale.locationId)) },
      type: { key: 'type', filterKey: 'type', next: 'item', get: (f) => one(f.item.type, typeLabel(f.item.type)) },
      item: { key: 'item', filterKey: 'item', next: 'teamMember', get: (f) => one(String(f.a.item), f.item.name) },
    }
    const ms: Measure<CF>[] = [
      { key: 'salesQty', type: 'int', calc: (fs) => fs.reduce((s, f) => s + Math.abs(f.qty), 0) },
      { key: 'itemsSolds', type: 'int', calc: (fs) => fs.reduce((s, f) => s + f.qty, 0) },
      { key: 'grossSales', type: 'money', calc: (fs) => sum(fs, (f) => f.gross) },
      { key: 'refunds', type: 'money', calc: (fs) => sum(fs, (f) => f.refunds) },
      { key: 'tax', type: 'money', calc: (fs) => sum(fs, (f) => f.tax) },
      { key: 'discounts', type: 'money', calc: (fs) => -sum(fs, (f) => f.itemDiscEx + f.cartDiscEx) },
      { key: 'costs', type: 'money', calc: (fs) => sum(fs, (f) => f.cost) },
      { key: 'commissionBase', type: 'money', calc: (fs) => sum(fs, (f) => f.base) },
      { key: 'commission', type: 'money', calc: (fs) => sum(fs, (f) => f.commission) },
      { key: 'pctCommission', type: 'pct', calc: (fs) => pct(sum(fs, (f) => f.commission), sum(fs, (f) => f.base)) },
    ]
    return summarize(commissionFacts(ctx, p), dims[p.groupBy] ?? dims.teamMember, ms)
  },
}

// ─── Tips ──────────────────────────────────────────────────────────────────

function tipFacts(ctx: Ctx, p: Params) {
  const out = []
  for (const sale of ctx.d.sales ?? []) {
    if (sale.status === 'draft' || sale.status === 'voided' || !sale.tips.length) continue
    const date = ctx.day(sale.createdAt)
    if (!inR(date, p.range)) continue
    const pays = ctx.salePayments.get(sale.id) ?? []
    const terminal = pays.some((x) => x.method === 'card_terminal')
    const channel = sale.channel !== 'offline' ? 'online' : terminal ? 'terminal' : 'pos'
    for (const tip of sale.tips) {
      out.push({ key: `${sale.id}_${tip.teamMemberId}`, sale, tip, date, refunded: sale.kind === 'refund' ? tip.amount : 0, method: [...new Set(pays.map((x) => x.methodLabel))].join(', ') || '-', a: { ...clientAttrs(ctx, sale.clientId, date), location: sale.locationId, teamMember: tip.teamMemberId, tipChannel: channel } })
    }
  }
  return applyFilters(out, p.filters).sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt))
}

type TF = ReturnType<typeof tipFacts>[number]

const tipsSummary: Spec = {
  slug: 'tips-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }, { key: 'tipChannel' }],
  filters: ['location', 'teamMember', 'tipChannel', 'clientRetention', 'clientGender', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims: Record<string, Dim<TF>> = {
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'location', get: (f) => one(f.tip.teamMemberId, ctx.memberName(f.tip.teamMemberId)) },
      location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.sale.locationId, ctx.locationName(f.sale.locationId)) },
      tipChannel: { key: 'tipChannel', filterKey: 'tipChannel', next: 'teamMember', get: (f) => one(String(f.a.tipChannel), L(`opt.tipChannel.${f.a.tipChannel}`)) },
    }
    return summarize(tipFacts(ctx, p), dims[p.groupBy] ?? dims.teamMember, [
      { key: 'tipsCollected', type: 'money', calc: (fs) => sum(fs.filter((f) => f.sale.kind === 'sale'), (f) => f.tip.amount) },
      { key: 'tipsRefunded', type: 'money', calc: (fs) => -sum(fs, (f) => f.refunded) },
      { key: 'totalTips', type: 'money', calc: (fs) => round2(sum(fs.filter((f) => f.sale.kind === 'sale'), (f) => f.tip.amount) - sum(fs, (f) => f.refunded)) },
      { key: 'noOfTips', type: 'int', hidden: true, calc: (fs) => fs.length },
    ])
  },
}

const tipsDetail: Spec = {
  slug: 'tips-detail',
  range: 'month_to_date',
  filters: ['tipChannel', 'location', 'teamMember', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      tipFacts(ctx, p),
      [
        { key: 'saleNo', type: 'text', get: (f) => String(f.sale.number), link: (f) => saleLink(f.sale.id) },
        { key: 'saleDate', type: 'datetime', get: (f) => f.sale.createdAt },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.tip.teamMemberId) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.sale.clientId), link: (f) => clientLink(f.sale.clientId) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.sale.locationId) },
        { key: 'transactionType', type: 'text', get: (f) => L(`opt.transactionType.${f.sale.kind}`) },
        { key: 'channel', type: 'text', get: (f) => channelLabel(f.sale.channel) },
        { key: 'paymentMethod', type: 'text', get: (f) => f.method },
        { key: 'tipsCollected', type: 'money', get: (f) => f.tip.amount },
      ],
      (f) => f.key,
      { total: true },
    ),
}

// ─── Shifts, working hours, time off ───────────────────────────────────────

function shiftFacts(ctx: Ctx, p: Params) {
  const out = []
  for (const date of daysOf(ctx, p.range)) {
    for (const m of activeMembers(ctx)) {
      for (const s of rawShifts(ctx.d, m.id, date)) out.push({ key: `${m.id}_${date}_${s.start}`, m, s, date, mins: toMinutes(s.end) - toMinutes(s.start), a: { teamMember: m.id, location: s.locationId } })
    }
  }
  return applyFilters(out, p.filters)
}

const scheduledShifts: Spec = {
  slug: 'scheduled-shifts',
  range: 'month_to_date',
  filters: ['teamMember', 'location'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      shiftFacts(ctx, p),
      [
        { key: 'teamMember', type: 'text', get: (f) => `${f.m.firstName} ${f.m.lastName}` },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.s.locationId) },
        { key: 'dayOfTheWeek', type: 'text', get: (f) => format(parseISO(f.date), 'EEEE') },
        { key: 'date', type: 'date', get: (f) => f.date },
        { key: 'expectedStart', type: 'time', get: (f) => f.s.start },
        { key: 'expectedEnd', type: 'time', get: (f) => f.s.end },
        { key: 'duration', type: 'hours', get: (f) => f.mins },
      ],
      (f) => f.key,
      { total: true },
    ),
}

const overlap = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))

function workloadFacts(ctx: Ctx, p: Params) {
  const out = []
  const appts = new Map<string, number>()
  for (const a of ctx.d.appointments ?? []) {
    if (a.status === 'cancelled' || !inR(a.date, p.range)) continue
    for (const i of a.items) appts.set(`${i.teamMemberId}|${a.date}`, (appts.get(`${i.teamMemberId}|${a.date}`) ?? 0) + i.durationMin)
  }
  for (const date of daysOf(ctx, p.range)) {
    for (const m of activeMembers(ctx).filter((x) => x.bookable)) {
      const shifts = rawShifts(ctx.d, m.id, date)
      if (!shifts.length) continue
      const windows = shifts.map((s): [number, number] => [toMinutes(s.start), toMinutes(s.end)])
      const scheduled = windows.reduce((s, w) => s + w[1] - w[0], 0)
      const off = timeOffOn(ctx.d.timeOff, m.id, date).reduce((s, t) => s + windows.reduce((x, w) => x + overlap(w, [toMinutes(t.startTime), toMinutes(t.endTime)]), 0), 0)
      const blocked = (ctx.d.blockedTimes ?? []).filter((b) => b.teamMemberId === m.id && b.date === date).reduce((s, b) => s + windows.reduce((x, w) => x + overlap(w, [toMinutes(b.start), toMinutes(b.end)]), 0), 0)
      const available = Math.max(0, scheduled - off - blocked)
      const booked = Math.min(available, appts.get(`${m.id}|${date}`) ?? 0)
      out.push({ m, date, scheduled, off, blocked, available, booked, loc: shifts[0].locationId, a: { teamMember: m.id, location: shifts[0].locationId } })
    }
  }
  return applyFilters(out, p.filters)
}

type WL = ReturnType<typeof workloadFacts>[number]

/** Scheduled vs booked hours, shared with the Performance dashboard. */
export function workload(ctx: Ctx, p: Params): { scheduled: number; available: number; booked: number; byDay: Map<string, { available: number; booked: number }> } {
  const facts = workloadFacts(ctx, p)
  const byDay = new Map<string, { available: number; booked: number }>()
  for (const f of facts) {
    const d = byDay.get(f.date) ?? { available: 0, booked: 0 }
    d.available += f.available
    d.booked += f.booked
    byDay.set(f.date, d)
  }
  return { scheduled: facts.reduce((s, f) => s + f.scheduled, 0), available: facts.reduce((s, f) => s + f.available, 0), booked: facts.reduce((s, f) => s + f.booked, 0), byDay }
}

const workingHoursSummary: Spec = {
  slug: 'working-hours-summary',
  range: 'last_30_days',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['location', 'teamMember'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims: Record<string, Dim<WL>> = {
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'location', get: (f) => one(f.m.id, `${f.m.firstName} ${f.m.lastName}`) },
      location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.loc, ctx.locationName(f.loc)) },
    }
    const s = (k: keyof Pick<WL, 'scheduled' | 'off' | 'blocked' | 'available' | 'booked'>) => (fs: WL[]) => fs.reduce((x, f) => x + f[k], 0)
    return summarize(workloadFacts(ctx, p), dims[p.groupBy] ?? dims.teamMember, [
      { key: 'scheduled', type: 'hours', calc: s('scheduled') },
      { key: 'timeOff', type: 'hours', calc: s('off') },
      { key: 'blocked', type: 'hours', calc: s('blocked') },
      { key: 'available', type: 'hours', calc: s('available') },
      { key: 'booked', type: 'hours', calc: s('booked') },
      { key: 'unbooked', type: 'hours', calc: (fs) => s('available')(fs) - s('booked')(fs) },
      { key: 'pctOccupancy', type: 'pct', calc: (fs) => pct(s('booked')(fs), s('available')(fs)) },
    ])
  },
}

const teamTimeOff: Spec = {
  slug: 'team-time-off-report',
  range: 'last_30_days',
  filters: ['location', 'teamMember', 'timeOffStatus'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = (ctx.d.timeOff ?? [])
      .filter((t) => t.startDate <= p.range.to && (t.repeatUntil ?? t.startDate) >= p.range.from)
      .map((t) => {
        const m = ctx.byId.member.get(t.teamMemberId)
        const days = differenceInCalendarDays(parseISO(t.repeatUntil ?? t.startDate), parseISO(t.startDate)) + 1
        return { t, m, hours: round2((days * (toMinutes(t.endTime) - toMinutes(t.startTime))) / 60), a: { location: m?.locationIds ?? [], teamMember: t.teamMemberId, timeOffStatus: t.approved ? 'approved' : 'pending' } }
      })
      .sort((a, b) => b.t.startDate.localeCompare(a.t.startDate))
    return listResult(
      applyFilters(facts, p.filters),
      [
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.t.teamMemberId) },
        { key: 'startDate', type: 'date', get: (f) => f.t.startDate },
        { key: 'endDate', type: 'date', get: (f) => f.t.repeatUntil ?? f.t.startDate },
        { key: 'startTime', type: 'time', get: (f) => f.t.startTime },
        { key: 'endTime', type: 'time', get: (f) => f.t.endTime },
        { key: 'durationHrs', type: 'num', total: true, get: (f) => f.hours },
        { key: 'type', type: 'text', get: (f) => ctx.d.settings.timeOffTypes.find((x) => x.id === f.t.typeId)?.name ?? '-' },
        { key: 'status', type: 'text', get: (f) => L(`opt.timeOffStatus.${f.a.timeOffStatus}`) },
        { key: 'description', type: 'text', hidden: true, get: (f) => f.t.description || '-' },
      ],
      (f) => f.t.id,
    )
  },
}

// ─── Pay summary (statement) ───────────────────────────────────────────────

const PAY_LINES: Line[] = [
  { key: 'earnings', kind: 'section' },
  { key: 'wages', indent: true, to: 'wages-summary' },
  { key: 'commissions', indent: true, to: 'advanced-commission-summary' },
  { key: 'tips', indent: true, to: 'tips-summary' },
  { key: 'earningAdjustments', indent: true },
  { key: 'other', indent: true },
  { key: 'paymentProcessingFeeDeductions', indent: true, to: 'fee-deduction-summary' },
  { key: 'newClientFeeDeductions', indent: true, to: 'fee-deduction-summary' },
  { key: 'otherAdditions', indent: true },
  { key: 'otherDeductions', indent: true },
  { key: 'totalCompensation', kind: 'bold' },
  { key: 'payments', kind: 'section' },
  { key: 'walletPayment', indent: true },
  { key: 'bankTransfer', indent: true },
  { key: 'offlinePayment', indent: true },
  { key: 'offlineRequest', indent: true },
  { key: 'hourlyPay', kind: 'section' },
  { key: 'hourlyRate', indent: true },
  { key: 'regularPaidHours', indent: true, type: 'hours' },
  { key: 'overtimePay', indent: true },
  { key: 'overtimeRate', indent: true },
  { key: 'overtimePaidHours', indent: true, type: 'hours' },
  { key: 'totalPaidHoursWorked', indent: true, type: 'hours' },
  { key: 'totalWages', kind: 'bold' },
  { key: 'servicesCommissions', kind: 'section' },
  { key: 'sales', indent: true },
  { key: 'refunds', indent: true },
  { key: 'costs', indent: true },
  { key: 'discounts', indent: true },
  { key: 'commissionBase', indent: true },
  { key: 'pctCommission', indent: true, type: 'pct' },
  { key: 'serviceAddonsCommissions' },
  { key: 'productCommissions' },
  { key: 'membershipCommissions' },
  { key: 'packageCommissions' },
  { key: 'giftCardCommissions' },
  { key: 'cancellationCommissions' },
  { key: 'totalCommissions', kind: 'bold' },
  { key: 'tipsSection', kind: 'section' },
  { key: 'saleCheckout', indent: true },
  { key: 'payByApp', indent: true },
  { key: 'onlineTips', indent: true },
  { key: 'terminal', indent: true },
  { key: 'totalTips', kind: 'bold' },
  { key: 'totalEarningAdjustments', kind: 'bold' },
  { key: 'totalOther', kind: 'bold' },
]

function payValues(ctx: Ctx, p: Params, scope: { member?: ID; location?: ID }): Record<string, number> {
  const f = { ...p.filters, ...(scope.member ? { teamMember: [scope.member] } : {}), ...(scope.location ? { location: [scope.location] } : {}) }
  const sub = { ...p, filters: f }
  const wages = applyFilters(wageFacts(ctx, p), f)
  const comm = commissionFacts(ctx, sub)
  const svc = comm.filter((x) => x.item.type === 'service')
  const tips = tipFacts(ctx, sub)
  const fees = applyFilters(feeFacts(ctx).filter((x) => inR(x.date, p.range)), f)
  const adj = (ctx.d.payAdjustments ?? []).filter((a) => inR(ctx.day(a.at), p.range) && (!scope.member || a.teamMemberId === scope.member))
  const adjOf = (k: string) => sum(adj.filter((a) => a.kind === k), (a) => a.amount)
  const totalWages = sum(wages, (w) => w.wages)
  const totalCommissions = sum(comm, (c) => c.commission)
  const totalTips = round2(sum(tips.filter((t) => t.sale.kind === 'sale'), (t) => t.tip.amount) - sum(tips, (t) => t.refunded))
  const procFees = -sum(fees.filter((x) => x.deduction === 'processing'), (x) => x.amount)
  const ncFees = -sum(fees.filter((x) => x.deduction === 'new_client'), (x) => x.amount)
  const adjustments = round2(adjOf('wages') + adjOf('commissions') + adjOf('tips'))
  const other = adjOf('other')
  const runs = (ctx.d.payRuns ?? []).filter((r) => r.status === 'completed' && inR(r.periodEnd, p.range))
  const paidBy = (method: string) => sum(runs.filter((r) => r.method === method), (r) => r.lines.filter((l) => !scope.member || l.teamMemberId === scope.member).reduce((s, l) => s + l.paid, 0))
  const member = scope.member ? ctx.byId.member.get(scope.member) : undefined
  return {
    wages: totalWages,
    commissions: totalCommissions,
    tips: totalTips,
    earningAdjustments: adjustments,
    other,
    paymentProcessingFeeDeductions: procFees,
    newClientFeeDeductions: ncFees,
    otherAdditions: 0,
    otherDeductions: 0,
    totalCompensation: round2(totalWages + totalCommissions + totalTips + adjustments + other + procFees + ncFees),
    walletPayment: paidBy('wallet'),
    bankTransfer: 0,
    offlinePayment: round2(paidBy('manual') + paidBy('cash_register')),
    offlineRequest: 0,
    hourlyRate: member?.wages.enabled ? member.wages.hourlyRate : 0,
    regularPaidHours: wages.reduce((s, w) => s + w.regular, 0),
    overtimePay: sum(wages, (w) => (w.overtime / 60) * w.otRate),
    overtimeRate: member?.wages.overtime ? round2(member.wages.hourlyRate * 1.5) : 0,
    overtimePaidHours: wages.reduce((s, w) => s + w.overtime, 0),
    totalPaidHoursWorked: wages.reduce((s, w) => s + w.paid, 0),
    totalWages,
    sales: sum(svc, (c) => c.gross),
    refunds: sum(svc, (c) => c.refunds),
    costs: sum(svc, (c) => c.cost),
    discounts: -sum(svc, (c) => c.itemDiscEx + c.cartDiscEx),
    commissionBase: sum(svc, (c) => c.base),
    pctCommission: pct(sum(svc, (c) => c.commission), sum(svc, (c) => c.base)),
    serviceAddonsCommissions: sum(comm.filter((c) => c.item.type === 'service_addon'), (c) => c.commission),
    productCommissions: sum(comm.filter((c) => c.item.type === 'product'), (c) => c.commission),
    membershipCommissions: 0,
    packageCommissions: 0,
    giftCardCommissions: 0,
    cancellationCommissions: 0,
    totalCommissions,
    saleCheckout: sum(tips.filter((t) => t.a.tipChannel === 'pos'), (t) => t.tip.amount),
    payByApp: 0,
    onlineTips: sum(tips.filter((t) => t.a.tipChannel === 'online'), (t) => t.tip.amount),
    terminal: sum(tips.filter((t) => t.a.tipChannel === 'terminal'), (t) => t.tip.amount),
    totalTips,
    totalEarningAdjustments: adjustments,
    totalOther: other,
  }
}

const paySummary: Spec = {
  slug: 'pay-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'teamMember' }, { key: 'location' }],
  filters: ['teamMember', 'location'],
  advanced: false,
  customize: false,
  build: (ctx, p) => {
    const byLocation = p.groupBy === 'location'
    const buckets = byLocation
      ? ctx.d.locations.filter((l) => !p.filters.location?.length || p.filters.location.includes(l.id)).map((l) => ({ key: l.id, label: l.name }))
      : activeMembers(ctx)
          .filter((m) => !p.filters.teamMember?.length || p.filters.teamMember.includes(m.id))
          .map((m) => ({ key: m.id, label: `${m.firstName} ${m.lastName}` }))
    const res = statement(L('line.overview'), PAY_LINES, buckets, (b) => payValues(ctx, p, b ? (byLocation ? { location: b } : { member: b }) : {}))
    // Rates don't add up across members: leave the Total column blank for them.
    res.rows.forEach((r) => {
      if (r.key === 'hourlyRate' || r.key === 'overtimeRate') r.cells.total = null
    })
    return res
  },
}

export const TEAM_SPECS: Spec[] = [
  workingHoursActivity,
  breakActivity,
  attendanceSummary,
  wagesDetail,
  wagesSummary,
  feeDeductionActivity,
  feeDeductionSummary,
  paySummary,
  scheduledShifts,
  workingHoursSummary,
  teamTimeOff,
  tipsSummary,
  tipsDetail,
  commissionActivity,
  commissionSummary,
]

export { commissionFacts, tipFacts, wageFacts }
