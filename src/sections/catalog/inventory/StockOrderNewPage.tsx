import { ArrowRight, Check, Download, Mail, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { Avatar, Button, EmptyState, FullscreenFrame, MoneyInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { fmtDateTimeUS, money } from '@/lib/format'
import { now, nowISO } from '@/lib/time'
import type { ID, StockOrder, StockOrderItem } from '@/types'
import { ApiError } from '@/api/client'
import { emailStockOrder, orderFeesTotal, orderQuantity, orderSubtotal, orderTotal, saveStockOrder } from '@/api/catalog'
import { LocationCard, LocationPicker, ProductThumb, Stepper, SuccessHero } from '../ui'
import { downloadOrderPdf, productSize, productSku } from './shared'
import { FeesModal, ProductPickerModal } from './OrderModals'

type Step = 'supplier' | 'products' | 'ready'

interface Initial {
  step: Step
  supplierId: ID
  locationId: ID
  items: StockOrderItem[]
  fees: StockOrder['fees']
  expectedAt?: string
  draftId: ID | null
  /** Editing an order that has already been placed (`?edit=`). */
  editing?: boolean
  pendingProduct?: ID
}

/** Create stock order: supplier → products → ready (catalog.md §6). Supports ?product, ?supplier, ?draft and ?edit (placed order). */
export function StockOrderNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const products = useDb((s) => s.products)
  const suppliers = useDb((s) => s.suppliers)
  const locations = useDb((s) => s.locations)
  const orders = useDb((s) => s.stockOrders)

  const [init] = useState<Initial>(() => {
    const base: Initial = { step: 'supplier', supplierId: '', locationId: locations[0]?.id ?? '', items: [], fees: [], draftId: null }
    const lineFor = (id: ID): StockOrderItem[] => {
      const p = products.find((x) => x.id === id)
      return p ? [{ productId: p.id, qty: Math.max(1, p.reorderQty || 1), unitCost: p.supplyPrice }] : []
    }
    const placed = orders.find((o) => o.id === params.get('edit') && o.status === 'ordered')
    if (placed) return { ...base, step: 'products', supplierId: placed.supplierId, locationId: placed.locationId, items: placed.items, fees: placed.fees, expectedAt: placed.expectedAt, draftId: placed.id, editing: true }
    const draft = orders.find((o) => o.id === params.get('draft') && o.status === 'draft')
    if (draft) return { ...base, step: 'products', supplierId: draft.supplierId, locationId: draft.locationId, items: draft.items, fees: draft.fees, expectedAt: draft.expectedAt, draftId: draft.id }
    const product = products.find((p) => p.id === params.get('product'))
    if (product) {
      if (product.supplierId && suppliers.some((s) => s.id === product.supplierId)) return { ...base, step: 'products', supplierId: product.supplierId, items: lineFor(product.id) }
      return { ...base, pendingProduct: product.id }
    }
    const supplier = suppliers.find((s) => s.id === params.get('supplier'))
    if (supplier) return { ...base, step: 'products', supplierId: supplier.id }
    return base
  })

  const [step, setStep] = useState<Step>(init.step)
  const [supplierId, setSupplierId] = useState(init.supplierId)
  const [locationId, setLocationId] = useState(init.locationId)
  const [items, setItems] = useState<StockOrderItem[]>(init.items)
  const [fees, setFees] = useState<StockOrder['fees']>(init.fees)
  const [expectedAt, setExpectedAt] = useState<string | undefined>(init.expectedAt)
  const [pendingProduct, setPendingProduct] = useState(init.pendingProduct)
  const [lastSaved, setLastSaved] = useState<string | null>(init.draftId ? nowISO() : null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [feesOpen, setFeesOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdId, setCreatedId] = useState<ID | null>(null)
  const [emailing, setEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const draftId = useRef<ID | null>(init.draftId)
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  const supplier = suppliers.find((s) => s.id === supplierId)
  const location = locations.find((l) => l.id === locationId)
  const created = orders.find((o) => o.id === createdId)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const productCount = (sid: ID) => products.filter((p) => !p.archived && p.supplierId === sid).length

  // Autosave the order as a draft while it is being built (placed orders save on "Save").
  useEffect(() => {
    if (init.editing || step !== 'products' || !supplierId || !items.length) return
    const timer = setTimeout(() => {
      const input = { supplierId, locationId, items, fees, expectedAt }
      chain.current = chain.current.then(async () => {
        const saved = await saveStockOrder(draftId.current, input, { quiet: true })
        draftId.current = saved.id
        setLastSaved(nowISO())
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [init.editing, step, supplierId, locationId, items, fees, expectedAt])

  const subtotal = orderSubtotal(items)
  const feesTotal = orderFeesTotal(fees, subtotal)
  const total = orderTotal({ items, fees })

  const chooseSupplier = (id: ID) => {
    setSupplierId(id)
    if (pendingProduct && !items.some((i) => i.productId === pendingProduct)) {
      const p = productById.get(pendingProduct)
      if (p) setItems((list) => [...list, { productId: p.id, qty: Math.max(1, p.reorderQty || 1), unitCost: p.supplyPrice }])
      setPendingProduct(undefined)
    }
    setStep('products')
  }

  const addProducts = (ids: ID[]) => {
    setItems((list) => [
      ...list,
      ...ids
        .filter((id) => !list.some((i) => i.productId === id))
        .map((id) => {
          const p = productById.get(id)
          return { productId: id, qty: Math.max(1, p?.reorderQty || 1), unitCost: p?.supplyPrice ?? 0 }
        }),
    ])
    setPickerOpen(false)
  }

  const patchItem = (productId: ID, next: Partial<StockOrderItem>) => setItems((list) => list.map((i) => (i.productId === productId ? { ...i, ...next } : i)))

  const create = async () => {
    setCreating(true)
    if (init.editing && draftId.current) {
      try {
        await saveStockOrder(draftId.current, { supplierId, locationId, items, fees, expectedAt })
        toast(t('catalog.inventory.orderNew.updated'))
        navigate(`/catalogue/orders?drawer=stock-order&id=${draftId.current}`)
      } finally {
        setCreating(false)
      }
      return
    }
    try {
      const input = { supplierId, locationId, items, fees, expectedAt }
      const placed = (chain.current = chain.current.then(() => saveStockOrder(draftId.current, input, { place: true })))
      const order = (await placed) as StockOrder
      draftId.current = null
      setCreatedId(order.id)
      setStep('ready')
      toast(t('catalog.inventory.orderNew.created'))
    } finally {
      setCreating(false)
    }
  }

  const sendEmail = async () => {
    if (!created) return
    setEmailing(true)
    try {
      const email = await emailStockOrder(created.id)
      setEmailSent(true)
      toast(t('catalog.inventory.orderNew.ready.emailed', { email }))
    } catch (e) {
      toast(e instanceof ApiError ? t('catalog.inventory.orderNew.ready.noEmail') : String(e), 'error')
    } finally {
      setEmailing(false)
    }
  }

  const download = async () => {
    if (!created) return
    setDownloading(true)
    try {
      await downloadOrderPdf(created, { products, suppliers, locations }, t)
      toast(t('catalog.toasts.downloaded'))
    } finally {
      setDownloading(false)
    }
  }

  const progress = step === 'supplier' ? 1 / 3 : step === 'products' ? 2 / 3 : 1
  const close = () => navigate(init.editing && init.draftId ? `/catalogue/orders?drawer=stock-order&id=${init.draftId}` : '/catalogue/orders')

  if (step === 'ready' && created)
    return (
      <FullscreenFrame closeLabel={t('catalog.common.close')} onClose={close} progress={1} maxWidth="max-w-2xl">
        <div className="py-6">
          <SuccessHero title={t('catalog.inventory.orderNew.ready.title')} subtitle={t('catalog.inventory.orderNew.ready.subtitle')} />
          <section className="mt-8 rounded-lg border border-line bg-surface p-4 md:p-6">
            <h2 className="font-display text-title-3 text-ink">{t('catalog.inventory.orderNew.ready.details')}</h2>
            <p className="mt-1 text-body text-muted">{t('catalog.inventory.orderNew.ready.summary', { count: orderQuantity(created.items), total: money(orderTotal(created)) })}</p>
            <ul className="mt-5 flex flex-col divide-y divide-line">
              <li className="flex items-center gap-3 py-4 md:gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                  <Mail size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-ink">{t('catalog.inventory.orderNew.ready.email')}</p>
                  <p className="text-small text-muted max-md:[overflow-wrap:anywhere]">{supplier?.email ? t('catalog.inventory.orderNew.ready.emailHint', { email: supplier.email }) : t('catalog.inventory.orderNew.ready.noEmail')}</p>
                </div>
                {emailSent ? (
                  <span className="chip bg-success-subtle text-success">
                    <Check size={14} aria-hidden /> {t('catalog.inventory.orderNew.ready.sent')}
                  </span>
                ) : (
                  <Button loading={emailing} disabled={!supplier?.email} onClick={() => void sendEmail()}>
                    {t('catalog.inventory.orderNew.ready.send')}
                  </Button>
                )}
              </li>
              <li className="flex items-center gap-3 py-4 md:gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                  <Download size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-ink">{t('catalog.inventory.orderNew.ready.pdf')}</p>
                  <p className="text-small text-muted">{t('catalog.inventory.orderNew.ready.pdfHint')}</p>
                </div>
                <Button loading={downloading} onClick={() => void download()}>
                  {t('catalog.inventory.orderNew.ready.download')}
                </Button>
              </li>
            </ul>
          </section>
          <div className="mt-8 flex justify-center">
            <Button variant="primary" size="lg" onClick={close}>
              {t('catalog.inventory.common.done')}
            </Button>
          </div>
        </div>
      </FullscreenFrame>
    )

  if (step === 'supplier' || !supplier)
    return (
      <FullscreenFrame closeLabel={t('catalog.common.close')} onClose={close} progress={progress} maxWidth="max-w-3xl">
        <h1 className="font-display text-title-1 text-ink md:text-display">{t('catalog.inventory.orderNew.supplierTitle')}</h1>
        <p className="mt-2 text-body text-muted md:text-body-lg">
          {t('catalog.inventory.orderNew.supplierSubtitle')}{' '}
          <Link to="/catalogue/suppliers" className="text-primary hover:underline">
            {t('catalog.inventory.orderNew.here')}
          </Link>
        </p>
        {suppliers.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 md:mt-8">
            {suppliers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => chooseSupplier(s.id)}
                className={`flex items-center gap-4 rounded-lg border bg-surface p-4 text-left transition-colors hover:border-primary ${s.id === supplierId ? 'border-primary ring-1 ring-primary' : 'border-line'}`}
              >
                <Avatar name={s.name} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong text-ink max-md:break-words md:truncate">{s.name}</span>
                  <span className="block text-small text-muted">{t('catalog.inventory.common.products', { count: productCount(s.id) })}</span>
                </span>
                <ArrowRight size={18} className="text-muted" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-8 card"
            title={t('catalog.inventory.orderNew.noSuppliersTitle')}
            body={t('catalog.inventory.orderNew.noSuppliersBody')}
            action={
              <Button variant="primary" onClick={() => navigate('/catalogue/suppliers/add')}>
                {t('catalog.inventory.orderNew.addSupplier')}
              </Button>
            }
          />
        )}
      </FullscreenFrame>
    )

  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')}
      onClose={close}
      progress={progress}
      maxWidth="max-w-[1320px]"
      actions={
        <>
          {lastSaved && !init.editing && <span className="hidden text-small text-muted md:inline">{t('catalog.inventory.orderNew.lastSaved', { date: fmtDateTimeUS(parseISO(lastSaved)) })}</span>}
          {init.editing ? (
            <Button variant="primary" disabled={!items.length} loading={creating} onClick={() => void create()}>
              {t('catalog.common.save')}
            </Button>
          ) : (
            <Button variant="primary" iconRight={<ArrowRight size={16} aria-hidden />} disabled={!items.length} loading={creating} onClick={() => void create()}>
              {t('catalog.inventory.orderNew.create')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <h1 className="font-display text-title-1 text-ink">{init.editing ? t('catalog.inventory.orderNew.editTitle', { number: orders.find((o) => o.id === init.draftId)?.number ?? '' }) : t('catalog.inventory.orderNew.productsTitle')}</h1>
          <p className="mb-5 mt-1 text-body text-muted md:mb-6 md:text-body-lg">{t('catalog.inventory.orderNew.productsSubtitle')}</p>
          {items.length ? (
            <>
              {/* Phones: one card per product instead of the wide table. */}
              <ul className="flex flex-col gap-3 md:hidden">
                {items.map((item) => {
                  const p = productById.get(item.productId)
                  const name = p?.name ?? item.productId
                  return (
                    <li key={item.productId} className="rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-start gap-3">
                        <ProductThumb product={p} size={48} />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-body text-ink">{name}</p>
                          <p className="text-small text-muted">{[productSku(p) && t('catalog.inventory.common.sku', { sku: productSku(p) }), productSize(p)].filter(Boolean).join(' · ')}</p>
                          <p className="text-small text-muted">{t('catalog.inventory.common.inStock', { count: p?.stock ?? 0 })}</p>
                        </div>
                        <button type="button" aria-label={t('catalog.inventory.orderNew.removeProduct', { name })} onClick={() => setItems((list) => list.filter((i) => i.productId !== item.productId))} className="icon-btn shrink-0">
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <p className="mb-1 text-small text-muted">{t('catalog.inventory.orderNew.cols.qty')}</p>
                          <Stepper value={item.qty} min={1} onChange={(qty) => patchItem(item.productId, { qty })} label={t('catalog.inventory.orderNew.qtyLabel', { name })} />
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1 text-small text-muted">{t('catalog.inventory.orderNew.cols.unitCost')}</p>
                          <MoneyInput value={item.unitCost} aria-label={t('catalog.inventory.orderNew.costLabel', { name })} onChange={(v) => patchItem(item.productId, { unitCost: v === '' ? 0 : Math.max(0, v) })} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                        <span className="text-body text-muted">{t('catalog.inventory.orderNew.cols.total')}</span>
                        <span className="tabular text-body-strong text-ink">{money(item.qty * item.unitCost)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] border-collapse text-left text-body">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.orderNew.cols.product')}</th>
                      <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.orderNew.cols.qty')}</th>
                      <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.orderNew.cols.unitCost')}</th>
                      <th className="px-3 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.orderNew.cols.total')}</th>
                      <th className="w-12 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const p = productById.get(item.productId)
                      const name = p?.name ?? item.productId
                      return (
                        <tr key={item.productId} className="border-b border-line">
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-3">
                              <ProductThumb product={p} size={56} />
                              <div className="min-w-0">
                                <p className="text-body text-ink">{name}</p>
                                <p className="text-small text-muted">{[productSku(p) && t('catalog.inventory.common.sku', { sku: productSku(p) }), productSize(p)].filter(Boolean).join(' · ')}</p>
                                <p className="text-small text-muted">{t('catalog.inventory.common.inStock', { count: p?.stock ?? 0 })}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <Stepper value={item.qty} min={1} onChange={(qty) => patchItem(item.productId, { qty })} label={t('catalog.inventory.orderNew.qtyLabel', { name })} />
                          </td>
                          <td className="px-3 py-4">
                            <MoneyInput className="w-32" value={item.unitCost} aria-label={t('catalog.inventory.orderNew.costLabel', { name })} onChange={(v) => patchItem(item.productId, { unitCost: v === '' ? 0 : Math.max(0, v) })} />
                          </td>
                          <td className="px-3 py-4 text-right tabular text-body-strong">{money(item.qty * item.unitCost)}</td>
                          <td className="px-3 py-4 text-right">
                            <button type="button" aria-label={t('catalog.inventory.orderNew.removeProduct', { name })} onClick={() => setItems((list) => list.filter((i) => i.productId !== item.productId))} className="icon-btn h-9 w-9">
                              <Trash2 size={16} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setPickerOpen(true)} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-sunken text-body-strong text-ink hover:bg-primary-subtle">
                <Plus size={18} aria-hidden />
                {t('catalog.inventory.orderNew.addMore')}
              </button>
            </>
          ) : (
            <EmptyState
              className="rounded-lg bg-sunken"
              title={t('catalog.inventory.orderNew.noProductsTitle')}
              body={t('catalog.inventory.orderNew.noProductsBody')}
              action={
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setPickerOpen(true)}>
                  {t('catalog.inventory.orderNew.addProducts')}
                </Button>
              }
            />
          )}
        </div>

        <aside className="flex flex-col gap-6 md:gap-8">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-title-3 text-ink">{t('catalog.inventory.orderNew.selectedSupplier')}</h2>
              <Button variant="link" onClick={() => setStep('supplier')}>
                {t('catalog.inventory.orderNew.change')}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Avatar name={supplier.name} size={48} />
              <span className="min-w-0 text-body text-ink">{supplier.name}</span>
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-display text-title-3 text-ink">{t('catalog.inventory.orderNew.deliverTo')}</h2>
            <LocationCard location={location} onChange={locations.length > 1 ? () => setLocationOpen(true) : undefined} />
          </section>
          <section>
            <h2 className="mb-3 font-display text-title-3 text-ink">{t('catalog.inventory.orderNew.expectedBy')}</h2>
            {expectedAt ? (
              <div className="flex items-center gap-2">
                <input type="date" aria-label={t('catalog.inventory.orderNew.expectedBy')} value={expectedAt} min={format(now(), 'yyyy-MM-dd')} onChange={(e) => setExpectedAt(e.target.value || undefined)} className="input flex-1" />
                <Button variant="ghost" onClick={() => setExpectedAt(undefined)}>
                  {t('catalog.common.remove')}
                </Button>
              </div>
            ) : (
              <Button icon={<Plus size={16} />} className="rounded-full" onClick={() => setExpectedAt(format(addDays(now(), 7), 'yyyy-MM-dd'))}>
                {t('catalog.common.add')}
              </Button>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-title-3 text-ink">{t('catalog.inventory.orderNew.fees')}</h2>
              {fees.length > 0 && (
                <Button variant="link" onClick={() => setFeesOpen(true)}>
                  {t('catalog.common.edit')}
                </Button>
              )}
            </div>
            {fees.length ? (
              <ul className="flex flex-col gap-1.5">
                {fees.map((f, i) => (
                  <li key={i} className="flex justify-between text-body">
                    <span className="text-ink">
                      {f.name}
                      {f.type === 'percent' && <span className="text-muted"> ({f.amount}%)</span>}
                    </span>
                    <span className="tabular text-ink">{money(f.type === 'percent' ? (subtotal * f.amount) / 100 : f.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Button icon={<Plus size={16} />} className="rounded-full" onClick={() => setFeesOpen(true)}>
                {t('catalog.common.add')}
              </Button>
            )}
          </section>
          <section className="border-t border-line pt-4">
            <dl className="flex flex-col gap-2 text-body">
              <div className="flex justify-between">
                <dt className="text-ink">{t('catalog.inventory.orderNew.subtotal')}</dt>
                <dd className="tabular">{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink">{t('catalog.inventory.orderNew.feesTotal')}</dt>
                <dd className="tabular">{money(feesTotal)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t border-line pt-3 font-display text-title-3 text-ink">
                <dt>{t('catalog.inventory.orderNew.total')}</dt>
                <dd className="tabular">{money(total)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {pickerOpen && <ProductPickerModal supplierId={supplier.id} supplierName={supplier.name} existing={items.map((i) => i.productId)} onClose={() => setPickerOpen(false)} onAdd={addProducts} />}
      {feesOpen && (
        <FeesModal
          fees={fees}
          onClose={() => setFeesOpen(false)}
          onSave={(next) => {
            setFees(next)
            setFeesOpen(false)
          }}
        />
      )}
      <LocationPicker open={locationOpen} onClose={() => setLocationOpen(false)} locations={locations} value={locationId} onChange={setLocationId} />
    </FullscreenFrame>
  )
}
