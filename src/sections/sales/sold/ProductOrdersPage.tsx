import { ShoppingBag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, Chip, DataTable, EmptyState, LearnMore, Menu, Modal, Page, PageHeader, PageSkeleton, PillTabs, SearchInput, Toolbar, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { setProductOrderStatus } from '@/api/salesPages'
import { ApiError } from '@/api/client'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDateTime, money2, round2 } from '@/lib/format'
import type { ProductOrder } from '@/types'
import { OptionsMenu, TableLink } from '../shared/ui'
import { matches, useLookups } from '../shared/data'
import { NoResults } from '../lists/AppointmentsListPage'

type Status = ProductOrder['status']
type Target = Exclude<Status, 'new'>
const STATUSES: Status[] = ['new', 'ready', 'shipped', 'completed', 'cancelled']
const TONES: Record<Status, 'info' | 'warning' | 'primary' | 'success' | 'danger'> = { new: 'info', ready: 'warning', shipped: 'primary', completed: 'success', cancelled: 'danger' }

/** Next steps an order can take from its current status. */
function nextSteps(order: ProductOrder): Target[] {
  switch (order.status) {
    case 'new':
      return order.fulfilment === 'pickup' ? ['ready', 'cancelled'] : ['shipped', 'cancelled']
    case 'ready':
      return ['completed', 'cancelled']
    case 'shipped':
      return ['completed', 'cancelled']
    default:
      return []
  }
}

interface Row {
  order: ProductOrder
  client: string
  items: string
}

export function ProductOrdersPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const orders = useDb((s) => s.productOrders)
  const products = useDb((s) => s.products)
  const lookups = useLookups()
  const [tab, setTab] = useState<'all' | Status>('all')
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const productName = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p.name]))
    return (id: string) => map.get(id) ?? t('sales.orders.deletedProduct')
  }, [products, t])

  const all = useMemo(
    () =>
      orders
        .map((order): Row => {
          const client = lookups.client.get(order.clientId)
          return { order, client: client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn'), items: order.items.map((i) => `${i.qty} × ${productName(i.productId)}`).join(', ') }
        })
        .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt)),
    [orders, lookups, productName, t],
  )
  const rows = all.filter((r) => (tab === 'all' || r.order.status === tab) && (!query.trim() || matches(`#${r.order.number}`, query) || matches(r.client, query) || matches(r.items, query)))

  const run = async (order: ProductOrder, target: Target, notifyClient = true) => {
    if (target === 'cancelled') {
      const ok = await confirm({ title: t('sales.orders.cancelTitle', { number: order.number }), body: t('sales.orders.cancelBody'), confirmLabel: t('sales.orders.cancelConfirm'), tone: 'danger' })
      if (!ok) return
    }
    setBusy(order.id)
    try {
      await setProductOrderStatus(order.id, target, notifyClient)
      toast(t(`sales.orders.toasts.${target}`))
    } catch (e) {
      toast(e instanceof ApiError || e instanceof Error ? e.message : t('sales.common.somethingWrong'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const actionLabel = (target: Target) => t(`sales.orders.actions.${target}`)
  const columns: Column<Row>[] = [
    { key: 'number', header: t('sales.orders.cols.order'), cell: (r) => <TableLink onClick={() => setViewing(r.order.id)}>#{r.order.number}</TableLink> },
    { key: 'client', header: t('sales.orders.cols.client'), cell: (r) => <TableLink onClick={() => drawer.open('client', { id: r.order.clientId })}>{r.client}</TableLink> },
    { key: 'items', header: t('sales.orders.cols.items'), cell: (r) => <span className="block max-w-[260px] truncate">{r.items}</span> },
    { key: 'fulfilment', header: t('sales.orders.cols.fulfilment'), cell: (r) => t(`sales.orders.fulfilment.${r.order.fulfilment}`) },
    { key: 'date', header: t('sales.orders.cols.date'), cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.order.createdAt)}</span> },
    { key: 'total', header: t('sales.orders.cols.total'), align: 'right', cell: (r) => money2(r.order.total) },
    { key: 'status', header: t('sales.orders.cols.status'), cell: (r) => <Chip tone={TONES[r.order.status]}>{t(`sales.orders.status.${r.order.status}`)}</Chip> },
    {
      key: 'actions',
      header: <span className="sr-only">{t('sales.common.actions')}</span>,
      width: '56px',
      cell: (r) => {
        const steps = nextSteps(r.order)
        return (
          <Menu
            label={t('sales.common.actions')}
            groups={[
              { items: [{ label: t('sales.orders.view'), onSelect: () => setViewing(r.order.id) }] },
              ...(steps.length ? [{ items: steps.map((s) => ({ label: actionLabel(s), danger: s === 'cancelled', disabled: busy === r.order.id, onSelect: () => void run(r.order, s) })) }] : []),
            ]}
          />
        )
      },
    },
  ]

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length])) as Record<Status, number>, [orders])
  const current = orders.find((o) => o.id === viewing)

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  return (
    <Page wide>
      <PageHeader
        title={t('sales.orders.title')}
        count={orders.length}
        subtitle={
          <>
            {t('sales.orders.subtitle')} <LearnMore topic="online store" />
          </>
        }
        actions={
          <OptionsMenu
            groups={[
              {
                items: [
                  { label: t('sales.orders.manageProducts'), onSelect: () => navigate('/catalogue/products') },
                  { label: t('sales.orders.manageStore'), onSelect: () => navigate('/online-presence/store') },
                ],
              },
            ]}
          />
        }
      />
      {orders.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ShoppingBag size={24} aria-hidden />}
            title={t('sales.orders.emptyTitle')}
            body={t('sales.orders.emptyBody')}
            action={
              <Button className="rounded-full" onClick={() => navigate('/online-presence/store')}>
                {t('sales.orders.setUp')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <PillTabs
            className="mb-4"
            value={tab}
            onChange={setTab}
            items={[{ value: 'all' as const, label: t('sales.orders.tabs.all'), count: orders.length }, ...STATUSES.map((s) => ({ value: s, label: t(`sales.orders.status.${s}`), count: counts[s] }))]}
          />
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder={t('sales.orders.search')} className="max-w-sm" />
          </Toolbar>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.order.id} onRowClick={(r) => setViewing(r.order.id)} empty={<NoResults />} />
        </>
      )}

      <Modal
        open={Boolean(current)}
        onClose={() => setViewing(null)}
        size="lg"
        title={current ? t('sales.orders.detailTitle', { number: current.number }) : ''}
        subtitle={current ? t('sales.orders.placedOn', { date: fmtDateTime(current.createdAt) }) : ''}
        footer={
          current && (
            <>
              <Button onClick={() => setViewing(null)}>{t('sales.common.close')}</Button>
              {nextSteps(current).map((s) => (
                <Button key={s} variant={s === 'cancelled' ? 'danger' : 'primary'} loading={busy === current.id} onClick={() => void run(current, s, notify)}>
                  {actionLabel(s)}
                </Button>
              ))}
            </>
          )
        }
      >
        {current && <OrderDetail order={current} productName={productName} client={lookups.client.get(current.clientId)} notify={notify} setNotify={setNotify} onClient={() => drawer.open('client', { id: current.clientId })} />}
      </Modal>
    </Page>
  )
}

function OrderDetail({
  order,
  productName,
  client,
  notify,
  setNotify,
  onClient,
}: {
  order: ProductOrder
  productName: (id: string) => string
  client?: { firstName: string; lastName: string; email: string; phone: string; addresses: { line1: string; postcode: string; city: string }[] }
  notify: boolean
  setNotify: (v: boolean) => void
  onClient: () => void
}) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const subtotal = round2(order.items.reduce((s, i) => s + i.qty * i.price, 0))
  const address = client?.addresses[0]
  return (
    <div className="flex flex-col gap-5 pb-2">
      <div className="flex items-center gap-3">
        <Chip tone={TONES[order.status]}>{t(`sales.orders.status.${order.status}`)}</Chip>
        <span className="text-body text-muted">{t(`sales.orders.fulfilment.${order.fulfilment}`)}</span>
      </div>
      <section className="rounded-lg border border-line p-4">
        <p className="text-small text-muted">{t('sales.orders.cols.client')}</p>
        {client ? (
          <>
            <button type="button" className="text-body-strong text-primary hover:underline" onClick={onClient}>
              {client.firstName} {client.lastName}
            </button>
            <p className="text-body text-muted">
              {client.email} • {client.phone}
            </p>
          </>
        ) : (
          <p className="text-body text-ink">{t('sales.common.walkIn')}</p>
        )}
        <p className="mt-3 text-small text-muted">{order.fulfilment === 'pickup' ? t('sales.orders.pickupAt') : t('sales.orders.shipTo')}</p>
        <p className="text-body text-ink">
          {order.fulfilment === 'pickup'
            ? `${locations[0]?.name ?? ''}, ${locations[0]?.address.line1 ?? ''}`
            : address
              ? `${address.line1}, ${address.postcode} ${address.city}`
              : t('sales.orders.addressOnFile')}
        </p>
      </section>
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-line text-left text-body-strong text-ink">
            <th scope="col" className="py-2">
              {t('sales.orders.cols.items')}
            </th>
            <th scope="col" className="py-2 text-right">
              {t('sales.orders.qty')}
            </th>
            <th scope="col" className="py-2 text-right">
              {t('sales.orders.cols.total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.productId} className="border-b border-line">
              <td className="py-2.5 text-ink">{productName(i.productId)}</td>
              <td className="py-2.5 text-right tabular">{i.qty}</td>
              <td className="py-2.5 text-right tabular">{money2(i.qty * i.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="pt-3 text-muted">
              {t('sales.orders.subtotal')}
            </td>
            <td className="pt-3 text-right tabular">{money2(subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="text-muted">
              {t('sales.orders.shipping')}
            </td>
            <td className="text-right tabular">{money2(order.shipping)}</td>
          </tr>
          <tr className="font-semibold text-ink">
            <td colSpan={2} className="pt-1">
              {t('sales.orders.cols.total')}
            </td>
            <td className="pt-1 text-right tabular">{money2(order.total)}</td>
          </tr>
        </tfoot>
      </table>
      {nextSteps(order).length > 0 && <Checkbox label={t('sales.orders.notify')} hint={t('sales.orders.notifyHint')} checked={notify} onChange={setNotify} />}
    </div>
  )
}
