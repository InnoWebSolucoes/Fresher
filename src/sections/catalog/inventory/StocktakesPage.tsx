import { ClipboardList } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Button, DataTable, EmptyState, IntroPage, LearnMore, Menu, Page, PageHeader, PageSkeleton, RadioGroup, SearchInput, SideDrawer, Toolbar, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { useIsPhone } from '@/components/ui/responsive'
import { fmtDateTimeUS } from '@/lib/format'
import type { Stocktake } from '@/types'
import { FiltersButton, SortButton, useIntroProps } from '../ui'
import { InventoryStatus } from './shared'

type Sort = 'startedDesc' | 'startedAsc' | 'nameAsc' | 'nameDesc'
type StatusFilter = 'all' | Stocktake['status']

const openPath = (s: Stocktake) => (s.status === 'completed' || s.status === 'cancelled' ? `/catalogue/stocktakes/${s.id}` : `/catalogue/stocktakes/${s.id}/count`)

/** Stocktakes list, with the intro page until the first stocktake (catalog.md §5). */
export function StocktakesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const phone = useIsPhone()
  const loading = usePageLoading()
  const intro = useIntroProps(t('catalog.inventory.stocktakes.title'))
  const stocktakes = useDb((s) => s.stocktakes)
  const locations = useDb((s) => s.locations)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('startedDesc')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [draftStatus, setDraftStatus] = useState<StatusFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = stocktakes.filter((s) => (status === 'all' || s.status === status) && (!q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)))
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'startedAsc':
          return a.startedAt.localeCompare(b.startedAt)
        case 'nameAsc':
          return a.name.localeCompare(b.name)
        case 'nameDesc':
          return b.name.localeCompare(a.name)
        default:
          return b.startedAt.localeCompare(a.startedAt)
      }
    })
  }, [stocktakes, query, sort, status])

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  if (!stocktakes.length)
    return (
      <Page wide>
        <IntroPage
          {...intro}
          title={t('catalog.inventory.stocktakes.intro.title')}
          body={t('catalog.inventory.stocktakes.intro.body')}
          bullets={[1, 2, 3, 4].map((n) => t(`catalog.inventory.stocktakes.intro.b${n}`))}
          primary={{ label: t('catalog.inventory.stocktakes.intro.start'), onClick: () => navigate('/catalogue/stocktakes/new') }}
        />
      </Page>
    )

  const actionsColumn: Column<Stocktake> = {
    key: 'actions',
    header: '',
    width: '56px',
    cell: (s) => (
      <Menu
        label={t('catalog.common.actions')}
        groups={[
          {
            items: [
              { label: t('catalog.inventory.stocktakes.view'), onSelect: () => navigate(`/catalogue/stocktakes/${s.id}`) },
              ...(s.status === 'completed' || s.status === 'cancelled' ? [] : [{ label: t('catalog.inventory.stocktakes.resume'), onSelect: () => navigate(`/catalogue/stocktakes/${s.id}/count`) }]),
            ],
          },
        ]}
      />
    ),
  }
  const columns: Column<Stocktake>[] = [
    {
      key: 'name',
      header: t('catalog.inventory.stocktakes.cols.name'),
      sortValue: (s) => s.name.toLowerCase(),
      cell: (s) => (
        <div>
          <p className="text-body-strong text-ink">{s.name}</p>
          <p className="text-small text-muted">{locations.find((l) => l.id === s.locationId)?.name}</p>
        </div>
      ),
    },
    { key: 'status', header: t('catalog.inventory.stocktakes.cols.status'), cell: (s) => <InventoryStatus status={s.status} /> },
    { key: 'started', header: t('catalog.inventory.stocktakes.cols.started'), sortValue: (s) => s.startedAt, cell: (s) => fmtDateTimeUS(parseISO(s.startedAt)) },
    { key: 'completed', header: t('catalog.inventory.stocktakes.cols.completed'), sortValue: (s) => s.completedAt ?? '', cell: (s) => (s.completedAt ? fmtDateTimeUS(parseISO(s.completedAt)) : '-') },
    actionsColumn,
  ]
  // Phones: name, location, status and dates in one column, plus the actions menu.
  const phoneColumns: Column<Stocktake>[] = [
    {
      key: 'name',
      header: t('catalog.inventory.stocktakes.cols.name'),
      cell: (s) => (
        <div className="flex max-w-[calc(100vw-138px)] flex-col items-start gap-1 whitespace-normal">
          <p className="break-words text-body-strong text-ink">{s.name}</p>
          <p className="text-small text-muted">{locations.find((l) => l.id === s.locationId)?.name}</p>
          <InventoryStatus status={s.status} />
          <p className="text-small text-muted">
            {t('catalog.inventory.stocktakes.cols.started')}: {fmtDateTimeUS(parseISO(s.startedAt))}
            {s.completedAt && (
              <>
                <br />
                {t('catalog.inventory.stocktakes.cols.completed')}: {fmtDateTimeUS(parseISO(s.completedAt))}
              </>
            )}
          </p>
        </div>
      ),
    },
    actionsColumn,
  ]

  const statuses: Stocktake['status'][] = ['in_progress', 'paused', 'draft', 'completed', 'cancelled']

  return (
    <Page wide>
      <PageHeader
        title={t('catalog.inventory.stocktakes.title')}
        count={stocktakes.length}
        subtitle={
          <>
            {t('catalog.inventory.stocktakes.subtitle')} <LearnMore topic={t('catalog.inventory.stocktakes.title')}>{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => navigate('/catalogue/stocktakes/new')}>
            {t('catalog.common.add')}
          </Button>
        }
      />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.inventory.stocktakes.search')} className="max-w-sm max-md:max-w-none max-md:basis-full" />
        <FiltersButton
          count={status === 'all' ? 0 : 1}
          onClick={() => {
            setDraftStatus(status)
            setFiltersOpen(true)
          }}
        />
        <div className="ml-auto">
          <SortButton
            value={sort}
            onChange={setSort}
            options={(['startedDesc', 'startedAsc', 'nameAsc', 'nameDesc'] as Sort[]).map((v) => ({ value: v, label: t(`catalog.inventory.stocktakes.sort.${v}`) }))}
          />
        </div>
      </Toolbar>
      <DataTable
        columns={phone ? phoneColumns : columns}
        rows={rows}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(openPath(s))}
        empty={<EmptyState icon={<ClipboardList size={26} />} title={t('catalog.common.noResults')} body={t('catalog.inventory.common.noResultsBody')} />}
      />
      <SideDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('catalog.common.filters')}
        footer={
          <>
            <Button
              onClick={() => {
                setStatus('all')
                setFiltersOpen(false)
              }}
            >
              {t('catalog.common.clearFilters')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setStatus(draftStatus)
                setFiltersOpen(false)
              }}
            >
              {t('catalog.common.apply')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-body-strong text-ink">{t('catalog.inventory.stocktakes.cols.status')}</p>
        <RadioGroup<StatusFilter>
          value={draftStatus}
          onChange={setDraftStatus}
          options={[{ value: 'all', label: t('catalog.inventory.common.allStatuses') }, ...statuses.map((s) => ({ value: s, label: t(`catalog.inventory.common.status.${s}`) }))]}
        />
      </SideDrawer>
    </Page>
  )
}
