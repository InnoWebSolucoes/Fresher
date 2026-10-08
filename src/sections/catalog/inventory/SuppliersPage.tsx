import { Plus, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useNavigate } from 'react-router-dom'
import { parseISO } from 'date-fns'
import { Avatar, Button, DataTable, EmptyState, LearnMore, Menu, Page, PageHeader, PageSkeleton, SearchInput, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDateTimeUS } from '@/lib/format'
import type { Supplier } from '@/types'
import { deleteSupplier } from '@/api/catalog'
import { SortButton, ToolbarCard } from '../ui'
import { supplierPhone } from './shared'

type Sort = 'nameAsc' | 'nameDesc' | 'updatedDesc' | 'updatedAsc'

/** Delete with confirmation (list row menu, drawer, editor). */
export async function confirmDeleteSupplier(supplier: Supplier, t: TFunction): Promise<boolean> {
  const ok = await confirm({ title: t('catalog.inventory.suppliers.deleteTitle', { name: supplier.name }), body: t('catalog.inventory.suppliers.deleteBody'), confirmLabel: t('catalog.inventory.suppliers.delete'), tone: 'danger' })
  if (!ok) return false
  await deleteSupplier(supplier.id)
  toast(t('catalog.inventory.suppliers.deleted'))
  return true
}

/** Suppliers list (`/catalogue/suppliers`, catalog.md §7). */
export function SuppliersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const suppliers = useDb((s) => s.suppliers)
  const products = useDb((s) => s.products)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('nameAsc')

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    products.forEach((p) => {
      if (p.supplierId && !p.archived) map.set(p.supplierId, (map.get(p.supplierId) ?? 0) + 1)
    })
    return map
  }, [products])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return suppliers
      .filter((s) => !q || [s.name, s.email, s.mobile, s.telephone, s.firstName, s.lastName].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => {
        switch (sort) {
          case 'nameDesc':
            return b.name.localeCompare(a.name)
          case 'updatedDesc':
            return b.updatedAt.localeCompare(a.updatedAt)
          case 'updatedAsc':
            return a.updatedAt.localeCompare(b.updatedAt)
          default:
            return a.name.localeCompare(b.name)
        }
      })
  }, [suppliers, query, sort])

  if (loading)
    return (
      <Page>
        <PageSkeleton />
      </Page>
    )

  const columns: Column<Supplier>[] = [
    {
      key: 'name',
      header: t('catalog.inventory.suppliers.cols.name'),
      cell: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.name} size={40} />
          <span className="text-body-strong text-ink">{s.name}</span>
        </div>
      ),
    },
    { key: 'phone', header: t('catalog.inventory.suppliers.cols.phone'), cell: (s) => supplierPhone(s) || '-' },
    { key: 'email', header: t('catalog.inventory.suppliers.cols.email'), cell: (s) => s.email || '-' },
    { key: 'products', header: t('catalog.inventory.suppliers.cols.products'), align: 'right', cell: (s) => counts.get(s.id) ?? 0 },
    { key: 'updated', header: t('catalog.inventory.suppliers.cols.updated'), cell: (s) => fmtDateTimeUS(parseISO(s.updatedAt)) },
    {
      key: 'actions',
      header: '',
      width: '56px',
      cell: (s) => (
        <Menu
          label={t('catalog.inventory.common.actions')}
          groups={[
            {
              items: [
                { label: t('catalog.inventory.suppliers.edit'), onSelect: () => navigate(`/catalogue/suppliers/edit/${s.id}`) },
                { label: t('catalog.inventory.suppliers.createOrder'), onSelect: () => navigate(`/catalogue/orders/new?d_supplier=${s.id}`) },
              ],
            },
            { items: [{ label: t('catalog.inventory.suppliers.delete'), danger: true, onSelect: () => void confirmDeleteSupplier(s, t) }] },
          ]}
        />
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title={t('catalog.inventory.suppliers.title')}
        count={suppliers.length}
        subtitle={
          <>
            {t('catalog.inventory.suppliers.subtitle')} <LearnMore topic={t('catalog.inventory.suppliers.title')}>{t('catalog.inventory.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/catalogue/suppliers/add')}>
            {t('catalog.inventory.common.add')}
          </Button>
        }
      />
      {suppliers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Truck size={26} />}
            title={t('catalog.inventory.suppliers.emptyTitle')}
            body={t('catalog.inventory.suppliers.emptyBody')}
            action={
              <Button variant="primary" onClick={() => navigate('/catalogue/suppliers/add')}>
                {t('catalog.inventory.common.add')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <ToolbarCard>
            <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.inventory.suppliers.search')} className="max-w-md" />
            <div className="ml-auto">
              <SortButton value={sort} onChange={setSort} options={(['nameAsc', 'nameDesc', 'updatedDesc', 'updatedAsc'] as Sort[]).map((v) => ({ value: v, label: t(`catalog.inventory.suppliers.sort.${v}`) }))} />
            </div>
          </ToolbarCard>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            onRowClick={(s) => drawer.open('supplier', { id: s.id })}
            empty={<EmptyState title={t('catalog.inventory.common.noResults')} body={t('catalog.inventory.common.noResultsBody')} />}
          />
        </>
      )}
    </Page>
  )
}
