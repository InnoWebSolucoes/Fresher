import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Button, EmptyState, Menu, MenuButton, Page, PageSkeleton, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { exportCsv } from '@/lib/export'
import { fmtDateTimeUS } from '@/lib/format'
import { deleteStocktake } from '@/api/catalog'
import { CountPills, InfoCard } from '../ui'
import { InventoryStatus, productSku } from './shared'
import { StocktakeTable, matchesFilter, type ReviewFilter } from './StocktakeReviewPage'

type SummaryFilter = Extract<ReviewFilter, 'all' | 'unmatched' | 'matched' | 'excluded'> | 'counted'

/** Stocktake summary (`/catalogue/stocktakes/:id`, catalog.md §5). */
export function StocktakeSummaryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const { id } = useParams()
  const stocktake = useDb((s) => s.stocktakes.find((x) => x.id === id))
  const products = useDb((s) => s.products)
  const locations = useDb((s) => s.locations)
  const [filter, setFilter] = useState<SummaryFilter>('counted')

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )
  if (!stocktake)
    return (
      <Page wide>
        <EmptyState
          title={t('catalog.common.notFoundTitle')}
          body={t('catalog.common.notFoundBody')}
          action={<Button onClick={() => navigate('/catalogue/stocktakes')}>{t('catalog.inventory.summary.back')}</Button>}
        />
      </Page>
    )

  const open = stocktake.status !== 'completed' && stocktake.status !== 'cancelled'
  const filters: SummaryFilter[] = ['counted', 'unmatched', 'matched', 'excluded']
  const visible = stocktake.items.filter((i) => matchesFilter(i, filter))
  const location = locations.find((l) => l.id === stocktake.locationId)

  const download = () => {
    exportCsv(`stocktake_${stocktake.name.replace(/\W+/g, '_').toLowerCase()}`, [
      {
        headers: [t('catalog.inventory.review.cols.product'), t('catalog.inventory.pdf.sku'), t('catalog.inventory.review.cols.expected'), t('catalog.inventory.review.cols.counted'), t('catalog.inventory.review.cols.difference'), t('catalog.inventory.review.cols.cost')],
        rows: stocktake.items.map((i) => {
          const p = products.find((x) => x.id === i.productId)
          const diff = i.excluded || i.counted === undefined ? '' : i.counted - i.expected
          return [p?.name ?? '', productSku(p), i.expected, i.excluded ? t('catalog.inventory.count.excluded') : (i.counted ?? ''), diff, diff === '' ? '' : diff * (p?.supplyPrice ?? 0)]
        }),
      },
    ])
  }

  const remove = async () => {
    const ok = await confirm({ title: t('catalog.inventory.summary.deleteTitle'), body: t('catalog.inventory.summary.deleteBody'), confirmLabel: t('catalog.inventory.summary.delete'), tone: 'danger' })
    if (!ok) return
    await deleteStocktake(stocktake.id)
    toast(t('catalog.inventory.summary.deleted'))
    navigate('/catalogue/stocktakes')
  }

  return (
    <Page wide>
      <Link to="/catalogue/stocktakes" className="mb-4 inline-flex items-center gap-2 text-body-strong text-primary hover:underline">
        <ArrowLeft size={16} aria-hidden />
        {t('catalog.inventory.summary.back')}
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 md:mb-6 md:gap-4">
        <h1 className="flex flex-wrap items-center gap-3 font-display text-title-2 text-ink max-md:min-w-0 max-md:break-words md:text-title-1">
          {stocktake.name}
          <InventoryStatus status={stocktake.status} />
        </h1>
        <div className="flex items-center gap-2">
          <Menu
            width={220}
            trigger={({ open: o, toggle }) => (
              <MenuButton open={o} toggle={toggle}>
                {t('catalog.common.options')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  { label: t('catalog.inventory.summary.downloadCsv'), onSelect: download },
                  { label: t('catalog.inventory.summary.delete'), danger: true, onSelect: () => void remove() },
                ],
              },
            ]}
          />
          {open && (
            <Button variant="primary" onClick={() => navigate(`/catalogue/stocktakes/${stocktake.id}/count`)}>
              {t('catalog.inventory.summary.resume')}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div>
          <InfoCard
            title={t('catalog.inventory.summary.details')}
            rows={[
              { label: t('catalog.inventory.summary.location'), value: location?.name },
              { label: t('catalog.inventory.summary.startedOn'), value: fmtDateTimeUS(parseISO(stocktake.startedAt)) },
              { label: t('catalog.inventory.summary.completedOn'), value: stocktake.completedAt ? fmtDateTimeUS(parseISO(stocktake.completedAt)) : '-' },
              { label: t('catalog.inventory.summary.countedBy'), value: stocktake.countedBy },
              { label: t('catalog.inventory.summary.reviewedBy'), value: stocktake.reviewedBy ?? '-' },
              ...(stocktake.description ? [{ label: t('catalog.inventory.summary.description'), value: stocktake.description, block: true }] : []),
              { label: t('catalog.inventory.summary.note'), value: stocktake.note ?? '-', block: true },
            ]}
          />
        </div>
        <section className="min-w-0">
          <h2 className="mb-4 font-display text-title-2 text-ink">{t('catalog.inventory.summary.products')}</h2>
          <div className="mb-4">
            <CountPills
              value={filter}
              onChange={setFilter}
              items={filters.map((f) => ({ value: f, label: t(`catalog.inventory.${f === 'counted' ? 'count.counted' : `review.pills.${f}`}`), count: stocktake.items.filter((i) => matchesFilter(i, f)).length }))}
            />
          </div>
          <StocktakeTable items={visible} products={products} />
        </section>
      </div>
    </Page>
  )
}
