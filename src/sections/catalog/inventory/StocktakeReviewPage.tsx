import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Field, FullscreenFrame, Menu, MenuButton, Modal, TextArea, confirm, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { money } from '@/lib/format'
import type { Product, StocktakeItem } from '@/types'
import { completeStocktake, setStocktakeStatus } from '@/api/catalog'
import { CountPills, ProductThumb } from '../ui'
import { productSku } from './shared'
import { DiffChip } from './StocktakeCountPage'

export type ReviewFilter = 'all' | 'uncounted' | 'unmatched' | 'matched' | 'excluded'

export const matchesFilter = (item: StocktakeItem, filter: ReviewFilter | 'counted') => {
  switch (filter) {
    case 'uncounted':
      return !item.excluded && item.counted === undefined
    case 'unmatched':
      return !item.excluded && item.counted !== undefined && item.counted !== item.expected
    case 'matched':
      return !item.excluded && item.counted !== undefined && item.counted === item.expected
    case 'excluded':
      return item.excluded
    case 'counted':
      return !item.excluded && item.counted !== undefined
    default:
      return true
  }
}

/** Table used by the review and summary pages: Product / Expected / Counted / Difference / Cost. */
export function StocktakeTable({ items, products }: { items: StocktakeItem[]; products: Product[] }) {
  const { t } = useTranslation()
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const diffOf = (i: StocktakeItem) => (i.excluded || i.counted === undefined ? 0 : i.counted - i.expected)
  const costOf = (i: StocktakeItem) => diffOf(i) * (byId.get(i.productId)?.supplyPrice ?? 0)
  const totals = items.reduce(
    (acc, i) => ({ expected: acc.expected + i.expected, counted: acc.counted + (i.excluded ? 0 : (i.counted ?? 0)), diff: acc.diff + diffOf(i), cost: acc.cost + costOf(i) }),
    { expected: 0, counted: 0, diff: 0, cost: 0 },
  )
  if (!items.length) return <EmptyState className="rounded-lg border border-line bg-surface" title={t('catalog.inventory.common.noResults')} />
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[680px] border-collapse text-left text-body">
        <thead>
          <tr className="border-b border-line">
            <th className="px-4 py-3 text-body-strong text-ink">{t('catalog.inventory.review.cols.product')}</th>
            <th className="px-4 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.review.cols.expected')}</th>
            <th className="px-4 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.review.cols.counted')}</th>
            <th className="px-4 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.review.cols.difference')}</th>
            <th className="px-4 py-3 text-right text-body-strong text-ink">{t('catalog.inventory.review.cols.cost')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line bg-sunken font-semibold">
            <td className="px-4 py-3">{t('catalog.inventory.common.total')}</td>
            <td className="px-4 py-3 text-right tabular">{totals.expected}</td>
            <td className="px-4 py-3 text-right tabular">{totals.counted}</td>
            <td className="px-4 py-3 text-right tabular">{totals.diff}</td>
            <td className="px-4 py-3 text-right tabular">{money(totals.cost)}</td>
          </tr>
          {items.map((item) => {
            const p = byId.get(item.productId)
            return (
              <tr key={item.productId} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ProductThumb product={p} size={44} />
                    <div className="min-w-0">
                      <p className="text-body text-ink">{p?.name ?? item.productId}</p>
                      {productSku(p) && <p className="text-small text-muted">{t('catalog.inventory.common.sku', { sku: productSku(p) })}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular">{item.expected}</td>
                <td className="px-4 py-3 text-right tabular">
                  {item.excluded ? <span className="chip bg-sunken text-muted">{t('catalog.inventory.count.excluded')}</span> : item.counted === undefined ? <span className="text-muted">{t('catalog.inventory.review.notCounted')}</span> : item.counted}
                </td>
                <td className="px-4 py-3 text-right">{item.excluded || item.counted === undefined ? '-' : <DiffChip diff={diffOf(item)} />}</td>
                <td className="px-4 py-3 text-right tabular">{item.excluded || item.counted === undefined ? '-' : money(costOf(item))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Review stocktake + Complete modal (catalog.md §5). */
export function StocktakeReviewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const stocktake = useDb((s) => s.stocktakes.find((x) => x.id === id))
  const products = useDb((s) => s.products)
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [modal, setModal] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (!stocktake)
    return (
      <FullscreenFrame title={t('catalog.inventory.review.title')} onClose={() => navigate('/catalogue/stocktakes')}>
        <EmptyState title={t('catalog.inventory.common.notFoundTitle')} body={t('catalog.inventory.common.notFoundBody')} />
      </FullscreenFrame>
    )
  if (stocktake.status === 'completed' || stocktake.status === 'cancelled') return <Navigate to={`/catalogue/stocktakes/${stocktake.id}`} replace />

  const filters: ReviewFilter[] = ['all', 'uncounted', 'unmatched', 'matched', 'excluded']
  const visible = stocktake.items.filter((i) => matchesFilter(i, filter))
  const countedCount = stocktake.items.filter((i) => matchesFilter(i, 'counted')).length

  const complete = async () => {
    setBusy(true)
    try {
      await completeStocktake(stocktake.id, note.trim())
      toast(t('catalog.inventory.review.completed'))
      navigate(`/catalogue/stocktakes/${stocktake.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullscreenFrame
      title={t('catalog.inventory.review.title')}
      onClose={() => navigate(`/catalogue/stocktakes/${stocktake.id}/count`)}
      closeLabel={t('catalog.inventory.common.back')}
      maxWidth="max-w-5xl"
      progress={0.9}
      actions={
        <>
          <Menu
            width={220}
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('catalog.inventory.common.options')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  { label: t('catalog.inventory.review.resume'), onSelect: () => navigate(`/catalogue/stocktakes/${stocktake.id}/count`) },
                  {
                    label: t('catalog.inventory.review.saveDraft'),
                    onSelect: async () => {
                      await setStocktakeStatus(stocktake.id, 'draft')
                      toast(t('catalog.inventory.review.savedDraft'))
                      navigate('/catalogue/stocktakes')
                    },
                  },
                  {
                    label: t('catalog.inventory.review.cancel'),
                    danger: true,
                    onSelect: async () => {
                      const ok = await confirm({ title: t('catalog.inventory.review.cancelTitle'), body: t('catalog.inventory.review.cancelBody'), confirmLabel: t('catalog.inventory.review.cancel'), tone: 'danger' })
                      if (!ok) return
                      await setStocktakeStatus(stocktake.id, 'cancelled')
                      toast(t('catalog.inventory.review.cancelled'))
                      navigate('/catalogue/stocktakes')
                    },
                  },
                ],
              },
            ]}
          />
          <Button
            variant="primary"
            onClick={() => {
              if (!countedCount) {
                toast(t('catalog.inventory.review.nothingCounted'))
                return
              }
              setModal(true)
            }}
          >
            {t('catalog.inventory.review.complete')}
          </Button>
        </>
      }
    >
      <h1 className="font-display text-display text-ink">{stocktake.name}</h1>
      <p className="mb-6 mt-1 text-body-lg text-muted">{t('catalog.inventory.review.uncountedHint')}</p>
      <div className="mb-4">
        <CountPills
          value={filter}
          onChange={setFilter}
          items={filters.map((f) => ({ value: f, label: t(`catalog.inventory.review.pills.${f}`), count: stocktake.items.filter((i) => matchesFilter(i, f)).length }))}
        />
      </div>
      <StocktakeTable items={visible} products={products} />

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={t('catalog.inventory.review.modalTitle')}
        subtitle={t('catalog.inventory.review.modalSubtitle')}
        footer={
          <>
            <Button onClick={() => setModal(false)}>{t('catalog.inventory.common.goBack')}</Button>
            <Button variant="primary" loading={busy} onClick={() => void complete()}>
              {t('catalog.inventory.review.completeButton')}
            </Button>
          </>
        }
      >
        <Field label={t('catalog.inventory.review.note')} optional counter={{ value: note.length, max: 200 }} className="pb-2">
          {(fid) => <TextArea id={fid} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('catalog.inventory.review.notePlaceholder')} />}
        </Field>
      </Modal>
    </FullscreenFrame>
  )
}
