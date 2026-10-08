import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { computeTotals, salePaid } from '@/api/sales'
import { round2 } from '@/lib/format'
import type { Appointment, ClientMembership, ClientPackage, ID, Sale } from '@/types'
import type { Ctx } from '../engine/context'
import { channelAttr, channelLabel, clientAttrs, lineFacts, typeLabel, type LineFact } from '../engine/facts'
import { applyFilters, listResult, summarize, sum, type Dim, type Fact, type Measure } from '../engine/helpers'
import { L } from '../engine/labels'
import type { Params, Spec } from '../engine/types'
import { clientLink, inR, lineDims, measures, SALES_GROUPINGS, SALES_SUMMARY_COLUMNS, saleLink } from './common'

const nonGift = (ctx: Ctx, p: Params) => applyFilters(lineFacts(ctx).filter((f) => !f.giftCard && inR(f.date, p.range)), p.filters, p.ranges)

const salesSummary: Spec = {
  slug: 'sales-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: SALES_GROUPINGS,
  filters: ['location', 'teamMember', 'status', 'channel', 'type', 'loyalty', 'clientTags', 'clientSegments', 'clientGender', 'clientRetention', 'supplier', 'brand', 'productCategory', 'serviceCategory'],
  premiumFilters: ['clientGender', 'clientRetention', 'supplier', 'brand', 'productCategory', 'serviceCategory'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims = lineDims(ctx)
    return summarize(nonGift(ctx, p), dims[p.groupBy] ?? dims.type, measures(SALES_SUMMARY_COLUMNS))
  },
}

const salesByTimePeriod: Spec = {
  slug: 'sales-by-time-period',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'hourOfDay' }, { key: 'day' }, { key: 'dayOfWeek' }, { key: 'week' }, { key: 'month' }, { key: 'quarter' }, { key: 'year' }],
  filters: ['channel', 'type', 'clientGender', 'clientRetention', 'location', 'teamMember', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims = lineDims(ctx)
    return summarize(nonGift(ctx, p), dims[p.groupBy] ?? dims.hourOfDay, measures(['salesQty', 'itemsSold', 'grossSales', 'discounts', 'refunds', 'netSales', 'taxes', 'totalSales', 'itemDiscounts', 'cartDiscounts', 'cost', 'margin']))
  },
}

// ─── Sales list / log ──────────────────────────────────────────────────────

interface SaleFact extends Fact {
  sale: Sale
  date: string
  total: number
  due: number
  items: number
  giftCards: number
  charges: number
}

function saleFacts(ctx: Ctx, p: Params): SaleFact[] {
  const out: SaleFact[] = []
  for (const sale of ctx.d.sales ?? []) {
    if (sale.status === 'draft' || sale.status === 'voided') continue
    const date = ctx.day(sale.createdAt)
    if (!inR(date, p.range)) continue
    const t = computeTotals(sale)
    const due = round2(t.total - salePaid(sale, ctx.d.payments))
    out.push({
      sale,
      date,
      total: t.total,
      due: sale.kind === 'refund' ? 0 : Math.max(0, due),
      items: sale.items.reduce((s, i) => s + (sale.kind === 'refund' ? -i.quantity : i.quantity), 0),
      giftCards: round2(sale.items.filter((i) => i.type === 'gift_card').reduce((s, i) => s + i.unitPrice * i.quantity, 0)),
      charges: t.serviceCharges,
      a: { ...clientAttrs(ctx, sale.clientId, date), location: sale.locationId, channel: channelAttr(sale.channel), status: sale.kind === 'refund' ? 'refunded' : sale.status, serviceCharge: sale.serviceCharges.map((c) => c.id) },
      n: { totalSales: t.total, amountDue: due },
    })
  }
  return applyFilters(out, p.filters, p.ranges).sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt))
}

const salesList: Spec = {
  slug: 'sales-list',
  range: 'month_to_date',
  filters: ['status', 'location', 'channel', 'clientGender', 'clientRetention', 'serviceCharge', 'totalSales', 'amountDue', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      saleFacts(ctx, p),
      [
        { key: 'saleNo', type: 'text', get: (f) => String(f.sale.number), link: (f) => saleLink(f.sale.id) },
        { key: 'saleDate', type: 'datetime', get: (f) => f.sale.createdAt },
        { key: 'saleStatus', type: 'text', get: (f) => L(`opt.status.${f.a.status}`) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.sale.locationId) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.sale.clientId), link: (f) => clientLink(f.sale.clientId) },
        { key: 'channel', type: 'text', get: (f) => channelLabel(f.sale.channel) },
        { key: 'itemsSold', type: 'int', total: true, get: (f) => f.items },
        { key: 'totalSales', type: 'money', get: (f) => f.total },
        { key: 'giftCard', type: 'money', get: (f) => f.giftCards },
        { key: 'serviceCharges', type: 'money', get: (f) => f.charges },
        { key: 'amountDue', type: 'money', get: (f) => f.due },
        { key: 'createdBy', type: 'text', hidden: true, get: (f) => f.sale.createdBy },
        { key: 'tips', type: 'money', hidden: true, get: (f) => sum(f.sale.tips, (t) => t.amount) },
      ],
      (f) => f.sale.id,
      { total: true },
    ),
}

const salesLogDetail: Spec = {
  slug: 'sales-log-detail',
  range: 'month_to_date',
  filters: ['location', 'type', 'teamMember', 'channel', 'clientGender', 'clientRetention', 'discountCategory', 'discountType', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = applyFilters(lineFacts(ctx).filter((f) => inR(f.date, p.range)), p.filters, p.ranges).sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt))
    const catName = (f: LineFact) => {
      const c = String(f.a.category)
      return c.startsWith('t_') ? typeLabel(f.item.type) : (ctx.byId.category.get(c)?.name ?? ctx.byId.productCategory.get(c)?.name ?? '-')
    }
    return listResult(
      facts,
      [
        { key: 'date', type: 'datetime', get: (f) => f.sale.createdAt },
        { key: 'saleNo', type: 'text', get: (f) => String(f.sale.number), link: (f) => saleLink(f.sale.id) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.sale.locationId) },
        { key: 'type', type: 'text', get: (f) => typeLabel(f.item.type) },
        { key: 'item', type: 'text', get: (f) => f.item.name },
        { key: 'category', type: 'text', get: catName },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.sale.clientId), link: (f) => clientLink(f.sale.clientId) },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.item.teamMemberId) },
        { key: 'channel', type: 'text', get: (f) => channelLabel(f.sale.channel) },
        { key: 'grossSales', type: 'money', get: (f) => f.gross },
        { key: 'itemDiscounts', type: 'money', get: (f) => -f.itemDiscEx },
        { key: 'cartDiscounts', type: 'money', get: (f) => -f.cartDiscEx },
        { key: 'totalDiscounts', type: 'money', get: (f) => -round2(f.itemDiscEx + f.cartDiscEx) },
        { key: 'refunds', type: 'money', get: (f) => f.refunds },
        { key: 'netSales', type: 'money', get: (f) => f.net },
        { key: 'taxesOnNetSales', type: 'money', get: (f) => f.tax },
        { key: 'totalSales', type: 'money', get: (f) => f.netIncl },
        { key: 'itemsSold', type: 'int', hidden: true, total: true, get: (f) => f.qty },
        { key: 'cost', type: 'money', hidden: true, get: (f) => f.cost },
      ],
      (f) => `${f.sale.id}_${f.item.id}`,
      { total: true },
    )
  },
}

// ─── Gift cards ────────────────────────────────────────────────────────────

const giftCardList: Spec = {
  slug: 'gift-card-list',
  range: 'month_to_date',
  filters: ['location', 'teamMember', 'redeemed', 'giftCardStatus'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = (ctx.d.giftCards ?? [])
      .filter((g) => inR(ctx.day(g.issuedAt), p.range))
      .map((g) => {
        const sale = ctx.byId.sale.get(g.saleId)
        const expired = g.status === 'expired' || (g.expiresAt && g.expiresAt < ctx.today && g.balance > 0)
        return {
          g,
          sale,
          redemptions: round2(g.value - g.balance - (expired ? 0 : 0)),
          expirations: expired ? g.balance : 0,
          closing: expired || g.status === 'cancelled' ? 0 : g.balance,
          a: {
            location: sale?.locationId ?? 'none',
            teamMember: sale?.items.find((i) => i.giftCardId === g.id)?.teamMemberId ?? 'none',
            redeemed: g.balance < g.value ? 'yes' : 'no',
            giftCardStatus: expired && g.status === 'active' ? 'expired' : g.status,
          },
        }
      })
      .sort((a, b) => b.g.issuedAt.localeCompare(a.g.issuedAt))
    return listResult(
      applyFilters(facts, p.filters, p.ranges),
      [
        { key: 'code', type: 'text', get: (f) => f.g.customCode ?? f.g.code },
        { key: 'saleNo', type: 'text', get: (f) => (f.sale ? String(f.sale.number) : '-'), link: (f) => saleLink(f.sale?.id) },
        { key: 'purchasedBy', type: 'text', get: (f) => ctx.clientName(f.g.purchaserClientId), link: (f) => clientLink(f.g.purchaserClientId) },
        { key: 'status', type: 'text', get: (f) => L(`opt.giftCardStatus.${f.a.giftCardStatus}`) },
        { key: 'issueDate', type: 'date', get: (f) => ctx.day(f.g.issuedAt) },
        { key: 'expiryDate', type: 'date', get: (f) => f.g.expiresAt ?? L('never') },
        { key: 'issuedValue', type: 'money', get: (f) => f.g.value },
        { key: 'discount', type: 'money', get: (f) => round2(f.g.price - f.g.value) },
        { key: 'totalSales', type: 'money', get: (f) => f.g.price },
        { key: 'redemptions', type: 'money', get: (f) => -f.redemptions },
        { key: 'expirations', type: 'money', get: (f) => -f.expirations },
        { key: 'closingBalance', type: 'money', get: (f) => f.closing },
      ],
      (f) => f.g.id,
      { total: true },
    )
  },
}

// ─── Memberships ───────────────────────────────────────────────────────────

const membershipRedemptions = (ctx: Ctx, cm: ClientMembership): Appointment[] => {
  const def = ctx.byId.membership.get(cm.membershipId)
  const ids = new Set(def?.benefits.flatMap((b) => b.serviceIds) ?? [])
  return (ctx.d.appointments ?? []).filter((a) => a.clientId === cm.clientId && a.status === 'completed' && a.date >= cm.startDate && a.items.some((i) => ids.has(i.serviceId)))
}

const membershipPaid = (ctx: Ctx, cm: ClientMembership) =>
  round2((ctx.d.sales ?? []).filter((s) => s.status === 'completed').reduce((s, sale) => s + sale.items.filter((i) => i.clientMembershipId === cm.id).reduce((x, i) => x + i.unitPrice * i.quantity, 0), 0))

const cmFacts = (ctx: Ctx, p: Params) =>
  applyFilters(
    (ctx.d.clientMemberships ?? [])
      .filter((cm) => inR(cm.startDate, p.range))
      .map((cm) => {
        const def = ctx.byId.membership.get(cm.membershipId)
        const sale = ctx.byId.sale.get(cm.saleId)
        const paid = membershipPaid(ctx, cm)
        return {
          cm,
          def,
          sale,
          paid,
          redemptions: membershipRedemptions(ctx, cm),
          a: { ...clientAttrs(ctx, cm.clientId, cm.startDate), location: sale?.locationId ?? 'none', membershipStatus: cm.status, service: def?.benefits.flatMap((b) => b.serviceIds) ?? [], membershipId: cm.id, membershipName: cm.membershipId, paymentFrequency: def?.interval ?? 'month' },
          n: { saleValue: paid },
        }
      }),
    p.filters,
    p.ranges,
  )

const membershipCode = (id: ID) => id.replace('cmem_', 'M-').toUpperCase()

const membershipsList: Spec = {
  slug: 'membership-list-v2',
  range: 'all_time',
  filters: ['location', 'membershipStatus', 'service', 'membershipId', 'membershipName', 'client', 'paymentFrequency', 'saleValue'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      cmFacts(ctx, p),
      [
        { key: 'membershipId', type: 'text', get: (f) => membershipCode(f.cm.id) },
        { key: 'membershipName', type: 'text', get: (f) => f.def?.name ?? '-' },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.cm.clientId), link: (f) => clientLink(f.cm.clientId) },
        { key: 'membershipStatus', type: 'text', get: (f) => L(`opt.membershipStatus.${f.cm.status}`) },
        { key: 'saleDate', type: 'date', get: (f) => (f.sale ? ctx.day(f.sale.createdAt) : f.cm.startDate) },
        { key: 'startDate', type: 'date', get: (f) => f.cm.startDate },
        { key: 'nextBillingDate', type: 'date', get: (f) => f.cm.nextBillingAt },
        { key: 'paymentFrequency', type: 'text', get: (f) => L(`opt.paymentFrequency.${f.def?.interval ?? 'month'}`) },
        { key: 'soldLocation', type: 'text', get: (f) => ctx.locationName(f.sale?.locationId) },
        { key: 'membershipSaleValue', type: 'money', get: (f) => f.cm.price },
        { key: 'paymentsCollected', type: 'money', get: (f) => f.paid },
        { key: 'redemptions', type: 'int', total: true, get: (f) => f.redemptions.length },
      ],
      (f) => f.cm.id,
      { total: true },
    ),
}

const membershipsSummary: Spec = {
  slug: 'membership-summary-v2',
  range: 'all_time',
  filters: ['location', 'membershipStatus', 'membershipName', 'client'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    type F = ReturnType<typeof cmFacts>[number]
    const dim: Dim<F> = { key: 'membershipName', filterKey: 'membershipName', next: 'membershipName', get: (f) => ({ k: f.cm.membershipId, l: f.def?.name ?? '-' }) }
    const ms: Measure<F>[] = [
      { key: 'membershipsSold', type: 'int', calc: (fs) => fs.length },
      { key: 'activeMemberships', type: 'int', calc: (fs) => fs.filter((f) => f.cm.status === 'active').length },
      { key: 'cancelledMemberships', type: 'int', calc: (fs) => fs.filter((f) => f.cm.status === 'canceled').length },
      { key: 'totalClients', type: 'int', calc: (fs) => new Set(fs.map((f) => f.cm.clientId)).size },
      { key: 'paymentsCollected', type: 'money', calc: (fs) => sum(fs, (f) => f.paid) },
      { key: 'redemptions', type: 'int', calc: (fs) => fs.reduce((s, f) => s + f.redemptions.length, 0) },
      { key: 'redemptionValue', type: 'money', calc: (fs) => sum(fs, (f) => sum(f.redemptions, (a) => a.items.reduce((x, i) => x + i.price, 0))) },
    ]
    const res = summarize(cmFacts(ctx, p), dim, ms)
    res.rows.forEach((r) => delete r.links)
    return res
  },
}

const membershipsBenefits: Spec = {
  slug: 'memberships-benefits-consumption',
  range: 'all_time',
  filters: ['location', 'redemptionLocation', 'membershipStatus', 'membershipName', 'benefitUsageType', 'benefitStatus', 'redemptionType', 'recognizedRevenue', 'deferredRevenue'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const rows = cmFacts(ctx, { ...p, filters: {}, ranges: {} }).flatMap((f) => {
      const benefit = f.def?.benefits[0]
      const unlimited = benefit?.sessions === 'unlimited'
      const value = f.cm.price
      let recognized = 0
      return f.redemptions.map((a) => {
        const item = a.items[0]
        const share = unlimited ? round2(value / Math.max(1, f.redemptions.length)) : round2(value / Number(benefit?.sessions || 1))
        recognized = round2(recognized + share)
        return {
          f,
          a: a,
          item,
          share,
          recognized,
          deferred: Math.max(0, round2(f.paid - recognized)),
          aa: { location: f.sale?.locationId ?? 'none', redemptionLocation: a.locationId, membershipStatus: f.cm.status, membershipName: f.cm.membershipId, benefitUsageType: unlimited ? 'unlimited' : 'limited', benefitStatus: 'redeemed', redemptionType: 'appointment' },
        }
      })
    })
    const facts = applyFilters(
      rows.map((r) => ({ ...r, a2: r.a, a: r.aa, n: { recognizedRevenue: r.recognized, deferredRevenue: r.deferred } })),
      p.filters,
      p.ranges,
    )
    return listResult(
      facts,
      [
        { key: 'membershipId', type: 'text', get: (r) => membershipCode(r.f.cm.id) },
        { key: 'membershipName', type: 'text', get: (r) => r.f.def?.name ?? '-' },
        { key: 'redemptionSaleId', type: 'text', get: (r) => (r.a2.saleId ? String(ctx.byId.sale.get(r.a2.saleId)?.number ?? '-') : '-'), link: (r) => saleLink(r.a2.saleId) },
        { key: 'benefitName', type: 'text', get: (r) => r.item.name },
        { key: 'membershipStatus', type: 'text', get: (r) => L(`opt.membershipStatus.${r.f.cm.status}`) },
        { key: 'saleDate', type: 'date', get: (r) => (r.f.sale ? ctx.day(r.f.sale.createdAt) : r.f.cm.startDate) },
        { key: 'startDate', type: 'date', get: (r) => r.f.cm.startDate },
        { key: 'endDate', type: 'date', get: (r) => r.f.cm.nextBillingAt },
        { key: 'soldLocation', type: 'text', get: (r) => ctx.locationName(r.f.sale?.locationId) },
        { key: 'redemptionLocation', type: 'text', get: (r) => ctx.locationName(r.a2.locationId) },
        { key: 'benefitUsageType', type: 'text', get: (r) => L(`opt.benefitUsageType.${r.a.benefitUsageType}`) },
        { key: 'benefitStatus', type: 'text', get: () => L('opt.benefitStatus.redeemed') },
        { key: 'redemptionType', type: 'text', get: () => L('opt.redemptionType.appointment') },
        { key: 'redemptionDate', type: 'date', get: (r) => r.a2.date },
        { key: 'membershipDuration', type: 'text', get: (r) => L(`opt.paymentFrequency.${r.f.def?.interval ?? 'month'}`) },
        { key: 'membershipSaleValue', type: 'money', get: (r) => r.f.cm.price },
        { key: 'valueOfBenefit', type: 'money', get: (r) => r.item.price },
        { key: 'recognizedRevenue', type: 'money', get: (r) => r.share },
        { key: 'deferredRevenue', type: 'money', get: (r) => r.deferred },
      ],
      (r) => `${r.f.cm.id}_${r.a2.id}`,
      { total: true },
    )
  },
}

// ─── Packages ──────────────────────────────────────────────────────────────

const pkgTotals = (ctx: Ctx, cp: ClientPackage) => {
  const def = ctx.byId.packageDef.get(cp.packageId)
  const included = def?.benefits.reduce((s, b) => s + (b.quantity === 'unlimited' ? 0 : b.quantity), 0) ?? 0
  const used = cp.usage.reduce((s, u) => s + u.used, 0)
  const perSession = included ? round2(cp.price / included) : 0
  const expired = cp.expiresAt < ctx.today && cp.status === 'active'
  return { def, included, used, remaining: Math.max(0, included - used), perSession, status: expired ? 'expired' : used >= included && included ? 'used' : cp.status }
}

const pkgFacts = (ctx: Ctx, p: Params) =>
  applyFilters(
    (ctx.d.clientPackages ?? [])
      .filter((cp) => inR(cp.startDate, p.range))
      .map((cp) => {
        const t = pkgTotals(ctx, cp)
        const sale = ctx.byId.sale.get(cp.saleId)
        return { cp, sale, ...t, a: { ...clientAttrs(ctx, cp.clientId, cp.startDate), location: sale?.locationId ?? 'none', packageStatus: t.status, packageName: cp.packageId, benefits: t.def?.benefits.flatMap((b) => b.serviceIds ?? []) ?? [] }, n: { saleValue: cp.price } }
      })
      .sort((a, b) => b.cp.startDate.localeCompare(a.cp.startDate)),
    p.filters,
    p.ranges,
  )

const packagesList: Spec = {
  slug: 'packages-list',
  range: 'all_time',
  filters: ['location', 'packageStatus', 'packageName', 'saleValue'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      pkgFacts(ctx, p),
      [
        { key: 'packageName', type: 'text', get: (f) => f.def?.name ?? '-' },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.cp.clientId), link: (f) => clientLink(f.cp.clientId) },
        { key: 'saleNo', type: 'text', get: (f) => (f.sale ? String(f.sale.number) : '-'), link: (f) => saleLink(f.sale?.id) },
        { key: 'packageStatus', type: 'text', get: (f) => L(`opt.packageStatus.${f.status}`) },
        { key: 'packageSaleDate', type: 'date', get: (f) => f.cp.startDate },
        { key: 'packageExpirationDate', type: 'date', get: (f) => f.cp.expiresAt },
        { key: 'soldLocation', type: 'text', get: (f) => ctx.locationName(f.sale?.locationId) },
        { key: 'sessionsIncluded', type: 'int', total: true, get: (f) => f.included },
        { key: 'sessionsRedeemed', type: 'int', total: true, get: (f) => f.used },
        { key: 'sessionsRemaining', type: 'int', total: true, get: (f) => f.remaining },
        { key: 'packageSaleValue', type: 'money', get: (f) => f.cp.price },
        { key: 'redeemedValue', type: 'money', get: (f) => round2(f.used * f.perSession) },
        { key: 'unredeemedValue', type: 'money', get: (f) => round2(f.remaining * f.perSession) },
      ],
      (f) => f.cp.id,
      { total: true },
    ),
}

const packagesSummary: Spec = {
  slug: 'packages-summary',
  range: 'all_time',
  groupBy: true,
  groupings: [{ key: 'packageName' }, { key: 'location' }, { key: 'packageStatus' }],
  filters: ['location', 'packageStatus', 'packageName', 'benefits'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    type F = ReturnType<typeof pkgFacts>[number]
    const dims: Record<string, Dim<F>> = {
      packageName: { key: 'packageName', filterKey: 'packageName', next: 'location', get: (f) => ({ k: f.cp.packageId, l: f.def?.name ?? '-' }) },
      location: { key: 'location', filterKey: 'location', next: 'packageName', get: (f) => ({ k: String(f.a.location), l: ctx.locationName(f.sale?.locationId) }) },
      packageStatus: { key: 'packageStatus', filterKey: 'packageStatus', next: 'packageName', get: (f) => ({ k: f.status, l: L(`opt.packageStatus.${f.status}`) }) },
    }
    const ms: Measure<F>[] = [
      { key: 'packagesSold', type: 'int', calc: (fs) => fs.length },
      { key: 'activePackages', type: 'int', calc: (fs) => fs.filter((f) => f.status === 'active').length },
      { key: 'sessionsIncluded', type: 'int', calc: (fs) => fs.reduce((s, f) => s + f.included, 0) },
      { key: 'sessionsRedeemed', type: 'int', calc: (fs) => fs.reduce((s, f) => s + f.used, 0) },
      { key: 'sessionsRemaining', type: 'int', calc: (fs) => fs.reduce((s, f) => s + f.remaining, 0) },
      { key: 'packageSaleValue', type: 'money', calc: (fs) => sum(fs, (f) => f.cp.price) },
      { key: 'redeemedValue', type: 'money', calc: (fs) => sum(fs, (f) => f.used * f.perSession) },
      { key: 'unredeemedValue', type: 'money', calc: (fs) => sum(fs, (f) => f.remaining * f.perSession) },
    ]
    return summarize(pkgFacts(ctx, p), dims[p.groupBy] ?? dims.packageName, ms)
  },
}

const packagesBenefits: Spec = {
  slug: 'packages-benefits-consumption',
  range: 'all_time',
  filters: ['location', 'redemptionLocation', 'packageStatus', 'packageName', 'benefitUsageType', 'benefitStatus', 'redemptionType', 'recognizedRevenue', 'deferredRevenue'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const rows = pkgFacts(ctx, { ...p, filters: {}, ranges: {} }).flatMap((f) => {
      const benefit = f.def?.benefits[0]
      const ids = new Set(benefit?.serviceIds ?? [])
      const appts = (ctx.d.appointments ?? []).filter((a) => a.clientId === f.cp.clientId && a.status === 'completed' && a.date >= f.cp.startDate && a.items.some((i) => ids.has(i.serviceId))).slice(0, Math.max(f.used, 0))
      const duration = differenceInCalendarDays(parseISO(f.cp.expiresAt), parseISO(f.cp.startDate))
      const active = Math.max(0, Math.min(duration, differenceInCalendarDays(parseISO(ctx.today), parseISO(f.cp.startDate))))
      let recognized = 0
      const redeemedRows = appts.map((a) => {
        recognized = round2(recognized + f.perSession)
        return { f, appt: a as Appointment | undefined, status: 'redeemed', recognized: f.perSession, deferred: round2(f.cp.price - recognized), duration, active }
      })
      const available = Array.from({ length: f.remaining }, () => ({ f, appt: undefined as Appointment | undefined, status: 'available', recognized: 0, deferred: round2(f.cp.price - recognized), duration, active }))
      return [...redeemedRows, ...available]
    })
    const facts = applyFilters(
      rows.map((r, i) => ({ ...r, i, a: { location: r.f.sale?.locationId ?? 'none', redemptionLocation: r.appt?.locationId ?? 'none', packageStatus: r.f.status, packageName: r.f.cp.packageId, benefitUsageType: 'limited', benefitStatus: r.status, redemptionType: 'appointment' }, n: { recognizedRevenue: r.recognized, deferredRevenue: r.deferred } })),
      p.filters,
      p.ranges,
    )
    return listResult(
      facts,
      [
        { key: 'packageName', type: 'text', get: (r) => r.f.def?.name ?? '-' },
        { key: 'redemptionSaleId', type: 'text', get: (r) => (r.appt?.saleId ? String(ctx.byId.sale.get(r.appt.saleId)?.number ?? '-') : '-'), link: (r) => saleLink(r.appt?.saleId) },
        { key: 'benefitName', type: 'text', get: (r) => ctx.byId.service.get(r.f.def?.benefits[0]?.serviceIds?.[0] ?? '')?.name ?? '-' },
        { key: 'packageStatus', type: 'text', get: (r) => L(`opt.packageStatus.${r.f.status}`) },
        { key: 'packageSaleDate', type: 'date', get: (r) => r.f.cp.startDate },
        { key: 'packageExpirationDate', type: 'date', get: (r) => r.f.cp.expiresAt },
        { key: 'soldLocation', type: 'text', get: (r) => ctx.locationName(r.f.sale?.locationId) },
        { key: 'redemptionLocation', type: 'text', get: (r) => (r.appt ? ctx.locationName(r.appt.locationId) : '-') },
        { key: 'benefitUsageType', type: 'text', get: () => L('opt.benefitUsageType.limited') },
        { key: 'benefitStatus', type: 'text', get: (r) => L(`opt.benefitStatus.${r.status}`) },
        { key: 'redemptionType', type: 'text', get: (r) => (r.appt ? L('opt.redemptionType.appointment') : '-') },
        { key: 'redemptionDate', type: 'date', get: (r) => r.appt?.date ?? '-' },
        { key: 'packageDuration', type: 'int', total: false, get: (r) => r.duration },
        { key: 'daysToExpiration', type: 'int', total: false, get: (r) => Math.max(0, differenceInCalendarDays(parseISO(r.f.cp.expiresAt), parseISO(ctx.today))) },
        { key: 'daysActive', type: 'int', total: false, get: (r) => r.active },
        { key: 'dailyRevenueRecognition', type: 'money', total: false, get: (r) => (r.duration ? round2(r.f.cp.price / r.duration) : 0) },
        { key: 'packageSaleValue', type: 'money', total: false, get: (r) => r.f.cp.price },
        { key: 'valueOfBenefit', type: 'money', get: (r) => r.f.perSession },
        { key: 'recognizedRevenue', type: 'money', get: (r) => r.recognized },
        { key: 'deferredRevenue', type: 'money', total: false, get: (r) => r.deferred },
      ],
      (r) => `${r.f.cp.id}_${r.i}`,
      { total: true },
    )
  },
}

// ─── Cash register summary ─────────────────────────────────────────────────

const cashRegisterSummary: Spec = {
  slug: 'cash-register-summary',
  range: 'month_to_date',
  filters: ['location', 'register', 'openedBy'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = (ctx.d.registerSessions ?? [])
      .filter((s) => inR(ctx.day(s.openedAt), p.range))
      .map((s) => {
        const reg = ctx.byId.register.get(s.registerId)
        const end = s.closedAt ?? ctx.nowIso
        const locPays = (ctx.d.payments ?? []).filter((x) => x.status === 'succeeded' && x.locationId === reg?.locationId && x.at >= s.openedAt && x.at <= end)
        const cash = round2((ctx.d.payments ?? []).filter((x) => x.registerSessionId === s.id && x.status === 'succeeded').reduce((t, x) => t + x.amount, 0))
        const by = (ms: string[]) => round2(locPays.filter((x) => ms.includes(x.method)).reduce((t, x) => t + x.amount, 0))
        const cashIn = round2(s.movements.filter((m) => m.type === 'cash_in').reduce((t, m) => t + m.amount, 0))
        const cashOut = round2(s.movements.filter((m) => m.type === 'cash_out').reduce((t, m) => t + Math.abs(m.amount), 0))
        const cashTotal = round2(s.openingFloat + cash + cashIn - cashOut)
        const counted = s.counted?.cash
        const tips = round2(locPays.filter((x) => x.kind === 'sale').reduce((t, x) => t + (ctx.byId.sale.get(x.saleId)?.tips.reduce((a, b) => a + b.amount, 0) ?? 0), 0))
        const terminals = by(['card_terminal'])
        const online = by(['online_card', 'self_checkout', 'qr_code', 'manual_card'])
        const redemptions = by(['gift_card'])
        const custom = by(['other', 'custom'])
        return {
          s,
          reg,
          terminals,
          online,
          redemptions,
          custom,
          cash,
          cashIn,
          cashOut,
          cashTotal,
          counted,
          tips,
          a: { location: reg?.locationId ?? 'none', register: s.registerId, openedBy: s.openedBy },
        }
      })
      .sort((a, b) => b.s.openedAt.localeCompare(a.s.openedAt))
    const period = (f: (typeof facts)[number]) => `${format(parseISO(f.s.openedAt), 'dd MMM yyyy, h:mmaaa')} – ${f.s.closedAt ? format(parseISO(f.s.closedAt), 'dd MMM yyyy, h:mmaaa') : L('open')}`
    return listResult(
      applyFilters(facts, p.filters, p.ranges),
      [
        { key: 'date', type: 'text', get: period },
        { key: 'register', type: 'text', get: (f) => `${f.reg?.name ?? '-'} · ${ctx.locationName(f.reg?.locationId)}` },
        { key: 'openingBy', type: 'text', get: (f) => f.s.openedBy },
        { key: 'brandTerminals', type: 'money', get: (f) => f.terminals },
        { key: 'brandOnline', type: 'money', get: (f) => f.online },
        { key: 'redemptions', type: 'money', get: (f) => f.redemptions },
        { key: 'customMethods', type: 'money', get: (f) => f.custom },
        { key: 'cashOpeningFloat', type: 'money', get: (f) => f.s.openingFloat },
        { key: 'cashPayments', type: 'money', get: (f) => f.cash },
        { key: 'cashIn', type: 'money', get: (f) => f.cashIn },
        { key: 'cashOut', type: 'money', get: (f) => -f.cashOut },
        { key: 'cashTotal', type: 'money', get: (f) => f.cashTotal },
        { key: 'cashCounted', type: 'money', get: (f) => f.counted ?? 0 },
        { key: 'cashDifference', type: 'money', get: (f) => (f.counted === undefined ? 0 : round2(f.counted - f.cashTotal)) },
        { key: 'customMethodsDifference', type: 'money', get: () => 0 },
        { key: 'totalBalance', type: 'money', get: (f) => round2(f.terminals + f.online + f.redemptions + f.custom + f.cash) },
        { key: 'ofWhichTips', type: 'money', get: (f) => f.tips },
        { key: 'closedBy', type: 'text', get: (f) => f.s.closedBy ?? '-' },
        { key: 'counted', type: 'text', get: (f) => (f.counted === undefined ? L('no') : L('yes')) },
        { key: 'cashToBank', type: 'money', get: (f) => f.s.cashToBank ?? 0 },
        { key: 'cashClosingFloat', type: 'money', get: (f) => f.s.closingFloat ?? 0 },
      ],
      (f) => f.s.id,
      { total: true },
    )
  },
}

// ─── Discounts and taxes ───────────────────────────────────────────────────

const discountSummary: Spec = {
  slug: 'discount-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'discountCategory' }, { key: 'discountType' }, { key: 'discountName' }, { key: 'item' }, { key: 'type' }, { key: 'teamMember' }, { key: 'location' }, { key: 'client' }],
  filters: ['type', 'discountCategory', 'discountType', 'location', 'teamMember', 'clientGender', 'clientRetention', 'cartDiscounts', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims = lineDims(ctx)
    const facts = nonGift(ctx, p).filter((f) => !f.refund && (f.itemDisc || f.cartDisc))
    return summarize(facts, dims[p.groupBy] ?? dims.discountCategory, measures(['itemsDiscounted', 'grossSales', 'itemDiscounts', 'cartDiscounts', 'totalDiscounts', 'totalDiscountPct']).map((m) => ({ ...m, hidden: false })))
  },
}

const taxesSummary: Spec = {
  slug: 'taxes-summary',
  range: 'month_to_date',
  filters: ['location', 'channel', 'clientGender', 'clientRetention'],
  premiumFilters: ['clientGender'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = nonGift(ctx, p).filter((f) => f.rate > 0)
    const groups = new Map<string, LineFact[]>()
    for (const f of facts) {
      const k = `${f.rate}|${f.sale.locationId}`
      groups.set(k, [...(groups.get(k) ?? []), f])
    }
    const taxName = (rate: number) => ctx.d.settings.taxRates.find((t) => t.rate === Math.round(rate * 100))?.name ?? L('salesTax')
    const charges = (fs: LineFact[]) => {
      const sales = new Map(fs.map((f) => [f.sale.id, f.sale]))
      return round2([...sales.values()].reduce((s, sale) => s + computeTotals(sale).serviceCharges * (0.23 / 1.23), 0))
    }
    return listResult(
      [...groups.entries()].map(([k, fs]) => ({ k, fs, rate: fs[0].rate, loc: fs[0].sale.locationId })),
      [
        { key: 'taxType', type: 'text', get: (g) => taxName(g.rate) },
        { key: 'location', type: 'text', get: (g) => ctx.locationName(g.loc) },
        { key: 'taxRate', type: 'pct', total: false, get: (g) => round2(g.rate * 100) },
        { key: 'itemsSold', type: 'int', total: true, get: (g) => g.fs.reduce((s, f) => s + f.qty, 0) },
        { key: 'taxesOnNetSales', type: 'money', get: (g) => sum(g.fs, (f) => f.tax) },
        { key: 'taxOnServiceCharges', type: 'money', get: (g) => charges(g.fs) },
        { key: 'totalTax', type: 'money', get: (g) => round2(sum(g.fs, (f) => f.tax) + charges(g.fs)) },
      ],
      (g) => g.k,
      { total: true },
    )
  },
}

export const SALES_SPECS: Spec[] = [
  salesSummary,
  salesByTimePeriod,
  salesList,
  salesLogDetail,
  giftCardList,
  membershipsList,
  membershipsSummary,
  membershipsBenefits,
  packagesList,
  packagesSummary,
  packagesBenefits,
  cashRegisterSummary,
  discountSummary,
  taxesSummary,
]
