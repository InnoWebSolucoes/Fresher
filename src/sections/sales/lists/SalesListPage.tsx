import { FileText, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, DataTable, DateRangeButton, EmptyState, Field, LearnMore, Page, PageHeader, PageSkeleton, PillTabs, SearchInput, Select, Toolbar, resolvePreset, usePageLoading, type Column, type DateRangeValue, type PresetKey } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDateTime, money2 } from '@/lib/format'
import type { Sale, SaleItemType, SaleStatus } from '@/types'
import { AmountInput, FilterButton, FilterChips, FiltersModal, OptionsMenu, SaleStatusChip, SortMenu, TableLink, parseAmount, sortBy, useFilters, type FilterChip, type SortDir } from '../shared/ui'
import { dayOf, matches, saleGross, saleTips, useLookups } from '../shared/data'
import { NoResults } from './AppointmentsListPage'

const SALES_PRESETS: PresetKey[] = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'last_month', 'week_to_date', 'month_to_date', 'quarter_to_date', 'year_to_date']
type SortKey = 'number' | 'client' | 'date' | 'location' | 'tips' | 'gross'
const SORTS: { key: SortKey; dir: SortDir }[] = [
  { key: 'number', dir: 'desc' },
  { key: 'number', dir: 'asc' },
  { key: 'client', dir: 'desc' },
  { key: 'client', dir: 'asc' },
  { key: 'date', dir: 'desc' },
  { key: 'date', dir: 'asc' },
  { key: 'location', dir: 'desc' },
  { key: 'location', dir: 'asc' },
  { key: 'tips', dir: 'desc' },
  { key: 'tips', dir: 'asc' },
  { key: 'gross', dir: 'desc' },
  { key: 'gross', dir: 'asc' },
]
const STATUS_FILTERS = ['all', 'unpaid', 'part_paid', 'completed', 'exchanged', 'refunded', 'voided'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]
const ITEM_FILTERS: ('all' | SaleItemType)[] = ['all', 'service', 'service_addon', 'product', 'gift_card', 'package', 'membership', 'late_cancellation_fee', 'no_show_fee', 'shipping']

interface Row {
  sale: Sale
  client: string
  clientId: string | null
  location: string
  tips: number
  gross: number
}

interface Filters {
  status: StatusFilter
  from: string
  to: string
  item: 'all' | SaleItemType
}
const NO_FILTERS: Filters = { status: 'all', from: '', to: '', item: 'all' }

export function SalesListPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const sales = useDb((s) => s.sales)
  const lookups = useLookups()
  const [tab, setTab] = useState<'sales' | 'drafts'>('sales')
  const [query, setQuery] = useState('')
  const [draftQuery, setDraftQuery] = useState('')
  const [range, setRange] = useState<DateRangeValue>(() => resolvePreset('today'))
  const [sort, setSort] = useState<string>('date:desc')
  const filters = useFilters<Filters>(NO_FILTERS)

  const toRow = useMemo(
    () =>
      (sale: Sale): Row => {
        const client = sale.clientId ? lookups.client.get(sale.clientId) : undefined
        return {
          sale,
          client: client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn'),
          clientId: client?.id ?? null,
          location: lookups.location.get(sale.locationId)?.name ?? '',
          tips: saleTips(sale),
          gross: saleGross(sale),
        }
      },
    [lookups, t],
  )

  const rows = useMemo(() => {
    const f = filters.applied
    const from = parseAmount(f.from)
    const to = parseAmount(f.to)
    const list = sales
      .filter((s) => s.status !== 'draft')
      .filter((s) => {
        const day = dayOf(s.createdAt)
        return day >= range.from && day <= range.to
      })
      .filter((s) => f.status === 'all' || s.status === f.status)
      .filter((s) => f.item === 'all' || s.items.some((i) => i.type === f.item))
      .map(toRow)
      .filter((r) => (from === null || r.gross >= from) && (to === null || r.gross <= to))
      .filter((r) => !query.trim() || matches(String(r.sale.number), query.replace('#', '')) || matches(r.client, query))
    const [key, dir] = sort.split(':') as [SortKey, SortDir]
    const value: Record<SortKey, (r: Row) => string | number> = {
      number: (r) => r.sale.number,
      client: (r) => r.client.toLowerCase(),
      date: (r) => r.sale.createdAt,
      location: (r) => r.location,
      tips: (r) => r.tips,
      gross: (r) => r.gross,
    }
    return sortBy(list, value[key], dir)
  }, [sales, range, filters.applied, toRow, query, sort])

  const drafts = useMemo(
    () =>
      sales
        .filter((s) => s.status === 'draft')
        .map(toRow)
        .filter((r) => !draftQuery.trim() || matches(String(r.sale.number), draftQuery.replace('#', '')))
        .sort((a, b) => b.sale.createdAt.localeCompare(a.sale.createdAt)),
    [sales, toRow, draftQuery],
  )

  const columns: Column<Row>[] = [
    { key: 'number', header: t('sales.salesList.cols.number'), cell: (r) => <TableLink onClick={() => drawer.open('sale', { id: r.sale.id })}>{r.sale.number}</TableLink> },
    { key: 'client', header: t('sales.salesList.cols.client'), cell: (r) => (r.clientId ? <TableLink onClick={() => drawer.open('client', { id: r.clientId! })}>{r.client}</TableLink> : r.client) },
    { key: 'status', header: t('sales.salesList.cols.status'), cell: (r) => <SaleStatusChip status={r.sale.status} /> },
    { key: 'date', header: t('sales.salesList.cols.date'), cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.sale.createdAt)}</span> },
    { key: 'tips', header: t('sales.salesList.cols.tips'), align: 'right', cell: (r) => money2(r.tips) },
    { key: 'gross', header: t('sales.salesList.cols.gross'), align: 'right', cell: (r) => money2(r.gross) },
  ]
  const draftColumns: Column<Row>[] = [
    { key: 'number', header: t('sales.salesList.cols.draftId'), cell: (r) => <TableLink onClick={() => drawer.open('checkout', { d_sale: r.sale.id })}>{r.sale.number}</TableLink> },
    { key: 'client', header: t('sales.salesList.cols.client'), cell: (r) => r.client },
    { key: 'created', header: t('sales.salesList.cols.created'), cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.sale.createdAt)}</span> },
    { key: 'by', header: t('sales.salesList.cols.createdBy'), cell: (r) => r.sale.createdBy },
    { key: 'gross', header: t('sales.salesList.cols.gross'), align: 'right', cell: (r) => money2(r.gross) },
  ]

  const statusLabel = (s: StatusFilter) => (s === 'all' ? t('sales.salesList.allStatuses') : s === 'exchanged' ? t('sales.salesList.exchanged') : t(`sales.saleStatus.${s as SaleStatus}`))
  const itemLabel = (i: 'all' | SaleItemType) => t(`sales.salesList.items.${i}`)
  const f = filters.applied
  const chips: FilterChip[] = [
    ...(f.status !== 'all' ? [{ key: 'status', label: statusLabel(f.status), onRemove: () => filters.setApplied({ ...f, status: 'all' }) }] : []),
    ...(f.from ? [{ key: 'from', label: t('sales.salesList.fromChip', { amount: money2(parseAmount(f.from) ?? 0) }), onRemove: () => filters.setApplied({ ...f, from: '' }) }] : []),
    ...(f.to ? [{ key: 'to', label: t('sales.salesList.toChip', { amount: money2(parseAmount(f.to) ?? 0) }), onRemove: () => filters.setApplied({ ...f, to: '' }) }] : []),
    ...(f.item !== 'all' ? [{ key: 'item', label: itemLabel(f.item), onRemove: () => filters.setApplied({ ...f, item: 'all' }) }] : []),
  ]
  const createSale = () => drawer.open('checkout', {})
  const filtered = Boolean(query.trim()) || chips.length > 0

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  return (
    <Page wide>
      <PageHeader
        title={t('sales.salesList.title')}
        subtitle={
          <>
            {t('sales.salesList.subtitle')} <LearnMore topic="sales" />
          </>
        }
        actions={
          <>
            <OptionsMenu groups={[{ items: [{ label: t('sales.salesList.salesSettings'), onSelect: () => navigate('/setup/sales/receipts') }] }]} />
            <Button variant="primary" onClick={createSale}>
              {t('sales.common.addNew')}
            </Button>
          </>
        }
      />
      <PillTabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'sales', label: t('sales.salesList.tabs.sales') },
          { value: 'drafts', label: t('sales.salesList.tabs.drafts') },
        ]}
      />
      {tab === 'sales' ? (
        <>
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} placeholder={t('sales.salesList.search')} className="max-w-xs" />
            <DateRangeButton value={range} onChange={setRange} presets={SALES_PRESETS} />
            <FilterButton count={chips.length} onClick={filters.openModal} />
            <div className="ml-auto">
              <SortMenu value={sort} label={t('sales.common.sortBy')} options={SORTS.map((s) => ({ value: `${s.key}:${s.dir}`, label: t(`sales.salesList.sort.${s.key}.${s.dir}`) }))} onChange={setSort} />
            </div>
          </Toolbar>
          <FilterChips chips={chips} onClearAll={filters.reset} />
          {rows.length === 0 && !filtered ? (
            <div className="card">
              <EmptyState
                icon={<Tag size={24} aria-hidden />}
                title={t('sales.salesList.empty')}
                action={
                  <Button className="rounded-full" onClick={createSale}>
                    {t('sales.salesList.createNew')}
                  </Button>
                }
              />
            </div>
          ) : (
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.sale.id} onRowClick={(r) => drawer.open('sale', { id: r.sale.id })} empty={<NoResults />} />
          )}
        </>
      ) : (
        <>
          <Toolbar>
            <SearchInput value={draftQuery} onChange={setDraftQuery} placeholder={t('sales.salesList.searchDrafts')} className="max-w-xs" />
          </Toolbar>
          {drafts.length === 0 && !draftQuery.trim() ? (
            <div className="card">
              <EmptyState
                icon={<FileText size={24} aria-hidden />}
                title={t('sales.salesList.emptyDrafts')}
                action={
                  <Button className="rounded-full" onClick={createSale}>
                    {t('sales.salesList.createNew')}
                  </Button>
                }
              />
            </div>
          ) : (
            <DataTable columns={draftColumns} rows={drafts} rowKey={(r) => r.sale.id} onRowClick={(r) => drawer.open('checkout', { d_sale: r.sale.id })} empty={<NoResults />} />
          )}
        </>
      )}
      <FiltersModal open={filters.open} onClose={filters.close} onClear={filters.clearDraft} onApply={filters.apply}>
        <Field label={t('sales.salesList.filters.status')}>
          {(id) => <Select id={id} value={filters.draft.status} onChange={(e) => filters.setDraft({ ...filters.draft, status: e.target.value as StatusFilter })} options={STATUS_FILTERS.map((s) => ({ value: s, label: statusLabel(s) }))} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('sales.salesList.filters.from')}>{(id) => <AmountInput id={id} value={filters.draft.from} onChange={(v) => filters.setDraft({ ...filters.draft, from: v })} placeholder="0" />}</Field>
          <Field label={t('sales.salesList.filters.to')}>{(id) => <AmountInput id={id} value={filters.draft.to} onChange={(v) => filters.setDraft({ ...filters.draft, to: v })} placeholder="0" />}</Field>
        </div>
        <Field label={t('sales.salesList.filters.items')}>
          {(id) => <Select id={id} value={filters.draft.item} onChange={(e) => filters.setDraft({ ...filters.draft, item: e.target.value as Filters['item'] })} options={ITEM_FILTERS.map((i) => ({ value: i, label: itemLabel(i) }))} />}
        </Field>
      </FiltersModal>
    </Page>
  )
}
