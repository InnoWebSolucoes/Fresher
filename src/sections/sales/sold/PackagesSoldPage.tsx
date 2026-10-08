import { Package } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, DataTable, EmptyState, LearnMore, Menu, Page, PageHeader, PageSkeleton, SearchInput, Toolbar, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { cancelClientPackage } from '@/api/salesPages'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { todayISO } from '@/lib/time'
import { fmtDateEU, money2 } from '@/lib/format'
import { exportCsv, exportedFileName } from '@/lib/export'
import type { ClientPackage } from '@/types'
import { OptionsMenu, PILL, TableLink } from '../shared/ui'
import { matches, useLookups } from '../shared/data'
import { NoResults } from '../lists/AppointmentsListPage'

type Status = ClientPackage['status']
const FILTERS = ['all', 'active', 'canceled', 'pending'] as const
type StatusFilter = (typeof FILTERS)[number]
const TONES: Record<Status, 'success' | 'outline' | 'warning' | 'danger' | 'neutral'> = { active: 'success', canceled: 'danger', pending: 'warning', expired: 'outline', used: 'neutral' }

interface Row {
  cp: ClientPackage
  status: Status
  name: string
  client: string
  saleNumber?: number
  used: number
  total: number | 'unlimited'
}

export function PackagesSoldPage() {
  const { t } = useTranslation()
  const loading = usePageLoading()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const clientPackages = useDb((s) => s.clientPackages)
  const packages = useDb((s) => s.packages)
  const sales = useDb((s) => s.sales)
  const lookups = useLookups()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const rows = useMemo(() => {
    const today = todayISO()
    const defs = new Map(packages.map((p) => [p.id, p]))
    const saleById = new Map(sales.map((s) => [s.id, s]))
    return clientPackages
      .map((cp): Row => {
        const def = defs.get(cp.packageId)
        const client = lookups.client.get(cp.clientId)
        const quantities = def?.benefits.map((b) => b.quantity) ?? []
        const total: number | 'unlimited' = quantities.includes('unlimited') ? 'unlimited' : quantities.reduce<number>((s, q) => s + (q === 'unlimited' ? 0 : q), 0)
        return {
          cp,
          status: cp.status === 'active' && cp.expiresAt < today ? 'expired' : cp.status,
          name: def?.name ?? t('sales.packages.deleted'),
          client: client ? `${client.firstName} ${client.lastName}` : t('sales.common.walkIn'),
          saleNumber: saleById.get(cp.saleId)?.number,
          used: cp.usage.reduce((s, u) => s + u.used, 0),
          total,
        }
      })
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) => !query.trim() || matches(r.name, query) || matches(r.client, query))
      .sort((a, b) => b.cp.startDate.localeCompare(a.cp.startDate))
  }, [clientPackages, packages, sales, lookups, status, query, t])

  const cancel = async (row: Row) => {
    const ok = await confirm({ title: t('sales.packages.cancelTitle'), body: t('sales.packages.cancelBody', { name: row.name, client: row.client }), confirmLabel: t('sales.packages.cancelConfirm'), tone: 'danger' })
    if (!ok) return
    setBusy(row.cp.id)
    try {
      await cancelClientPackage(row.cp.id)
      toast(t('sales.packages.canceled'))
    } finally {
      setBusy(null)
    }
  }

  const usage = (r: Row) => (r.total === 'unlimited' ? t('sales.packages.usedUnlimited', { used: r.used }) : t('sales.packages.usedOf', { used: r.used, total: r.total }))
  const columns: Column<Row>[] = [
    { key: 'name', header: t('sales.packages.cols.package'), cell: (r) => <span className="font-semibold text-ink">{r.name}</span> },
    { key: 'client', header: t('sales.packages.cols.client'), cell: (r) => <TableLink onClick={() => drawer.open('client', { id: r.cp.clientId })}>{r.client}</TableLink> },
    { key: 'sale', header: t('sales.packages.cols.sale'), cell: (r) => (r.saleNumber !== undefined ? <TableLink onClick={() => drawer.open('sale', { id: r.cp.saleId })}>{r.saleNumber}</TableLink> : '-') },
    { key: 'purchased', header: t('sales.packages.cols.purchased'), cell: (r) => <span className="whitespace-nowrap">{fmtDateEU(r.cp.startDate)}</span> },
    { key: 'expires', header: t('sales.packages.cols.expires'), cell: (r) => <span className="whitespace-nowrap">{fmtDateEU(r.cp.expiresAt)}</span> },
    { key: 'usage', header: t('sales.packages.cols.usage'), cell: usage },
    { key: 'price', header: t('sales.packages.cols.price'), align: 'right', cell: (r) => money2(r.cp.price) },
    { key: 'status', header: t('sales.packages.cols.status'), cell: (r) => <Chip tone={TONES[r.status]}>{t(`sales.packages.status.${r.status}`)}</Chip> },
    {
      key: 'actions',
      header: <span className="sr-only">{t('sales.common.actions')}</span>,
      width: '56px',
      cell: (r) => (
        <Menu
          label={t('sales.common.actions')}
          groups={[
            {
              items: [
                { label: t('sales.packages.viewClient'), onSelect: () => drawer.open('client', { id: r.cp.clientId }) },
                { label: t('sales.packages.viewSale'), onSelect: () => drawer.open('sale', { id: r.cp.saleId }), disabled: r.saleNumber === undefined },
              ],
            },
            ...(r.status === 'active' || r.status === 'pending' ? [{ items: [{ label: t('sales.packages.cancel'), danger: true, disabled: busy === r.cp.id, onSelect: () => void cancel(r) }] }] : []),
          ]}
        />
      ),
    },
  ]

  const exportRows = () => {
    exportCsv(exportedFileName(), [
      {
        headers: [t('sales.packages.cols.package'), t('sales.packages.cols.client'), t('sales.packages.cols.sale'), t('sales.packages.cols.purchased'), t('sales.packages.cols.expires'), t('sales.packages.cols.usage'), t('sales.packages.cols.price'), t('sales.packages.cols.status')],
        rows: rows.map((r) => [r.name, r.client, r.saleNumber ?? '', fmtDateEU(r.cp.startDate), fmtDateEU(r.cp.expiresAt), usage(r), r.cp.price.toFixed(2), t(`sales.packages.status.${r.status}`)]),
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

  const empty = clientPackages.length === 0
  return (
    <Page wide>
      <PageHeader
        title={t('sales.packages.title')}
        subtitle={
          <>
            {t('sales.packages.subtitle')} <LearnMore topic="packages" />
          </>
        }
        actions={
          <OptionsMenu
            groups={[
              { items: [{ label: t('sales.packages.manage'), onSelect: () => navigate('/catalogue/packages') }] },
              { heading: t('sales.common.export'), items: [{ label: t('sales.common.formats.csv'), onSelect: exportRows }] },
            ]}
          />
        }
      />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('sales.packages.search')} className="max-w-sm" />
        <Menu
          align="left"
          width={220}
          trigger={({ open, toggle }) => (
            <button type="button" className={PILL} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              {t(`sales.packages.filter.${status}`)}
              <span aria-hidden className="text-[10px]">
                {open ? '▲' : '▼'}
              </span>
            </button>
          )}
          groups={[{ items: FILTERS.map((s) => ({ label: t(`sales.packages.filter.${s}`), checked: s === status, onSelect: () => setStatus(s) })) }]}
        />
      </Toolbar>
      {empty ? (
        <div className="card">
          <EmptyState
            icon={<Package size={24} aria-hidden />}
            title={t('sales.packages.emptyTitle')}
            body={t('sales.packages.emptyBody')}
            action={
              <Button className="rounded-full" onClick={() => navigate('/catalogue/packages')}>
                {t('sales.packages.setUp')}
              </Button>
            }
          />
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.cp.id} empty={<NoResults />} />
      )}
    </Page>
  )
}
