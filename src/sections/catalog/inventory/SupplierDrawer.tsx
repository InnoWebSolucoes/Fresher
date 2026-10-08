import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Avatar, Button, EmptyState, Menu, MenuButton } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate, money } from '@/lib/format'
import { orderTotal } from '@/api/catalog'
import { InfoCard, ProductThumb } from '../ui'
import { InventoryDrawerFrame, InventoryStatus, productSku, supplierManager, supplierPhone } from './shared'
import { confirmDeleteSupplier } from './SuppliersPage'

type Tab = 'details' | 'orders' | 'products'

/** Supplier drawer (`?drawer=supplier&id=…`, catalog.md §7). */
export function SupplierDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const supplier = useDb((s) => s.suppliers.find((x) => x.id === id))
  const allProducts = useDb((s) => s.products)
  const allOrders = useDb((s) => s.stockOrders)
  const initialTab = params.get('tab')
  const [tab, setTab] = useState<Tab>(initialTab === 'orders' || initialTab === 'products' ? initialTab : 'details')

  if (!supplier) return <EmptyState className="h-full" title={t('catalog.inventory.common.notFoundTitle')} body={t('catalog.inventory.common.notFoundBody')} />

  const products = allProducts.filter((p) => p.supplierId === supplier.id && !p.archived)
  const orders = allOrders.filter((o) => o.supplierId === supplier.id && o.status !== 'draft').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const createOrder = () => navigate(`/catalogue/orders/new?d_supplier=${supplier.id}`)
  const edit = () => navigate(`/catalogue/suppliers/edit/${supplier.id}`)

  const hero = (
    <>
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={supplier.name} size={64} />
        <div className="min-w-0">
          <h2 className="truncate font-display text-title-1 text-ink">{supplier.name}</h2>
          <p className="text-body text-muted">{t('catalog.inventory.common.products', { count: products.length })}</p>
        </div>
      </div>
      <Menu
        width={220}
        trigger={({ open, toggle }) => (
          <MenuButton open={open} toggle={toggle}>
            {t('catalog.inventory.common.actions')}
          </MenuButton>
        )}
        groups={[
          {
            items: [
              { label: t('catalog.inventory.suppliers.createOrder'), onSelect: createOrder },
              { label: t('catalog.inventory.suppliers.edit'), onSelect: edit },
            ],
          },
          {
            items: [
              {
                label: t('catalog.inventory.suppliers.delete'),
                danger: true,
                onSelect: async () => {
                  if (await confirmDeleteSupplier(supplier, t)) close()
                },
              },
            ],
          },
        ]}
      />
    </>
  )

  const address = supplier.address
  return (
    <InventoryDrawerFrame
      hero={hero}
      tab={tab}
      onTab={(next) => {
        setTab(next)
        drawer.update({ tab: next })
      }}
      tabs={[
        { value: 'details', label: t('catalog.inventory.supplierDrawer.tabs.details') },
        { value: 'orders', label: t('catalog.inventory.supplierDrawer.tabs.orders') },
        { value: 'products', label: t('catalog.inventory.supplierDrawer.tabs.products') },
      ]}
    >
      {tab === 'details' && (
        <>
          <InfoCard
            title={t('catalog.inventory.supplierDrawer.contact')}
            action={
              <Button variant="link" onClick={edit}>
                {t('catalog.inventory.common.edit')}
              </Button>
            }
            rows={[
              { label: t('catalog.inventory.supplierDrawer.name'), value: supplier.name },
              { label: t('catalog.inventory.supplierDrawer.manager'), value: supplierManager(supplier) },
              { label: t('catalog.inventory.supplierDrawer.email'), value: supplier.email },
              { label: t('catalog.inventory.supplierDrawer.phone'), value: supplierPhone(supplier) },
              { label: t('catalog.inventory.supplierDrawer.website'), value: supplier.website },
              { label: t('catalog.inventory.supplierDrawer.description'), value: supplier.description, block: true },
            ]}
          />
          <InfoCard
            title={t('catalog.inventory.supplierDrawer.address')}
            action={
              <Button variant="link" onClick={edit}>
                {t('catalog.inventory.common.edit')}
              </Button>
            }
            rows={[
              { label: t('catalog.inventory.supplierDrawer.street'), value: address.line1 },
              { label: t('catalog.inventory.supplierDrawer.suburb'), value: address.suburb },
              { label: t('catalog.inventory.supplierDrawer.city'), value: address.city },
              { label: t('catalog.inventory.supplierDrawer.state'), value: address.state },
              { label: t('catalog.inventory.supplierDrawer.postcode'), value: address.postcode },
              { label: t('catalog.inventory.supplierDrawer.country'), value: address.country },
            ]}
          />
        </>
      )}
      {tab === 'orders' && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-title-3 text-ink">{t('catalog.inventory.supplierDrawer.tabs.orders')}</h3>
            <Button size="sm" onClick={createOrder}>
              {t('catalog.inventory.suppliers.createOrder')}
            </Button>
          </div>
          {orders.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => drawer.open('stock-order', { id: o.id })} className="flex w-full items-center gap-4 py-3 text-left hover:bg-sunken/60">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong text-ink">{o.number}</span>
                      <span className="block text-small text-muted">{fmtDate(parseISO(o.createdAt))}</span>
                    </span>
                    <InventoryStatus status={o.status} />
                    <span className="w-20 text-right tabular text-body-strong text-ink">{money(orderTotal(o))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted">{t('catalog.inventory.supplierDrawer.noOrders')}</p>
          )}
        </section>
      )}
      {tab === 'products' && (
        <section className="rounded-lg border border-line bg-surface p-6">
          <h3 className="mb-4 font-display text-title-3 text-ink">{t('catalog.inventory.supplierDrawer.tabs.products')}</h3>
          {products.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {products.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => drawer.open('product', { id: p.id })} className="flex w-full items-center gap-3 py-3 text-left hover:bg-sunken/60">
                    <ProductThumb product={p} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink">{p.name}</span>
                      {productSku(p) && <span className="block text-small text-muted">{t('catalog.inventory.common.sku', { sku: productSku(p) })}</span>}
                    </span>
                    <span className="text-small text-muted">{t('catalog.inventory.common.inStock', { count: p.stock })}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted">{t('catalog.inventory.supplierDrawer.noProducts')}</p>
          )}
        </section>
      )}
    </InventoryDrawerFrame>
  )
}
