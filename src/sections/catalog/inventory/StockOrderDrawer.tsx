import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Button, EmptyState, Menu, MenuButton, confirm, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate, fmtDateTimeUS, money } from '@/lib/format'
import { ApiError } from '@/api/client'
import { cancelStockOrder, emailStockOrder, orderFeesTotal, orderQuantity, orderSubtotal, orderTotal } from '@/api/catalog'
import { InfoCard, ProductThumb } from '../ui'
import { InventoryDrawerFrame, InventoryStatus, downloadOrderCsv, downloadOrderPdf, productSku, supplierManager, supplierPhone } from './shared'

type Tab = 'details' | 'activity'

/** Stock order drawer (`?drawer=stock-order&id=…`, catalog.md §6). */
export function StockOrderDrawer({ id, params }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const order = useDb((s) => s.stockOrders.find((o) => o.id === id))
  const products = useDb((s) => s.products)
  const suppliers = useDb((s) => s.suppliers)
  const locations = useDb((s) => s.locations)
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'activity' ? 'activity' : 'details')

  if (!order) return <EmptyState className="h-full" title={t('catalog.inventory.common.notFoundTitle')} body={t('catalog.inventory.common.notFoundBody')} />

  const supplier = suppliers.find((s) => s.id === order.supplierId)
  const location = locations.find((l) => l.id === order.locationId)
  const sub = orderSubtotal(order.items)
  const data = { products, suppliers, locations }

  const email = async () => {
    try {
      const to = await emailStockOrder(order.id)
      toast(t('catalog.inventory.orderDrawer.emailed', { email: to }))
    } catch (e) {
      toast(e instanceof ApiError ? t('catalog.inventory.orderNew.ready.noEmail') : String(e))
    }
  }

  const cancel = async () => {
    const ok = await confirm({ title: t('catalog.inventory.orderDrawer.cancelTitle', { number: order.number }), body: t('catalog.inventory.orderDrawer.cancelBody'), confirmLabel: t('catalog.inventory.orderDrawer.cancel'), tone: 'danger' })
    if (!ok) return
    await cancelStockOrder(order.id)
    toast(t('catalog.inventory.orderDrawer.cancelled'))
  }

  const hero = (
    <>
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-3 font-display text-title-1 text-ink">
          {t('catalog.inventory.orderDrawer.title', { number: order.number })}
          <InventoryStatus status={order.status} />
        </h2>
        <p className="mt-1 text-body text-muted">
          {t('catalog.inventory.orderDrawer.created', { date: fmtDate(parseISO(order.createdAt)) })}
          {supplier ? ` · ${supplier.name}` : ''}
        </p>
      </div>
      <div>
        <Menu
          align="right"
          width={220}
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {t('catalog.inventory.common.actions')}
            </MenuButton>
          )}
          groups={[
            {
              items: [
                ...(order.status === 'ordered' ? [{ label: t('catalog.inventory.orderDrawer.receive'), onSelect: () => navigate(`/catalogue/orders/${order.id}/receive`) }] : []),
                { label: t('catalog.inventory.orderDrawer.emailPdf'), onSelect: () => void email() },
                { label: t('catalog.inventory.orderDrawer.pdf'), onSelect: () => void downloadOrderPdf(order, data, t) },
                { label: t('catalog.inventory.orderDrawer.csv'), onSelect: () => downloadOrderCsv(order, data, t) },
              ],
            },
            ...(order.status === 'ordered' ? [{ items: [{ label: t('catalog.inventory.orderDrawer.cancel'), danger: true, onSelect: () => void cancel() }] }] : []),
          ]}
        />
      </div>
    </>
  )

  return (
    <InventoryDrawerFrame
      hero={hero}
      tab={tab}
      onTab={(next) => {
        setTab(next)
        drawer.update({ tab: next })
      }}
      tabs={[
        { value: 'details', label: t('catalog.inventory.orderDrawer.tabs.details') },
        { value: 'activity', label: t('catalog.inventory.orderDrawer.tabs.activity') },
      ]}
    >
      {tab === 'details' ? (
        <>
          <InfoCard
            title={t('catalog.inventory.orderDrawer.summary')}
            rows={[
              { label: t('catalog.inventory.orderDrawer.createdAt'), value: fmtDateTimeUS(parseISO(order.createdAt)) },
              { label: t('catalog.inventory.orderDrawer.expected'), value: order.expectedAt ? fmtDate(parseISO(order.expectedAt)) : '-' },
              ...(order.receivedAt ? [{ label: t('catalog.inventory.orderDrawer.receivedAt'), value: fmtDateTimeUS(parseISO(order.receivedAt)) }] : []),
              { label: t('catalog.inventory.orderDrawer.deliverTo'), value: location?.name },
              { label: t('catalog.inventory.orderDrawer.totalQty'), value: orderQuantity(order.items) },
              ...(order.fees.length ? [{ label: t('catalog.inventory.orderDrawer.fees'), value: money(orderFeesTotal(order.fees, sub)) }] : []),
              { label: t('catalog.inventory.orderDrawer.totalCost'), value: <span className="text-body-strong text-ink">{money(orderTotal(order))}</span> },
            ]}
          />
          {supplier && (
            <InfoCard
              title={t('catalog.inventory.orderDrawer.supplier')}
              action={
                <Button variant="link" onClick={() => navigate(`/catalogue/suppliers/edit/${supplier.id}`)}>
                  {t('catalog.inventory.common.edit')}
                </Button>
              }
              rows={[
                { label: t('catalog.inventory.orderDrawer.name'), value: <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('supplier', { id: supplier.id })}>{supplier.name}</button> },
                { label: t('catalog.inventory.orderDrawer.manager'), value: supplierManager(supplier) },
                { label: t('catalog.inventory.orderDrawer.email'), value: supplier.email },
                { label: t('catalog.inventory.orderDrawer.phone'), value: supplierPhone(supplier) },
                { label: t('catalog.inventory.orderDrawer.website'), value: supplier.website },
                { label: t('catalog.inventory.orderDrawer.description'), value: supplier.description, block: true },
              ]}
            />
          )}
          <InfoCard title={t('catalog.inventory.orderDrawer.products')}>
            <ul className="flex flex-col divide-y divide-line">
              {order.items.map((item) => {
                const p = products.find((x) => x.id === item.productId)
                return (
                  <li key={item.productId} className="flex items-center gap-3 py-3">
                    <ProductThumb product={p} size={44} />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => p && drawer.open('product', { id: p.id })}>
                      <span className="block truncate text-body text-ink hover:text-primary">{p?.name ?? item.productId}</span>
                      <span className="block text-small text-muted">
                        {[productSku(p) && t('catalog.inventory.common.sku', { sku: productSku(p) }), t('catalog.inventory.orderDrawer.qtyLine', { qty: item.qty, cost: money(item.unitCost) }), order.status === 'received' ? t('catalog.inventory.orderDrawer.receivedLine', { count: item.receivedQty ?? 0 }) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    <span className="tabular text-body-strong text-ink">{money(item.qty * item.unitCost)}</span>
                  </li>
                )
              })}
            </ul>
          </InfoCard>
        </>
      ) : (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h3 className="mb-4 font-display text-title-3 text-ink">{t('catalog.inventory.orderDrawer.tabs.activity')}</h3>
          {order.activity.length ? (
            <ol className="flex flex-col gap-4">
              {[...order.activity].reverse().map((a) => (
                <li key={a.id} className="border-l-2 border-primary/40 pl-4">
                  <p className="text-body-strong text-ink">{a.title}</p>
                  {a.detail && <p className="text-small text-muted">{a.detail}</p>}
                  <p className="text-small text-muted">
                    {a.by} · {fmtDateTimeUS(parseISO(a.at))}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-muted">{t('catalog.inventory.orderDrawer.noActivity')}</p>
          )}
        </section>
      )}
    </InventoryDrawerFrame>
  )
}
