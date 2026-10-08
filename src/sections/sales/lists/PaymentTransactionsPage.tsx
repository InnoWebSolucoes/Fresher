import { subDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { DataTable, DateRangeButton, Field, Menu, Page, PageHeader, PageSkeleton, SearchInput, Select, Toolbar, toast, usePageLoading, type Column, type DateRangeValue } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { now, toISODate } from '@/lib/time'
import { fmtDateEU, money2, round2 } from '@/lib/format'
import { exportCsv, exportedFileName } from '@/lib/export'
import type { Payment, Sale } from '@/types'
import { AmountInput, FilterButton, FilterChips, FiltersModal, OptionsMenu, SortHeader, TableLink, parseAmount, sortBy, useFilters, type FilterChip, type SortDir } from '../shared/ui'
import { dayOf, matches, useLookups } from '../shared/data'
import { NoResults, WIDE_PRESETS } from './AppointmentsListPage'

type SortKey = 'date' | 'location' | 'ref' | 'client' | 'member' | 'type' | 'method' | 'amount'

interface Row {
  payment: Payment
  sale?: Sale
  location: string
  client: string
  clientId: string | null
  member: string
  memberId?: string
}

interface Filters {
  location: string
  member: string
  type: 'all' | Payment['kind']
  from: string
  to: string
  giftCards: 'exclude' | 'include'
  deposits: 'exclude' | 'include'
}
const NO_FILTERS: Filters = { location: 'all', member: 'all', type: 'all', from: '', to: '', giftCards: 'exclude', deposits: 'exclude' }

export function PaymentTransactionsPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const payments = useDb((s) => s.payments)
  const sales = useDb((s) => s.sales)
  const lookups = useLookups()
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<DateRangeValue>(() => ({ preset: 'custom', from: toISODate(subDays(now(), 30)), to: toISODate(now()) }))
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' })
  const filters = useFilters<Filters>(NO_FILTERS)

  const rows = useMemo(() => {
    const f = filters.applied
    const from = parseAmount(f.from)
    const to = parseAmount(f.to)
    const saleById = new Map(sales.map((s) => [s.id, s]))
    const list: Row[] = payments
      .filter((p) => p.status === 'succeeded')
      .filter((p) => {
        const day = dayOf(p.at)
        return day >= range.from && day <= range.to
      })
      .filter((p) => f.location === 'all' || p.locationId === f.location)
      .filter((p) => f.type === 'all' || p.kind === f.type)
      .filter((p) => f.giftCards === 'include' || p.method !== 'gift_card')
      .filter((p) => f.deposits === 'include' || (p.method !== 'deposit' && !(p.kind === 'deposit' && p.saleId)))
      .filter((p) => (from === null || p.amount >= from) && (to === null || p.amount <= to))
      .map((p) => {
        const client = p.clientId ? lookups.client.get(p.clientId) : undefined
        const member = (p.collectedById ? lookups.member.get(p.collectedById) : undefined) ?? lookups.memberByName.get(p.by)
        return {
          payment: p,
          sale: saleById.get(p.saleId),
          location: lookups.location.get(p.locationId)?.name ?? '',
          client: client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn'),
          clientId: client?.id ?? null,
          member: member ? `${member.firstName} ${member.lastName}` : p.by,
          memberId: member?.id,
        }
      })
      .filter((r) => f.member === 'all' || r.memberId === f.member)
      .filter((r) => !query.trim() || (r.sale && matches(String(r.sale.number), query.replace('#', ''))) || matches(r.client, query))
    const value: Record<SortKey, (r: Row) => string | number> = {
      date: (r) => r.payment.at,
      location: (r) => r.location,
      ref: (r) => r.sale?.number ?? 0,
      client: (r) => r.client.toLowerCase(),
      member: (r) => r.member,
      type: (r) => r.payment.kind,
      method: (r) => r.payment.methodLabel,
      amount: (r) => r.payment.amount,
    }
    return sortBy(list, value[sort.key], sort.dir)
  }, [payments, sales, range, filters.applied, lookups, query, sort, t])

  const total = round2(rows.reduce((s, r) => s + r.payment.amount, 0))
  const typeLabel = (k: Payment['kind']) => t(`sales.payments.types.${k}`)
  const header = (key: SortKey, label: string) => <SortHeader label={label} active={sort.key === key} dir={sort.dir} onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))} />

  const columns: Column<Row>[] = [
    { key: 'date', header: header('date', t('sales.payments.cols.date')), cell: (r) => <span className="whitespace-nowrap">{fmtDateEU(r.payment.at)}</span> },
    { key: 'location', header: header('location', t('sales.payments.cols.location')), cell: (r) => <span className="block max-w-[180px]">{r.location}</span> },
    { key: 'ref', header: header('ref', t('sales.payments.cols.ref')), cell: (r) => (r.sale ? <TableLink onClick={() => drawer.open('sale', { id: r.sale!.id })}>{r.sale.number}</TableLink> : '-') },
    { key: 'client', header: header('client', t('sales.payments.cols.client')), cell: (r) => (r.clientId ? <TableLink onClick={() => drawer.open('client', { id: r.clientId! })}>{r.client}</TableLink> : r.client) },
    {
      key: 'member',
      header: header('member', t('sales.payments.cols.member')),
      cell: (r) =>
        r.memberId ? (
          <TableLink className="block max-w-[150px] truncate" onClick={() => drawer.open('team-member', { id: r.memberId! })}>
            {r.member}
          </TableLink>
        ) : (
          r.member
        ),
    },
    { key: 'type', header: header('type', t('sales.payments.cols.type')), cell: (r) => typeLabel(r.payment.kind) },
    { key: 'method', header: header('method', t('sales.payments.cols.method')), cell: (r) => r.payment.methodLabel },
    { key: 'amount', header: header('amount', t('sales.payments.cols.amount')), align: 'right', cell: (r) => <span className="whitespace-nowrap">{money2(r.payment.amount)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">{t('sales.common.actions')}</span>,
      width: '56px',
      cell: (r) =>
        r.sale && r.payment.kind !== 'refund' ? (
          <Menu
            label={t('sales.common.actions')}
            width={180}
            groups={[
              {
                items: [
                  { label: t('sales.payments.viewSale'), onSelect: () => drawer.open('sale', { id: r.sale!.id }) },
                  ...(r.sale.kind === 'sale' && (r.sale.status === 'completed' || r.sale.status === 'part_paid') ? [{ label: t('sales.payments.refund'), onSelect: () => navigate(`/sales/refund-sale/${r.sale!.id}`) }] : []),
                ],
              },
            ]}
          />
        ) : null,
    },
  ]

  const f = filters.applied
  const memberName = (id: string) => {
    const m = lookups.member.get(id)
    return m ? `${m.firstName} ${m.lastName}` : ''
  }
  const chips: FilterChip[] = [
    ...(f.location !== 'all' ? [{ key: 'location', label: lookups.location.get(f.location)?.name ?? '', onRemove: () => filters.setApplied({ ...f, location: 'all' }) }] : []),
    ...(f.member !== 'all' ? [{ key: 'member', label: memberName(f.member), onRemove: () => filters.setApplied({ ...f, member: 'all' }) }] : []),
    ...(f.type !== 'all' ? [{ key: 'type', label: typeLabel(f.type), onRemove: () => filters.setApplied({ ...f, type: 'all' }) }] : []),
    ...(f.from ? [{ key: 'from', label: t('sales.salesList.fromChip', { amount: money2(parseAmount(f.from) ?? 0) }), onRemove: () => filters.setApplied({ ...f, from: '' }) }] : []),
    ...(f.to ? [{ key: 'to', label: t('sales.salesList.toChip', { amount: money2(parseAmount(f.to) ?? 0) }), onRemove: () => filters.setApplied({ ...f, to: '' }) }] : []),
    ...(f.giftCards === 'include' ? [{ key: 'giftCards', label: t('sales.payments.filters.includeGiftCards'), onRemove: () => filters.setApplied({ ...f, giftCards: 'exclude' }) }] : []),
    ...(f.deposits === 'include' ? [{ key: 'deposits', label: t('sales.payments.filters.includeDeposits'), onRemove: () => filters.setApplied({ ...f, deposits: 'exclude' }) }] : []),
  ]

  const exportRows = () => {
    exportCsv(exportedFileName(), [
      {
        headers: [t('sales.payments.cols.date'), t('sales.payments.cols.location'), t('sales.payments.cols.ref'), t('sales.payments.cols.client'), t('sales.payments.cols.member'), t('sales.payments.cols.type'), t('sales.payments.cols.method'), t('sales.payments.cols.amount')],
        rows: [[t('sales.payments.total'), '', '', '', '', '', '', total.toFixed(2)], ...rows.map((r) => [fmtDateEU(r.payment.at), r.location, r.sale?.number ?? '', r.client, r.member, typeLabel(r.payment.kind), r.payment.methodLabel, r.payment.amount.toFixed(2)])],
      },
    ])
    toast(t('sales.common.reportGenerated'))
  }

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  return (
    <Page wide>
      <PageHeader
        title={t('sales.payments.title')}
        subtitle={t('sales.payments.subtitle')}
        actions={
          <OptionsMenu
            groups={[
              { items: [{ label: t('sales.payments.managePayments'), onSelect: () => navigate('/payments/payment-processing') }] },
              { heading: t('sales.common.export'), items: [{ label: t('sales.common.formats.csv'), onSelect: exportRows }] },
            ]}
          />
        }
      />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('sales.payments.search')} className="max-w-xs" />
        <DateRangeButton value={range} onChange={setRange} presets={WIDE_PRESETS} />
        <FilterButton count={chips.length} onClick={filters.openModal} />
      </Toolbar>
      <FilterChips chips={chips} onClearAll={filters.reset} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.payment.id} totalRow={{ date: t('sales.payments.total'), amount: money2(total) }} empty={<NoResults />} />
      <FiltersModal open={filters.open} onClose={filters.close} onClear={filters.clearDraft} onApply={filters.apply}>
        <Field label={t('sales.payments.filters.location')}>
          {(id) => <Select id={id} value={filters.draft.location} onChange={(e) => filters.setDraft({ ...filters.draft, location: e.target.value })} options={[{ value: 'all', label: t('sales.common.allLocations') }, ...lookups.locations.map((l) => ({ value: l.id, label: l.name }))]} />}
        </Field>
        <Field label={t('sales.payments.filters.member')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.member}
              onChange={(e) => filters.setDraft({ ...filters.draft, member: e.target.value })}
              options={[{ value: 'all', label: t('sales.common.allTeamMembers') }, ...lookups.members.filter((m) => !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))]}
            />
          )}
        </Field>
        <Field label={t('sales.payments.filters.type')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.type}
              onChange={(e) => filters.setDraft({ ...filters.draft, type: e.target.value as Filters['type'] })}
              options={[{ value: 'all', label: t('sales.payments.filters.allTypes') }, ...(['sale', 'refund', 'deposit'] as const).map((k) => ({ value: k, label: typeLabel(k) }))]}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('sales.payments.filters.from')}>{(id) => <AmountInput id={id} value={filters.draft.from} onChange={(v) => filters.setDraft({ ...filters.draft, from: v })} placeholder="0" />}</Field>
          <Field label={t('sales.payments.filters.to')}>{(id) => <AmountInput id={id} value={filters.draft.to} onChange={(v) => filters.setDraft({ ...filters.draft, to: v })} placeholder="0" />}</Field>
        </div>
        <Field label={t('sales.payments.filters.giftCards')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.giftCards}
              onChange={(e) => filters.setDraft({ ...filters.draft, giftCards: e.target.value as Filters['giftCards'] })}
              options={[
                { value: 'exclude', label: t('sales.payments.filters.excludeGiftCards') },
                { value: 'include', label: t('sales.payments.filters.includeGiftCards') },
              ]}
            />
          )}
        </Field>
        <Field label={t('sales.payments.filters.deposits')}>
          {(id) => (
            <Select
              id={id}
              value={filters.draft.deposits}
              onChange={(e) => filters.setDraft({ ...filters.draft, deposits: e.target.value as Filters['deposits'] })}
              options={[
                { value: 'exclude', label: t('sales.payments.filters.excludeDeposits') },
                { value: 'include', label: t('sales.payments.filters.includeDeposits') },
              ]}
            />
          )}
        </Field>
      </FiltersModal>
    </Page>
  )
}
