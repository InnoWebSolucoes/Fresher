import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Chip, DataTable, EmptyState, Menu, Page, PageHeader, PageSkeleton, SearchInput, Toolbar, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { setMembershipStatus } from '@/api/salesPages'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDateEU, money } from '@/lib/format'
import { exportCsv, exportedFileName } from '@/lib/export'
import type { ClientMembership, Membership } from '@/types'
import { ExportMenu, HiddenHeader, TableLink } from '../shared/ui'
import { matches, useLookups } from '../shared/data'
import { NoResults } from '../lists/AppointmentsListPage'

const TONES: Record<ClientMembership['status'], 'success' | 'warning' | 'danger'> = { active: 'success', paused: 'warning', canceled: 'danger' }

interface Row {
  cm: ClientMembership
  def?: Membership
  name: string
  client: string
  saleNumber?: number
}

export function MembershipsSoldPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const clientMemberships = useDb((s) => s.clientMemberships)
  const memberships = useDb((s) => s.memberships)
  const sales = useDb((s) => s.sales)
  const lookups = useLookups()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const rows = useMemo(() => {
    const defs = new Map(memberships.map((m) => [m.id, m]))
    const saleById = new Map(sales.map((s) => [s.id, s]))
    return clientMemberships
      .map((cm): Row => {
        const def = defs.get(cm.membershipId)
        const client = lookups.client.get(cm.clientId)
        return { cm, def, name: def?.name ?? t('sales.memberships.deleted'), client: client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn'), saleNumber: saleById.get(cm.saleId)?.number }
      })
      .filter((r) => !query.trim() || matches(r.name, query) || matches(r.client, query))
      .sort((a, b) => b.cm.startDate.localeCompare(a.cm.startDate))
  }, [clientMemberships, memberships, sales, lookups, query, t])

  const change = async (row: Row, status: ClientMembership['status']) => {
    if (status === 'canceled') {
      const ok = await confirm({ title: t('sales.memberships.cancelTitle'), body: t('sales.memberships.cancelBody', { name: row.name, client: row.client }), confirmLabel: t('sales.memberships.cancelConfirm'), tone: 'danger' })
      if (!ok) return
    }
    setBusy(row.cm.id)
    try {
      await setMembershipStatus(row.cm.id, status)
      toast(t(`sales.memberships.toasts.${status}`))
    } finally {
      setBusy(null)
    }
  }

  const price = (r: Row) => t(r.def?.interval === 'week' ? 'sales.memberships.perWeek' : 'sales.memberships.perMonth', { amount: money(r.cm.price) })
  const columns: Column<Row>[] = [
    { key: 'name', header: t('sales.memberships.cols.membership'), cell: (r) => <span className="font-semibold text-ink">{r.name}</span> },
    { key: 'client', header: t('sales.memberships.cols.client'), cell: (r) => <TableLink onClick={() => drawer.open('client', { id: r.cm.clientId })}>{r.client}</TableLink> },
    { key: 'sale', header: t('sales.memberships.cols.sale'), cell: (r) => (r.saleNumber !== undefined ? <TableLink onClick={() => drawer.open('sale', { id: r.cm.saleId })}>{r.saleNumber}</TableLink> : '-') },
    { key: 'start', header: t('sales.memberships.cols.start'), cell: (r) => <span className="whitespace-nowrap">{fmtDateEU(r.cm.startDate)}</span> },
    { key: 'next', header: t('sales.memberships.cols.next'), cell: (r) => <span className="whitespace-nowrap">{r.cm.status === 'active' ? fmtDateEU(r.cm.nextBillingAt) : '-'}</span> },
    { key: 'price', header: t('sales.memberships.cols.price'), align: 'right', cell: price },
    { key: 'status', header: t('sales.memberships.cols.status'), cell: (r) => <Chip tone={TONES[r.cm.status]}>{t(`sales.memberships.status.${r.cm.status}`)}</Chip> },
    {
      key: 'actions',
      header: <HiddenHeader>{t('sales.common.actions')}</HiddenHeader>,
      width: '56px',
      cell: (r) => (
        <Menu
          label={t('sales.common.actions')}
          groups={[
            {
              items: [
                { label: t('sales.memberships.viewClient'), onSelect: () => drawer.open('client', { id: r.cm.clientId }) },
                { label: t('sales.memberships.viewSale'), disabled: r.saleNumber === undefined, onSelect: () => drawer.open('sale', { id: r.cm.saleId }) },
              ],
            },
            ...(r.cm.status !== 'canceled'
              ? [
                  {
                    items: [
                      r.cm.status === 'active'
                        ? { label: t('sales.memberships.pause'), disabled: busy === r.cm.id, onSelect: () => void change(r, 'paused') }
                        : { label: t('sales.memberships.resume'), disabled: busy === r.cm.id, onSelect: () => void change(r, 'active') },
                      { label: t('sales.memberships.cancel'), danger: true, disabled: busy === r.cm.id, onSelect: () => void change(r, 'canceled') },
                    ],
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ]

  const onExport = () => {
    exportCsv(exportedFileName(), [
      {
        headers: [t('sales.memberships.cols.membership'), t('sales.memberships.cols.client'), t('sales.memberships.cols.sale'), t('sales.memberships.cols.start'), t('sales.memberships.cols.next'), t('sales.memberships.cols.price'), t('sales.memberships.cols.status')],
        rows: rows.map((r) => [r.name, r.client, r.saleNumber ?? '', fmtDateEU(r.cm.startDate), r.cm.status === 'active' ? fmtDateEU(r.cm.nextBillingAt) : '', r.cm.price.toFixed(2), t(`sales.memberships.status.${r.cm.status}`)]),
      },
    ])
  }

  if (loading)
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )

  return (
    <Page wide>
      <PageHeader title={t('sales.memberships.title')} subtitle={t('sales.memberships.subtitle')} actions={<ExportMenu formats={['csv']} onExport={onExport} />} />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('sales.memberships.search')} className="max-w-md" />
      </Toolbar>
      {clientMemberships.length === 0 ? (
        <EmptyState title={t('sales.memberships.emptyTitle')} body={t('sales.memberships.emptyBody')} />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.cm.id} empty={<NoResults />} />
      )}
    </Page>
  )
}
