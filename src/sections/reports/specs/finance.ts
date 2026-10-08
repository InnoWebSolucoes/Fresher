import { computeTotals, salePaid } from '@/api/sales'
import { round2 } from '@/lib/format'
import type { Appointment, ID } from '@/types'
import type { Ctx } from '../engine/context'
import { balanceBefore, channelLabel, clientAttrs, lineFacts, liabilityEvents, payFacts, typeLabel, type LiabilityEvent, type PayFact } from '../engine/facts'
import { applyFilters, bucketRange, bucketsBetween, listResult, statement, sum, summarize, timeBucket, type Dim, type Line, type Measure, type TimeUnit } from '../engine/helpers'
import { L } from '../engine/labels'
import type { Cell, Col, Params, Range, Result, Row, Spec } from '../engine/types'
import { apptLink, clientLink, inR, saleLink } from './common'

const TIME_GROUPINGS = [{ key: 'day' }, { key: 'week' }, { key: 'month' }, { key: 'quarter' }, { key: 'year' }]

// ─── Finance summary ───────────────────────────────────────────────────────

function financeValues(ctx: Ctx, r: Range, filters: Params['filters']): Record<string, number> {
  const lines = applyFilters(lineFacts(ctx).filter((f) => inR(f.date, r)), filters)
  const goods = lines.filter((f) => !f.giftCard)
  // Items covered by a membership benefit sell at €0; their list price shows as gross and is taken back on the Memberships line.
  const memberships = -sum(goods.filter((f) => f.item.benefitNote && f.item.clientMembershipId && !f.refund), (f) => (f.item.originalPrice ?? 0) / (1 + f.rate))
  const discounts = -sum(goods, (f) => f.itemDiscEx + f.cartDiscEx)
  const refunds = sum(goods, (f) => f.refunds)
  const netSales = sum(goods, (f) => f.net)
  const gross = round2(netSales - discounts - memberships - refunds)
  const taxes = sum(goods, (f) => f.tax)
  const totalSales = round2(netSales + taxes)
  const giftCardSales = sum(lines.filter((f) => f.giftCard), (f) => f.netIncl)
  const loc = filters.location ?? []
  const sales = (ctx.d.sales ?? []).filter((s) => s.status !== 'draft' && s.status !== 'voided' && inR(ctx.day(s.createdAt), r) && (!loc.length || loc.includes(s.locationId)))
  const charges = sum(sales, (s) => computeTotals(s).serviceCharges)
  const tips = sum(sales, (s) => s.tips.reduce((x, t) => x + t.amount, 0))
  const chargesNet = round2(charges / 1.23)
  const netOther = round2(giftCardSales + chargesNet + tips)
  const taxOther = round2(charges - chargesNet)
  const totalOther = round2(netOther + taxOther)
  const all = round2(totalSales + totalOther)
  const paidInPeriod = sum(
    sales.filter((s) => s.kind === 'sale'),
    (s) => Math.min(computeTotals(s).total, salePaid(s, ctx.d.payments)),
  )
  const refundsPaid = sum(sales.filter((s) => s.kind === 'refund'), (s) => computeTotals(s).total)
  const salesPaid = round2(paidInPeriod + refundsPaid)
  const pays = (ctx.d.payments ?? []).filter((p) => p.status === 'succeeded' && inR(ctx.day(p.at), r) && (!loc.length || loc.includes(p.locationId)))
  // Money received: every payment except gift card redemptions (those are listed under Redemptions).
  const salePays = pays.filter((p) => p.method !== 'gift_card')
  const out: Record<string, number> = {
    grossSales: gross,
    discounts,
    memberships,
    refundsReturns: refunds,
    netSales,
    taxes,
    totalSales,
    giftCardSales,
    serviceCharges: charges,
    tips,
    netOtherSales: netOther,
    taxOnOtherSales: taxOther,
    totalOtherSales: totalOther,
    totalSalesOther: all,
    salesPaidInPeriod: salesPaid,
    unpaidSalesInPeriod: round2(all - salesPaid),
  }
  for (const p of salePays) out[`pm_${p.method}`] = round2((out[`pm_${p.method}`] ?? 0) + p.amount)
  out.totalPayments = sum(salePays, (p) => p.amount)
  // Total payments = payments for sales in this period + for earlier sales + prepayments not yet used by a sale in the period.
  const saleDate = (p: (typeof salePays)[number]) => {
    const sale = p.saleId ? ctx.byId.sale.get(p.saleId) : undefined
    return sale ? ctx.day(sale.createdAt) : null
  }
  out.paymentsForSalesInPeriod = sum(salePays.filter((p) => { const d = saleDate(p); return d !== null && inR(d, r) }), (p) => p.amount)
  out.paymentsForPreviousPeriods = sum(salePays.filter((p) => { const d = saleDate(p); return d !== null && d < r.from }), (p) => p.amount)
  out.prepayments = round2(out.totalPayments - out.paymentsForSalesInPeriod - out.paymentsForPreviousPeriods)
  const events = liabilityEvents(ctx).filter((e) => inR(e.date, r) && e.activity === 'redemption' && (!loc.length || loc.includes(e.locationId)))
  out.prepaymentRedemption = -sum(events.filter((e) => e.liability === 'prepayment'), (e) => e.amount)
  out.giftCardRedemption = -sum(events.filter((e) => e.liability === 'gift_card'), (e) => e.amount)
  out.totalRedemptions = round2(out.prepaymentRedemption + out.giftCardRedemption)
  out.redemptionsForSalesInPeriod = -sum(
    events.filter((e) => e.liability === 'gift_card' ? (e.card ? inR(ctx.day(e.card.issuedAt), r) : false) : true),
    (e) => e.amount,
  )
  out.redemptionsForPreviousPeriods = round2(out.totalRedemptions - out.redemptionsForSalesInPeriod)
  return out
}

const financeSummary: Spec = {
  slug: 'finance-summary',
  range: 'last_6_months',
  groupBy: true,
  groupings: TIME_GROUPINGS,
  defaultGroupBy: 'month',
  filters: ['location'],
  advanced: false,
  customize: false,
  build: (ctx, p) => {
    const unit = (['day', 'week', 'month', 'quarter', 'year'].includes(p.groupBy) ? p.groupBy : 'month') as 'day' | 'week' | 'month' | 'quarter' | 'year'
    const buckets = bucketsBetween(unit, p.range).reverse()
    const methods = [...new Set((ctx.d.payments ?? []).filter((x) => x.status === 'succeeded' && x.method !== 'gift_card' && inR(ctx.day(x.at), p.range)).map((x) => x.method))].sort()
    const lines: Line[] = [
      { key: 'grossSales' },
      { key: 'discounts', indent: true, to: 'discount-summary' },
      { key: 'memberships', indent: true },
      { key: 'refundsReturns', indent: true },
      { key: 'netSales' },
      { key: 'taxes', indent: true, to: 'taxes-summary' },
      { key: 'totalSales', kind: 'bold', to: 'sales-summary' },
      { key: 'giftCardSales', indent: true, to: 'gift-card-list' },
      { key: 'serviceCharges', indent: true, to: 'service-charges' },
      { key: 'tips', indent: true, to: 'tips-summary' },
      { key: 'netOtherSales' },
      { key: 'taxOnOtherSales', indent: true },
      { key: 'totalOtherSales', kind: 'bold' },
      { key: 'totalSalesOther', kind: 'bold' },
      { key: 'salesPaidInPeriod', indent: true },
      { key: 'unpaidSalesInPeriod', indent: true },
      { key: 'payments', kind: 'section' },
      ...methods.map((m): Line => ({ key: `pm_${m}`, label: L(`opt.paymentMethod.${m}`), indent: true })),
      { key: 'totalPayments', kind: 'bold', to: 'payments-summary' },
      { key: 'paymentsForSalesInPeriod', indent: true },
      { key: 'paymentsForPreviousPeriods', indent: true },
      { key: 'prepayments', indent: true, to: 'deposit-list' },
      { key: 'redemptions', kind: 'section' },
      { key: 'prepaymentRedemption', to: 'deposit-list' },
      { key: 'giftCardRedemption', to: 'gift-card-list' },
      { key: 'totalRedemptions', kind: 'bold', to: 'liability-summary' },
      { key: 'redemptionsForSalesInPeriod', indent: true },
      { key: 'redemptionsForPreviousPeriods', indent: true },
    ]
    return statement(
      L('line.sales'),
      lines,
      buckets.map((b) => ({ key: b.k, label: b.l })),
      (bucket) => {
        if (!bucket) return financeValues(ctx, p.range, p.filters)
        const br = bucketRange(unit, bucket)!
        return financeValues(ctx, { from: br.from < p.range.from ? p.range.from : br.from, to: br.to > p.range.to ? p.range.to : br.to }, p.filters)
      },
    )
  },
}

// ─── Payments ──────────────────────────────────────────────────────────────

const pf = (ctx: Ctx, p: Params) => applyFilters(payFacts(ctx).filter((f) => inR(f.date, p.range)), p.filters, p.ranges)

const paymentsSummary: Spec = {
  slug: 'payments-summary',
  range: 'month_to_date',
  filters: ['location', 'teamMember', 'type'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dim: Dim<PayFact> = { key: 'paymentMethod', get: (f) => ({ k: f.p.method === 'custom' ? `custom_${f.method}` : f.p.method, l: f.method }) }
    const ms: Measure<PayFact>[] = [
      { key: 'noOfPayments', type: 'int', calc: (fs) => fs.filter((f) => f.p.amount > 0).length },
      { key: 'paymentAmount', type: 'money', calc: (fs) => sum(fs.filter((f) => f.p.amount > 0), (f) => f.p.amount) },
      { key: 'noOfRefunds', type: 'int', calc: (fs) => fs.filter((f) => f.p.amount < 0).length },
      { key: 'refunds', type: 'money', calc: (fs) => sum(fs.filter((f) => f.p.amount < 0), (f) => f.p.amount) },
      { key: 'netPayments', type: 'money', calc: (fs) => sum(fs, (f) => f.p.amount) },
    ]
    return summarize(pf(ctx, p), dim, ms)
  },
}

const depositAppt = (ctx: Ctx) => {
  const map = new Map<ID, Appointment>()
  for (const a of ctx.d.appointments ?? []) if (a.deposit?.paymentId) map.set(a.deposit.paymentId, a)
  return map
}

const paymentTransactions: Spec = {
  slug: 'payment-transactions',
  range: 'month_to_date',
  filters: ['location', 'teamMember', 'type', 'paymentMethod', 'paymentAmount', 'giftCards', 'deposits'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const deposits = depositAppt(ctx)
    const facts = pf(ctx, p).sort((a, b) => b.p.at.localeCompare(a.p.at))
    const apptOf = (f: PayFact) => (f.sale?.appointmentId ? ctx.byId.appointment.get(f.sale.appointmentId) : deposits.get(f.p.id))
    return listResult(
      facts,
      [
        { key: 'paymentDate', type: 'datetime', get: (f) => f.p.at },
        { key: 'paymentNo', type: 'text', get: (f) => String(ctx.paymentNo.get(f.p.id) ?? '-') },
        { key: 'saleDate', type: 'datetime', get: (f) => f.sale?.createdAt ?? '-' },
        { key: 'saleNo', type: 'text', get: (f) => (f.sale ? String(f.sale.number) : '-'), link: (f) => saleLink(f.sale?.id) },
        { key: 'apptRef', type: 'text', get: (f) => apptOf(f)?.ref ?? '-', link: (f) => apptLink(apptOf(f)?.id) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.p.clientId), link: (f) => clientLink(f.p.clientId) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.p.locationId) },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.p.collectedById ?? f.sale?.items.find((i) => i.teamMemberId)?.teamMemberId) },
        { key: 'transactionType', type: 'text', get: (f) => L(`opt.transactionType.${f.p.kind}`) },
        { key: 'paymentMethod', type: 'text', get: (f) => f.p.methodLabel || f.method },
        { key: 'paymentAmount', type: 'money', get: (f) => f.p.amount },
        { key: 'processedBy', type: 'text', hidden: true, get: (f) => f.p.by },
      ],
      (f) => f.p.id,
      { total: true },
    )
  },
}

// ─── Cash flow ─────────────────────────────────────────────────────────────

interface CashEvent {
  key: string
  at: string
  date: string
  type: 'sale' | 'refund' | 'cash_in' | 'cash_out' | 'cash_to_bank'
  amount: number
  locationId: ID
  ref: string
  clientId: ID | null
  memberId?: ID | null
  by: string
  from: string
  to: string
  a: Record<string, string | string[]>
}

function cashEvents(ctx: Ctx): CashEvent[] {
  const out: CashEvent[] = []
  for (const s of ctx.d.registerSessions ?? []) {
    const reg = ctx.byId.register.get(s.registerId)
    const locationId = reg?.locationId ?? ''
    const regName = `${reg?.name ?? '-'} · ${ctx.locationName(locationId)}`
    for (const pay of (ctx.d.payments ?? []).filter((x) => x.registerSessionId === s.id && x.status === 'succeeded')) {
      const sale = ctx.byId.sale.get(pay.saleId)
      const type = pay.amount < 0 ? 'refund' : 'sale'
      out.push({ key: pay.id, at: pay.at, date: ctx.day(pay.at), type, amount: pay.amount, locationId, ref: sale ? `${L('sale')} ${sale.number}` : '-', clientId: pay.clientId, memberId: pay.collectedById ?? sale?.items[0]?.teamMemberId, by: pay.by, from: type === 'sale' ? ctx.clientName(pay.clientId) : regName, to: type === 'sale' ? regName : ctx.clientName(pay.clientId), a: {} })
    }
    for (const m of s.movements) {
      if (m.type !== 'cash_in' && m.type !== 'cash_out') continue
      out.push({ key: m.id, at: m.at, date: ctx.day(m.at), type: m.type, amount: m.type === 'cash_in' ? Math.abs(m.amount) : -Math.abs(m.amount), locationId, ref: m.reason, clientId: null, by: m.by, from: m.type === 'cash_in' ? L('external') : regName, to: m.type === 'cash_in' ? regName : L('external'), a: {} })
    }
    if (s.closedAt && s.cashToBank) out.push({ key: `${s.id}_bank`, at: s.closedAt, date: ctx.day(s.closedAt), type: 'cash_to_bank', amount: -s.cashToBank, locationId, ref: L('registerClosed'), clientId: null, by: s.closedBy ?? '-', from: regName, to: L('bank'), a: {} })
  }
  out.sort((a, b) => a.at.localeCompare(b.at))
  for (const e of out) e.a = { location: e.locationId, transactionType: e.type, teamMember: e.memberId ?? 'none', processedBy: e.by }
  return out
}

const cashFlowSummary: Spec = {
  slug: 'cash-flow-summary',
  range: 'month_to_date',
  filters: ['location'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const cash = applyFilters(cashEvents(ctx), p.filters)
    const card = applyFilters(
      payFacts(ctx)
        .filter((f) => ['card_terminal', 'online_card', 'qr_code', 'self_checkout', 'manual_card'].includes(f.p.method))
        .map((f) => ({ date: f.date, amount: f.p.amount, locationId: f.p.locationId, a: { location: f.p.locationId } })),
      p.filters,
    )
    const payouts = (ctx.d.payouts ?? []).map((x) => ({ date: ctx.day(x.at), amount: -x.amount, locationId: ctx.d.locations[0]?.id ?? '', a: { location: ctx.d.locations[0]?.id ?? '' } }))
    const rows: { type: string; loc: ID; events: { date: string; amount: number }[] }[] = []
    for (const loc of ctx.d.locations) {
      if (p.filters.location?.length && !p.filters.location.includes(loc.id)) continue
      rows.push({ type: L('cashRegister'), loc: loc.id, events: cash.filter((e) => e.locationId === loc.id) })
      rows.push({ type: L('cardPayments'), loc: loc.id, events: [...card.filter((e) => e.locationId === loc.id), ...payouts.filter((e) => e.locationId === loc.id)] })
    }
    const data = rows
      .map((r) => {
        const opening = round2(r.events.filter((e) => e.date < p.range.from).reduce((s, e) => s + e.amount, 0))
        const within = r.events.filter((e) => inR(e.date, p.range))
        const inflows = sum(within.filter((e) => e.amount > 0), (e) => e.amount)
        const outflows = sum(within.filter((e) => e.amount < 0), (e) => e.amount)
        return { ...r, opening, inflows, outflows, closing: round2(opening + inflows + outflows) }
      })
      .filter((r) => r.inflows || r.outflows || r.opening)
    return listResult(
      data,
      [
        { key: 'type', type: 'text', get: (r) => r.type },
        { key: 'location', type: 'text', get: (r) => ctx.locationName(r.loc) },
        { key: 'openingBalance', type: 'money', get: (r) => r.opening },
        { key: 'totalInflows', type: 'money', get: (r) => r.inflows },
        { key: 'totalOutflows', type: 'money', get: (r) => r.outflows },
        { key: 'closingBalance', type: 'money', get: (r) => r.closing },
      ],
      (r) => `${r.type}_${r.loc}`,
      { total: true },
    )
  },
}

const cashFlowStatement: Spec = {
  slug: 'cash-flow-statement',
  range: 'month_to_date',
  filters: ['transactionType', 'location', 'teamMember', 'processedBy'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const all = applyFilters(cashEvents(ctx), p.filters)
    const balance = new Map<ID, number>()
    const rows = all.map((e) => {
      const opening = balance.get(e.locationId) ?? 0
      const closing = round2(opening + e.amount)
      balance.set(e.locationId, closing)
      return { e, opening, closing }
    })
    return listResult(
      rows.filter((r) => inR(r.e.date, p.range)).reverse(),
      [
        { key: 'paymentDate', type: 'datetime', get: (r) => r.e.at },
        { key: 'transactionRef', type: 'text', get: (r) => r.e.ref },
        { key: 'transactionType', type: 'text', get: (r) => L(`opt.transactionType.${r.e.type}`) },
        { key: 'location', type: 'text', get: (r) => ctx.locationName(r.e.locationId) },
        { key: 'teamMember', type: 'text', get: (r) => (r.e.memberId ? ctx.memberName(r.e.memberId) : '-') },
        { key: 'client', type: 'text', get: (r) => (r.e.clientId ? ctx.clientName(r.e.clientId) : '-'), link: (r) => clientLink(r.e.clientId) },
        { key: 'processedBy', type: 'text', get: (r) => r.e.by },
        { key: 'from', type: 'text', get: (r) => r.e.from },
        { key: 'to', type: 'text', get: (r) => r.e.to },
        { key: 'openingBalance', type: 'money', total: false, get: (r) => r.opening },
        { key: 'inflows', type: 'money', get: (r) => (r.e.amount > 0 ? r.e.amount : 0) },
        { key: 'outflows', type: 'money', get: (r) => (r.e.amount < 0 ? r.e.amount : 0) },
        { key: 'closingBalance', type: 'money', total: false, get: (r) => r.closing },
      ],
      (r) => r.e.key,
      { total: true },
    )
  },
}

// ─── Service charges ───────────────────────────────────────────────────────

const serviceCharges: Spec = {
  slug: 'service-charges',
  range: 'month_to_date',
  filters: ['serviceCharge', 'location', 'teamMember'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = (ctx.d.sales ?? [])
      .filter((s) => s.status !== 'draft' && s.status !== 'voided' && inR(ctx.day(s.createdAt), p.range))
      .flatMap((s) => s.serviceCharges.map((c) => ({ s, c, a: { serviceCharge: c.id, location: s.locationId, teamMember: [...new Set(s.items.map((i) => i.teamMemberId ?? 'none'))] } })))
    const filtered = applyFilters(facts, p.filters)
    const groups = new Map<string, typeof filtered>()
    for (const f of filtered) {
      const k = `${f.c.name}|${f.s.locationId}`
      groups.set(k, [...(groups.get(k) ?? []), f])
    }
    const def = (name: string) => ctx.d.settings.serviceCharges.find((c) => c.name === name)
    return listResult(
      [...groups.entries()].map(([k, fs]) => ({ k, fs })),
      [
        { key: 'serviceCharge', type: 'text', get: (g) => g.fs[0].c.name },
        { key: 'location', type: 'text', get: (g) => ctx.locationName(g.fs[0].s.locationId) },
        { key: 'salesQty', type: 'int', total: true, get: (g) => g.fs.length },
        { key: 'rate', type: 'money', total: false, get: (g) => (def(g.fs[0].c.name)?.rateType === 'flat' ? (def(g.fs[0].c.name)?.amount ?? 0) : 0) },
        { key: 'ratePct', type: 'pct', total: false, get: (g) => (def(g.fs[0].c.name)?.rateType === 'percent' ? (def(g.fs[0].c.name)?.amount ?? 0) : 0) },
        { key: 'netAmount', type: 'money', get: (g) => round2(sum(g.fs, (f) => f.c.amount) / 1.23) },
        { key: 'tax', type: 'money', get: (g) => round2(sum(g.fs, (f) => f.c.amount) - sum(g.fs, (f) => f.c.amount) / 1.23) },
        { key: 'total', type: 'money', get: (g) => sum(g.fs, (f) => f.c.amount) },
      ],
      (g) => g.k,
      { total: true },
    )
  },
}

// ─── Liabilities ───────────────────────────────────────────────────────────

const liabilitySummary: Spec = {
  slug: 'liability-summary',
  range: 'month_to_date',
  filters: ['location'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const events = applyFilters(liabilityEvents(ctx), p.filters)
    const rows = (['gift_card', 'prepayment'] as const)
      .map((type) => {
        const evs = events.filter((e) => e.liability === type)
        const within = evs.filter((e) => inR(e.date, p.range))
        const by = (act: LiabilityEvent['activity']) => sum(within.filter((e) => e.activity === act), (e) => e.amount)
        const opening = balanceBefore(evs, p.range.from)
        const net = sum(within, (e) => e.amount)
        return { type, opening, collections: by('collection'), redemptions: by('redemption'), expirations: by('expiration'), refunds: by('refund'), closing: round2(opening + net), net }
      })
      .filter((r) => r.opening || r.net || r.collections)
    return listResult(
      rows,
      [
        { key: 'liabilityType', type: 'text', get: (r) => L(`opt.liabilityType.${r.type}`) },
        { key: 'openingBalance', type: 'money', get: (r) => r.opening },
        { key: 'collections', type: 'money', get: (r) => r.collections },
        { key: 'redemptions', type: 'money', get: (r) => r.redemptions },
        { key: 'expirations', type: 'money', get: (r) => r.expirations },
        { key: 'refunds', type: 'money', get: (r) => r.refunds },
        { key: 'closingBalance', type: 'money', get: (r) => r.closing },
        { key: 'netChange', type: 'money', get: (r) => r.net },
      ],
      (r) => r.type,
      { total: true },
    )
  },
}

const liabilityActivity: Spec = {
  slug: 'liability-activity',
  range: 'month_to_date',
  filters: ['location', 'liabilityType', 'activity'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      applyFilters(liabilityEvents(ctx).filter((e) => inR(e.date, p.range)), p.filters).reverse(),
      [
        { key: 'date', type: 'datetime', get: (e) => e.at },
        { key: 'ref', type: 'text', get: (e) => e.ref, link: (e) => (e.appointmentId ? apptLink(e.appointmentId) : undefined) },
        { key: 'liabilityType', type: 'text', get: (e) => L(`opt.liabilityType.${e.liability}`) },
        { key: 'client', type: 'text', get: (e) => ctx.clientName(e.clientId), link: (e) => clientLink(e.clientId) },
        { key: 'saleNo', type: 'text', get: (e) => (e.saleId ? String(ctx.byId.sale.get(e.saleId)?.number ?? '-') : '-'), link: (e) => saleLink(e.saleId) },
        { key: 'location', type: 'text', get: (e) => ctx.locationName(e.locationId) },
        { key: 'activity', type: 'text', get: (e) => L(`opt.activity.${e.activity}`) },
        { key: 'amount', type: 'money', get: (e) => e.amount },
      ],
      (e) => e.key,
      { total: true },
    ),
}

/** Liability balances per time bucket (Gift card / Prepayments by time period). */
function liabilityByPeriod(ctx: Ctx, p: Params, type: LiabilityEvent['liability'], cols: { key: string; calc: (evs: LiabilityEvent[]) => number }[]): Result {
  const unit = (['day', 'week', 'month', 'quarter', 'year'].includes(p.groupBy) ? p.groupBy : 'day') as TimeUnit
  const events = applyFilters(liabilityEvents(ctx).filter((e) => e.liability === type), p.filters)
  const within = events.filter((e) => inR(e.date, p.range))
  const buckets = new Map<string, { label: string; start: string; evs: LiabilityEvent[] }>()
  for (const e of within) {
    const b = timeBucket(unit, e.date)
    const start = bucketRange(unit, b.k)?.from ?? e.date
    const g = buckets.get(b.k)
    if (g) g.evs.push(e)
    else buckets.set(b.k, { label: b.l, start: start < p.range.from ? p.range.from : start, evs: [e] })
  }
  const columns: Col[] = [{ key: 'group', label: L(`dim.${unit}`), type: 'text' }, { key: 'openingBalance', label: L('col.openingBalance'), type: 'money' }, ...cols.map((c) => ({ key: c.key, label: L(`col.${c.key}`), type: 'money' as const })), { key: 'closingBalance', label: L('col.closingBalance'), type: 'money' }]
  const row = (opening: number, evs: LiabilityEvent[]) => {
    const cells: Record<string, Cell> = { openingBalance: opening }
    for (const c of cols) cells[c.key] = c.calc(evs)
    cells.closingBalance = round2(opening + sum(evs, (e) => e.amount))
    return cells
  }
  const rows: Row[] = [...buckets.entries()]
    .sort((a, b) => a[1].start.localeCompare(b[1].start))
    .map(([k, g]) => ({ key: k, cells: { group: g.label, ...row(balanceBefore(events, g.start), g.evs) }, links: unit === 'day' ? undefined : { group: { kind: 'drill', drill: { range: bucketRange(unit, k), groupBy: 'day' } } } }))
  return { columns, rows, total: within.length ? { group: L('total'), ...row(balanceBefore(events, p.range.from), within) } : null }
}

const giftCardByTimePeriod: Spec = {
  slug: 'gift-card-by-time-period',
  range: 'month_to_date',
  groupBy: true,
  groupings: TIME_GROUPINGS,
  filters: ['location'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    liabilityByPeriod(ctx, { ...p, groupBy: p.groupBy || 'day' }, 'gift_card', [
      { key: 'issuedValue', calc: (evs) => sum(evs.filter((e) => e.activity === 'collection'), (e) => e.amount) },
      { key: 'soldValue', calc: (evs) => sum(evs.filter((e) => e.activity === 'collection'), (e) => e.card?.price ?? e.amount) },
      { key: 'expiredValue', calc: (evs) => sum(evs.filter((e) => e.activity === 'expiration'), (e) => e.amount) },
      { key: 'redeemedValue', calc: (evs) => sum(evs.filter((e) => e.activity === 'redemption'), (e) => e.amount) },
      { key: 'refundedValue', calc: (evs) => sum(evs.filter((e) => e.activity === 'refund'), (e) => e.amount) },
    ]),
}

const prepaymentsByTimePeriod: Spec = {
  slug: 'deposits-by-time-period',
  range: 'month_to_date',
  groupBy: true,
  groupings: TIME_GROUPINGS,
  filters: ['location', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    liabilityByPeriod(ctx, { ...p, groupBy: p.groupBy || 'day' }, 'prepayment', [
      { key: 'collections', calc: (evs) => sum(evs.filter((e) => e.activity === 'collection'), (e) => e.amount) },
      { key: 'redemptions', calc: (evs) => sum(evs.filter((e) => e.activity === 'redemption'), (e) => e.amount) },
      { key: 'refunds', calc: (evs) => sum(evs.filter((e) => e.activity === 'refund'), (e) => e.amount) },
    ]),
}

const prepaymentList: Spec = {
  slug: 'deposit-list',
  range: 'month_to_date',
  filters: ['location', 'redemptionStatus', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const events = liabilityEvents(ctx).filter((e) => e.liability === 'prepayment')
    const facts = (ctx.d.appointments ?? [])
      .filter((a) => a.deposit && inR(ctx.day(a.deposit.paidAt), p.range))
      .map((a) => {
        const evs = events.filter((e) => e.appointmentId === a.id)
        const by = (act: LiabilityEvent['activity']) => sum(evs.filter((e) => e.activity === act), (e) => e.amount)
        const status = by('redemption') ? 'redeemed' : by('refund') ? 'refunded' : 'unredeemed'
        return { a: { ...clientAttrs(ctx, a.clientId, a.date), location: a.locationId, redemptionStatus: status }, appt: a, collections: by('collection'), redemptions: by('redemption'), refunds: by('refund'), status }
      })
      .sort((x, y) => y.appt.deposit!.paidAt.localeCompare(x.appt.deposit!.paidAt))
    return listResult(
      applyFilters(facts, p.filters),
      [
        { key: 'apptRef', type: 'text', get: (f) => f.appt.ref, link: (f) => apptLink(f.appt.id) },
        { key: 'date', type: 'date', get: (f) => ctx.day(f.appt.deposit!.paidAt) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.appt.clientId), link: (f) => clientLink(f.appt.clientId) },
        { key: 'collections', type: 'money', get: (f) => f.collections },
        { key: 'redemptions', type: 'money', get: (f) => f.redemptions },
        { key: 'refunds', type: 'money', get: (f) => f.refunds },
        { key: 'closingBalance', type: 'money', get: (f) => round2(f.collections + f.redemptions + f.refunds) },
        { key: 'status', type: 'text', get: (f) => L(`opt.redemptionStatus.${f.status}`) },
        { key: 'scheduledDate', type: 'date', hidden: true, get: (f) => f.appt.date },
      ],
      (f) => f.appt.id,
      { total: true },
    )
  },
}

const taxesList: Spec = {
  slug: 'taxes-list',
  range: 'month_to_date',
  filters: ['location', 'teamMember', 'status', 'taxName'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = applyFilters(lineFacts(ctx).filter((f) => f.rate > 0 && inR(f.date, p.range)), p.filters).sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt))
    return listResult(
      facts,
      [
        { key: 'saleNo', type: 'text', get: (f) => String(f.sale.number), link: (f) => saleLink(f.sale.id) },
        { key: 'saleDate', type: 'datetime', get: (f) => f.sale.createdAt },
        { key: 'status', type: 'text', get: (f) => L(`opt.status.${f.a.status}`) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.sale.locationId) },
        { key: 'type', type: 'text', get: (f) => typeLabel(f.item.type) },
        { key: 'item', type: 'text', get: (f) => f.item.name },
        { key: 'category', type: 'text', get: (f) => (String(f.a.category).startsWith('t_') ? typeLabel(f.item.type) : (ctx.byId.category.get(String(f.a.category))?.name ?? ctx.byId.productCategory.get(String(f.a.category))?.name ?? '-')) },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.item.teamMemberId) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.sale.clientId), link: (f) => clientLink(f.sale.clientId) },
        { key: 'itemsSold', type: 'int', total: true, get: (f) => f.qty },
        { key: 'paymentMethod', type: 'text', get: (f) => [...new Set((ctx.salePayments.get(f.sale.id) ?? []).map((x) => x.methodLabel))].join(', ') || '-' },
        { key: 'netSales', type: 'money', get: (f) => f.net },
        { key: 'taxName', type: 'text', get: (f) => ctx.d.settings.taxRates.find((t) => t.rate === Math.round(f.rate * 100))?.name ?? L('salesTax') },
        { key: 'taxRate', type: 'pct', total: false, get: (f) => round2(f.rate * 100) },
        { key: 'taxOnNetSales', type: 'money', get: (f) => f.tax },
        { key: 'channel', type: 'text', hidden: true, get: (f) => channelLabel(f.sale.channel) },
      ],
      (f) => `${f.sale.id}_${f.item.id}`,
      { total: true },
    )
  },
}

export const FINANCE_SPECS: Spec[] = [
  financeSummary,
  paymentsSummary,
  paymentTransactions,
  cashFlowSummary,
  cashFlowStatement,
  serviceCharges,
  liabilitySummary,
  liabilityActivity,
  prepaymentsByTimePeriod,
  prepaymentList,
  taxesList,
  giftCardByTimePeriod,
]
