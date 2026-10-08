import { Package, ShoppingBag, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Chip, confirm, DataTable, EmptyState, IntroPage, Menu, Modal, MoneyInput, Page, PageHeader, PageSkeleton, Switch, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { addOnStatus, businessSlug, saveStoreSettings, setProductOnline, setStoreActive, STORE_BASE, useStoreConfig } from '@/api/online'
import { fmtDate, fullName, money, money2 } from '@/lib/format'
import { now } from '@/lib/time'
import type { Product, ProductOrder } from '@/types'
import { copyText, LinkWithQr, PhoneArt, Stat } from './shared'

const ORDER_TONE: Record<ProductOrder['status'], 'info' | 'warning' | 'primary' | 'success' | 'danger'> = { new: 'info', ready: 'warning', shipped: 'primary', completed: 'success', cancelled: 'danger' }

/** Product store (online-booking.md §6): intro, then the store dashboard. */
export function ProductStorePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  const workspace = useDb((s) => s.workspace)
  const products = useDb((s) => s.products)
  const orders = useDb((s) => s.productOrders)
  const clients = useDb((s) => s.clients)
  const store = useStoreConfig()
  const locations = useDb((s) => s.locations)
  const [busy, setBusy] = useState(false)
  const [paymentsGate, setPaymentsGate] = useState(false)
  const [fee, setFee] = useState<number | ''>(store.shippingFee)
  const active = addOnStatus(addOns, 'product-store') === 'active'
  const paymentsOn = addOnStatus(addOns, 'payments') === 'active'
  const retail = useMemo(() => products.filter((p) => !p.archived && p.retailSales), [products])
  const recent = useMemo(() => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [orders])
  const month = useMemo(() => {
    const key = now().toISOString().slice(0, 7)
    const list = orders.filter((o) => o.createdAt.startsWith(key) && o.status !== 'cancelled')
    return { count: list.length, revenue: list.reduce((n, o) => n + o.total, 0) }
  }, [orders])
  if (loading) return <Page><PageSkeleton /></Page>

  const launch = async () => {
    // The store takes payments online: Payments must be set up first.
    if (!paymentsOn) return setPaymentsGate(true)
    setBusy(true)
    try {
      await setStoreActive(true)
      toast(t('online.store.launchedToast'))
    } finally {
      setBusy(false)
    }
  }

  if (!active) {
    return (
      <Page>
        <IntroPage
          badge={t('online.common.included')}
          title={t('online.store.introTitle')}
          body={t('online.store.introBody')}
          bullets={[t('online.store.b1'), t('online.store.b2'), t('online.store.b3'), t('online.store.b4')]}
          primary={{ label: t('online.common.startNow'), onClick: () => void launch(), loading: busy }}
          art={<PhoneArt name={workspace.name} city={locations[0]?.address.city} cta={t('online.store.shopNow')} lines={[t('online.store.art1'), t('online.store.art2')]} />}
        />
        <Modal
          open={paymentsGate}
          onClose={() => setPaymentsGate(false)}
          title={t('online.store.paymentsGateTitle')}
          footer={
            <>
              <Button onClick={() => setPaymentsGate(false)}>{t('online.common.close')}</Button>
              <Button variant="primary" onClick={() => navigate('/payments/payment-processing')}>
                {t('online.store.paymentsGateAction')}
              </Button>
            </>
          }
        >
          <p className="text-body text-muted">{t('online.store.paymentsGateBody')}</p>
        </Modal>
      </Page>
    )
  }

  const url = `${STORE_BASE}/${businessSlug(workspace.name)}`
  const hidden = new Set(store.hiddenProductIds)
  const pause = async () => {
    if (!(await confirm({ title: t('online.store.pauseTitle'), body: t('online.store.pauseBody'), confirmLabel: t('online.store.pause'), tone: 'danger' }))) return
    await setStoreActive(false)
    toast(t('online.store.pausedToast'))
  }
  const toggle = async (p: Product, on: boolean) => {
    await setProductOnline(p.id, on)
    toast(on ? t('online.store.shownToast', { name: p.name }) : t('online.store.hiddenToast', { name: p.name }))
  }
  const productCols: Column<Product>[] = [
    {
      key: 'name',
      header: t('online.store.cols.product'),
      sortValue: (p) => p.name,
      cell: (p) => (
        <span className="flex items-center gap-3">
          {p.images[0] ? <img src={p.images[0]} alt="" className="h-9 w-9 rounded-md object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sunken text-muted"><Package size={16} aria-hidden /></span>}
          <span className="text-body-strong text-ink">{p.name}</span>
        </span>
      ),
    },
    { key: 'price', header: t('online.store.cols.price'), align: 'right', sortValue: (p) => p.retailPrice, cell: (p) => money(p.retailPrice) },
    { key: 'stock', header: t('online.store.cols.stock'), align: 'right', sortValue: (p) => p.stock, cell: (p) => (p.trackStock ? p.stock : '—') },
    { key: 'online', header: t('online.store.cols.online'), align: 'right', cell: (p) => <Switch checked={!hidden.has(p.id)} onChange={(on) => void toggle(p, on)} label={<span className="sr-only">{t('online.store.visibleFor', { name: p.name })}</span>} /> },
  ]
  const orderCols: Column<ProductOrder>[] = [
    { key: 'n', header: t('online.store.cols.order'), cell: (o) => `#${o.number}` },
    { key: 'client', header: t('online.store.cols.client'), cell: (o) => fullName(clients.find((c) => c.id === o.clientId)) },
    { key: 'date', header: t('online.store.cols.date'), cell: (o) => fmtDate(o.createdAt) },
    { key: 'status', header: t('online.store.cols.status'), cell: (o) => <Chip tone={ORDER_TONE[o.status]}>{t(`online.store.status.${o.status}`)}</Chip> },
    { key: 'total', header: t('online.store.cols.total'), align: 'right', cell: (o) => money2(o.total) },
  ]
  const online = retail.filter((p) => !hidden.has(p.id)).length

  return (
    <Page wide>
      <PageHeader
        title={t('online.store.title')}
        subtitle={t('online.store.subtitle')}
        actions={
          <>
            <Menu
              label={t('online.common.options')}
              trigger={({ toggle: open, open: isOpen }) => (
                <Button onClick={open} aria-expanded={isOpen}>
                  {t('online.common.options')}
                </Button>
              )}
              groups={[
                { items: [{ label: t('online.common.copyLink'), onSelect: () => copyText(url, t('online.common.linkCopied')) }, { label: t('online.store.manageProducts'), onSelect: () => navigate('/catalogue/products') }] },
                { items: [{ label: t('online.store.pause'), danger: true, onSelect: () => void pause() }] },
              ]}
            />
            <Button variant="primary" onClick={() => navigate('/sales/store-orders')}>
              {t('online.store.viewOrders')}
            </Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat icon={<ShoppingBag size={18} aria-hidden />} label={t('online.store.ordersMonth')} value={String(month.count)} />
        <Stat icon={<Store size={18} aria-hidden />} label={t('online.store.revenueMonth')} value={money(month.revenue)} />
        <Stat icon={<Package size={18} aria-hidden />} label={t('online.store.productsOnline')} value={`${online}/${retail.length}`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title={t('online.store.recentOrders')}
            action={
              <Button variant="link" onClick={() => navigate('/sales/store-orders')}>
                {t('online.store.viewAll')}
              </Button>
            }
          >
            {recent.length ? (
              <DataTable columns={orderCols} rows={recent} rowKey={(o) => o.id} onRowClick={() => navigate('/sales/store-orders')} footer={false} />
            ) : (
              <EmptyState icon={<ShoppingBag size={32} aria-hidden />} title={t('online.store.noOrders')} body={t('online.store.noOrdersBody')} action={<Button onClick={() => copyText(url, t('online.common.linkCopied'))}>{t('online.common.copyLink')}</Button>} />
            )}
          </Card>
          <Card title={t('online.store.products')} subtitle={t('online.store.productsBody')}>
            {retail.length ? (
              <DataTable columns={productCols} rows={retail} rowKey={(p) => p.id} pageSize={10} />
            ) : (
              <EmptyState icon={<Package size={32} aria-hidden />} title={t('online.store.noProducts')} action={<Button variant="primary" onClick={() => navigate('/catalogue/products')}>{t('online.store.manageProducts')}</Button>} />
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={t('online.store.link')} subtitle={t('online.store.linkBody')}>
            <LinkWithQr url={url} fileName="store-qr" />
          </Card>
          <Card title={t('online.store.delivery')}>
            <div className="flex flex-col gap-4">
              <Switch
                checked={store.pickup}
                onChange={async (v) => {
                  await saveStoreSettings({ pickup: v })
                  toast(t('online.store.settingsSaved'))
                }}
                label={t('online.store.pickup')}
                hint={t('online.store.pickupHint')}
              />
              <Switch
                checked={store.shipping}
                onChange={async (v) => {
                  await saveStoreSettings({ shipping: v })
                  toast(t('online.store.settingsSaved'))
                }}
                label={t('online.store.shipping')}
                hint={t('online.store.shippingHint')}
              />
              {store.shipping && (
                <div className="flex items-end gap-2">
                  <label className="flex-1">
                    <span className="label mb-1 block">{t('online.store.shippingFee')}</span>
                    <MoneyInput value={fee} onChange={setFee} aria-label={t('online.store.shippingFee')} />
                  </label>
                  <Button
                    onClick={async () => {
                      await saveStoreSettings({ shippingFee: Number(fee) || 0 })
                      toast(t('online.store.settingsSaved'))
                    }}
                  >
                    {t('online.common.save')}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  )
}
