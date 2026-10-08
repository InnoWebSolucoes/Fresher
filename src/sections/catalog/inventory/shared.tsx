import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Chip } from '@/components/ui'
import { exportCsv, exportPdf, type ExportTable } from '@/lib/export'
import { fmtDate, money2 } from '@/lib/format'
import type { DbData, Product, StockOrder, Stocktake, Supplier } from '@/types'
import { orderFeesTotal, orderSubtotal, orderTotal } from '@/api/catalog'

/** Shared bits for the inventory pages (stocktakes, stock orders, suppliers). */

type AnyStatus = Stocktake['status'] | StockOrder['status']

const TONES: Record<AnyStatus, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  in_progress: 'info',
  paused: 'warning',
  draft: 'neutral',
  completed: 'success',
  cancelled: 'danger',
  ordered: 'primary',
  received: 'success',
}

export function InventoryStatus({ status }: { status: AnyStatus }) {
  const { t } = useTranslation()
  return <Chip tone={TONES[status]}>{t(`catalog.inventory.common.status.${status}`)}</Chip>
}

export const supplierManager = (s: Pick<Supplier, 'firstName' | 'lastName'>) => [s.firstName, s.lastName].filter(Boolean).join(' ')
export const supplierPhone = (s: Pick<Supplier, 'mobile' | 'telephone'>) => s.mobile || s.telephone || ''

export const productSku = (p: Pick<Product, 'skus'> | undefined) => p?.skus[0] ?? ''

/** Measure + amount, e.g. "100 ml". */
export const productSize = (p: Pick<Product, 'amount' | 'measure'> | undefined) => (p?.amount ? `${p.amount} ${p.measure === 'whole' ? '' : p.measure}`.trim() : '')

function orderTables(order: StockOrder, data: Pick<DbData, 'products'>, t: TFunction): ExportTable[] {
  const sub = orderSubtotal(order.items)
  const fees = orderFeesTotal(order.fees, sub)
  const received = order.status === 'received'
  return [
    {
      headers: [t('catalog.inventory.pdf.product'), t('catalog.inventory.pdf.sku'), t('catalog.inventory.pdf.qty'), ...(received ? [t('catalog.inventory.pdf.received')] : []), t('catalog.inventory.pdf.unitCost'), t('catalog.inventory.pdf.total')],
      rows: order.items.map((i) => {
        const p = data.products.find((x) => x.id === i.productId)
        return [p?.name ?? '', productSku(p), i.qty, ...(received ? [i.receivedQty ?? 0] : []), money2(i.unitCost), money2(i.qty * i.unitCost)]
      }),
    },
    {
      title: t('catalog.inventory.pdf.summary'),
      headers: [t('catalog.inventory.pdf.item'), t('catalog.inventory.pdf.amount')],
      rows: [
        [t('catalog.inventory.pdf.subtotal'), money2(sub)],
        ...order.fees.map((f) => [f.type === 'percent' ? `${f.name} (${f.amount}%)` : f.name, money2(f.type === 'percent' ? (sub * f.amount) / 100 : f.amount)]),
        [t('catalog.inventory.pdf.fees'), money2(fees)],
        [t('catalog.inventory.common.total'), money2(orderTotal(order))],
      ],
    },
  ]
}

/** Stock order PDF (order lines + totals). */
export async function downloadOrderPdf(order: StockOrder, data: Pick<DbData, 'products' | 'suppliers' | 'locations'>, t: TFunction): Promise<void> {
  const supplier = data.suppliers.find((s) => s.id === order.supplierId)
  const location = data.locations.find((l) => l.id === order.locationId)
  await exportPdf(`stock_order_${order.number}`, {
    title: t('catalog.inventory.pdf.title', { number: order.number }),
    subtitle: t('catalog.inventory.pdf.subtitle', { supplier: supplier?.name ?? '', date: fmtDate(order.createdAt), location: location?.name ?? '' }),
    tables: orderTables(order, data, t),
  })
}

export function downloadOrderCsv(order: StockOrder, data: Pick<DbData, 'products'>, t: TFunction): void {
  exportCsv(`stock_order_${order.number}`, orderTables(order, data, t))
}
