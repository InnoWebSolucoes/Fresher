import clsx from 'clsx'
import { ChevronRight, History, Package, Pencil, Receipt, Truck } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, Menu, MenuButton, Select, confirm, toast } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { exportCsv, exportedFileName } from '@/lib/export'
import { fmtDate, fmtDateTimeUS, fullName, money, round2 } from '@/lib/format'
import { now } from '@/lib/time'
import type { Product } from '@/types'
import { deleteProducts } from '@/api/catalog'
import { InfoCard } from '../ui'
import { StockModal, useReasonLabel } from './parts'

const P = 'catalog.products2'
type Tab = 'details' | 'orders' | 'sales' | 'history'

/** Product drawer `?drawer=product&id=…` (catalog.md §4). */
export function ProductDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const products = useDb((s) => s.products)
  const product = products.find((p) => p.id === id)
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'orders' || tabParam === 'sales' || tabParam === 'history' ? tabParam : 'details'
  const [stockMode, setStockMode] = useState<'add' | 'remove' | null>(null)

  if (!product) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState icon={<Package size={26} />} title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} action={<Button onClick={close}>{t('catalog.common.close')}</Button>} />
      </div>
    )
  }

  const remove = async () => {
    const ok = await confirm({ title: t(`${P}.deleteTitle`), body: t(`${P}.deleteBody`, { name: product.name }), confirmLabel: t('catalog.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteProducts([product.id])
    close()
    toast(t(`${P}.toasts.productDeleted`))
  }

  const hero = (
    <>
      <div className="mb-2 flex h-36 w-36 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface text-subtle">
        {product.images[0] ? <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" /> : <Package size={56} strokeWidth={1.2} aria-hidden />}
      </div>
      <h2 className="font-display text-title-3 text-ink">{product.name}</h2>
      {product.trackStock ? (
        <span className={clsx('chip h-6', product.stock <= 0 ? 'bg-danger-subtle text-danger' : product.stock <= product.lowStockLevel ? 'bg-warning-subtle text-warning' : 'bg-primary-subtle text-primary')}>{t(`${P}.inStock`, { count: product.stock })}</span>
      ) : (
        <span className="chip h-6 bg-sunken text-muted">{t(`${P}.notTracked`)}</span>
      )}
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
                { label: t(`${P}.actions.addStock`), onSelect: () => setStockMode('add') },
                { label: t(`${P}.actions.removeStock`), onSelect: () => setStockMode('remove'), disabled: !product.trackStock },
                { label: t(`${P}.actions.orderStock`), onSelect: () => navigate(`/catalogue/orders/new?d_product=${product.id}`) },
                { label: t(`${P}.actions.sellProduct`), onSelect: () => drawer.open('checkout', { d_add: `product:${product.id}` }), disabled: !product.retailSales },
                { label: t(`${P}.actions.editProduct`), onSelect: () => navigate(`/catalogue/products/edit/${product.id}`) },
              ],
            },
            { items: [{ label: t(`${P}.actions.deleteProduct`), danger: true, onSelect: () => void remove() }] },
          ]}
        />
      </div>
    </>
  )

  return (
    <>
      <ProductPanes
        hero={hero}
        tab={tab}
        onTab={(next) => drawer.update({ tab: next === 'details' ? undefined : next })}
        tabs={[
          { value: 'details', label: t(`${P}.tabs.details`) },
          { value: 'orders', label: t(`${P}.tabs.orders`) },
          { value: 'sales', label: t(`${P}.tabs.sales`) },
          { value: 'history', label: t(`${P}.tabs.history`) },
        ]}
      >
        {tab === 'details' && <DetailsTab product={product} />}
        {tab === 'orders' && <OrdersTab product={product} />}
        {tab === 'sales' && <SalesTab product={product} />}
        {tab === 'history' && <HistoryTab product={product} />}
      </ProductPanes>
      <StockModal product={product} mode={stockMode ?? 'add'} open={stockMode !== null} onClose={() => setStockMode(null)} />
    </>
  )
}

/** Left hero + vertical tabs, grey right pane (narrower left column than TwoPaneDrawer to fit 720px). */
function ProductPanes({ hero, tabs, tab, onTab, children }: { hero: ReactNode; tabs: { value: Tab; label: string }[]; tab: Tab; onTab: (t: Tab) => void; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[250px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
        <div className="flex flex-col items-center gap-2 border-b border-line px-5 pb-6 pt-8 text-center">{hero}</div>
        <nav className="flex flex-col gap-1 p-3" role="tablist" aria-orientation="vertical">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => onTab(item.value)}
              className={clsx('flex h-11 items-center rounded-md px-4 text-left text-body', tab === item.value ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto bg-sunken px-6 py-8">{children}</div>
    </div>
  )
}

function TabTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h2 className="font-display text-title-2 text-ink">{title}</h2>
      {action}
    </div>
  )
}

function DetailsTab({ product }: { product: Product }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const brands = useDb((s) => s.brands)
  const categories = useDb((s) => s.productCategories)
  const suppliers = useDb((s) => s.suppliers)
  const movements = useDb((s) => s.stockMovements)
  const supplier = suppliers.find((s) => s.id === product.supplierId)
  const avgCost = useMemo(() => {
    const incoming = movements.filter((m) => m.productId === product.id && m.qty > 0 && m.supplyPrice !== undefined)
    const qty = incoming.reduce((s, m) => s + m.qty, 0)
    return qty ? round2(incoming.reduce((s, m) => s + m.qty * (m.supplyPrice ?? 0), 0) / qty) : product.supplyPrice
  }, [movements, product.id, product.supplyPrice])
  const stock = Math.max(0, product.stock)
  return (
    <>
      <TabTitle
        title={t(`${P}.tabs.details`)}
        action={
          <Button size="sm" iconRight={<Pencil size={14} aria-hidden />} onClick={() => navigate(`/catalogue/products/edit/${product.id}`)}>
            {t('catalog.common.edit')}
          </Button>
        }
      />
      <InfoCard
        title={t(`${P}.form.basicInfo`)}
        rows={[
          { label: t(`${P}.form.barcodeShort`), value: product.barcode },
          { label: t(`${P}.export.brand`), value: brands.find((b) => b.id === product.brandId)?.name },
          { label: t(`${P}.form.category`), value: categories.find((c) => c.id === product.categoryId)?.name },
          {
            label: t(`${P}.form.supplier`),
            value: supplier ? (
              <button type="button" className="text-primary hover:underline" onClick={() => drawer.open('supplier', { id: supplier.id })}>
                {supplier.name}
              </button>
            ) : undefined,
          },
          { label: t(`${P}.form.amount`), value: product.measure === 'whole' ? t(`${P}.measures.whole`) : product.amount !== undefined ? `${product.amount} ${product.measure}` : undefined },
          { label: t(`${P}.form.shortDescription`), value: product.shortDescription, block: true },
          { label: t(`${P}.form.description`), value: product.description, block: true },
        ]}
      />
      <InfoCard
        title={t(`${P}.stockInfo.title`)}
        rows={[
          { label: t(`${P}.stockInfo.primarySku`), value: product.skus[0] },
          { label: t(`${P}.stockInfo.onHand`), value: product.trackStock ? product.stock : t(`${P}.notTracked`) },
          { label: t(`${P}.form.retailPrice`), value: product.retailSales ? money(product.retailPrice) : '-' },
          { label: t(`${P}.stockInfo.totalRetail`), value: money(round2(stock * product.retailPrice)) },
          { label: t(`${P}.form.supplyPrice`), value: money(product.supplyPrice) },
          { label: t(`${P}.stockInfo.totalSupply`), value: money(round2(stock * product.supplyPrice)) },
          { label: t(`${P}.stockInfo.avgCost`), value: money(avgCost) },
          { label: t(`${P}.stockInfo.totalCost`), value: money(round2(stock * avgCost)) },
        ]}
      />
    </>
  )
}

function OrdersTab({ product }: { product: Product }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const orders = useDb((s) => s.stockOrders)
  const suppliers = useDb((s) => s.suppliers)
  const list = useMemo(() => orders.filter((o) => o.items.some((i) => i.productId === product.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orders, product.id])
  return (
    <>
      <TabTitle
        title={t(`${P}.tabs.orders`)}
        action={
          <Button size="sm" onClick={() => navigate(`/catalogue/orders/new?d_product=${product.id}`)}>
            {t(`${P}.actions.orderStock`)}
          </Button>
        }
      />
      {list.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon={<Truck size={26} />} title={t(`${P}.ordersEmpty`)} body={t(`${P}.ordersEmptyBody`)} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((o) => {
            const item = o.items.find((i) => i.productId === product.id)
            return (
              <li key={o.id}>
                <button type="button" onClick={() => drawer.open('stock-order', { id: o.id })} className="flex w-full items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong">
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">
                      {t(`${P}.orderNumber`, { number: o.number })} · {suppliers.find((s) => s.id === o.supplierId)?.name ?? '-'}
                    </span>
                    <span className="block text-small text-muted">
                      {fmtDate(o.createdAt)} · {t(`${P}.orderQty`, { count: item?.qty ?? 0, cost: money(item?.unitCost ?? 0) })}
                    </span>
                  </span>
                  <span className={clsx('chip h-6', o.status === 'received' ? 'bg-success-subtle text-success' : o.status === 'cancelled' ? 'bg-danger-subtle text-danger' : o.status === 'ordered' ? 'bg-info-subtle text-info' : 'bg-sunken text-muted')}>{t(`${P}.orderStatus.${o.status}`)}</span>
                  <ChevronRight size={16} className="text-muted" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function SalesTab({ product }: { product: Product }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const sales = useDb((s) => s.sales)
  const clients = useDb((s) => s.clients)
  const [period, setPeriod] = useState<'all' | '30' | '90'>('all')
  const list = useMemo(() => {
    const since = period === 'all' ? '' : new Date(now().getTime() - Number(period) * 86400000).toISOString()
    return sales
      .filter((s) => s.kind === 'sale' && s.status !== 'voided' && s.status !== 'draft' && s.createdAt >= since && s.items.some((i) => i.type === 'product' && i.refId === product.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [sales, product.id, period])
  return (
    <>
      <TabTitle title={t(`${P}.tabs.sales`)} action={<Select aria-label={t('catalog.common.filters')} className="w-44" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} options={[{ value: 'all', label: t(`${P}.salesPeriod.all`) }, { value: '30', label: t(`${P}.salesPeriod.d30`) }, { value: '90', label: t(`${P}.salesPeriod.d90`) }]} />} />
      {list.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon={<Receipt size={26} />} title={t(`${P}.salesEmpty`)} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((s) => {
            const lines = s.items.filter((i) => i.type === 'product' && i.refId === product.id)
            const qty = lines.reduce((sum, i) => sum + i.quantity, 0)
            const total = round2(lines.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0))
            const client = clients.find((c) => c.id === s.clientId)
            return (
              <li key={s.id}>
                <button type="button" onClick={() => drawer.open('sale', { id: s.id })} className="flex w-full items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left hover:border-line-strong">
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-strong text-ink">
                      {t(`${P}.saleNumber`, { number: s.number })} · {client ? fullName(client) : t(`${P}.walkIn`)}
                    </span>
                    <span className="block text-small text-muted">
                      {fmtDateTimeUS(s.createdAt)} · {t(`${P}.saleQty`, { count: qty })}
                    </span>
                  </span>
                  <span className="text-body-strong text-ink">{money(total)}</span>
                  <ChevronRight size={16} className="text-muted" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function HistoryTab({ product }: { product: Product }) {
  const { t } = useTranslation()
  const reasonLabel = useReasonLabel()
  const movements = useDb((s) => s.stockMovements)
  const locations = useDb((s) => s.locations)
  const list = useMemo(() => movements.filter((m) => m.productId === product.id).sort((a, b) => b.at.localeCompare(a.at)), [movements, product.id])
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? ''
  const exportHistory = () => {
    exportCsv(exportedFileName(), [{ headers: [t(`${P}.history.date`), t(`${P}.history.by`), t('catalog.common.quantity'), t(`${P}.stock.reason`), t(`${P}.form.supplyPrice`), t(`${P}.history.location`)], rows: list.map((m) => [fmtDateTimeUS(m.at), m.by, m.qty, reasonLabel(m.reason), m.supplyPrice ?? '', locName(m.locationId)]) }])
    toast(t('catalog.toasts.downloaded'))
  }
  return (
    <>
      <TabTitle
        title={t(`${P}.tabs.history`)}
        action={
          <Menu
            width={200}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('catalog.common.options')}
              </MenuButton>
            )}
            groups={[{ items: [{ label: t(`${P}.history.export`), onSelect: exportHistory, disabled: !list.length }] }]}
          />
        }
      />
      {list.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon={<History size={26} />} title={t(`${P}.historyEmpty`)} />
        </div>
      ) : (
        <ol className="rounded-lg border border-line bg-surface">
          {list.map((m) => (
            <li key={m.id} className="flex items-start gap-4 border-b border-line px-5 py-4 last:border-0">
              <span className={clsx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-body-strong', m.qty >= 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger')}>{m.qty >= 0 ? '+' : '−'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-ink">{t(`${P}.history.line`, { by: m.by, qty: m.qty > 0 ? `+${m.qty}` : String(m.qty) })}</span>
                <span className="block text-small text-muted">
                  {fmtDateTimeUS(m.at)} • {locName(m.locationId)}
                </span>
                <span className="mt-1 block text-small text-muted">
                  {reasonLabel(m.reason)}
                  {m.ref ? ` · ${m.ref}` : ''}
                  {m.supplyPrice !== undefined ? ` · ${t(`${P}.history.cost`, { price: money(m.supplyPrice) })}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
