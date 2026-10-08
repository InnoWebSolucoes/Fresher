import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subDays } from 'date-fns'
import type { DbData, ID, ISODate, PayAdjustment, PayRunLine, Sale, Settings, TeamMember } from '@/types'
import { lineTotal } from '@/api/sales'
import { asRecord, type PayRunRecord } from '@/api/team'
import { round2 } from '@/lib/format'
import { weekdayOf } from '@/lib/time'
import { timesheetTotals } from './timesheets'

export interface PayPeriod {
  start: ISODate
  end: ISODate
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
/** Local calendar day of an ISO timestamp. */
export const dayOf = (at: string) => iso(parseISO(at))

const BIWEEKLY_ANCHOR = '2026-01-05'

/** Pay period containing `date` for the workspace's pay run settings. */
export function periodFor(date: ISODate, cfg: Settings['payRuns']): PayPeriod {
  if (cfg.frequency === 'monthly') {
    const d = parseISO(date)
    return { start: iso(startOfMonth(d)), end: iso(endOfMonth(d)) }
  }
  const offset = (weekdayOf(date) - cfg.restartsOn + 7) % 7
  let start = subDays(parseISO(date), offset)
  if (cfg.frequency === 'biweekly') {
    const anchorOffset = (weekdayOf(BIWEEKLY_ANCHOR) - cfg.restartsOn + 7) % 7
    const anchor = subDays(parseISO(BIWEEKLY_ANCHOR), anchorOffset)
    const weeks = Math.round(differenceInCalendarDays(start, anchor) / 7)
    if (((weeks % 2) + 2) % 2 === 1) start = subDays(start, 7)
    return { start: iso(start), end: iso(addDays(start, 13)) }
  }
  return { start: iso(start), end: iso(addDays(start, 6)) }
}

/** Current period first, then the previous ones. */
export function periodsList(today: ISODate, cfg: Settings['payRuns'], count = 12): PayPeriod[] {
  const list: PayPeriod[] = []
  let p = periodFor(today, cfg)
  for (let i = 0; i < count; i++) {
    list.push(p)
    p = periodFor(iso(subDays(parseISO(p.start), 1)), cfg)
  }
  return list
}

export type PayKind = 'wages' | 'commissions' | 'tips' | 'other'
export const PAY_KINDS: PayKind[] = ['wages', 'commissions', 'tips', 'other']

/** Activity "All types" keys (team.md §6.1), grouped. */
export const ACTIVITY_TYPE_GROUPS: string[][] = [
  ['timesheet', 'wageAdjustment'],
  ['servicesCommission', 'addonsCommission', 'productsCommission', 'giftCardCommission', 'membershipsCommission', 'voucherCommission', 'cancellationCommission', 'noShowCommission', 'commissionAdjustment'],
  ['tipApp', 'tipTerminal', 'tipCheckout', 'tipAfter', 'tipAdjustment'],
  ['newClientFee', 'processingFee', 'bookingFee', 'otherAdjustment'],
  ['payRun', 'cashAdvance'],
]

export interface ActivityRow {
  id: string
  at: string
  kind: PayKind | 'paid'
  type: string
  /** Activity key: wageCreated, commissionCreated, tipCreated, feeCreated, adjustment, payRun. */
  activity: string
  reference: string
  link?: { kind: 'timesheet' | 'sale' | 'adjustment' | 'payRun'; id: ID }
  detail?: string
  total: number
  paid: number
}

export interface Earnings {
  member: TeamMember
  period: PayPeriod
  wages: { enabled: boolean; rate: number; regularMin: number; regularTotal: number; overtimeRate: number; overtimeMin: number; overtimeTotal: number; adjustment: number; total: number }
  commissions: { service: number; addons: number; product: number; giftCard: number; voucher: number; membership: number; package: number; noShow: number; cancellation: number; adjustment: number; total: number }
  tips: { checkout: number; app: number; terminal: number; after: number; adjustment: number; total: number }
  other: { processing: number; newClient: number; adjustment: number; total: number }
  earnings: number
  total: number
  paid: number
  paidTips: number
  toPay: number
  adjustments: PayAdjustment[]
  activity: ActivityRow[]
}

export type PayData = Pick<DbData, 'timesheets' | 'blockedTimeTypes' | 'sales' | 'payments' | 'payAdjustments' | 'payRuns' | 'clients'>

const CARD_METHODS = ['card_terminal', 'online_card', 'qr_code', 'self_checkout', 'manual_card']

/** Completed sales in a period, indexed once per render. */
export function salesInPeriod(sales: Sale[], period: PayPeriod): Sale[] {
  return sales.filter((s) => s.kind === 'sale' && s.status === 'completed' && (() => {
    const d = dayOf(s.completedAt ?? s.createdAt)
    return d >= period.start && d <= period.end
  })())
}

/** Earnings breakdown for one member and pay period (team.md §6.1). */
export function computeEarnings(data: PayData, member: TeamMember, period: PayPeriod, periodSales?: Sale[]): Earnings {
  const rec = asRecord(member)
  const activity: ActivityRow[] = []
  const sales = periodSales ?? salesInPeriod(data.sales, period)
  const adjustments = data.payAdjustments.filter((a) => a.teamMemberId === member.id && a.periodStart === period.start)
  const adj = (kind: PayKind) => round2(adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amount, 0))

  // Wages from clocked-out timesheets.
  const wagesOn = member.wages.enabled && rec.compensationType !== 'none'
  const rate = wagesOn ? member.wages.hourlyRate : 0
  const sheets = wagesOn ? data.timesheets.filter((t) => t.teamMemberId === member.id && t.status === 'clocked_out' && t.date >= period.start && t.date <= period.end) : []
  let paidMin = 0
  for (const t of sheets) {
    const totals = timesheetTotals(t, data.blockedTimeTypes)
    paidMin += totals.paid
    activity.push({ id: `w_${t.id}`, at: `${t.date}T${t.clockIn}:00`, kind: 'wages', type: 'timesheet', activity: 'wageCreated', reference: t.date, link: { kind: 'timesheet', id: t.id }, detail: String(totals.paid), total: round2((totals.paid / 60) * rate), paid: 0 })
  }
  const weeks = (differenceInCalendarDays(parseISO(period.end), parseISO(period.start)) + 1) / 7
  const overtimeMin = wagesOn && member.wages.overtime ? Math.max(0, paidMin - Math.round(40 * 60 * weeks)) : 0
  const overtimeRate = wagesOn && member.wages.overtime ? round2(rate * 1.5) : 0
  const regularMin = paidMin - overtimeMin
  const regularTotal = round2((regularMin / 60) * rate)
  const overtimeTotal = round2((overtimeMin / 60) * overtimeRate)
  if (overtimeMin > 0) {
    activity.push({ id: `ot_${period.start}`, at: `${period.end}T23:59:00`, kind: 'wages', type: 'timesheet', activity: 'overtime', reference: period.end, detail: String(overtimeMin), total: round2(overtimeTotal - (overtimeMin / 60) * rate), paid: 0 })
  }
  const wageAdj = adj('wages')
  const wages = { enabled: wagesOn, rate, regularMin, regularTotal, overtimeRate, overtimeMin, overtimeTotal, adjustment: wageAdj, total: round2(regularTotal + overtimeTotal + wageAdj) }

  // Commissions, tips and fees from completed sales.
  const c = { service: 0, addons: 0, product: 0, giftCard: 0, voucher: 0, membership: 0, package: 0, noShow: 0, cancellation: 0 }
  const tips = { checkout: 0, app: 0, terminal: 0, after: 0 }
  let processing = 0
  let newClient = 0
  const prs = rec.payRunSettings
  const firstSaleByClient = new Map<string, string>()
  if (prs?.deductNewClientFees) {
    for (const s of data.sales) {
      if (!s.clientId || s.kind !== 'sale') continue
      const prev = firstSaleByClient.get(s.clientId)
      if (!prev || s.createdAt < prev) firstSaleByClient.set(s.clientId, s.createdAt)
    }
  }
  for (const s of sales) {
    const mine = s.items.filter((i) => i.teamMemberId === member.id)
    const tip = s.tips.filter((t) => t.teamMemberId === member.id).reduce((sum, t) => sum + t.amount, 0)
    if (!mine.length && !tip) continue
    const at = s.completedAt ?? s.createdAt
    const ref = `#${s.number}`
    if (member.commission.enabled) {
      for (const item of mine) {
        const value = lineTotal(item)
        let amount = 0
        let type = ''
        if (item.type === 'service') {
          amount = value * member.commission.serviceRate
          c.service += amount
          type = 'servicesCommission'
        } else if (item.type === 'service_addon') {
          amount = value * member.commission.serviceRate
          c.addons += amount
          type = 'addonsCommission'
        } else if (item.type === 'product') {
          amount = value * member.commission.productRate
          c.product += amount
          type = 'productsCommission'
        }
        if (amount > 0) activity.push({ id: `c_${item.id}`, at, kind: 'commissions', type, activity: 'commissionCreated', reference: ref, link: { kind: 'sale', id: s.id }, detail: item.name, total: round2(amount), paid: 0 })
      }
    }
    const methods = data.payments.filter((p) => s.paymentIds.includes(p.id) && p.status === 'succeeded').map((p) => p.method)
    if (tip > 0) {
      const bucket = methods.includes('card_terminal') ? 'terminal' : methods.includes('online_card') ? 'app' : 'checkout'
      tips[bucket] += tip
      activity.push({ id: `t_${s.id}`, at, kind: 'tips', type: bucket === 'terminal' ? 'tipTerminal' : bucket === 'app' ? 'tipApp' : 'tipCheckout', activity: 'tipCreated', reference: ref, link: { kind: 'sale', id: s.id }, total: round2(tip), paid: 0 })
    }
    const myTotal = mine.reduce((sum, i) => sum + lineTotal(i), 0)
    if (prs?.deductProcessingFees && myTotal > 0 && methods.some((m) => CARD_METHODS.includes(m))) {
      const fee = round2(myTotal * 0.0129)
      processing += fee
      activity.push({ id: `pf_${s.id}`, at, kind: 'other', type: 'processingFee', activity: 'feeCreated', reference: ref, link: { kind: 'sale', id: s.id }, total: -fee, paid: 0 })
    }
    if (prs?.deductNewClientFees && s.clientId && firstSaleByClient.get(s.clientId) === s.createdAt && data.clients.find((x) => x.id === s.clientId)?.marketplace) {
      const services = mine.filter((i) => i.type === 'service').reduce((sum, i) => sum + lineTotal(i), 0)
      const fee = round2(Math.min(20, services * 0.2))
      if (fee > 0) {
        newClient += fee
        activity.push({ id: `nc_${s.id}`, at, kind: 'other', type: 'newClientFee', activity: 'feeCreated', reference: ref, link: { kind: 'sale', id: s.id }, total: -fee, paid: 0 })
      }
    }
  }
  const commAdj = adj('commissions')
  const commissions = {
    service: round2(c.service),
    addons: round2(c.addons),
    product: round2(c.product),
    giftCard: 0,
    voucher: 0,
    membership: 0,
    package: 0,
    noShow: 0,
    cancellation: 0,
    adjustment: commAdj,
    total: round2(c.service + c.addons + c.product + commAdj),
  }
  const tipAdj = adj('tips')
  const tipsOut = { checkout: round2(tips.checkout), app: round2(tips.app), terminal: round2(tips.terminal), after: round2(tips.after), adjustment: tipAdj, total: round2(tips.checkout + tips.app + tips.terminal + tips.after + tipAdj) }
  const otherAdj = adj('other')
  const other = { processing: -round2(processing), newClient: -round2(newClient), adjustment: otherAdj, total: round2(-processing - newClient + otherAdj) }

  for (const a of adjustments) {
    const type = { wages: 'wageAdjustment', commissions: 'commissionAdjustment', tips: 'tipAdjustment', other: 'otherAdjustment' }[a.kind]
    activity.push({ id: `a_${a.id}`, at: a.at, kind: a.kind, type, activity: 'adjustment', reference: a.note, link: { kind: 'adjustment', id: a.id }, total: a.amount, paid: 0 })
  }

  // Already paid in completed pay runs for this period.
  let paid = 0
  let paidTips = 0
  for (const run of data.payRuns as PayRunRecord[]) {
    if (run.status !== 'completed' || run.periodStart !== period.start) continue
    const line = run.lines.find((l) => l.teamMemberId === member.id)
    if (!line || line.paid <= 0) continue
    paid += line.paid
    paidTips += line.tips
    activity.push({ id: `p_${run.id}`, at: run.completedAt ?? run.createdAt, kind: 'paid', type: run.method === 'cash_register' ? 'cashAdvance' : 'payRun', activity: 'payRun', reference: run.id.slice(-6).toUpperCase(), link: { kind: 'payRun', id: run.id }, total: 0, paid: round2(line.paid) })
  }

  const earnings = round2(wages.total + commissions.total + tipsOut.total)
  const total = round2(earnings + other.total)
  paid = round2(paid)
  return {
    member,
    period,
    wages,
    commissions,
    tips: tipsOut,
    other,
    earnings,
    total,
    paid,
    paidTips: round2(Math.min(paidTips, tipsOut.total)),
    toPay: round2(Math.max(0, total - paid)),
    adjustments,
    activity: activity.sort((a, b) => b.at.localeCompare(a.at)),
  }
}

/** Members shown in pay runs: active with pay runs enabled. */
export function payMembers(members: TeamMember[]): TeamMember[] {
  return members.filter((m) => !m.archived && m.payRuns.enabled).sort((a, b) => a.order - b.order)
}

/** A pay run line for the chosen compensation types. */
export function lineFor(e: Earnings, includes: PayKind[]): PayRunLine & { toPay: number; originalWages: number } {
  const wages = includes.includes('wages') ? e.wages.total : 0
  const commissions = includes.includes('commissions') ? e.commissions.total : 0
  const tips = includes.includes('tips') ? e.tips.total : 0
  const other = includes.includes('other') ? e.other.total : 0
  const total = round2(wages + commissions + tips + other)
  return { teamMemberId: e.member.id, wages, commissions, tips, other, total, paid: e.paid, toPay: round2(Math.max(0, total - e.paid)), originalWages: round2(e.wages.total - e.wages.adjustment) }
}
