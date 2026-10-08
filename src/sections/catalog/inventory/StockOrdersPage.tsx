import { PackagePlus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Button, DataTable, EmptyState, LearnMore, Menu, MenuButton, Page, PageHeader, PageSkeleton, RadioGroup, SearchInput, SideDrawer, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { exportCsv, exportXlsx, exportedFileName } from '@/lib/export'
import { fmtDate, money } from '@/lib/format'
import type { StockOrder } from '@/types'
import { deleteStockOrderDraft, orderTotal } from '@/api/catalog'
import { FiltersButton, ToolbarCard } from '../ui'
import { InventoryStatus, downloadOrderPdf } from './shared'

type StatusFilter = 'all' | StockOrder['status']

/** Stock orders list (`/catalogue/orders`, catalog.md §6). */
export function StockOrdersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const orders = useDb((s) => s.stockOrders)
  const suppliers = useDb((s) => s.suppliers)
  const locations = useDb((s) => s.locations)
  const products = useDb((s) => s.products)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [draftStatus, setDraftStatus] = useState<StatusFilter>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const supplierName = (o: StockOrder) => suppliers.find((s) => s.id === o.supplierId)?.name ?? ''
  const locationName = (o: StockOrder) => locations.find((l) => l.id === o.locationId)?.name ?? ''

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...orders]
      .filter((o) => status === 'all' || o.status === status)
      .filter((o) => {
        if (!q) return true
        if (o.number.toLowerCase().includes(q)) return true
        if ((suppliers.find((s) => s.id === o.supplierId)?.name ?? '').toLowerCase().includes(q)) return true
        return o.items.some((i) => (products.find((p) => p.id === i.productId)?.name ?? '').toLowerCase().includes(q))
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [orders, status, query, suppliers, products])

  const open = (o: StockOrder) => (o.status === 'draft' ? navigate(`/catalogue/orders/new?d_draft=${o.id}`) : drawer.open('stock-order', { id: o.id }))

  const exportTable = () => ({
    headers: [t('catalog.inventory.orders.cols.number'), t('catalog.inventory.orders.cols.created'), t('catalog.inventory.orders.cols.expected'), t('catalog.inventory.orders.cols.supplier'), t('catalog.inventory.orders.cols.location'), t('catalog.inventory.orders.cols.total'), t('catalog.inventory.orders.cols.status')],
    rows: rows.map((o) => [o.number, fmtDate(parseISO(o.createdAt)), o.expectedAt ? fmtDate(parseISO(o.expectedAt)) : '', supplierName(o), locationName(o), orderTotal(o), t(`catalog.inventory.common.status.${o.status}`)]),
  })

  if (loading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )

  const columns: Column<StockOrder>[] = [
    { key: 'number', header: t('catalog.inventory.orders.cols.number'), sortValue: (o) => Number(o.number.replace(/\D/g, '')) || 0, cell: (o) => <span className="text-body-strong text-ink">{o.number}</span> },
    { key: 'created', header: t('catalog.inventory.orders.cols.created'), sortValue: (o) => o.createdAt, cell: (o) => fmtDate(parseISO(o.createdAt)) },
    { key: 'expected', header: t('catalog.inventory.orders.cols.expected'), sortValue: (o) => o.expectedAt ?? '', cell: (o) => (o.expectedAt ? fmtDate(parseISO(o.expectedAt)) : '-') },
    {
      key: 'from',
      header: t('catalog.inventory.orders.cols.from'),
      sortValue: (o) => supplierName(o).toLowerCase(),
      cell: (o) => (
        <div>
          <p className="text-body text-ink">{supplierName(o)}</p>
          <p className="text-small text-muted">{locationName(o)}</p>
        </div>
      ),
    },
    { key: 'total', header: t('catalog.inventory.orders.cols.total'), align: 'right', sortValue: (o) => orderTotal(o), cell: (o) => money(orderTotal(o)) },
    { key: 'status', header: t('catalog.inventory.orders.cols.status'), cell: (o) => <InventoryStatus status={o.status} /> },
    {
      key: 'actions',
      header: '',
      width: '56px',
      cell: (o) => (
        <Menu
          label={t('catalog.inventory.common.actions')}
          groups={[
            {
              items:
                o.status === 'draft'
                  ? [
                      { label: t('catalog.inventory.orders.continue'), onSelect: () => open(o) },
                      {
                        label: t('catalog.inventory.orders.deleteDraft'),
                        danger: true,
                        onSelect: async () => {
                          await deleteStockOrderDraft(o.id)
                          toast(t('catalog.inventory.orders.draftDeleted'))
                        },
                      },
                    ]
                  : [
                      { label: t('catalog.inventory.orders.view'), onSelect: () => open(o) },
                      ...(o.status === 'ordered' ? [{ label: t('catalog.inventory.orderDrawer.receive'), onSelect: () => navigate(`/catalogue/orders/${o.id}/receive`) }] : []),
                      { label: t('catalog.inventory.orderDrawer.pdf'), onSelect: () => void downloadOrderPdf(o, { products, suppliers, locations }, t) },
                    ],
            },
          ]}
        />
      ),
    },
  ]

  const statuses: StockOrder['status'][] = ['draft', 'ordered', 'received', 'cancelled']

  return (
    <Page>
      <PageHeader
        title={t('catalog.inventory.orders.title')}
        count={orders.filter((o) => o.status !== 'draft').length}
        subtitle={
          <>
            {t('catalog.inventory.orders.subtitle')} <LearnMore topic={t('catalog.inventory.orders.title')}>{t('catalog.inventory.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <>
            <Menu
              width={240}
              trigger={({ open: o, toggle }) => (
                <MenuButton open={o} toggle={toggle}>
                  {t('catalog.inventory.common.options')}
                </MenuButton>
              )}
              groups={[
                {
                  items: [
                    { label: t('catalog.inventory.orders.manageProducts'), onSelect: () => navigate('/catalogue/products') },
                    { label: t('catalog.inventory.orders.manageSuppliers'), onSelect: () => navigate('/catalogue/suppliers') },
                  ],
                },
                {
                  heading: t('catalog.inventory.orders.export'),
                  items: [
                    {
                      label: t('catalog.inventory.orders.csv'),
                      onSelect: () => {
                        exportCsv(exportedFileName(), [exportTable()])
                        toast(t('catalog.inventory.orders.exported'))
                      },
                    },
                    {
                      label: t('catalog.inventory.orders.excel'),
                      onSelect: async () => {
                        await exportXlsx(exportedFileName(), [exportTable()])
                        toast(t('catalog.inventory.orders.exported'))
                      },
                    },
                  ],
                },
              ]}
            />
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/catalogue/orders/new')}>
              {t('catalog.inventory.common.add')}
            </Button>
          </>
        }
      />
      {orders.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<PackagePlus size={26} />}
            title={t('catalog.inventory.orders.emptyTitle')}
            body={
              <button type="button" className="text-primary hover:underline" onClick={() => navigate('/catalogue/orders/new')}>
                {t('catalog.inventory.orders.emptyBody')}
              </button>
            }
          />
        </div>
      ) : (
        <>
          <ToolbarCard>
            <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.inventory.orders.search')} className="max-w-sm" />
            <FiltersButton
              count={status === 'all' ? 0 : 1}
              onClick={() => {
                setDraftStatus(status)
                setFiltersOpen(true)
              }}
            />
          </ToolbarCard>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            onRowClick={open}
            initialSort={{ key: 'created', dir: 'desc' }}
            empty={<EmptyState title={t('catalog.inventory.common.noResults')} body={t('catalog.inventory.common.noResultsBody')} />}
          />
        </>
      )}
      <SideDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('catalog.inventory.common.filters')}
        footer={
          <>
            <Button
              onClick={() => {
                setStatus('all')
                setFiltersOpen(false)
              }}
            >
              {t('catalog.inventory.common.clearAll')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setStatus(draftStatus)
                setFiltersOpen(false)
              }}
            >
              {t('catalog.inventory.common.apply')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-body-strong text-ink">{t('catalog.inventory.orders.cols.status')}</p>
        <RadioGroup<StatusFilter>
          value={draftStatus}
          onChange={setDraftStatus}
          options={[{ value: 'all', label: t('catalog.inventory.common.allStatuses') }, ...statuses.map((s) => ({ value: s, label: t(`catalog.inventory.common.status.${s}`) }))]}
        />
      </SideDrawer>
    </Page>
  )
}
