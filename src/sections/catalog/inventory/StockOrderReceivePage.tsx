import { Download, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, FullscreenFrame, Modal, MoneyInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import type { StockOrder, StockOrderItem } from '@/types'
import { orderTotal, receiveStockOrder } from '@/api/catalog'
import { ProductThumb, Stepper, SuccessHero } from '../ui'
import { downloadOrderPdf, productSku } from './shared'

/** Receive stock for an order (`/catalogue/orders/:id/receive`, catalog.md §6). */
export function StockOrderReceivePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const order = useDb((s) => s.stockOrders.find((o) => o.id === id))
  const [doneId, setDoneId] = useState<string | null>(null)

  if (!order)
    return (
      <FullscreenFrame closeLabel={t('catalog.common.close')} onClose={() => navigate('/catalogue/orders')}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} />
      </FullscreenFrame>
    )
  if (doneId === order.id) return <ReceivedView order={order} />
  if (order.status !== 'ordered')
    return (
      <FullscreenFrame closeLabel={t('catalog.common.close')} onClose={() => navigate('/catalogue/orders')}>
        <EmptyState
          title={t('catalog.inventory.receive.notReceivable')}
          action={<Button onClick={() => navigate(`/catalogue/orders?drawer=stock-order&id=${order.id}`)}>{t('catalog.common.back')}</Button>}
        />
      </FullscreenFrame>
    )
  return <ReceiveForm key={order.id} order={order} onDone={() => setDoneId(order.id)} />
}

function ReceiveForm({ order, onDone }: { order: StockOrder; onDone: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const products = useDb((s) => s.products)
  const locations = useDb((s) => s.locations)
  const [items, setItems] = useState<StockOrderItem[]>(() => order.items.map((i) => ({ ...i, receivedQty: i.receivedQty ?? 0 })))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const location = locations.find((l) => l.id === order.locationId)
  const patch = (productId: string, next: Partial<StockOrderItem>) => setItems((list) => list.map((i) => (i.productId === productId ? { ...i, ...next } : i)))
  const received = items.reduce((s, i) => s + (i.receivedQty ?? 0), 0)
  const receivedTotal = items.reduce((s, i) => s + (i.receivedQty ?? 0) * i.unitCost, 0)

  const submit = async () => {
    setBusy(true)
    try {
      await receiveStockOrder(order.id, items, order.fees)
      toast(t('catalog.inventory.receive.toast'))
      setConfirmOpen(false)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')}
      onClose={() => navigate(`/catalogue/orders?drawer=stock-order&id=${order.id}`)}
      maxWidth="max-w-5xl"
      actions={
        <>
          <Button icon={<Wand2 size={16} />} aria-label={t('catalog.inventory.receive.autofill')} className="max-md:w-10 max-md:px-0" onClick={() => setItems((list) => list.map((i) => ({ ...i, receivedQty: i.qty })))}>
            <span className="hidden md:inline">{t('catalog.inventory.receive.autofill')}</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!received) {
                toast(t('catalog.inventory.receive.nothing'))
                return
              }
              setConfirmOpen(true)
            }}
          >
            {t('catalog.inventory.receive.submit')}
          </Button>
        </>
      }
    >
      <h1 className="font-display text-title-1 text-ink md:text-display">{t('catalog.inventory.receive.title', { number: order.number })}</h1>
      <p className="mb-5 mt-1 text-body text-muted md:mb-6 md:text-body-lg">{t('catalog.inventory.receive.subtitle')}</p>
      {/* Phones: one card per product, then the totals, instead of the wide table. */}
      <div className="flex flex-col gap-3 md:hidden">
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const p = products.find((x) => x.id === item.productId)
            const name = p?.name ?? item.productId
            return (
              <li key={item.productId} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-start gap-3">
                  <ProductThumb product={p} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-body text-ink">{name}</p>
                    <p className="text-small text-muted">{[productSku(p) && t('catalog.inventory.common.sku', { sku: productSku(p) }), t('catalog.inventory.common.inStock', { count: p?.stock ?? 0 })].filter(Boolean).join(' · ')}</p>
                    <p className="text-small text-muted">
                      {t('catalog.inventory.receive.cols.ordered')}: <span className="tabular text-ink">{item.qty}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <p className="mb-1 text-small text-muted">{t('catalog.inventory.receive.cols.received')}</p>
                    <Stepper value={item.receivedQty ?? 0} onChange={(v) => patch(item.productId, { receivedQty: v })} label={t('catalog.inventory.receive.receivedLabel', { name })} />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-small text-muted">{t('catalog.inventory.receive.cols.unitCost')}</p>
                    <MoneyInput value={item.unitCost} aria-label={t('catalog.inventory.receive.costLabel', { name })} onChange={(v) => patch(item.productId, { unitCost: v === '' ? 0 : Math.max(0, v) })} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                  <span className="text-body text-muted">{t('catalog.inventory.receive.cols.total')}</span>
                  <span className="tabular text-body-strong text-ink">{money((item.receivedQty ?? 0) * item.unitCost)}</span>
                </div>
              </li>
            )
          })}
        </ul>
        <dl className="flex flex-col gap-2 rounded-lg border border-line bg-sunken p-4 text-body">
          <div className="flex justify-between gap-3">
            <dt className="text-ink">{t('catalog.inventory.receive.cols.ordered')}</dt>
            <dd className="tabular">{items.reduce((s, i) => s + i.qty, 0)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink">{t('catalog.inventory.receive.cols.received')}</dt>
            <dd className="tabular">{received}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
            <dt className="text-ink">{t('catalog.inventory.common.total')}</dt>
            <dd className="tabular">{money(receivedTotal)}</dd>
          </div>
        </dl>
      </div>
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-3 text-body-strong text-ink">{t('catalog.inventory.receive.cols.product')}</th>
              <th className="px-4 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.receive.cols.ordered')}</th>
              <th className="px-4 py-3 text-body-strong text-ink">{t('catalog.inventory.receive.cols.received')}</th>
              <th className="px-4 py-3 text-body-strong text-ink">{t('catalog.inventory.receive.cols.unitCost')}</th>
              <th className="px-4 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.receive.cols.total')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const p = products.find((x) => x.id === item.productId)
              const name = p?.name ?? item.productId
              return (
                <tr key={item.productId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumb product={p} size={48} />
                      <div className="min-w-0">
                        <p className="text-body text-ink">{name}</p>
                        <p className="text-small text-muted">
                          {[productSku(p) && t('catalog.inventory.common.sku', { sku: productSku(p) }), t('catalog.inventory.common.inStock', { count: p?.stock ?? 0 })].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular">{item.qty}</td>
                  <td className="px-4 py-3">
                    <Stepper value={item.receivedQty ?? 0} onChange={(v) => patch(item.productId, { receivedQty: v })} label={t('catalog.inventory.receive.receivedLabel', { name })} />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyInput className="w-32" value={item.unitCost} aria-label={t('catalog.inventory.receive.costLabel', { name })} onChange={(v) => patch(item.productId, { unitCost: v === '' ? 0 : Math.max(0, v) })} />
                  </td>
                  <td className="px-4 py-3 text-right tabular text-body-strong">{money((item.receivedQty ?? 0) * item.unitCost)}</td>
                </tr>
              )
            })}
            <tr className="bg-sunken font-semibold">
              <td className="px-4 py-3">{t('catalog.inventory.common.total')}</td>
              <td className="px-4 py-3 text-right tabular">{items.reduce((s, i) => s + i.qty, 0)}</td>
              <td className="px-4 py-3 tabular">{received}</td>
              <td />
              <td className="px-4 py-3 text-right tabular">{money(receivedTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title={t('catalog.inventory.receive.confirmTitle', { number: order.number })}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('catalog.inventory.common.goBack')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void submit()}>
              {t('catalog.inventory.common.confirm')}
            </Button>
          </>
        }
      >
        <p className="pb-2 text-body text-muted">{t('catalog.inventory.receive.confirmBody', { location: location?.name ?? '' })}</p>
      </Modal>
    </FullscreenFrame>
  )
}

function ReceivedView({ order }: { order: StockOrder }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const products = useDb((s) => s.products)
  const suppliers = useDb((s) => s.suppliers)
  const locations = useDb((s) => s.locations)
  const [busy, setBusy] = useState(false)
  const received = order.items.reduce((s, i) => s + (i.receivedQty ?? 0), 0)
  const done = () => navigate('/catalogue/orders')
  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')} onClose={done} progress={1} maxWidth="max-w-2xl">
      <div className="py-6">
        <SuccessHero title={t('catalog.inventory.receive.doneTitle')} subtitle={t('catalog.inventory.receive.doneSubtitle', { number: order.number })} />
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4 md:p-6">
          <div>
            <p className="text-body-strong text-ink">{t('catalog.inventory.receive.doneProducts', { count: received })}</p>
            <p className="text-body text-muted">{t('catalog.inventory.receive.doneAmount', { total: money(orderTotal(order)) })}</p>
          </div>
          <Button
            icon={<Download size={16} />}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await downloadOrderPdf(order, { products, suppliers, locations }, t)
                toast(t('catalog.toasts.downloaded'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('catalog.inventory.orderDrawer.pdf')}
          </Button>
        </section>
        <div className="mt-8 flex justify-center">
          <Button variant="primary" size="lg" onClick={done}>
            {t('catalog.inventory.common.done')}
          </Button>
        </div>
      </div>
    </FullscreenFrame>
  )
}
