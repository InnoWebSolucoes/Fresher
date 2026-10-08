import { Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Avatar, Button, EmptyState, Menu, MenuButton } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate, money } from '@/lib/format'
import { orderTotal } from '@/api/catalog'
import { InfoCard, PaneTitle, ProductThumb, TwoPaneDrawer } from '../ui'
import { InventoryStatus, productSku, supplierManager, supplierPhone } from './shared'
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
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'orders' || tabParam === 'products' ? tabParam : 'details'

  if (!supplier) return <EmptyState className="h-full" title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} />

  const products = allProducts.filter((p) => p.supplierId === supplier.id && !p.archived)
  const orders = allOrders.filter((o) => o.supplierId === supplier.id && o.status !== 'draft').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const createOrder = () => navigate(`/catalogue/orders/new?supplier=${supplier.id}`)
  const edit = () => navigate(`/catalogue/suppliers/edit/${supplier.id}`)

  const hero = (
    <>
      <Avatar name={supplier.name} size={96} className="mb-2 text-title-2" />
      <h2 className="font-display text-title-3 text-ink">{supplier.name}</h2>
      <p className="text-body text-muted">{t('catalog.inventory.common.products', { count: products.length })}</p>
      <div className="mt-3">
        <Menu
          align="left"
          width={220}
          trigger={({ open, toggle }) => (
            <MenuButton open={open} toggle={toggle}>
              {t('catalog.common.actions')}
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
      </div>
    </>
  )

  const address = supplier.address
  return (
    <TwoPaneDrawer
      hero={hero}
      tab={tab}
      onTab={(next) => drawer.update({ tab: next === 'details' ? undefined : next })}
      tabs={[
        { value: 'details', label: t('catalog.inventory.supplierDrawer.tabs.details') },
        { value: 'orders', label: t('catalog.inventory.supplierDrawer.tabs.orders') },
        { value: 'products', label: t('catalog.inventory.supplierDrawer.tabs.products') },
      ]}
    >
      {tab === 'details' && (
        <>
          <PaneTitle title={t('catalog.inventory.supplierDrawer.tabs.details')} />
          <InfoCard
            title={t('catalog.inventory.supplierDrawer.contact')}
            action={
              <Button variant="link" onClick={edit}>
                {t('catalog.common.edit')}
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
                {t('catalog.common.edit')}
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
        <>
          <PaneTitle
            title={t('catalog.inventory.supplierDrawer.tabs.orders')}
            action={
              <Button size="sm" onClick={createOrder}>
                {t('catalog.inventory.suppliers.createOrder')}
              </Button>
            }
          />
          {orders.length ? (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => drawer.open('stock-order', { id: o.id })} className="flex w-full items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong text-ink">{t('catalog.inventory.orderDrawer.title', { number: o.number })}</span>
                      <span className="block text-small text-muted">{fmtDate(parseISO(o.createdAt))}</span>
                    </span>
                    <InventoryStatus status={o.status} />
                    <span className="w-20 text-right tabular text-body-strong text-ink">{money(orderTotal(o))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState icon={<Truck size={26} aria-hidden />} title={t('catalog.inventory.supplierDrawer.noOrders')} />
            </div>
          )}
        </>
      )}
      {tab === 'products' && (
        <>
          <PaneTitle title={t('catalog.inventory.supplierDrawer.tabs.products')} />
          {products.length ? (
            <ul className="flex flex-col gap-3">
              {products.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => drawer.open('product', { id: p.id })} className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong">
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
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState title={t('catalog.inventory.supplierDrawer.noProducts')} />
            </div>
          )}
        </>
      )}
    </TwoPaneDrawer>
  )
}
