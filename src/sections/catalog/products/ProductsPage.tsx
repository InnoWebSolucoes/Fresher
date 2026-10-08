import { Package, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, DataTable, EmptyState, IntroPage, LearnMore, Menu, MenuButton, Modal, Page, PageHeader, PageSkeleton, RadioGroup, SearchInput, Toolbar, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { useIsPhone } from '@/components/ui/responsive'
import { useDrawer } from '@/lib/drawer'
import { exportCsv, exportXlsx, exportedFileName, type ExportTable } from '@/lib/export'
import { money } from '@/lib/format'
import type { Product } from '@/types'
import { deleteProducts } from '@/api/catalog'
import { stockState } from '../lib'
import { FiltersButton, ProductThumb, SortButton, useIntroProps } from '../ui'
import { ImportProductsModal, ManageNamesModal } from './parts'

const P = 'catalog.products2'

const SORTS = ['nameAsc', 'nameDesc', 'createdAsc', 'createdDesc', 'updatedAsc', 'updatedDesc', 'qtyDesc', 'qtyAsc', 'categoryAsc', 'categoryDesc', 'supplierAsc', 'supplierDesc', 'priceAsc', 'priceDesc'] as const
type SortKey = (typeof SORTS)[number]
type StockFilter = 'all' | 'low' | 'out'
interface Filters {
  categories: string[]
  brands: string[]
  suppliers: string[]
  stock: StockFilter
}
const NO_FILTERS: Filters = { categories: [], brands: [], suppliers: [], stock: 'all' }
const NONE = '__none'

/** Product list (catalog.md §4). */
export function ProductsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const phone = useIsPhone()
  const loading = usePageLoading()
  const intro = useIntroProps(t('nav.products'))
  const products = useDb((s) => s.products)
  const brands = useDb((s) => s.brands)
  const categories = useDb((s) => s.productCategories)
  const suppliers = useDb((s) => s.suppliers)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('updatedDesc')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [manage, setManage] = useState<'brands' | 'categories' | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const nameOf = useMemo(() => {
    const map = new Map<string, string>()
    ;[...brands, ...categories, ...suppliers].forEach((x) => map.set(x.id, x.name))
    return (id: string | undefined) => (id ? (map.get(id) ?? '') : '')
  }, [brands, categories, suppliers])

  const active = useMemo(() => products.filter((p) => !p.archived), [products])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inList = (list: string[], id: string | undefined) => !list.length || list.includes(id ?? NONE)
    const rows = active.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q) || p.skus.some((s) => s.toLowerCase().includes(q))) &&
        inList(filters.categories, p.categoryId) &&
        inList(filters.brands, p.brandId) &&
        inList(filters.suppliers, p.supplierId) &&
        (filters.stock === 'all' || (filters.stock === 'out' ? stockState(p) === 'out' : stockState(p) === 'low')),
    )
    const str = (a: string, b: string) => a.localeCompare(b)
    const cmp: Record<SortKey, (a: Product, b: Product) => number> = {
      nameAsc: (a, b) => str(a.name, b.name),
      nameDesc: (a, b) => str(b.name, a.name),
      createdAsc: (a, b) => str(a.createdAt, b.createdAt),
      createdDesc: (a, b) => str(b.createdAt, a.createdAt),
      updatedAsc: (a, b) => str(a.updatedAt, b.updatedAt),
      updatedDesc: (a, b) => str(b.updatedAt, a.updatedAt),
      qtyDesc: (a, b) => b.stock - a.stock,
      qtyAsc: (a, b) => a.stock - b.stock,
      categoryAsc: (a, b) => str(nameOf(a.categoryId), nameOf(b.categoryId)),
      categoryDesc: (a, b) => str(nameOf(b.categoryId), nameOf(a.categoryId)),
      supplierAsc: (a, b) => str(nameOf(a.supplierId), nameOf(b.supplierId)),
      supplierDesc: (a, b) => str(nameOf(b.supplierId), nameOf(a.supplierId)),
      priceAsc: (a, b) => a.retailPrice - b.retailPrice,
      priceDesc: (a, b) => b.retailPrice - a.retailPrice,
    }
    return rows.sort(cmp[sort])
  }, [active, query, filters, sort, nameOf])

  const filterCount = filters.categories.length + filters.brands.length + filters.suppliers.length + (filters.stock !== 'all' ? 1 : 0)
  const visibleSelected = new Set([...selected].filter((id) => shown.some((p) => p.id === id)))

  const exportTable = (): ExportTable => ({
    headers: [t(`${P}.cols.name`), t(`${P}.export.barcode`), t(`${P}.export.brand`), t(`${P}.cols.category`), t(`${P}.cols.supplier`), t(`${P}.export.sku`), t(`${P}.export.measure`), t(`${P}.export.amount`), t(`${P}.form.supplyPrice`), t(`${P}.cols.retailPrice`), t(`${P}.cols.quantity`), t(`${P}.form.lowStockLevel`)],
    rows: shown.map((p) => [p.name, p.barcode ?? '', nameOf(p.brandId), nameOf(p.categoryId), nameOf(p.supplierId), p.skus[0] ?? '', p.measure, p.amount ?? '', p.supplyPrice, p.retailPrice, p.stock, p.lowStockLevel]),
  })
  const doExport = async (kind: 'csv' | 'xlsx') => {
    if (kind === 'csv') exportCsv(exportedFileName(), [exportTable()])
    else await exportXlsx(exportedFileName(), [exportTable()])
    toast(t('catalog.toasts.downloaded'))
  }
  const removeSelected = async () => {
    const ids = [...visibleSelected]
    const ok = await confirm({ title: t(`${P}.deleteManyTitle`, { count: ids.length }), body: t(`${P}.deleteManyBody`), confirmLabel: t('catalog.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteProducts(ids)
    setSelected(new Set())
    toast(t(`${P}.toasts.productsDeleted`, { count: ids.length }))
  }

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: t(`${P}.cols.name`),
      cell: (p) => (
        <div className="flex items-center gap-4">
          <ProductThumb product={p} size={56} />
          <div className="min-w-0">
            <p className="truncate text-body text-ink">{p.name}</p>
            {p.skus[0] && (
              <p className="text-small text-muted">
                {t(`${P}.cols.sku`)} {p.skus[0]}
              </p>
            )}
          </div>
        </div>
      ),
    },
    { key: 'category', header: t(`${P}.cols.category`), cell: (p) => <span className="text-ink">{nameOf(p.categoryId) || '-'}</span> },
    { key: 'supplier', header: t(`${P}.cols.supplier`), cell: (p) => <span className="text-ink">{nameOf(p.supplierId) || '-'}</span> },
    {
      key: 'qty',
      header: t(`${P}.cols.quantity`),
      cell: (p) => {
        if (!p.trackStock) return <span className="text-muted">-</span>
        const state = stockState(p)
        return (
          <span className="inline-flex items-center gap-2">
            <span className="tabular text-ink">{p.stock}</span>
            {state !== 'ok' && <span className={state === 'out' ? 'chip h-5 bg-danger-subtle text-caption text-danger' : 'chip h-5 bg-warning-subtle text-caption text-warning'}>{state === 'out' ? t(`${P}.filters.out`) : t(`${P}.filters.low`)}</span>}
          </span>
        )
      },
    },
    { key: 'price', header: t(`${P}.cols.retailPrice`), align: 'right', cell: (p) => (p.retailSales ? money(p.retailPrice) : '-') },
  ]
  // Phones: one column (thumbnail, name, SKU, stock and price) that fits the screen without sideways scrolling.
  const phoneColumns: Column<Product>[] = [
    {
      key: 'name',
      header: t(`${P}.cols.name`),
      cell: (p) => {
        const state = stockState(p)
        return (
          <div className="flex max-w-[calc(100vw-118px)] items-center gap-3 whitespace-normal">
            <ProductThumb product={p} size={48} />
            <div className="min-w-0">
              <p className="break-words text-body text-ink">{p.name}</p>
              {p.skus[0] && (
                <p className="text-small text-muted">
                  {t(`${P}.cols.sku`)} {p.skus[0]}
                </p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-muted">
                {p.trackStock ? <span className="tabular text-ink">{t(`${P}.inStock`, { count: p.stock })}</span> : <span>{t(`${P}.notTracked`)}</span>}
                {p.trackStock && state !== 'ok' && <span className={state === 'out' ? 'chip h-5 bg-danger-subtle text-caption text-danger' : 'chip h-5 bg-warning-subtle text-caption text-warning'}>{state === 'out' ? t(`${P}.filters.out`) : t(`${P}.filters.low`)}</span>}
                {p.retailSales && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular text-ink">{money(p.retailPrice)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        )
      },
    },
  ]

  if (loading) {
    return (
      <Page wide>
        <PageSkeleton />
      </Page>
    )
  }

  if (products.length === 0) {
    return (
      <Page wide>
        <IntroPage
          {...intro}
          title={t(`${P}.intro.title`)}
          body={t(`${P}.intro.body`)}
          bullets={[t(`${P}.intro.b1`), t(`${P}.intro.b2`), t(`${P}.intro.b3`), t(`${P}.intro.b4`)]}
          primary={{ label: t('catalog.common.startNow'), onClick: () => navigate('/catalogue/products/add') }}
          secondary={
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              {t(`${P}.importProducts`)}
            </Button>
          }
          art={
            <div className="mx-auto flex max-w-xs flex-col gap-3 py-8">
              {[t(`${P}.introArt.arganOil`), t(`${P}.introArt.repairShampoo`), t(`${P}.introArt.matteClay`)].map((n, i) => (
                <div key={n} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-sm">
                  <ProductThumb size={44} />
                  <span className="flex-1 text-body-strong text-ink">{n}</span>
                  <span className="text-body text-muted">{money(18 + i * 4)}</span>
                </div>
              ))}
            </div>
          }
        />
        <ImportProductsModal open={importOpen} onClose={() => setImportOpen(false)} />
      </Page>
    )
  }

  return (
    <Page wide>
      <PageHeader
        title={t(`${P}.title`)}
        count={active.length}
        subtitle={
          <>
            {t(`${P}.subtitle`)} <LearnMore topic={t('nav.products')}>{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <>
            <Menu
              width={240}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('catalog.common.options')}
                </MenuButton>
              )}
              groups={[
                {
                  items: [
                    { label: t(`${P}.manageBrands`), onSelect: () => setManage('brands') },
                    { label: t(`${P}.manageCategories`), onSelect: () => setManage('categories') },
                    { label: t(`${P}.importProducts`), onSelect: () => setImportOpen(true) },
                  ],
                },
                {
                  heading: t(`${P}.export.title`),
                  items: [
                    { label: t(`${P}.export.csv`), onSelect: () => void doExport('csv') },
                    { label: t(`${P}.export.excel`), onSelect: () => void doExport('xlsx') },
                  ],
                },
              ]}
            />
            <Button variant="primary" onClick={() => navigate('/catalogue/products/add')}>
              {t('catalog.common.add')}
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t(`${P}.search`)} className="w-full max-w-[300px] max-md:max-w-none max-md:basis-full" />
        <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} />
        {visibleSelected.size > 0 && (
          <div className="flex items-center gap-2 md:pl-2">
            <span className="text-body-strong text-ink">{t(`${P}.selected`, { count: visibleSelected.size })}</span>
            <Button size="sm" variant="ghost" icon={<Trash2 size={16} aria-hidden />} onClick={() => void removeSelected()}>
              {t('catalog.common.delete')}
            </Button>
          </div>
        )}
        <div className="ml-auto">
          <SortButton options={SORTS.map((s) => ({ value: s, label: t(`${P}.sort.${s}`) }))} value={sort} onChange={setSort} />
        </div>
      </Toolbar>
      <DataTable
        columns={phone ? phoneColumns : columns}
        rows={shown}
        rowKey={(p) => p.id}
        onRowClick={(p) => drawer.open('product', { id: p.id })}
        selectable={{ selected: visibleSelected, onChange: setSelected }}
        empty={
          <EmptyState
            icon={<Package size={26} />}
            title={t(`${P}.emptyTitle`)}
            body={t(`${P}.emptyBody`)}
            action={
              filterCount || query ? (
                <Button
                  onClick={() => {
                    setFilters(NO_FILTERS)
                    setQuery('')
                  }}
                >
                  {t('catalog.common.clearFilters')}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => navigate('/catalogue/products/add')}>
                  {t(`${P}.addProduct`)}
                </Button>
              )
            }
          />
        }
      />
      <ProductFiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} value={filters} onApply={setFilters} />
      <ManageNamesModal kind="brands" open={manage === 'brands'} onClose={() => setManage(null)} />
      <ManageNamesModal kind="categories" open={manage === 'categories'} onClose={() => setManage(null)} />
      <ImportProductsModal open={importOpen} onClose={() => setImportOpen(false)} />
    </Page>
  )
}

function ProductFiltersModal({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value: Filters; onApply: (f: Filters) => void }) {
  const { t } = useTranslation()
  const brands = useDb((s) => s.brands)
  const categories = useDb((s) => s.productCategories)
  const suppliers = useDb((s) => s.suppliers)
  const [draft, setDraft] = useState<Filters>(value)
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setDraft(value)
  }
  const toggle = (key: 'categories' | 'brands' | 'suppliers', id: string) => setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }))
  const group = (key: 'categories' | 'brands' | 'suppliers', list: { id: string; name: string }[], noneLabel: string) => (
    <fieldset>
      <legend className="mb-2 text-body-strong text-ink">{t(`${P}.filters.${key}`)}</legend>
      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1">
        {[{ id: NONE, name: noneLabel }, ...[...list].sort((a, b) => a.name.localeCompare(b.name))].map((x) => (
          <Checkbox key={x.id} label={x.name} checked={draft[key].includes(x.id)} onChange={() => toggle(key, x.id)} />
        ))}
      </div>
    </fieldset>
  )
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`${P}.filters.title`)}
      footer={
        <>
          <Button onClick={() => setDraft(NO_FILTERS)}>{t('catalog.common.clearFilters')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            {t('catalog.common.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        {group('categories', categories, t(`${P}.filters.noCategory`))}
        {group('brands', brands, t(`${P}.filters.noBrand`))}
        {group('suppliers', suppliers, t(`${P}.filters.noSupplier`))}
        <fieldset>
          <legend className="mb-2 text-body-strong text-ink">{t(`${P}.filters.stock`)}</legend>
          <RadioGroup<StockFilter>
            value={draft.stock}
            onChange={(stock) => setDraft((d) => ({ ...d, stock }))}
            options={[
              { value: 'all', label: t(`${P}.filters.all`) },
              { value: 'low', label: t(`${P}.filters.low`) },
              { value: 'out', label: t(`${P}.filters.out`) },
            ]}
          />
        </fieldset>
      </div>
    </Modal>
  )
}
