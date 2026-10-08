import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { Gift } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Chip, DataTable, EmptyState, Field, LearnMore, Page, PageHeader, PageSkeleton, SearchInput, Select, Toolbar, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { todayISO } from '@/lib/time'
import { money2, round2 } from '@/lib/format'
import { exportCsv, exportedFileName, exportPdf, exportXlsx, type ExportTable } from '@/lib/export'
import type { GiftCard } from '@/types'
import { FilterButton, FilterChips, FiltersModal, OptionsMenu, TableLink, useFilters, type ExportFormat, type FilterChip } from '../shared/ui'
import { matches, useLookups } from '../shared/data'

type Status = GiftCard['status']
const STATUSES: Status[] = ['active', 'redeemed', 'expired', 'cancelled']
const TONES: Record<Status, 'success' | 'outline' | 'warning' | 'danger'> = { active: 'success', redeemed: 'outline', expired: 'warning', cancelled: 'danger' }
const fmt = (d: string) => format(parseISO(d), 'dd MMM yyyy')

interface Row {
  card: GiftCard
  status: Status
  saleId: string
  saleNumber?: number
  purchaser: string
  purchaserId: string | null
  owner: string
  ownerId: string | null
  redeemed: number
}

interface Filters {
  status: 'all' | Status
  channel: 'all' | 'in_store' | 'online'
}

export function GiftCardsSoldPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const giftCards = useDb((s) => s.giftCards)
  const sales = useDb((s) => s.sales)
  const lookups = useLookups()
  const [query, setQuery] = useState('')
  const filters = useFilters<Filters>({ status: 'all', channel: 'all' })

  const rows = useMemo(() => {
    const saleById = new Map(sales.map((s) => [s.id, s]))
    const today = todayISO()
    const name = (id: string | null) => {
      const c = id ? lookups.client.get(id) : undefined
      return c ? `${c.firstName} ${c.lastName}` : null
    }
    return giftCards
      .map((card): Row => {
        const status: Status = card.status === 'active' && card.expiresAt && card.expiresAt < today ? 'expired' : card.status
        return {
          card,
          status,
          saleId: card.saleId,
          saleNumber: saleById.get(card.saleId)?.number,
          purchaser: name(card.purchaserClientId) ?? t('sales.common.walkIn'),
          purchaserId: card.purchaserClientId,
          owner: name(card.ownerClientId) ?? card.recipientName ?? t('sales.giftCards.notClaimed'),
          ownerId: card.ownerClientId,
          redeemed: round2(card.value - card.balance),
        }
      })
      .filter((r) => filters.applied.status === 'all' || r.status === filters.applied.status)
      .filter((r) => filters.applied.channel === 'all' || (filters.applied.channel === 'online') === r.card.onlinePurchase)
      .filter((r) => !query.trim() || matches(r.card.code, query) || matches(r.card.customCode, query) || matches(r.purchaser, query) || matches(r.owner, query))
      .sort((a, b) => b.card.issuedAt.localeCompare(a.card.issuedAt))
  }, [giftCards, sales, lookups, filters.applied, query, t])

  const columns: Column<Row>[] = [
    { key: 'code', header: t('sales.giftCards.cols.code'), cell: (r) => <TableLink onClick={() => drawer.open('gift-card', { id: r.card.id })}>{r.card.customCode ?? r.card.code}</TableLink> },
    { key: 'issued', header: t('sales.giftCards.cols.issued'), cell: (r) => <span className="whitespace-nowrap">{fmt(r.card.issuedAt)}</span> },
    { key: 'expiry', header: t('sales.giftCards.cols.expiry'), cell: (r) => <span className="whitespace-nowrap">{r.card.expiresAt ? fmt(r.card.expiresAt) : t('sales.giftCards.never')}</span> },
    { key: 'status', header: t('sales.giftCards.cols.status'), cell: (r) => <Chip tone={TONES[r.status]}>{t(`sales.giftCards.status.${r.status}`)}</Chip> },
    { key: 'sale', header: t('sales.giftCards.cols.sale'), cell: (r) => (r.saleNumber !== undefined ? <TableLink onClick={() => drawer.open('sale', { id: r.saleId })}>{r.saleNumber}</TableLink> : '-') },
    { key: 'purchaser', header: t('sales.giftCards.cols.purchaser'), cell: (r) => (r.purchaserId ? <TableLink onClick={() => drawer.open('client', { id: r.purchaserId! })}>{r.purchaser}</TableLink> : r.purchaser) },
    { key: 'owner', header: t('sales.giftCards.cols.owner'), cell: (r) => (r.ownerId ? <TableLink onClick={() => drawer.open('client', { id: r.ownerId! })}>{r.owner}</TableLink> : r.owner) },
    { key: 'total', header: t('sales.giftCards.cols.total'), align: 'right', cell: (r) => money2(r.card.value) },
    { key: 'redeemed', header: t('sales.giftCards.cols.redeemed'), align: 'right', cell: (r) => money2(r.redeemed) },
    { key: 'remaining', header: t('sales.giftCards.cols.remaining'), align: 'right', cell: (r) => money2(r.card.balance) },
  ]

  const onExport = async (fmtKind: ExportFormat) => {
    const table: ExportTable = {
      headers: columns.map((c) => String(t(`sales.giftCards.cols.${c.key}`))),
      rows: rows.map((r) => {
        const amt = (n: number) => (fmtKind === 'pdf' ? money2(n) : n.toFixed(2))
        return [r.card.customCode ?? r.card.code, fmt(r.card.issuedAt), r.card.expiresAt ? fmt(r.card.expiresAt) : t('sales.giftCards.never'), t(`sales.giftCards.status.${r.status}`), r.saleNumber ?? '', r.purchaser, r.owner, amt(r.card.value), amt(r.redeemed), amt(r.card.balance)]
      }),
    }
    const name = exportedFileName()
    if (fmtKind === 'csv') exportCsv(name, [table])
    else if (fmtKind === 'xlsx') await exportXlsx(name, [table])
    else await exportPdf(name, { title: t('sales.giftCards.title'), tables: [table], orientation: 'landscape' })
    toast(t('sales.common.reportGenerated'))
  }

  const f = filters.applied
  const chips: FilterChip[] = [
    ...(f.status !== 'all' ? [{ key: 'status', label: t(`sales.giftCards.status.${f.status}`), onRemove: () => filters.setApplied({ ...f, status: 'all' }) }] : []),
    ...(f.channel !== 'all' ? [{ key: 'channel', label: t(`sales.giftCards.channels.${f.channel}`), onRemove: () => filters.setApplied({ ...f, channel: 'all' }) }] : []),
  ]

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  return (
    <Page wide>
      <PageHeader
        title={t('sales.giftCards.title')}
        subtitle={
          <>
            {t('sales.giftCards.subtitle')} <LearnMore topic={t('sales.helpTopics.giftCards')}>{t('common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <OptionsMenu
            groups={[
              { items: [{ label: t('sales.giftCards.settings'), onSelect: () => navigate('/setup/sales/gift-cards') }] },
              { heading: t('sales.common.export'), items: (['pdf', 'csv', 'xlsx'] as const).map((k) => ({ label: t(`sales.common.formats.${k}`), onSelect: () => void onExport(k) })) },
            ]}
          />
        }
      />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('sales.giftCards.search')} className="max-w-sm" />
        <FilterButton count={chips.length} onClick={filters.openModal} />
      </Toolbar>
      <FilterChips chips={chips} onClearAll={filters.reset} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.card.id}
        onRowClick={(r) => drawer.open('gift-card', { id: r.card.id })}
        empty={<EmptyState icon={<Gift size={24} aria-hidden />} title={t('sales.common.noResults')} body={t('sales.common.noResultsHint')} />}
      />
      <FiltersModal open={filters.open} onClose={filters.close} onClear={filters.clearDraft} onApply={filters.apply}>
        <Field label={t('sales.giftCards.filters.status')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.status}
              onChange={(e) => filters.setDraft({ ...filters.draft, status: e.target.value as Filters['status'] })}
              options={[{ value: 'all', label: t('sales.giftCards.filters.allStatuses') }, ...STATUSES.map((s) => ({ value: s, label: t(`sales.giftCards.status.${s}`) }))]}
            />
          )}
        </Field>
        <Field label={t('sales.giftCards.filters.channel')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.channel}
              onChange={(e) => filters.setDraft({ ...filters.draft, channel: e.target.value as Filters['channel'] })}
              options={(['all', 'in_store', 'online'] as const).map((c) => ({ value: c, label: t(`sales.giftCards.channels.${c}`) }))}
            />
          )}
        </Field>
      </FiltersModal>
    </Page>
  )
}
