import { round2 } from '@/lib/format'
import type { ID } from '@/types'
import type { Ctx } from '../engine/context'
import { channelLabel, typeLabel, type LineFact } from '../engine/facts'
import { pct, timeBucket, type Dim, type DimVal, type Measure, type TimeUnit } from '../engine/helpers'
import { L } from '../engine/labels'
import type { GroupingOpt, Link, Range } from '../engine/types'

export const saleLink = (id: ID | undefined): Link | undefined => (id ? { kind: 'sale', id } : undefined)
export const clientLink = (id: ID | null | undefined): Link | undefined => (id ? { kind: 'client', id } : undefined)
export const apptLink = (id: ID | undefined): Link | undefined => (id ? { kind: 'appointment', id } : undefined)

export const inR = (date: string, r: Range) => date >= r.from && date <= r.to

const absSum = (fs: LineFact[], fn: (f: LineFact) => number) => round2(fs.reduce((s, f) => s + fn(f), 0))
const net = (fs: LineFact[]) => absSum(fs, (f) => f.net)
const itemsSold = (fs: LineFact[]) => fs.reduce((s, f) => s + f.qty, 0)
const salesQty = (fs: LineFact[]) => fs.reduce((s, f) => s + Math.abs(f.qty), 0)
const disc = (fs: LineFact[]) => -absSum(fs, (f) => f.itemDiscEx + f.cartDiscEx)
const upsell = (fs: LineFact[]) => fs.filter((f) => f.upsell)

/** Every measure available on sale lines (Customize › Columns lists them all). */
export const LINE_MEASURES: Record<string, Measure<LineFact>> = {
  salesQty: { key: 'salesQty', type: 'int', calc: salesQty },
  itemsSold: { key: 'itemsSold', type: 'int', calc: itemsSold },
  grossSales: { key: 'grossSales', type: 'money', calc: (fs) => absSum(fs, (f) => f.gross) },
  totalDiscounts: { key: 'totalDiscounts', type: 'money', calc: disc },
  discounts: { key: 'discounts', type: 'money', calc: disc },
  refunds: { key: 'refunds', type: 'money', calc: (fs) => absSum(fs, (f) => f.refunds) },
  netSales: { key: 'netSales', type: 'money', calc: net },
  taxes: { key: 'taxes', type: 'money', calc: (fs) => absSum(fs, (f) => f.tax) },
  totalSales: { key: 'totalSales', type: 'money', calc: (fs) => absSum(fs, (f) => f.netIncl) },
  itemDiscounts: { key: 'itemDiscounts', type: 'money', hidden: true, calc: (fs) => -absSum(fs, (f) => f.itemDiscEx) },
  cartDiscounts: { key: 'cartDiscounts', type: 'money', hidden: true, calc: (fs) => -absSum(fs, (f) => f.cartDiscEx) },
  totalDiscountPct: { key: 'totalDiscountPct', type: 'pct', hidden: true, calc: (fs) => pct(-disc(fs), absSum(fs, (f) => f.gross)) },
  itemsDiscounted: { key: 'itemsDiscounted', type: 'int', hidden: true, calc: (fs) => fs.filter((f) => f.itemDisc || f.cartDisc).reduce((s, f) => s + f.qty, 0) },
  cost: { key: 'cost', type: 'money', hidden: true, calc: (fs) => absSum(fs, (f) => f.cost) },
  margin: { key: 'margin', type: 'money', hidden: true, calc: (fs) => round2(net(fs) - absSum(fs, (f) => f.cost)) },
  marginPct: { key: 'marginPct', type: 'pct', hidden: true, calc: (fs) => pct(net(fs) - absSum(fs, (f) => f.cost), net(fs)) },
  upsellQty: { key: 'upsellQty', type: 'int', hidden: true, calc: (fs) => itemsSold(upsell(fs)) },
  upsellNetSales: { key: 'upsellNetSales', type: 'money', hidden: true, calc: (fs) => net(upsell(fs)) },
  upsellPctNet: { key: 'upsellPctNet', type: 'pct', hidden: true, calc: (fs) => pct(net(upsell(fs)), net(fs)) },
  upsellPctItems: { key: 'upsellPctItems', type: 'pct', hidden: true, calc: (fs) => pct(itemsSold(upsell(fs)), itemsSold(fs)) },
  upsellPctQty: { key: 'upsellPctQty', type: 'pct', hidden: true, calc: (fs) => pct(salesQty(upsell(fs)), salesQty(fs)) },
  avgNetPerItem: { key: 'avgNetPerItem', type: 'money', hidden: true, calc: (fs) => (itemsSold(fs) ? round2(net(fs) / itemsSold(fs)) : 0) },
  serviceNetSales: { key: 'serviceNetSales', type: 'money', hidden: true, calc: (fs) => net(fs.filter((f) => f.item.type === 'service' || f.item.type === 'service_addon')) },
  productNetSales: { key: 'productNetSales', type: 'money', hidden: true, calc: (fs) => net(fs.filter((f) => f.item.type === 'product')) },
  otherNetSales: { key: 'otherNetSales', type: 'money', hidden: true, calc: (fs) => net(fs.filter((f) => !['service', 'service_addon', 'product'].includes(f.item.type))) },
  avgTaxRate: { key: 'avgTaxRate', type: 'pct', hidden: true, calc: (fs) => pct(absSum(fs, (f) => f.tax), net(fs)) },
}

export const measures = (keys: string[]) => keys.map((k) => LINE_MEASURES[k])

export const SALES_SUMMARY_COLUMNS = ['salesQty', 'itemsSold', 'grossSales', 'totalDiscounts', 'refunds', 'netSales', 'taxes', 'totalSales', 'itemDiscounts', 'cartDiscounts', 'totalDiscountPct', 'itemsDiscounted', 'cost', 'margin', 'marginPct', 'upsellQty', 'upsellNetSales', 'upsellPctNet', 'upsellPctItems', 'upsellPctQty', 'avgNetPerItem', 'serviceNetSales', 'productNetSales', 'otherNetSales', 'avgTaxRate']

const one = (k: string, l: string, s?: string | number): DimVal => ({ k, l, s })

const timeDim = <F,>(key: string, unit: TimeUnit, date: (f: F) => string, time?: (f: F) => string): Dim<F> => ({ key, time: unit, get: (f) => timeBucket(unit, date(f), time?.(f)) })

/** Grouping options for sale lines (Sales summary › Group by, reports.md §2.2). */
export function lineDims(ctx: Ctx): Record<string, Dim<LineFact>> {
  const catLabel = (f: LineFact) => {
    const c = f.a.category as string
    if (c && !c.startsWith('t_')) return ctx.byId.category.get(c)?.name ?? ctx.byId.productCategory.get(c)?.name ?? typeLabel(f.item.type)
    return typeLabel(f.item.type)
  }
  return {
    type: { key: 'type', filterKey: 'type', next: 'item', get: (f) => one(f.item.type, typeLabel(f.item.type)) },
    category: { key: 'category', filterKey: 'category', next: 'item', get: (f) => one(String(f.a.category), catLabel(f)) },
    item: { key: 'item', filterKey: 'item', next: 'teamMember', get: (f) => one(String(f.a.item), f.item.name) },
    teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'item', get: (f) => one(String(f.a.teamMember), ctx.memberName(f.item.teamMemberId)) },
    resource: { key: 'resource', filterKey: 'resource', next: 'item', get: (f) => one(String(f.a.resource), f.a.resource === 'none' ? L('noResource') : (ctx.byId.resource.get(String(f.a.resource))?.name ?? '-')) },
    register: {
      key: 'register',
      filterKey: 'register',
      next: 'item',
      get: (f) => (f.a.register as string[]).map((r) => one(r, r === 'none' ? L('noRegister') : `${ctx.byId.register.get(r)?.name ?? '-'} · ${ctx.locationName(ctx.byId.register.get(r)?.locationId)}`)),
    },
    client: { key: 'client', filterKey: 'client', next: 'item', get: (f) => one(String(f.a.client), ctx.clientName(f.sale.clientId)) },
    loyalty: { key: 'loyalty', filterKey: 'loyalty', next: 'type', get: (f) => (f.a.loyalty as string[]).map((v) => one(v, L(`opt.loyalty.${v}`))) },
    channel: { key: 'channel', filterKey: 'channel', next: 'type', get: (f) => one(f.sale.channel, channelLabel(f.sale.channel)) },
    location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.sale.locationId, ctx.locationName(f.sale.locationId)) },
    clientTags: { key: 'clientTags', filterKey: 'clientTags', next: 'client', get: (f) => (f.a.clientTags as string[]).map((t) => one(t, t === 'none' ? L('opt.noTags') : (ctx.byId.tag.get(t)?.name ?? t))) },
    clientSegments: {
      key: 'clientSegments',
      filterKey: 'clientSegments',
      next: 'client',
      get: (f) => {
        const segs = f.a.clientSegments as string[]
        return segs.length ? segs.map((s) => one(s, ctx.d.segments.find((x) => x.id === s)?.name ?? s)) : [one('none', L('noSegment'))]
      },
    },
    source: {
      key: 'source',
      get: (f) => {
        const c = f.sale.clientId ? ctx.byId.client.get(f.sale.clientId) : undefined
        return c ? one(c.sourceId, ctx.byId.source.get(c.sourceId)?.name ?? '-') : one('walk_in', L('walkIn'))
      },
    },
    gender: { key: 'gender', filterKey: 'clientGender', next: 'type', get: (f) => one(String(f.a.clientGender), L(`opt.gender.${f.a.clientGender}`)) },
    retention: { key: 'retention', filterKey: 'clientRetention', next: 'type', get: (f) => one(String(f.a.clientRetention), L(`opt.retention.${f.a.clientRetention}`)) },
    hour: timeDim('hour', 'hour', (f) => f.date, (f) => f.time),
    hourOfDay: timeDim('hourOfDay', 'hour', (f) => f.date, (f) => f.time),
    day: timeDim('day', 'day', (f) => f.date),
    dayOfWeek: timeDim('dayOfWeek', 'weekday', (f) => f.date),
    week: timeDim('week', 'week', (f) => f.date),
    month: timeDim('month', 'month', (f) => f.date),
    quarter: timeDim('quarter', 'quarter', (f) => f.date),
    year: timeDim('year', 'year', (f) => f.date),
    paymentMethod: { key: 'paymentMethod', filterKey: 'paymentMethod', next: 'type', get: (f) => ((f.a.paymentMethod as string[]).length ? (f.a.paymentMethod as string[]) : ['none']).map((m) => one(m, m === 'none' ? L('unpaid') : L(`opt.paymentMethod.${m}`))) },
    transactionType: { key: 'transactionType', get: (f) => (f.refund ? one('refund', L('opt.transactionType.refund')) : one('sale', L('opt.transactionType.sale'))) },
    saleStatus: { key: 'saleStatus', filterKey: 'status', next: 'type', get: (f) => one(String(f.a.status), L(`opt.status.${f.a.status}`)) },
    supplier: { key: 'supplier', filterKey: 'supplier', next: 'item', get: (f) => one(String(f.a.supplier), f.a.supplier === 'none' ? L('none') : (ctx.byId.supplier.get(String(f.a.supplier))?.name ?? '-')) },
    brand: { key: 'brand', filterKey: 'brand', next: 'item', get: (f) => one(String(f.a.brand), f.a.brand === 'none' ? L('none') : (ctx.byId.brand.get(String(f.a.brand))?.name ?? '-')) },
    discountCategory: { key: 'discountCategory', filterKey: 'discountCategory', next: 'item', get: (f) => one(String(f.a.discountCategory), f.a.discountCategory === 'none' ? L('noDiscount') : L(`opt.discountCategory.${f.a.discountCategory}`)) },
    discountType: { key: 'discountType', filterKey: 'discountType', next: 'item', get: (f) => one(String(f.a.discountType), f.a.discountType === 'none' ? L('noDiscount') : L(`opt.discountType.${f.a.discountType}`)) },
    discountName: {
      key: 'discountName',
      next: 'item',
      get: (f) => {
        const dealId = f.item.discount?.dealId
        const deal = dealId ? ctx.d.deals.find((x) => x.id === dealId) : undefined
        if (deal) return one(deal.id, deal.name)
        if (f.itemDisc || f.cartDisc) return one('manual', L('manualDiscount'))
        return one('none', L('noDiscount'))
      },
    },
    upsell: { key: 'upsell', get: (f) => (f.upsell ? one('yes', L('upsellYes')) : one('no', L('upsellNo'))) },
  }
}

/** Sales summary group-by list: shown (with Premium tags) then hidden ones. */
export const SALES_GROUPINGS: GroupingOpt[] = [
  { key: 'type' },
  { key: 'category' },
  { key: 'item' },
  { key: 'teamMember' },
  { key: 'resource' },
  { key: 'register' },
  { key: 'client' },
  { key: 'loyalty' },
  { key: 'channel' },
  { key: 'location' },
  { key: 'clientTags' },
  { key: 'clientSegments' },
  { key: 'source', premium: true },
  { key: 'gender', premium: true },
  { key: 'retention', premium: true },
  { key: 'hour', premium: true },
  { key: 'day', premium: true },
  { key: 'week', premium: true },
  { key: 'month', premium: true },
  { key: 'quarter', premium: true },
  { key: 'year', premium: true },
  { key: 'paymentMethod', hidden: true },
  { key: 'transactionType', hidden: true },
  { key: 'saleStatus', hidden: true },
  { key: 'supplier', hidden: true },
  { key: 'brand', hidden: true },
  { key: 'discountCategory', hidden: true },
  { key: 'discountType', hidden: true },
  { key: 'discountName', hidden: true },
  { key: 'upsell', hidden: true },
]
