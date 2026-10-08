import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import type { Draft } from 'immer'
import { commit, db } from '@/store/db'
import type {
  Brand,
  Bundle,
  DbData,
  ExtraTime,
  ID,
  Membership,
  PackageDef,
  Product,
  ProductCategory,
  Service,
  ServiceCategory,
  StockOrder,
  StockOrderItem,
  Stocktake,
  StocktakeItem,
  Supplier,
} from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { money, round2 } from '@/lib/format'
import { ApiError, activity, actorName, latency } from './client'
import { queueMessage } from './messaging'
import { inline, t } from './i18n'

/**
 * Catalog domain operations (catalog.md): service menu, bundles, packages,
 * memberships, products, brands/categories, suppliers, stock orders,
 * stocktakes and stock movements. Every write goes through `commit`.
 */

type CatalogRecord = 'category' | 'service' | 'bundle' | 'package' | 'membership' | 'brand' | 'product' | 'stockOrder' | 'stocktake'

const find = <T extends { id: ID }>(list: T[], id: ID, what: CatalogRecord): T => {
  const item = list.find((x) => x.id === id)
  if (!item) throw new ApiError('not_found', t(`api.catalog.notFound.${what}`, { id }))
  return item
}

// ─── Catalog data without a shared collection (db.ext.catalog) ─────────────

/** Namespace in `db.ext` for catalog settings the shared model has no field for. */
export const CATALOG_EXT = 'catalog'

/** Per-service upselling switches (service editor › Online booking › Upselling). */
export interface Upselling {
  service: boolean
  membership: boolean
  package: boolean
}
export const DEFAULT_UPSELLING: Upselling = { service: false, membership: true, package: true }

/** Per-bundle extra time overrides (by service id) and portfolio images. */
export interface BundleExtras {
  extraTime: Record<ID, ExtraTime[]>
  images: string[]
}

/**
 * Keys in `db.ext.catalog`:
 * - `bookingSequence`: service ids in booking order (Set booking sequence)
 * - `bundleOrder`: bundle id → position inside its category (Set menu order)
 * - `upselling`: service id → Upselling
 * - `bundleExtras`: bundle id → BundleExtras
 */
export interface CatalogExt {
  bookingSequence: ID[]
  bundleOrder: Record<ID, number>
  upselling: Record<ID, Upselling>
  bundleExtras: Record<ID, BundleExtras>
}

function catalogExt(d: Draft<DbData>): Partial<CatalogExt> {
  if (!d.ext) d.ext = {}
  if (!d.ext[CATALOG_EXT]) d.ext[CATALOG_EXT] = {}
  return d.ext[CATALOG_EXT] as Partial<CatalogExt>
}

/** Drop catalog ext entries that point at deleted services or bundles. */
function forgetCatalogItems(d: Draft<DbData>, serviceIds: ID[], bundleIds: ID[]) {
  const ext = catalogExt(d)
  if (ext.bookingSequence) ext.bookingSequence = ext.bookingSequence.filter((sid) => !serviceIds.includes(sid))
  serviceIds.forEach((sid) => {
    if (ext.upselling) delete ext.upselling[sid]
  })
  bundleIds.forEach((bid) => {
    if (ext.bundleOrder) delete ext.bundleOrder[bid]
    if (ext.bundleExtras) delete ext.bundleExtras[bid]
  })
}

/** Set booking sequence (catalog.md §1.4). */
export async function saveBookingSequence(ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    catalogExt(d).bookingSequence = [...ids]
  })
}

// ─── Service categories ────────────────────────────────────────────────────

export type CategoryInput = Pick<ServiceCategory, 'name' | 'color' | 'description'>

export async function saveCategory(id: ID | null, input: CategoryInput): Promise<ServiceCategory> {
  await latency()
  let saved!: ServiceCategory
  commit((d) => {
    if (id) {
      const cat = find(d.serviceCategories, id, 'category')
      Object.assign(cat, input)
      saved = { ...cat }
    } else {
      saved = { id: uid('cat'), ...input, order: d.serviceCategories.reduce((m, c) => Math.max(m, c.order), -1) + 1 }
      d.serviceCategories.push(saved)
    }
  })
  return saved
}

/**
 * Archive or unarchive a category (category Actions → Archive). The category
 * and everything in it leave the active menu; services and bundles keep their
 * own archived flag, so unarchiving brings back exactly what was there.
 */
export async function setCategoryArchived(id: ID, archived: boolean): Promise<void> {
  await latency()
  commit((d) => {
    const cat = find(d.serviceCategories, id, 'category')
    if (archived) cat.archived = true
    else delete cat.archived
  })
}

/** A service or bundle is off the menu when it, or its category, is archived. */
export const isOffMenu = (item: { archived: boolean; categoryId: ID }, categories: ServiceCategory[]) => item.archived || Boolean(categories.find((c) => c.id === item.categoryId)?.archived)

/** Permanently delete a category together with its services and bundles. */
export async function deleteCategory(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const removed = new Set(d.services.filter((s) => s.categoryId === id).map((s) => s.id))
    forgetCatalogItems(d, [...removed], d.bundles.filter((b) => b.categoryId === id).map((b) => b.id))
    d.services = d.services.filter((s) => s.categoryId !== id)
    d.bundles = d.bundles.filter((b) => b.categoryId !== id)
    d.bundles.forEach((b) => {
      b.serviceIds = b.serviceIds.filter((sid) => !removed.has(sid))
    })
    d.packages.forEach((p) => {
      if (p.categoryId === id) p.categoryId = undefined
    })
    d.serviceCategories = d.serviceCategories.filter((c) => c.id !== id)
  })
}

// ─── Services ──────────────────────────────────────────────────────────────

export type ServiceInput = Omit<Service, 'id' | 'order'>

export async function saveService(id: ID | null, input: ServiceInput, upselling?: Upselling): Promise<Service> {
  await latency()
  let saved!: Service
  commit((d) => {
    if (id) {
      const index = d.services.findIndex((s) => s.id === id)
      if (index === -1) throw new ApiError('not_found', t('api.catalog.missing.service'))
      const previous = d.services[index]
      saved = { ...previous, ...input, id, order: previous.categoryId === input.categoryId ? previous.order : nextServiceOrder(d.services, input.categoryId) }
      d.services[index] = saved
    } else {
      saved = { ...input, id: uid('svc'), order: nextServiceOrder(d.services, input.categoryId) }
      d.services.push(saved)
    }
    if (upselling) {
      const ext = catalogExt(d)
      ext.upselling = { ...(ext.upselling ?? {}), [saved.id]: { ...upselling } }
    }
  })
  return saved
}

const nextServiceOrder = (services: Service[], categoryId: ID) => services.filter((s) => s.categoryId === categoryId).reduce((m, s) => Math.max(m, s.order), -1) + 1

export async function setServiceArchived(id: ID, archived: boolean): Promise<void> {
  await latency()
  commit((d) => {
    find(d.services, id, 'service').archived = archived
  })
}

export async function deleteService(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    forgetCatalogItems(d, [id], [])
    d.services = d.services.filter((s) => s.id !== id)
    d.bundles.forEach((b) => {
      b.serviceIds = b.serviceIds.filter((sid) => sid !== id)
    })
  })
}

/** Bulk edit services: replace the edited services (by id). */
export async function bulkUpdateServices(updated: Service[]): Promise<void> {
  await latency()
  commit((d) => {
    updated.forEach((u) => {
      const index = d.services.findIndex((s) => s.id === u.id)
      if (index !== -1) d.services[index] = u
    })
  })
}

/** Set menu order: categories in order, and services and bundles (ids) in order inside each category. */
export async function saveMenuOrder(categoryIds: ID[], itemsByCategory: Record<ID, ID[]>): Promise<void> {
  await latency()
  commit((d) => {
    categoryIds.forEach((cid, i) => {
      const cat = d.serviceCategories.find((c) => c.id === cid)
      if (cat) cat.order = i
    })
    const ext = catalogExt(d)
    const bundleOrder = { ...(ext.bundleOrder ?? {}) }
    Object.entries(itemsByCategory).forEach(([cid, ids]) =>
      ids.forEach((itemId, i) => {
        const svc = d.services.find((s) => s.id === itemId)
        if (svc) {
          svc.order = i
          svc.categoryId = cid
          return
        }
        const bundle = d.bundles.find((b) => b.id === itemId)
        if (bundle) {
          bundle.categoryId = cid
          bundleOrder[itemId] = i
        }
      }),
    )
    ext.bundleOrder = bundleOrder
  })
}

// ─── Bundles ───────────────────────────────────────────────────────────────

export type BundleInput = Omit<Bundle, 'id'>

export async function saveBundle(id: ID | null, input: BundleInput, extras?: BundleExtras): Promise<Bundle> {
  await latency()
  let saved!: Bundle
  commit((d) => {
    if (id) {
      const index = d.bundles.findIndex((b) => b.id === id)
      if (index === -1) throw new ApiError('not_found', t('api.catalog.missing.bundle'))
      saved = { ...d.bundles[index], ...input, id }
      d.bundles[index] = saved
    } else {
      saved = { ...input, id: uid('bun') }
      d.bundles.push(saved)
    }
    if (extras) {
      const ext = catalogExt(d)
      ext.bundleExtras = { ...(ext.bundleExtras ?? {}), [saved.id]: { extraTime: { ...extras.extraTime }, images: [...extras.images] } }
    }
  })
  return saved
}

export async function setBundleArchived(id: ID, archived: boolean): Promise<void> {
  await latency()
  commit((d) => {
    find(d.bundles, id, 'bundle').archived = archived
  })
}

export async function deleteBundle(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    forgetCatalogItems(d, [], [id])
    d.bundles = d.bundles.filter((b) => b.id !== id)
  })
}

// ─── Packages ──────────────────────────────────────────────────────────────

export type PackageInput = Omit<PackageDef, 'id' | 'order'>

export async function savePackage(id: ID | null, input: PackageInput): Promise<PackageDef> {
  await latency()
  let saved!: PackageDef
  commit((d) => {
    if (id) {
      const index = d.packages.findIndex((p) => p.id === id)
      if (index === -1) throw new ApiError('not_found', t('api.catalog.missing.package'))
      saved = { ...d.packages[index], ...input, id }
      d.packages[index] = saved
    } else {
      saved = { ...input, id: uid('pkg'), order: d.packages.reduce((m, p) => Math.max(m, p.order), -1) + 1 }
      d.packages.push(saved)
    }
  })
  return saved
}

export async function setPackageArchived(id: ID, archived: boolean): Promise<void> {
  await latency()
  commit((d) => {
    find(d.packages, id, 'package').archived = archived
  })
}

export async function deletePackage(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.packages = d.packages.filter((p) => p.id !== id)
  })
}

export async function savePackageOrder(ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    ids.forEach((pid, i) => {
      const p = d.packages.find((x) => x.id === pid)
      if (p) p.order = i
    })
  })
}

// ─── Memberships ───────────────────────────────────────────────────────────

export type MembershipInput = Omit<Membership, 'id'>

export async function saveMembership(id: ID | null, input: MembershipInput): Promise<Membership> {
  await latency()
  let saved!: Membership
  commit((d) => {
    if (id) {
      const index = d.memberships.findIndex((m) => m.id === id)
      if (index === -1) throw new ApiError('not_found', t('api.catalog.missing.membership'))
      saved = { ...d.memberships[index], ...input, id }
      d.memberships[index] = saved
    } else {
      saved = { ...input, id: uid('mem') }
      d.memberships.push(saved)
    }
  })
  return saved
}

export async function setMembershipArchived(id: ID, archived: boolean): Promise<void> {
  await latency()
  commit((d) => {
    find(d.memberships, id, 'membership').archived = archived
  })
}

export async function deleteMembership(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.memberships = d.memberships.filter((m) => m.id !== id)
  })
}

// ─── Brands and product categories ─────────────────────────────────────────

export async function saveBrand(id: ID | null, name: string): Promise<Brand> {
  await latency()
  let saved!: Brand
  commit((d) => {
    if (id) {
      const brand = find(d.brands, id, 'brand')
      brand.name = name
      saved = { ...brand }
    } else {
      saved = { id: uid('brand'), name }
      d.brands.push(saved)
    }
  })
  return saved
}

export async function deleteBrand(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.brands = d.brands.filter((b) => b.id !== id)
    d.products.forEach((p) => {
      if (p.brandId === id) p.brandId = undefined
    })
  })
}

export async function saveProductCategory(id: ID | null, name: string): Promise<ProductCategory> {
  await latency()
  let saved!: ProductCategory
  commit((d) => {
    if (id) {
      const cat = find(d.productCategories, id, 'category')
      cat.name = name
      saved = { ...cat }
    } else {
      saved = { id: uid('pcat'), name }
      d.productCategories.push(saved)
    }
  })
  return saved
}

export async function deleteProductCategory(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.productCategories = d.productCategories.filter((c) => c.id !== id)
    d.products.forEach((p) => {
      if (p.categoryId === id) p.categoryId = undefined
    })
  })
}

// ─── Suppliers ─────────────────────────────────────────────────────────────

export type SupplierInput = Omit<Supplier, 'id' | 'updatedAt'>

export async function saveSupplier(id: ID | null, input: SupplierInput): Promise<Supplier> {
  await latency()
  let saved!: Supplier
  commit((d) => {
    if (id) {
      const index = d.suppliers.findIndex((s) => s.id === id)
      if (index === -1) throw new ApiError('not_found', t('api.catalog.missing.supplier'))
      saved = { ...d.suppliers[index], ...input, id, updatedAt: nowISO() }
      d.suppliers[index] = saved
    } else {
      saved = { ...input, id: uid('sup'), updatedAt: nowISO() }
      d.suppliers.push(saved)
    }
  })
  return saved
}

export async function deleteSupplier(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.suppliers = d.suppliers.filter((s) => s.id !== id)
    d.products.forEach((p) => {
      if (p.supplierId === id) p.supplierId = undefined
    })
  })
}

// ─── Products and stock ────────────────────────────────────────────────────

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

const defaultLocationId = () => db().locations[0]?.id ?? ''

export async function saveProduct(id: ID | null, input: ProductInput): Promise<Product> {
  await latency()
  let saved!: Product
  const by = actorName()
  commit((d) => {
    const at = nowISO()
    if (id) {
      const index = d.products.findIndex((p) => p.id === id)
      if (index === -1) throw new ApiError('not_found', t('api.catalog.missing.product'))
      const previous = d.products[index]
      saved = { ...previous, ...input, id, updatedAt: at }
      if (saved.stock !== previous.stock) {
        d.stockMovements.push({ id: uid('sm'), productId: id, locationId: d.locations[0]?.id ?? '', qty: saved.stock - previous.stock, reason: 'Adjustment', by, at, supplyPrice: saved.supplyPrice })
      }
      d.products[index] = saved
    } else {
      saved = { ...input, id: uid('prd'), createdAt: at, updatedAt: at }
      d.products.push(saved)
      if (saved.trackStock && saved.stock !== 0) {
        d.stockMovements.push({ id: uid('sm'), productId: saved.id, locationId: d.locations[0]?.id ?? '', qty: saved.stock, reason: 'Adjustment', by, at, supplyPrice: saved.supplyPrice })
      }
    }
  })
  return saved
}

export async function deleteProducts(ids: ID[]): Promise<void> {
  await latency()
  const set = new Set(ids)
  commit((d) => {
    d.products = d.products.filter((p) => !set.has(p.id))
  })
}

export interface StockAdjustment {
  /** Signed quantity: positive adds, negative removes. */
  qty: number
  reason: string
  supplyPrice?: number
  /** Save the supply price on the product ("Save price for next time"). */
  savePrice?: boolean
  locationId?: ID
  ref?: string
}

export async function adjustStock(productId: ID, adj: StockAdjustment): Promise<Product> {
  await latency()
  const by = actorName()
  let saved!: Product
  commit((d) => {
    const product = find(d.products, productId, 'product')
    const at = nowISO()
    product.stock += adj.qty
    product.updatedAt = at
    if (adj.savePrice && adj.supplyPrice !== undefined) product.supplyPrice = adj.supplyPrice
    d.stockMovements.push({ id: uid('sm'), productId, locationId: adj.locationId ?? d.locations[0]?.id ?? '', qty: adj.qty, reason: adj.reason, by, at, supplyPrice: adj.supplyPrice ?? product.supplyPrice, ref: adj.ref })
    if (adj.qty < 0 && product.lowStockNotify && product.stock <= product.lowStockLevel) {
      d.notifications.unshift({ id: uid('nt'), tab: 'actions', title: t('api.notifications.lowStock.title'), body: t('api.notifications.lowStock.body', { product: product.name, stock: product.stock, level: product.lowStockLevel }), at, read: false, link: `/catalogue/products?drawer=product&id=${product.id}` })
    }
    saved = { ...product }
  })
  return saved
}

export interface ProductImportRow {
  name: string
  barcode?: string
  brand?: string
  category?: string
  supplier?: string
  supplyPrice: number
  retailPrice: number
  stock: number
  sku?: string
  measure?: string
  amount?: number
}

/** Import products from a parsed CSV; brands, categories and suppliers are created by name when missing. */
export async function importProducts(rows: ProductImportRow[]): Promise<number> {
  await latency(600, 1200)
  const by = actorName()
  commit((d) => {
    const at = nowISO()
    const byName = <T extends { id: ID; name: string }>(list: T[], name: string | undefined, make: (name: string) => T): ID | undefined => {
      const clean = name?.trim()
      if (!clean) return undefined
      const existing = list.find((x) => x.name.toLowerCase() === clean.toLowerCase())
      if (existing) return existing.id
      const created = make(clean)
      list.push(created)
      return created.id
    }
    rows.forEach((row) => {
      const id = uid('prd')
      d.products.push({
        id,
        name: row.name,
        barcode: row.barcode || undefined,
        brandId: byName(d.brands, row.brand, (name) => ({ id: uid('brand'), name })),
        measure: row.measure || 'ml',
        amount: row.amount,
        shortDescription: '',
        description: '',
        categoryId: byName(d.productCategories, row.category, (name) => ({ id: uid('pcat'), name })),
        supplyPrice: row.supplyPrice,
        retailSales: row.retailPrice > 0,
        retailPrice: row.retailPrice,
        taxRateId: d.settings.taxDefaults.products,
        commission: true,
        skus: row.sku ? [row.sku] : [],
        supplierId: byName(d.suppliers, row.supplier, (name) => ({ id: uid('sup'), name, description: '', firstName: '', lastName: '', mobile: '', telephone: '', email: '', website: '', address: { country: 'Portugal' }, updatedAt: at })),
        trackStock: true,
        stock: row.stock,
        lowStockLevel: 5,
        reorderQty: 10,
        lowStockNotify: true,
        images: [],
        archived: false,
        createdAt: at,
        updatedAt: at,
      })
      if (row.stock) d.stockMovements.push({ id: uid('sm'), productId: id, locationId: d.locations[0]?.id ?? '', qty: row.stock, reason: 'Import', by, at, supplyPrice: row.supplyPrice })
    })
  })
  return rows.length
}

// ─── Stock orders ──────────────────────────────────────────────────────────

export const orderSubtotal = (items: Pick<StockOrderItem, 'qty' | 'unitCost'>[]) => round2(items.reduce((s, i) => s + i.qty * i.unitCost, 0))
export const orderFeesTotal = (fees: StockOrder['fees'], subtotal: number) => round2(fees.reduce((s, f) => s + (f.type === 'percent' ? (subtotal * f.amount) / 100 : f.amount), 0))
export const orderTotal = (order: Pick<StockOrder, 'items' | 'fees'>) => {
  const sub = orderSubtotal(order.items)
  return round2(sub + orderFeesTotal(order.fees, sub))
}
export const orderQuantity = (items: Pick<StockOrderItem, 'qty'>[]) => items.reduce((s, i) => s + i.qty, 0)

const nextOrderNumber = (orders: StockOrder[]) => `P${orders.reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, '')) || 0), 0) + 1}`

export type StockOrderInput = Pick<StockOrder, 'supplierId' | 'locationId' | 'items' | 'fees' | 'expectedAt'>

/** Create or update a stock order. Drafts autosave while the order is being built. */
export async function saveStockOrder(id: ID | null, input: StockOrderInput, options: { place?: boolean; quiet?: boolean } = {}): Promise<StockOrder> {
  await (options.quiet ? latency(80, 160) : latency())
  let saved!: StockOrder
  commit((d) => {
    const at = nowISO()
    if (id) {
      const order = find(d.stockOrders, id, 'stockOrder')
      Object.assign(order, input)
      if (options.place && order.status === 'draft') {
        order.status = 'ordered'
        order.createdAt = at
        order.activity.push(activity(t('catalog.inventory.orderNew.created'), t('api.catalog.activity.orderSummary', { count: orderQuantity(order.items), total: money(orderTotal(order)) })))
      } else if (!options.quiet && order.status !== 'draft') {
        order.activity.push(activity(t('api.catalog.activity.orderEdited')))
      }
      saved = JSON.parse(JSON.stringify(order)) as StockOrder
    } else {
      saved = {
        id: uid('so'),
        number: nextOrderNumber(d.stockOrders),
        ...input,
        status: options.place ? 'ordered' : 'draft',
        createdAt: at,
        activity: options.place ? [activity(t('catalog.inventory.orderNew.created'))] : [],
      }
      d.stockOrders.push(saved)
    }
  })
  return saved
}

export async function cancelStockOrder(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const order = find(d.stockOrders, id, 'stockOrder')
    order.status = 'cancelled'
    order.activity.push(activity(t('catalog.inventory.orderDrawer.cancelled')))
  })
}

export async function deleteStockOrderDraft(id: ID): Promise<void> {
  await latency(80, 160)
  commit((d) => {
    d.stockOrders = d.stockOrders.filter((o) => !(o.id === id && o.status === 'draft'))
  })
}

/** Receive stock: adds received quantities to stock, writes movements and completes the order. */
export async function receiveStockOrder(id: ID, items: StockOrderItem[], fees: StockOrder['fees']): Promise<StockOrder> {
  await latency()
  const by = actorName()
  let saved!: StockOrder
  commit((d) => {
    const order = find(d.stockOrders, id, 'stockOrder')
    const at = nowISO()
    order.items = items
    order.fees = fees
    items.forEach((item) => {
      const qty = item.receivedQty ?? 0
      const product = d.products.find((p) => p.id === item.productId)
      if (!product || qty <= 0) return
      product.stock += qty
      product.supplyPrice = item.unitCost
      product.updatedAt = at
      d.stockMovements.push({ id: uid('sm'), productId: product.id, locationId: order.locationId, qty, reason: 'Stock order', by, at, supplyPrice: item.unitCost, ref: `Order ${order.number}` })
    })
    order.status = 'received'
    order.receivedAt = at
    order.activity.push(activity(t('api.catalog.activity.stockReceived'), t('api.catalog.activity.productsReceived', { count: items.reduce((s, i) => s + (i.receivedQty ?? 0), 0) })))
    saved = JSON.parse(JSON.stringify(order)) as StockOrder
  })
  return saved
}

/** Email the stock order to the supplier (lands in the demo outbox). */
export async function emailStockOrder(id: ID): Promise<string> {
  await latency()
  const data = db()
  const order = find(data.stockOrders, id, 'stockOrder')
  const supplier = data.suppliers.find((s) => s.id === order.supplierId)
  if (!supplier?.email) throw new ApiError('no_email', t('api.catalog.supplierNoEmail'))
  const location = data.locations.find((l) => l.id === order.locationId)
  const lines = order.items.map((i) => {
    const p = data.products.find((x) => x.id === i.productId)
    return `${i.qty} × ${p?.name ?? t('api.catalog.product')}${p?.skus[0] ? ` (SKU ${p.skus[0]})` : ''} @ ${money(i.unitCost)} = ${money(i.qty * i.unitCost)}`
  })
  queueMessage({
    clientId: null,
    to: supplier.email,
    toName: supplier.name,
    channel: 'email',
    type: 'stock_order',
    subject: t('api.catalog.orderEmail.subject', { number: order.number, business: data.workspace.name }),
    body: [
      t('api.catalog.orderEmail.greeting', { name: supplier.firstName || supplier.name }),
      '',
      t('api.catalog.orderEmail.intro', { number: order.number }),
      '',
      ...lines,
      '',
      `${t('settings.bill.invoices.total')}: ${money(orderTotal(order))}`,
      order.expectedAt ? t('api.catalog.orderEmail.expectedBy', { date: format(parseISO(order.expectedAt), 'MMM d, yyyy') }) : '',
      t('api.catalog.orderEmail.deliverTo', { address: `${location?.name ?? ''}, ${location?.address.line1 ?? ''}, ${location?.address.postcode ?? ''} ${location?.address.city ?? ''}` }),
      '',
      t('api.catalog.orderEmail.signOff'),
      actorName(),
    ]
      .filter((l) => l !== undefined)
      .join('\n'),
  })
  commit((d) => {
    find(d.stockOrders, id, 'stockOrder').activity.push(activity(t('api.catalog.activity.orderEmailed'), supplier.email))
  })
  return supplier.email
}

// ─── Stocktakes ────────────────────────────────────────────────────────────

export async function createStocktake(input: { name: string; description: string; locationId: ID }): Promise<Stocktake> {
  await latency()
  let saved!: Stocktake
  const by = actorName()
  commit((d) => {
    const at = nowISO()
    saved = {
      id: uid('st'),
      name: input.name.trim() || t('api.catalog.stocktakeName', { month: inline(format(parseISO(at), 'MMMM')) }),
      description: input.description,
      locationId: input.locationId,
      status: 'in_progress',
      items: d.products.filter((p) => p.trackStock && !p.archived).map((p) => ({ productId: p.id, expected: p.stock, excluded: false })),
      startedAt: at,
      countedBy: by,
    }
    d.stocktakes.push(saved)
  })
  return saved
}

/** Persist counts while counting (fast, called debounced from the count page). */
export async function saveStocktakeItems(id: ID, items: StocktakeItem[]): Promise<void> {
  await latency(60, 140)
  commit((d) => {
    const st = find(d.stocktakes, id, 'stocktake')
    st.items = items
    if (st.status === 'paused' || st.status === 'draft') st.status = 'in_progress'
  })
}

export async function setStocktakeStatus(id: ID, status: Stocktake['status']): Promise<void> {
  await latency()
  commit((d) => {
    find(d.stocktakes, id, 'stocktake').status = status
  })
}

/** Complete: counted products take their counted quantity; differences are written as stock movements. */
export async function completeStocktake(id: ID, note: string): Promise<void> {
  await latency()
  const by = actorName()
  commit((d) => {
    const st = find(d.stocktakes, id, 'stocktake')
    const at = nowISO()
    st.items.forEach((item) => {
      if (item.excluded || item.counted === undefined) return
      const product = d.products.find((p) => p.id === item.productId)
      if (!product) return
      const diff = item.counted - product.stock
      product.stock = item.counted
      product.updatedAt = at
      if (diff !== 0) d.stockMovements.push({ id: uid('sm'), productId: product.id, locationId: st.locationId, qty: diff, reason: 'Stocktake', by, at, supplyPrice: product.supplyPrice, ref: st.name })
    })
    st.status = 'completed'
    st.completedAt = at
    st.reviewedBy = by
    st.note = note || undefined
  })
}

export async function deleteStocktake(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.stocktakes = d.stocktakes.filter((s) => s.id !== id)
  })
}

export { defaultLocationId }
