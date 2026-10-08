import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subDays } from 'date-fns'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { DbData, ID, ISODate, PayAdjustment, PayRunLine, Sale, SaleItem, Settings, TeamMember } from '@/types'
import { useDb } from '@/store/db'
import { computeTotals, lineTotal } from '@/api/sales'
import { asRecord, useMemberExtras, type MemberExtrasMap } from '@/api/team'
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
  ['servicesCommission', 'addonsCommission', 'productsCommission', 'giftCardCommission', 'membershipsCommission', 'packagesCommission', 'voucherCommission', 'cancellationCommission', 'noShowCommission', 'commissionAdjustment'],
  ['tipApp', 'tipTerminal', 'tipCheckout', 'tipAfter', 'tipAdjustment'],
  ['newClientFee', 'processingFee', 'bookingFee', 'otherAdjustment'],
  ['payRun', 'cashAdvance'],
]

export interface ActivityRow {
  id: string
  at: string
  kind: PayKind | 'paid'
  type: string
  /** Activity key: wageCreated, overtime, commissionCreated, commissionReversed, tipCreated, feeCreated, adjustment, payRun, cashAdvance. */
  activity: string
  reference: string
  link?: { kind: 'timesheet' | 'sale' | 'adjustment' | 'payRun'; id: ID }
  detail?: string
  total: number
  paid: number
}

export type CommissionKey = 'service' | 'addons' | 'product' | 'giftCard' | 'voucher' | 'membership' | 'package' | 'noShow' | 'cancellation'
export const COMMISSION_KEYS: CommissionKey[] = ['service', 'addons', 'product', 'giftCard', 'voucher', 'membership', 'package', 'noShow', 'cancellation']

export interface Earnings {
  member: TeamMember
  period: PayPeriod
  wages: { enabled: boolean; rate: number; regularMin: number; regularTotal: number; overtimeRate: number; overtimeMin: number; overtimeTotal: number; adjustment: number; total: number }
  commissions: Record<CommissionKey, number> & { adjustment: number; total: number }
  tips: { checkout: number; app: number; terminal: number; after: number; adjustment: number; total: number }
  other: { processing: number; newClient: number; adjustment: number; total: number }
  earnings: number
  total: number
  /** Paid so far: completed pay runs plus cash advances. */
  paid: number
  /** Amounts already settled per compensation type by completed pay runs. */
  settled: Record<PayKind, number>
  /** Cash advances (cash taken from sales) not yet deducted in a pay run. */
  advanceLeft: number
  toPay: number
  adjustments: PayAdjustment[]
  activity: ActivityRow[]
}

export type PayData = Pick<DbData, 'timesheets' | 'blockedTimeTypes' | 'sales' | 'payments' | 'payAdjustments' | 'payRuns' | 'clients' | 'services' | 'products' | 'packages'> & {
  commissionSettings: Settings['commissions']
  memberExtras: MemberExtrasMap
}

/** Everything computeEarnings reads, selected once (stable between unrelated changes). */
export function usePayData(): PayData {
  const slices = useDb(
    useShallow((s) => ({
      timesheets: s.timesheets,
      blockedTimeTypes: s.blockedTimeTypes,
      sales: s.sales,
      payments: s.payments,
      payAdjustments: s.payAdjustments,
      payRuns: s.payRuns,
      clients: s.clients,
      services: s.services,
      products: s.products,
      packages: s.packages,
      commissionSettings: s.settings.commissions,
    })),
  )
  const memberExtras = useMemberExtras()
  return useMemo(() => ({ ...slices, memberExtras }), [slices, memberExtras])
}

const CARD_METHODS = ['card_terminal', 'online_card', 'qr_code', 'self_checkout', 'manual_card']

const saleDay = (s: Sale) => dayOf(s.completedAt ?? s.createdAt)

/** Completed sales and refunds that count towards a pay period. */
export function salesInPeriod(sales: Sale[], period: PayPeriod): Sale[] {
  return sales.filter((s) => ((s.kind === 'sale' && s.status === 'completed') || s.kind === 'refund') && saleDay(s) >= period.start && saleDay(s) <= period.end)
}

/**
 * Commission on one sale line (team.md §2.8, §6.1; settings-team.md §6).
 *
 * The shared TeamMember type stores two rates, `commission.serviceRate` and
 * `commission.productRate`, so the other commission types reuse them:
 * - Services, service add-ons, no-show fees and late cancellation fees use the
 *   service rate. Fees are credited to the member the appointment was booked
 *   with (the fee line's team member).
 * - Memberships and packages sell future services, so they also use the
 *   service rate. Packages only earn commission when the package has
 *   "commission" on (PackageDef.commission).
 * - Products use the product rate, only when the product has commission on.
 *   Gift cards are a retail sale like products, so they use the product rate
 *   too; services later paid with the gift card still earn their own
 *   commission (the card is a payment method, not a discount).
 * - Services with commission turned off in the catalogue earn nothing.
 * - Vouchers don't exist in this workspace, so that line stays €0.
 * - Shipping and manual lines earn nothing.
 *
 * Commission base, following Settings › Team › Commissions:
 * - "Deduct discounts" (default on): the line price after its own discount and
 *   its share of the cart discount; off: the full price before discounts.
 * - "Deduct taxes" (default on): without IVA (price / (1 + tax rate)).
 * - "Deduct service cost" / "Deduct product cost": minus the service cost or
 *   product supply price for the quantity sold.
 * - "Earn commission on services paid for with a package / membership"
 *   (default off): such services (price €0, linked to the client's package or
 *   membership) earn commission on their usual price only when turned on.
 * - "Earn commission even if it exceeds the amount paid" (default off): the
 *   commission is capped at what the client paid for the line.
 *
 * Refunds reverse the commission on the refunded lines, dated on the refund.
 */
function lineCommission(data: PayData, member: TeamMember, sale: Sale, item: SaleItem, cartFactor: number): { key: CommissionKey; type: string; amount: number } | null {
  const cfg = { deductDiscounts: true, deductTaxes: true, deductServiceCost: false, deductProductCost: false, packageServices: false, membershipServices: false, exceedPaid: false, ...data.commissionSettings }
  const { serviceRate, productRate } = member.commission
  const service = item.type === 'service' && item.refId ? data.services.find((s) => s.id === item.refId) : undefined
  const product = item.type === 'product' && item.refId ? data.products.find((p) => p.id === item.refId) : undefined
  let key: CommissionKey
  let type: string
  let rate: number
  switch (item.type) {
    case 'service':
      if (service && !service.commissionEnabled) return null
      ;[key, type, rate] = ['service', 'servicesCommission', serviceRate]
      break
    case 'service_addon':
      ;[key, type, rate] = ['addons', 'addonsCommission', serviceRate]
      break
    case 'product':
      if (product && !product.commission) return null
      ;[key, type, rate] = ['product', 'productsCommission', productRate]
      break
    case 'gift_card':
      ;[key, type, rate] = ['giftCard', 'giftCardCommission', productRate]
      break
    case 'membership':
      ;[key, type, rate] = ['membership', 'membershipsCommission', serviceRate]
      break
    case 'package': {
      const def = item.refId ? data.packages.find((p) => p.id === item.refId) : undefined
      if (def && !def.commission) return null
      ;[key, type, rate] = ['package', 'packagesCommission', serviceRate]
      break
    }
    case 'no_show_fee':
      ;[key, type, rate] = ['noShow', 'noShowCommission', serviceRate]
      break
    case 'late_cancellation_fee':
      ;[key, type, rate] = ['cancellation', 'cancellationCommission', serviceRate]
      break
    default:
      return null
  }
  if (rate <= 0) return null
  const refund = sale.kind === 'refund'
  const sign = refund ? -1 : 1
  // A service covered by the client's package or membership.
  const covered = item.type === 'service' && !refund && (Boolean(item.clientPackageId) || Boolean(item.clientMembershipId))
  if (covered && !((item.clientPackageId && cfg.packageServices) || (item.clientMembershipId && cfg.membershipServices))) return null
  const usualPrice = item.originalPrice ?? service?.price ?? item.unitPrice
  const paidIncl = lineTotal(item) * cartFactor
  const grossIncl = covered ? usualPrice * item.quantity : cfg.deductDiscounts ? paidIncl : item.unitPrice * item.quantity
  const net = cfg.deductTaxes ? grossIncl / (1 + (item.taxRate || 0)) : grossIncl
  const cost = (cfg.deductServiceCost && service?.cost ? service.cost * item.quantity : 0) + (cfg.deductProductCost && product ? product.supplyPrice * item.quantity : 0)
  const base = refund ? Math.min(0, net + cost) : Math.max(0, net - cost)
  let amount = base * rate
  if (!cfg.exceedPaid && !covered) amount = sign * Math.min(Math.abs(amount), Math.abs(paidIncl))
  amount = round2(amount)
  return amount === 0 ? null : { key, type, amount }
}

/** Earnings breakdown for one member and pay period (team.md §6.1). */
export function computeEarnings(data: PayData, member: TeamMember, period: PayPeriod, periodSales?: Sale[]): Earnings {
  const rec = asRecord(member, data.memberExtras)
  const activity: ActivityRow[] = []
  const sales = periodSales ?? salesInPeriod(data.sales, period)
  const adjustments = data.payAdjustments.filter((a) => a.teamMemberId === member.id && a.periodStart === period.start)
  const adj = (kind: PayKind) => round2(adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amount, 0))

  // Wages from clocked-out timesheets; overtime above 40 hours a week.
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

  // Commissions, tips, fees and cash advances from completed sales and refunds.
  const c: Record<CommissionKey, number> = { service: 0, addons: 0, product: 0, giftCard: 0, voucher: 0, membership: 0, package: 0, noShow: 0, cancellation: 0 }
  const tips = { checkout: 0, app: 0, terminal: 0, after: 0 }
  let processing = 0
  let newClient = 0
  let advances = 0
  const prs = rec.payRunSettings
  const firstSaleByClient = new Map<string, string>()
  if (prs?.deductNewClientFees) {
    for (const s of data.sales) {
      if (!s.clientId || s.kind !== 'sale' || s.status === 'voided' || s.status === 'draft') continue
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
    const totals = computeTotals(s)
    const cartFactor = totals.itemsTotal ? totals.subtotal / totals.itemsTotal : 1
    if (member.commission.enabled) {
      for (const item of mine) {
        const line = lineCommission(data, member, s, item, cartFactor)
        if (!line) continue
        c[line.key] += line.amount
        activity.push({ id: `c_${s.id}_${item.id}`, at, kind: 'commissions', type: line.type, activity: line.amount < 0 ? 'commissionReversed' : 'commissionCreated', reference: ref, link: { kind: 'sale', id: s.id }, detail: item.name, total: line.amount, paid: 0 })
      }
    }
    const pays = data.payments.filter((p) => s.paymentIds.includes(p.id) && p.status === 'succeeded')
    const methods = pays.map((p) => p.method)
    if (tip > 0) {
      const bucket = methods.includes('card_terminal') ? 'terminal' : methods.includes('online_card') ? 'app' : 'checkout'
      tips[bucket] += tip
      activity.push({ id: `t_${s.id}`, at, kind: 'tips', type: bucket === 'terminal' ? 'tipTerminal' : bucket === 'app' ? 'tipApp' : 'tipCheckout', activity: 'tipCreated', reference: ref, link: { kind: 'sale', id: s.id }, total: round2(tip), paid: 0 })
    }
    if (s.kind !== 'sale') continue
    const myTotal = mine.reduce((sum, i) => sum + lineTotal(i), 0) * cartFactor
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
    // "Record cash payments for sales as 'paid' in pay runs": the member keeps
    // the cash paid for their items, recorded as an advance on their pay.
    if (prs?.cashAdvances && myTotal > 0 && totals.subtotal > 0) {
      const cash = pays.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0)
      const share = round2(Math.min(myTotal, cash * (myTotal / totals.subtotal)))
      if (share > 0) {
        advances += share
        activity.push({ id: `ca_${s.id}`, at, kind: 'paid', type: 'cashAdvance', activity: 'cashAdvance', reference: ref, link: { kind: 'sale', id: s.id }, total: 0, paid: share })
      }
    }
  }
  const commAdj = adj('commissions')
  const commissionsBase = COMMISSION_KEYS.reduce((sum, k) => sum + c[k], 0)
  const commissions = {
    ...(Object.fromEntries(COMMISSION_KEYS.map((k) => [k, round2(c[k])])) as Record<CommissionKey, number>),
    adjustment: commAdj,
    total: round2(commissionsBase + commAdj),
  }
  const tipAdj = adj('tips')
  const tipsOut = { checkout: round2(tips.checkout), app: round2(tips.app), terminal: round2(tips.terminal), after: round2(tips.after), adjustment: tipAdj, total: round2(tips.checkout + tips.app + tips.terminal + tips.after + tipAdj) }
  const otherAdj = adj('other')
  const other = { processing: -round2(processing), newClient: -round2(newClient), adjustment: otherAdj, total: round2(-processing - newClient + otherAdj) }

  for (const a of adjustments) {
    const type = { wages: 'wageAdjustment', commissions: 'commissionAdjustment', tips: 'tipAdjustment', other: 'otherAdjustment' }[a.kind]
    activity.push({ id: `a_${a.id}`, at: a.at, kind: a.kind, type, activity: type, reference: a.note, link: { kind: 'adjustment', id: a.id }, total: a.amount, paid: 0 })
  }

  // Completed pay runs for this period: each line holds what that run settled per type.
  const settled: Record<PayKind, number> = { wages: 0, commissions: 0, tips: 0, other: 0 }
  let runPaid = 0
  let advanceUsed = 0
  for (const run of data.payRuns) {
    if (run.status !== 'completed' || run.periodStart !== period.start) continue
    const line = run.lines.find((l) => l.teamMemberId === member.id)
    if (!line) continue
    for (const k of PAY_KINDS) settled[k] += line[k]
    runPaid += line.paid
    advanceUsed += Math.max(0, line.total - line.paid)
    if (line.paid > 0) activity.push({ id: `p_${run.id}`, at: run.completedAt ?? run.createdAt, kind: 'paid', type: 'payRun', activity: 'payRun', reference: run.id.slice(-6).toUpperCase(), link: { kind: 'payRun', id: run.id }, total: 0, paid: round2(line.paid) })
  }
  for (const k of PAY_KINDS) settled[k] = round2(settled[k])

  const earnings = round2(wages.total + commissions.total + tipsOut.total)
  const total = round2(earnings + other.total)
  const paid = round2(runPaid + advances)
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
    settled,
    advanceLeft: round2(Math.max(0, advances - advanceUsed)),
    toPay: round2(Math.max(0, total - paid)),
    adjustments,
    activity: activity.sort((a, b) => b.at.localeCompare(a.at)),
  }
}

/** Members shown in pay runs: active with pay runs enabled. */
export function payMembers(members: TeamMember[]): TeamMember[] {
  return members.filter((m) => !m.archived && m.payRuns.enabled).sort((a, b) => a.order - b.order)
}

export interface PayRow {
  teamMemberId: ID
  /** Earned per type (only the included types; others are 0). */
  earned: Record<PayKind, number>
  /** Earned before adjustments, to show an adjusted value over the original. */
  original: Record<PayKind, number>
  total: number
  /** Already paid towards the included types (pay runs and cash advances). */
  paid: number
  toPay: number
  /** What this run would pay: one line for the pay run. */
  line: PayRunLine
}

/**
 * A member's row in "Team members pay run summary" for the chosen types: what
 * they earned, what was already settled and the line this run would pay.
 */
export function payRowFor(e: Earnings, includes: PayKind[]): PayRow {
  const has = (k: PayKind) => includes.includes(k)
  const earnedOf: Record<PayKind, number> = { wages: e.wages.total, commissions: e.commissions.total, tips: e.tips.total, other: e.other.total }
  const adjOf: Record<PayKind, number> = { wages: e.wages.adjustment, commissions: e.commissions.adjustment, tips: e.tips.adjustment, other: e.other.adjustment }
  const earned = Object.fromEntries(PAY_KINDS.map((k) => [k, has(k) ? earnedOf[k] : 0])) as Record<PayKind, number>
  const original = Object.fromEntries(PAY_KINDS.map((k) => [k, has(k) ? round2(earnedOf[k] - adjOf[k]) : 0])) as Record<PayKind, number>
  const remaining = Object.fromEntries(PAY_KINDS.map((k) => [k, has(k) ? round2(earnedOf[k] - e.settled[k]) : 0])) as Record<PayKind, number>
  const total = round2(PAY_KINDS.reduce((s, k) => s + earned[k], 0))
  const settledIncluded = PAY_KINDS.reduce((s, k) => s + (has(k) ? e.settled[k] : 0), 0)
  const due = round2(PAY_KINDS.reduce((s, k) => s + remaining[k], 0))
  const advance = Math.min(e.advanceLeft, Math.max(0, due))
  const toPay = round2(Math.max(0, due - advance))
  const paid = round2(settledIncluded + advance)
  const line: PayRunLine = { teamMemberId: e.member.id, ...remaining, total: due, paid: toPay }
  return { teamMemberId: e.member.id, earned, original, total, paid, toPay, line }
}

/** Tips still unpaid this period ("Pay team member tips" from the register). */
export function unpaidTips(e: Earnings): number {
  return round2(Math.max(0, e.tips.total - e.settled.tips))
}

export function tipsLine(e: Earnings): PayRunLine {
  const tips = unpaidTips(e)
  return { teamMemberId: e.member.id, wages: 0, commissions: 0, tips, other: 0, total: tips, paid: tips }
}
