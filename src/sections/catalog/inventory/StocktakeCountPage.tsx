import clsx from 'clsx'
import { Folder, Minus, Pause, Plus, ScanBarcode, Tag, Truck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { formatDistance, parseISO } from 'date-fns'
import { Button, EmptyState, FullscreenFrame, Menu, SearchInput, Select, Switch, TextInput, Toolbar, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { now, nowISO } from '@/lib/time'
import type { Stocktake, StocktakeItem } from '@/types'
import { saveStocktakeItems, setStocktakeStatus } from '@/api/catalog'
import { LocationCard, ProductThumb, SortButton } from '../ui'
import { productSku } from './shared'

type Sort = 'nameAsc' | 'nameDesc' | 'expectedDesc' | 'expectedAsc'
type Show = 'all' | 'counted' | 'uncounted' | 'excluded'

/** Count products (`/catalogue/stocktakes/:id/count`, catalog.md §5). */
export function StocktakeCountPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const stocktake = useDb((s) => s.stocktakes.find((x) => x.id === id))
  if (!stocktake)
    return (
      <FullscreenFrame closeLabel={t('catalog.common.close')} title={t('catalog.inventory.count.title')}>
        <EmptyState title={t('catalog.common.notFoundTitle')} body={t('catalog.common.notFoundBody')} />
      </FullscreenFrame>
    )
  if (stocktake.status === 'completed' || stocktake.status === 'cancelled') return <Navigate to={`/catalogue/stocktakes/${stocktake.id}`} replace />
  return <CountBody key={stocktake.id} stocktake={stocktake} />
}

/** Counted value input with − / + buttons; empty means "not counted". */
export function CountInput({ value, onChange, label }: { value: number | undefined; onChange: (v: number | undefined) => void; label: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))))}
        className="input h-11 w-20 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="inline-flex h-11 items-center rounded-sm border border-line-strong bg-surface">
        <button type="button" aria-label={t('catalog.common.decrease')} disabled={!value} onClick={() => onChange(Math.max(0, (value ?? 0) - 1))} className="flex h-full w-10 items-center justify-center text-ink hover:bg-sunken disabled:opacity-40">
          <Minus size={16} aria-hidden />
        </button>
        <button type="button" aria-label={t('catalog.common.increase')} onClick={() => onChange((value ?? 0) + 1)} className="flex h-full w-10 items-center justify-center text-ink hover:bg-sunken">
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function DiffChip({ diff }: { diff: number }) {
  return <span className={clsx('chip h-6 tabular', diff === 0 ? 'bg-success-subtle text-success' : diff < 0 ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning')}>{diff > 0 ? `+${diff}` : diff}</span>
}

function CountBody({ stocktake }: { stocktake: Stocktake }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const products = useDb((s) => s.products)
  const categories = useDb((s) => s.productCategories)
  const brands = useDb((s) => s.brands)
  const suppliers = useDb((s) => s.suppliers)
  const locations = useDb((s) => s.locations)
  const [items, setItems] = useState<StocktakeItem[]>(() => stocktake.items)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('nameAsc')
  const [show, setShow] = useState<Show>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quickScan, setQuickScan] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'pause' | 'review' | 'close' | null>(null)
  const itemsRef = useRef(items)
  const dirty = useRef(false)

  // Persist counts shortly after each change.
  useEffect(() => {
    itemsRef.current = items
    if (!dirty.current) return
    const timer = setTimeout(() => {
      dirty.current = false
      void saveStocktakeItems(stocktake.id, items)
    }, 400)
    return () => clearTimeout(timer)
  }, [items, stocktake.id])

  const flush = async () => {
    dirty.current = false
    await saveStocktakeItems(stocktake.id, itemsRef.current)
  }

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const update = (productIds: string[], patch: (item: StocktakeItem) => Partial<StocktakeItem>) => {
    const set = new Set(productIds)
    dirty.current = true
    setItems((list) => list.map((item) => (set.has(item.productId) ? { ...item, ...patch(item) } : item)))
  }
  const setCount = (productId: string, counted: number | undefined) => update([productId], () => ({ counted, countedAt: counted === undefined ? undefined : nowISO() }))

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = items.filter((item) => {
      const p = productById.get(item.productId)
      if (!p) return false
      if (show === 'counted' && (item.excluded || item.counted === undefined)) return false
      if (show === 'uncounted' && (item.excluded || item.counted !== undefined)) return false
      if (show === 'excluded' && !item.excluded) return false
      return !q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q) || p.skus.some((s) => s.toLowerCase().includes(q))
    })
    const name = (i: StocktakeItem) => productById.get(i.productId)?.name ?? ''
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'nameDesc':
          return name(b).localeCompare(name(a))
        case 'expectedDesc':
          return b.expected - a.expected
        case 'expectedAsc':
          return a.expected - b.expected
        default:
          return name(a).localeCompare(name(b))
      }
    })
  }, [items, productById, query, show, sort])

  const active = items.filter((i) => !i.excluded)
  const counted = active.filter((i) => i.counted !== undefined).length
  const progress = active.length ? Math.round((counted / active.length) * 100) : 0
  const activity = useMemo(() => items.filter((i) => i.countedAt && i.counted !== undefined).sort((a, b) => (b.countedAt ?? '').localeCompare(a.countedAt ?? '')).slice(0, 8), [items])
  const location = locations.find((l) => l.id === stocktake.locationId)
  const current = now()

  const scan = () => {
    const c = code.trim().toLowerCase()
    if (!c) return
    const item = items.find((i) => {
      const p = productById.get(i.productId)
      return p && ((p.barcode ?? '').toLowerCase() === c || p.skus.some((s) => s.toLowerCase() === c))
    })
    if (!item) {
      toast(t('catalog.inventory.count.scanNotFound', { code: code.trim() }))
      return
    }
    const next = (item.counted ?? 0) + 1
    update([item.productId], () => ({ counted: next, countedAt: nowISO(), excluded: false }))
    toast(t('catalog.inventory.count.scanned', { name: productById.get(item.productId)?.name, count: next }))
    setCode('')
  }

  const leave = async (kind: 'pause' | 'review' | 'close') => {
    setBusy(kind)
    try {
      await flush()
      if (kind === 'pause') {
        await setStocktakeStatus(stocktake.id, 'paused')
        toast(t('catalog.inventory.count.paused'))
        navigate('/catalogue/stocktakes')
      } else if (kind === 'review') navigate(`/catalogue/stocktakes/${stocktake.id}/review`)
      else navigate('/catalogue/stocktakes')
    } finally {
      setBusy(null)
    }
  }

  const rowMenu = (item: StocktakeItem) => (
    <Menu
      label={t('catalog.common.actions')}
      groups={[
        {
          items: [
            { label: t('catalog.inventory.count.viewProduct'), onSelect: () => drawer.open('product', { id: item.productId }) },
            item.excluded
              ? {
                  label: t('catalog.inventory.count.include'),
                  onSelect: () => {
                    update([item.productId], () => ({ excluded: false }))
                    toast(t('catalog.inventory.count.includedToast'))
                  },
                }
              : {
                  label: t('catalog.inventory.count.exclude'),
                  danger: true,
                  onSelect: () => {
                    update([item.productId], () => ({ excluded: true }))
                    toast(t('catalog.inventory.count.excludedToast'))
                  },
                },
          ],
        },
      ]}
    />
  )
  const toggleRow = (productId: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(productId)
    else next.delete(productId)
    setSelected(next)
  }

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.productId))
  const selectedIds = [...selected]

  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')}
      title={t('catalog.inventory.count.title')}
      onClose={() => void leave('close')}
      maxWidth="max-w-[1440px]"
      actions={
        <>
          <div className="mr-2 hidden items-center gap-2 md:flex" title={t('catalog.inventory.count.quickScanHint')}>
            <Switch checked={quickScan} onChange={setQuickScan} />
            <span className="text-body text-ink">{t('catalog.inventory.count.quickScan')}</span>
          </div>
          <Button icon={<Pause size={16} />} loading={busy === 'pause'} aria-label={t('catalog.inventory.count.pause')} className="max-md:w-10 max-md:px-0" onClick={() => void leave('pause')}>
            <span className="hidden md:inline">{t('catalog.inventory.count.pause')}</span>
          </Button>
          <Button variant="primary" loading={busy === 'review'} onClick={() => void leave('review')}>
            {t('catalog.inventory.count.review')}
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* Phones: the stocktake name and progress on top (the summary column comes after the list). */}
          <div className="mb-4 rounded-lg border border-line bg-surface p-4 md:hidden">
            <p className="break-words font-display text-title-3 text-ink">{stocktake.name}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-small text-muted">
              <span>
                {t('catalog.inventory.count.counted')}: <span className="tabular text-ink">{counted}</span> / <span className="tabular">{active.length}</span>
              </span>
              <span className="tabular text-ink">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('catalog.inventory.count.progress')}>
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          {quickScan && (
            <form
              className="mb-4 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-subtle/40 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                scan()
              }}
            >
              <ScanBarcode size={22} className="shrink-0 text-primary" aria-hidden />
              <TextInput autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('catalog.inventory.count.scanPlaceholder')} aria-label={t('catalog.inventory.count.scanPlaceholder')} className="flex-1" />
              <Button type="submit" variant="primary">
                {t('catalog.common.add')}
              </Button>
            </form>
          )}
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.inventory.count.search')} className="max-w-xs max-md:max-w-none max-md:basis-full" />
            <Select
              aria-label={t('catalog.inventory.count.filterTitle')}
              value={show}
              onChange={(e) => setShow(e.target.value as Show)}
              className="h-10 w-48 rounded-full max-md:w-auto max-md:min-w-0 max-md:flex-1"
              options={[
                { value: 'all', label: t('catalog.inventory.count.filterAll') },
                { value: 'counted', label: t('catalog.inventory.count.filterCounted') },
                { value: 'uncounted', label: t('catalog.inventory.count.filterUncounted') },
                { value: 'excluded', label: t('catalog.inventory.count.filterExcluded') },
              ]}
            />
            <div className="ml-auto">
              <SortButton value={sort} onChange={setSort} options={(['nameAsc', 'nameDesc', 'expectedDesc', 'expectedAsc'] as Sort[]).map((v) => ({ value: v, label: t(`catalog.inventory.count.sort.${v}`) }))} />
            </div>
          </Toolbar>

          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary-subtle/50 px-4 py-2">
              <span className="mr-2 text-body-strong text-ink">{t('catalog.inventory.count.selected', { count: selected.size })}</span>
              <Button size="sm" onClick={() => update(selectedIds, (i) => ({ counted: i.expected, countedAt: nowISO(), excluded: false }))}>
                {t('catalog.inventory.count.fillExpected')}
              </Button>
              <Button size="sm" onClick={() => update(selectedIds, () => ({ counted: undefined, countedAt: undefined }))}>
                {t('catalog.inventory.count.clearCounts')}
              </Button>
              <Button size="sm" onClick={() => update(selectedIds, () => ({ excluded: true }))}>
                {t('catalog.inventory.count.exclude')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t('catalog.common.cancel')}
              </Button>
            </div>
          )}

          {/* Phones: one card per product instead of the wide table. */}
          <div className="md:hidden">
            {rows.length > 0 && (
              <label className="mb-2 flex h-10 cursor-pointer items-center gap-3 px-1 text-body text-ink">
                <input type="checkbox" checked={allVisibleSelected} onChange={(e) => setSelected(new Set(e.target.checked ? rows.map((r) => r.productId) : []))} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                {t('catalog.common.selectAll')}
              </label>
            )}
            <ul className="flex flex-col gap-3">
              {rows.map((item) => {
                const p = productById.get(item.productId)!
                return (
                  <li key={item.productId} className={clsx('rounded-lg border border-line bg-surface p-3', item.excluded && 'opacity-60', selected.has(item.productId) && 'border-primary/40 bg-primary-subtle/30')}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" aria-label={t('catalog.common.selectRow')} checked={selected.has(item.productId)} onChange={(e) => toggleRow(item.productId, e.target.checked)} className="mt-3.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" />
                      <ProductThumb product={p} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-body text-ink">{p.name}</p>
                        {productSku(p) && <p className="text-small text-muted">{t('catalog.inventory.common.sku', { sku: productSku(p) })}</p>}
                        <p className="text-small text-muted">
                          {t('catalog.inventory.count.cols.expected')}: <span className="tabular text-ink">{item.expected}</span>
                        </p>
                      </div>
                      {rowMenu(item)}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 pl-8">
                      {item.excluded ? (
                        <span className="chip bg-sunken text-muted">{t('catalog.inventory.count.excluded')}</span>
                      ) : (
                        <>
                          <CountInput value={item.counted} onChange={(v) => setCount(item.productId, v)} label={t('catalog.inventory.count.countLabel', { name: p.name })} />
                          {item.counted !== undefined && <DiffChip diff={item.counted - item.expected} />}
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            {!rows.length && <EmptyState title={t('catalog.inventory.count.emptyTitle')} body={t('catalog.inventory.count.emptyBody')} />}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] border-collapse text-left text-body">
              <thead>
                <tr className="border-b border-line">
                  <th className="w-12 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={t('catalog.common.selectAll')}
                      checked={allVisibleSelected}
                      onChange={(e) => setSelected(new Set(e.target.checked ? rows.map((r) => r.productId) : []))}
                      className="h-4 w-4 accent-[rgb(var(--primary))]"
                    />
                  </th>
                  <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.count.cols.product')}</th>
                  <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.count.cols.details')}</th>
                  <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.count.cols.expected')}</th>
                  <th className="px-3 py-3 text-body-strong text-ink">{t('catalog.inventory.count.cols.counted')}</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const p = productById.get(item.productId)!
                  const details = [
                    { icon: <Folder size={14} aria-hidden />, text: categories.find((c) => c.id === p.categoryId)?.name },
                    { icon: <Tag size={14} aria-hidden />, text: brands.find((b) => b.id === p.brandId)?.name },
                    { icon: <Truck size={14} aria-hidden />, text: suppliers.find((s) => s.id === p.supplierId)?.name },
                  ].filter((d) => d.text)
                  return (
                    <tr key={item.productId} className={clsx('border-b border-line', item.excluded && 'opacity-60', selected.has(item.productId) && 'bg-primary-subtle/30')}>
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          aria-label={t('catalog.common.selectRow')}
                          checked={selected.has(item.productId)}
                          onChange={(e) => toggleRow(item.productId, e.target.checked)}
                          className="h-4 w-4 accent-[rgb(var(--primary))]"
                        />
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <ProductThumb product={p} size={56} />
                          <div className="min-w-0">
                            <p className="text-body text-ink">{p.name}</p>
                            {productSku(p) && <p className="text-small text-muted">{t('catalog.inventory.common.sku', { sku: productSku(p) })}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <ul className="flex flex-col gap-0.5 text-small text-muted">
                          {details.map((d, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              {d.icon}
                              {d.text}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-4 tabular">{item.expected}</td>
                      <td className="px-3 py-4">
                        {item.excluded ? (
                          <span className="chip bg-sunken text-muted">{t('catalog.inventory.count.excluded')}</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <CountInput value={item.counted} onChange={(v) => setCount(item.productId, v)} label={t('catalog.inventory.count.countLabel', { name: p.name })} />
                            {item.counted !== undefined && <DiffChip diff={item.counted - item.expected} />}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 text-right">{rowMenu(item)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!rows.length && <EmptyState title={t('catalog.inventory.count.emptyTitle')} body={t('catalog.inventory.count.emptyBody')} />}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-title-2 text-ink md:text-title-1">{stocktake.name}</h2>
            <p className="text-small text-muted">{t('catalog.inventory.count.started', { ago: formatDistance(parseISO(stocktake.startedAt), current, { addSuffix: true }) })}</p>
            {stocktake.description && <p className="mt-1 text-body text-muted">{stocktake.description}</p>}
          </div>
          <LocationCard location={location} />
          <section className="rounded-lg border border-line bg-surface p-4 md:p-6">
            <h3 className="mb-4 font-display text-title-3 text-ink">{t('catalog.inventory.count.summary')}</h3>
            <dl className="flex flex-col gap-3 text-body">
              {[
                [t('catalog.inventory.count.totalProducts'), active.length],
                [t('catalog.inventory.count.counted'), counted],
                [t('catalog.inventory.count.uncounted'), active.length - counted],
                [t('catalog.inventory.count.progress'), `${progress}%`],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4">
                  <dt className="text-ink">{label}</dt>
                  <dd className="tabular text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('catalog.inventory.count.progress')}>
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </section>
          <section className="rounded-lg border border-line bg-surface p-4 md:p-6">
            <h3 className="mb-4 font-display text-title-3 text-ink">{t('catalog.inventory.count.activity')}</h3>
            {activity.length ? (
              <>
                <div className="mb-2 flex justify-between text-small text-muted">
                  <span>{t('catalog.inventory.count.activityProduct')}</span>
                  <span>{t('catalog.inventory.count.activityCounted')}</span>
                </div>
                <ul className="flex flex-col divide-y divide-line">
                  {activity.map((item) => {
                    const p = productById.get(item.productId)
                    return (
                      <li key={item.productId} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-body-strong text-ink max-md:break-words md:truncate">{p?.name}</p>
                          {productSku(p) && <p className="text-small text-muted">{t('catalog.inventory.common.sku', { sku: productSku(p) })}</p>}
                          <p className="text-small text-muted">{stocktake.countedBy}</p>
                          <p className="text-small text-muted">{formatDistance(parseISO(item.countedAt!), current, { addSuffix: true })}</p>
                        </div>
                        <span className="tabular text-body-strong text-ink">{item.counted}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <p className="text-body text-muted">{t('catalog.inventory.count.activityEmpty')}</p>
            )}
          </section>
        </aside>
      </div>
    </FullscreenFrame>
  )
}
