import { round2 } from '@/lib/format'
import type { ID, Product } from '@/types'
import type { Ctx } from '../engine/context'
import { lineFacts } from '../engine/facts'
import { applyFilters, listResult } from '../engine/helpers'
import { L, stockReasonLabel } from '../engine/labels'
import type { Params, Spec } from '../engine/types'
import { inR } from './common'

const productAttrs = (p: Product, locationId: ID | string) => ({ brand: p.brandId ?? 'none', productCategory: p.categoryId ?? 'none', supplier: p.supplierId ?? 'none', product: p.id, location: locationId })

interface StockEvent {
  key: string
  at: string
  date: string
  product: Product
  locationId: ID
  reason: string
  ref: string
  qty: number
  cost: number
  kind: 'received' | 'sold' | 'adjusted'
}

const stockStore = new WeakMap<Ctx, StockEvent[]>()
const RECEIVED = ['new stock', 'stock order', 'import', 'received']

/** Stock changes: movements plus product sale lines (sale movements from checkout are skipped to avoid counting twice). */
function stockEvents(ctx: Ctx): StockEvent[] {
  let out = stockStore.get(ctx)
  if (out) return out
  out = []
  for (const m of ctx.d.stockMovements ?? []) {
    if ((m.reason === 'Sale' && m.ref?.startsWith('Sale ')) || (m.reason === 'Return' && m.ref?.startsWith('Refund '))) continue
    const product = ctx.byId.product.get(m.productId)
    if (!product) continue
    const kind = m.qty > 0 && RECEIVED.includes(m.reason.toLowerCase()) ? 'received' : m.reason === 'Sale' ? 'sold' : 'adjusted'
    out.push({ key: m.id, at: m.at, date: ctx.day(m.at), product, locationId: m.locationId, reason: m.reason, ref: m.ref ?? '-', qty: m.qty, cost: round2(m.qty * (m.supplyPrice ?? product.supplyPrice)), kind })
  }
  for (const f of lineFacts(ctx)) {
    if (f.item.type !== 'product' || !f.item.refId) continue
    const product = ctx.byId.product.get(f.item.refId)
    if (!product) continue
    out.push({ key: `${f.sale.id}_${f.item.id}`, at: f.sale.createdAt, date: f.date, product, locationId: f.sale.locationId, reason: f.refund ? 'Return' : 'Sale', ref: `${f.refund ? L('refund') : L('sale')} ${f.sale.number}`, qty: -f.qty, cost: round2(-f.qty * product.supplyPrice), kind: 'sold' })
  }
  out.sort((a, b) => b.at.localeCompare(a.at))
  stockStore.set(ctx, out)
  return out
}

const sku = (p: Product) => p.skus[0] ?? '-'
const brandName = (ctx: Ctx, p: Product) => (p.brandId ? (ctx.byId.brand.get(p.brandId)?.name ?? '-') : '-')
const homeLocation = (ctx: Ctx, p: Product) => (ctx.d.stockMovements ?? []).find((m) => m.productId === p.id)?.locationId ?? ctx.d.locations[0]?.id ?? ''

const stockOnHand: Spec = {
  slug: 'stock-on-hand',
  range: 'today',
  asOf: true,
  filters: ['brand', 'location', 'productCategory', 'supplier', 'product'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    // Stock at the end of the chosen day: today's stock minus every movement after it.
    const asOf = p.range.to
    const later = new Map<ID, number>()
    if (asOf < ctx.today) for (const e of stockEvents(ctx)) if (e.date > asOf) later.set(e.product.id, (later.get(e.product.id) ?? 0) + e.qty)
    const facts = (ctx.d.products ?? [])
      .filter((x) => !x.archived && x.trackStock)
      .map((x) => ({ x: { ...x, stock: x.stock - (later.get(x.id) ?? 0) }, loc: homeLocation(ctx, x), a: productAttrs(x, homeLocation(ctx, x)) }))
      .sort((a, b) => brandName(ctx, a.x).localeCompare(brandName(ctx, b.x)) || a.x.name.localeCompare(b.x.name))
    return listResult(
      applyFilters(facts, p.filters),
      [
        { key: 'brand', type: 'text', get: (f) => brandName(ctx, f.x) },
        { key: 'primarySku', type: 'text', get: (f) => sku(f.x) },
        { key: 'product', type: 'text', get: (f) => f.x.name },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.loc) },
        { key: 'stockOnHand', type: 'int', total: true, get: (f) => f.x.stock },
        { key: 'totalCost', type: 'money', get: (f) => round2(f.x.stock * f.x.supplyPrice) },
        { key: 'avgCost', type: 'money', total: false, get: (f) => f.x.supplyPrice },
        { key: 'retailPrice', type: 'money', total: false, get: (f) => f.x.retailPrice },
        { key: 'retailValue', type: 'money', get: (f) => round2(f.x.stock * f.x.retailPrice) },
        { key: 'supplyPrice', type: 'money', total: false, get: (f) => f.x.supplyPrice },
        { key: 'supplyValue', type: 'money', get: (f) => round2(f.x.stock * f.x.supplyPrice) },
        { key: 'pctMargin', type: 'pct', get: (f) => (f.x.retailPrice ? round2(((f.x.retailPrice / 1.23 - f.x.supplyPrice) / (f.x.retailPrice / 1.23)) * 100) : 0) },
        { key: 'lowStockLevel', type: 'int', get: (f) => f.x.lowStockLevel },
        { key: 'reorderQty', type: 'int', get: (f) => f.x.reorderQty },
      ],
      (f) => f.x.id,
      { total: true },
    )
  },
}

const stockMovementSummary: Spec = {
  slug: 'stock-movement-summary',
  range: 'last_30_days',
  filters: ['location', 'brand', 'supplier', 'productCategory', 'product'],
  advanced: true,
  customize: true,
  build: (ctx, p: Params) => {
    const events = stockEvents(ctx)
    const pendingOrders = new Map<ID, number>()
    for (const o of ctx.d.stockOrders ?? []) if (o.status === 'ordered') for (const i of o.items) pendingOrders.set(i.productId, (pendingOrders.get(i.productId) ?? 0) + i.qty - (i.receivedQty ?? 0))
    const facts = (ctx.d.products ?? [])
      .filter((x) => !x.archived && x.trackStock)
      .map((x) => {
        const mine = events.filter((e) => e.product.id === x.id)
        const after = mine.filter((e) => e.date > p.range.to).reduce((s, e) => s + e.qty, 0)
        const within = mine.filter((e) => inR(e.date, p.range))
        const received = within.filter((e) => e.kind === 'received').reduce((s, e) => s + e.qty, 0)
        const sold = -within.filter((e) => e.kind === 'sold').reduce((s, e) => s + e.qty, 0)
        const adjusted = within.filter((e) => e.kind === 'adjusted').reduce((s, e) => s + e.qty, 0)
        const end = x.stock - after
        return { x, received, sold, adjusted, end, start: end - received + sold - adjusted, ordered: pendingOrders.get(x.id) ?? 0, a: productAttrs(x, homeLocation(ctx, x)) }
      })
      .filter((f) => f.received || f.sold || f.adjusted || f.end)
      .sort((a, b) => brandName(ctx, a.x).localeCompare(brandName(ctx, b.x)) || a.x.name.localeCompare(b.x.name))
    return listResult(
      applyFilters(facts, p.filters),
      [
        { key: 'brand', type: 'text', get: (f) => brandName(ctx, f.x) },
        { key: 'primarySku', type: 'text', get: (f) => sku(f.x) },
        { key: 'product', type: 'text', get: (f) => f.x.name },
        { key: 'startStock', type: 'int', total: true, get: (f) => f.start },
        { key: 'received', type: 'int', total: true, get: (f) => f.received },
        { key: 'sold', type: 'int', total: true, get: (f) => f.sold },
        { key: 'adjusted', type: 'int', total: true, get: (f) => f.adjusted },
        { key: 'endStock', type: 'int', total: true, get: (f) => f.end },
        { key: 'orderedStock', type: 'int', total: true, get: (f) => f.ordered },
      ],
      (f) => f.x.id,
      { total: true },
    )
  },
}

const stockMovementLog: Spec = {
  slug: 'stock-movement',
  range: 'last_30_days',
  filters: ['adjustmentReason', 'brand', 'location', 'productCategory', 'supplier', 'product'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      applyFilters(
        stockEvents(ctx)
          .filter((e) => inR(e.date, p.range))
          .map((e) => ({ ...e, a: { ...productAttrs(e.product, e.locationId), adjustmentReason: e.reason } })),
        p.filters,
      ),
      [
        { key: 'date', type: 'datetime', get: (e) => e.at },
        { key: 'brand', type: 'text', get: (e) => brandName(ctx, e.product) },
        { key: 'primarySku', type: 'text', get: (e) => sku(e.product) },
        { key: 'product', type: 'text', get: (e) => e.product.name },
        { key: 'location', type: 'text', get: (e) => ctx.locationName(e.locationId) },
        { key: 'adjReason', type: 'text', get: (e) => stockReasonLabel(e.reason) },
        { key: 'adjRef', type: 'text', get: (e) => e.ref },
        { key: 'qty', type: 'int', total: true, get: (e) => e.qty },
        { key: 'cost', type: 'money', get: (e) => e.cost },
        { key: 'avgCost', type: 'money', total: false, get: (e) => e.product.supplyPrice },
      ],
      (e) => e.key,
      { total: true },
    ),
}

const productList: Spec = {
  slug: 'product-list',
  range: 'last_30_days',
  filters: ['brand', 'productCategory', 'supplier', 'product'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = (ctx.d.products ?? [])
      .filter((x) => !x.archived && (inR(ctx.day(x.updatedAt), p.range) || inR(ctx.day(x.createdAt), p.range)))
      .map((x) => ({ x, a: productAttrs(x, homeLocation(ctx, x)) }))
      .sort((a, b) => a.x.name.localeCompare(b.x.name))
    return listResult(
      applyFilters(facts, p.filters),
      [
        { key: 'primarySku', type: 'text', get: (f) => sku(f.x) },
        { key: 'product', type: 'text', get: (f) => f.x.name },
        { key: 'category', type: 'text', get: (f) => (f.x.categoryId ? (ctx.byId.productCategory.get(f.x.categoryId)?.name ?? '-') : '-') },
        { key: 'brand', type: 'text', get: (f) => brandName(ctx, f.x) },
        { key: 'barcode', type: 'text', get: (f) => f.x.barcode ?? '-' },
        { key: 'supplier', type: 'text', get: (f) => (f.x.supplierId ? (ctx.byId.supplier.get(f.x.supplierId)?.name ?? '-') : '-') },
        { key: 'hasDescription', type: 'text', get: (f) => (f.x.description || f.x.shortDescription ? L('yes') : L('no')) },
        { key: 'hasImage', type: 'text', get: (f) => (f.x.images.length ? L('yes') : L('no')) },
        { key: 'units', type: 'text', get: (f) => (f.x.amount !== undefined ? String(f.x.amount) : '-') },
        { key: 'uom', type: 'text', get: (f) => f.x.measure || '-' },
        { key: 'retailPrice', type: 'money', total: false, get: (f) => f.x.retailPrice },
        { key: 'supplyPrice', type: 'money', hidden: true, total: false, get: (f) => f.x.supplyPrice },
        { key: 'stockOnHand', type: 'int', hidden: true, get: (f) => f.x.stock },
      ],
      (f) => f.x.id,
    )
  },
}

const orderedStock: Spec = {
  slug: 'ordered-stock',
  range: 'last_30_days',
  filters: ['stockOrderStatus', 'brand', 'location', 'productCategory', 'supplier', 'orderedBy', 'product'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = (ctx.d.stockOrders ?? [])
      .filter((o) => inR(ctx.day(o.createdAt), p.range))
      .flatMap((o) =>
        o.items.map((i) => {
          const product = ctx.byId.product.get(i.productId)
          const received = i.receivedQty ?? (o.status === 'received' ? i.qty : 0)
          const cancelled = o.status === 'cancelled' ? i.qty - received : 0
          return { o, i, product, received, cancelled, pending: o.status === 'ordered' ? i.qty - received : 0, a: { ...(product ? productAttrs(product, o.locationId) : { location: o.locationId }), supplier: o.supplierId, stockOrderStatus: o.status, orderedBy: o.activity[0]?.by ?? 'Marta Ribeiro' } }
        }),
      )
      .sort((a, b) => b.o.createdAt.localeCompare(a.o.createdAt))
    return listResult(
      applyFilters(facts, p.filters),
      [
        { key: 'ordered', type: 'date', get: (f) => ctx.day(f.o.createdAt) },
        { key: 'expected', type: 'date', get: (f) => f.o.expectedAt ?? '-' },
        { key: 'receivedDate', type: 'date', get: (f) => (f.o.receivedAt ? ctx.day(f.o.receivedAt) : '-') },
        { key: 'reference', type: 'text', get: (f) => f.o.number },
        { key: 'product', type: 'text', get: (f) => f.product?.name ?? '-' },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.o.locationId) },
        { key: 'supplier', type: 'text', get: (f) => ctx.byId.supplier.get(f.o.supplierId)?.name ?? '-' },
        { key: 'orderQty', type: 'int', total: true, get: (f) => f.i.qty },
        { key: 'receivedQty', type: 'int', total: true, get: (f) => f.received },
        { key: 'cancelledQty', type: 'int', total: true, get: (f) => f.cancelled },
        { key: 'pendingStock', type: 'int', total: true, get: (f) => f.pending },
        { key: 'totalCost', type: 'money', get: (f) => round2(f.i.qty * f.i.unitCost) },
        { key: 'avgUnitCost', type: 'money', total: false, get: (f) => f.i.unitCost },
        { key: 'status', type: 'text', get: (f) => L(`opt.stockOrderStatus.${f.o.status}`) },
      ],
      (f) => `${f.o.id}_${f.i.productId}`,
      { total: true },
    )
  },
}

export const INVENTORY_SPECS: Spec[] = [stockOnHand, stockMovementSummary, stockMovementLog, productList, orderedStock]
