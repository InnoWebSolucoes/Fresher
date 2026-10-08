import clsx from 'clsx'
import { ArrowDownUp, CalendarCheck, ChevronDown, GripVertical, Layers, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Chip, DataTable, EmptyState, IntroPage, LearnMore, Menu, Modal, Page, PageHeader, PillTabs, SearchInput, SideDrawer, TextInput, Toolbar, confirm, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fmtDate, money } from '@/lib/format'
import type { ClientPackage, ID, PackageDef } from '@/types'
import { deletePackage, savePackageOrder, setPackageArchived } from '@/api/catalog'
import { themeOf } from '../lib'
import { CardsSkeleton, CategoryModal, CountBadge, FiltersButton, PillButton, SortButton, ToolbarCard, useIntroProps } from '../ui'

type Tri = 'all' | 'yes' | 'no'
interface PackageFilters {
  status: 'active' | 'archived' | 'all'
  online: Tri
  gift: Tri
  commission: Tri
  minPrice: number | ''
  maxPrice: number | ''
}
const NO_FILTERS: PackageFilters = { status: 'active', online: 'all', gift: 'all', commission: 'all', minPrice: '', maxPrice: '' }

export function PackageSwatch({ theme, size = 56 }: { theme: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-md text-white" style={{ width: size, height: size, background: themeOf(theme).gradient }}>
      <Layers size={Math.round(size * 0.45)} aria-hidden />
    </span>
  )
}

function PackagesArt() {
  const { t } = useTranslation()
  return (
    <div className="relative mx-auto max-w-sm py-8">
      <div className="rounded-xl p-6 text-white shadow-lg" style={{ background: themeOf('Purple Veil').gradient }}>
        <p className="font-display text-title-2">{t('catalog.packages.artName')}</p>
        <p className="text-body-strong opacity-90">{t('catalog.packages.artSessions')}</p>
        <p className="mt-10 text-right font-display text-title-1">€120</p>
        <p className="text-right text-body-strong opacity-90">{t('catalog.packages.artSave')}</p>
      </div>
      {[t('catalog.packages.artItem1'), t('catalog.packages.artItem2')].map((label, i) => (
        <div key={label} className="mx-6 flex items-center gap-3 rounded-b-lg border border-t-0 border-line bg-surface px-5 py-3 shadow-sm" style={{ marginLeft: 24 + i * 16, marginRight: 24 + i * 16 }}>
          <CalendarCheck size={20} className="text-primary" aria-hidden />
          <span className="text-body text-ink">{label}</span>
        </div>
      ))}
    </div>
  )
}

/** Packages list with Packages / Holders tabs (catalog.md §2). */
export function PackagesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const intro = useIntroProps('Packages')
  const packages = useDb((s) => s.packages)
  const categories = useDb((s) => s.serviceCategories)
  const clientPackages = useDb((s) => s.clientPackages)
  const clients = useDb((s) => s.clients)
  const [tab, setTab] = useState<'packages' | 'holders'>('packages')
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<ID | 'all' | 'none'>('all')
  const [filters, setFilters] = useState<PackageFilters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [createdCats, setCreatedCats] = useState<ID[]>([])

  const tri = (f: Tri, v: boolean) => f === 'all' || (f === 'yes' ? v : !v)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...packages]
      .sort((a, b) => a.order - b.order)
      .filter(
        (p) =>
          (filters.status === 'all' || (filters.status === 'archived' ? p.archived : !p.archived)) &&
          (!q || p.name.toLowerCase().includes(q)) &&
          tri(filters.online, p.onlineSale) &&
          tri(filters.gift, p.giftable) &&
          tri(filters.commission, p.commission) &&
          (filters.minPrice === '' || p.price >= filters.minPrice) &&
          (filters.maxPrice === '' || p.price <= filters.maxPrice),
      )
  }, [packages, query, filters])
  const inCat = (p: PackageDef) => cat === 'all' || (cat === 'none' ? !p.categoryId : p.categoryId === cat)
  const shown = filtered.filter(inCat)
  const usedCats = categories.filter((c) => packages.some((p) => p.categoryId === c.id) || createdCats.includes(c.id)).sort((a, b) => a.order - b.order)
  const filterCount = Object.entries(filters).filter(([k, v]) => v !== NO_FILTERS[k as keyof PackageFilters]).length

  const archive = async (p: PackageDef, archived: boolean) => {
    if (archived && !(await confirm({ title: t('catalog.packages.archiveTitle'), body: t('catalog.packages.archiveBody'), confirmLabel: t('catalog.common.archive') }))) return
    await setPackageArchived(p.id, archived)
    toast(archived ? t('catalog.toasts.packageArchived') : t('catalog.toasts.packageUnarchived'))
  }
  const remove = async (p: PackageDef) => {
    if (!(await confirm({ title: t('catalog.packages.deleteTitle'), body: t('catalog.packages.deleteBody'), confirmLabel: t('catalog.common.delete') }))) return
    await deletePackage(p.id)
    toast(t('catalog.toasts.packageDeleted'))
  }

  if (loading) {
    return (
      <Page wide>
        <CardsSkeleton />
      </Page>
    )
  }

  if (packages.length === 0) {
    return (
      <Page wide>
        <IntroPage
          {...intro}
          title={t('catalog.packages.introTitle')}
          body={t('catalog.packages.introBody')}
          bullets={[t('catalog.packages.introB1'), t('catalog.packages.introB2'), t('catalog.packages.introB3')]}
          primary={{ label: t('catalog.common.startNow'), onClick: () => navigate('/catalogue/packages/add') }}
          art={<PackagesArt />}
        />
      </Page>
    )
  }

  return (
    <Page wide>
      <PageHeader
        title={t('catalog.packages.title')}
        subtitle={
          <>
            {t('catalog.packages.subtitle')} <LearnMore topic="Packages">{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Button variant="primary" onClick={() => navigate('/catalogue/packages/add')}>
            {t('catalog.common.add')}
          </Button>
        }
      />
      <PillTabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'packages', label: t('catalog.packages.tabPackages') },
          { value: 'holders', label: t('catalog.packages.tabHolders') },
        ]}
      />

      {tab === 'packages' ? (
        <>
          <ToolbarCard>
            <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.common.search')} className="max-w-[300px]" />
            <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} />
            <div className="ml-auto">
              <PillButton icon={<ArrowDownUp size={16} aria-hidden />} onClick={() => setOrderOpen(true)}>
                {t('catalog.menu.manageOrder')}
              </PillButton>
            </div>
          </ToolbarCard>
          <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]">
            <aside className="card p-5">
              <h2 className="mb-3 px-3 font-display text-title-3 text-ink">{t('catalog.menu.categories')}</h2>
              {[
                { id: 'all' as const, name: t('catalog.menu.allCategories'), count: filtered.length },
                { id: 'none' as const, name: t('catalog.packages.uncategorized'), count: filtered.filter((p) => !p.categoryId).length },
                ...usedCats.map((c) => ({ id: c.id, name: c.name, count: filtered.filter((p) => p.categoryId === c.id).length })),
              ].map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} className={clsx('flex h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-body', cat === c.id ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}>
                  <span className="truncate">{c.name}</span>
                  <CountBadge value={c.count} />
                </button>
              ))}
              <button type="button" onClick={() => setCategoryOpen(true)} className="mt-2 px-3 py-2 text-body-strong text-primary hover:underline">
                {t('catalog.menu.addCategory')}
              </button>
            </aside>
            <div className="flex min-w-0 flex-col gap-3">
              {shown.length === 0 && (
                <div className="card">
                  <EmptyState
                    icon={<Layers size={26} />}
                    title={t('catalog.packages.noResultsTitle')}
                    body={t('catalog.packages.noResultsBody')}
                    action={
                      <Button
                        onClick={() => {
                          setQuery('')
                          setFilters(NO_FILTERS)
                          setCat('all')
                        }}
                      >
                        {t('catalog.common.clearFilters')}
                      </Button>
                    }
                  />
                </div>
              )}
              {shown.map((p) => (
                <article
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/catalogue/packages/edit/${p.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/catalogue/packages/edit/${p.id}`)}
                  className="flex cursor-pointer items-center gap-4 rounded-lg border border-line bg-surface px-6 py-5 hover:shadow-sm"
                >
                  <PackageSwatch theme={p.theme} />
                  <div className="min-w-0 flex-1">
                    <p className="text-body-lg font-semibold text-ink">{p.name}</p>
                    <p className="text-body text-muted">{t('catalog.packages.benefits', { count: p.benefits.length })}</p>
                  </div>
                  {p.archived && <Chip>{t('catalog.common.archived')}</Chip>}
                  <span className="text-body-lg text-ink">{money(p.price)}</span>
                  <Menu
                    label={t('catalog.common.more')}
                    groups={[
                      {
                        items: [
                          { label: t('catalog.packages.sell'), disabled: p.archived, onSelect: () => drawer.open('checkout', { d_add: `package:${p.id}` }) },
                          { label: t('catalog.common.edit'), onSelect: () => navigate(`/catalogue/packages/edit/${p.id}`) },
                          { label: t('catalog.common.duplicate'), onSelect: () => navigate(`/catalogue/packages/add?duplicate=${p.id}`) },
                          { label: t('catalog.packages.viewReport'), onSelect: () => navigate('/reports/table/packages-list') },
                        ],
                      },
                      {
                        items: [
                          p.archived ? { label: t('catalog.common.unarchive'), onSelect: () => void archive(p, false) } : { label: t('catalog.common.archive'), onSelect: () => void archive(p, true) },
                          { label: t('catalog.common.delete'), danger: true, onSelect: () => void remove(p) },
                        ],
                      },
                    ]}
                  />
                </article>
              ))}
            </div>
          </div>
        </>
      ) : (
        <HoldersTab holders={clientPackages} packages={packages} clientName={(id) => {
          const c = clients.find((x) => x.id === id)
          return c ? `${c.firstName} ${c.lastName}` : '-'
        }} onOpenClient={(id) => drawer.open('client', { id })} />
      )}

      <PackageFiltersDrawer open={filtersOpen} filters={filters} onClose={() => setFiltersOpen(false)} onApply={(f) => { setFilters(f); setFiltersOpen(false) }} />
      <ManageOrderModal open={orderOpen} onClose={() => setOrderOpen(false)} packages={[...packages].sort((a, b) => a.order - b.order)} />
      <CategoryModal open={categoryOpen} onClose={() => setCategoryOpen(false)} onSaved={(c) => setCreatedCats((x) => [...x, c.id])} />
    </Page>
  )
}

function HoldersTab({ holders, packages, clientName, onOpenClient }: { holders: ClientPackage[]; packages: PackageDef[]; clientName: (id: ID) => string; onOpenClient: (id: ID) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'start_desc' | 'start_asc' | 'expiry_asc' | 'expiry_desc'>('start_desc')
  const [status, setStatus] = useState<'all' | ClientPackage['status']>('all')
  const q = query.trim().toLowerCase()
  const pkgName = (id: ID) => packages.find((p) => p.id === id)?.name ?? t('catalog.packages.deletedPackage')
  const rows = holders
    .filter((h) => (status === 'all' || h.status === status) && (!q || clientName(h.clientId).toLowerCase().includes(q) || pkgName(h.packageId).toLowerCase().includes(q)))
    .sort((a, b) => {
      switch (sort) {
        case 'start_asc':
          return a.startDate.localeCompare(b.startDate)
        case 'expiry_asc':
          return a.expiresAt.localeCompare(b.expiresAt)
        case 'expiry_desc':
          return b.expiresAt.localeCompare(a.expiresAt)
        default:
          return b.startDate.localeCompare(a.startDate)
      }
    })
  const tone = (s: ClientPackage['status']) => (s === 'active' ? 'success' : s === 'pending' ? 'warning' : s === 'canceled' ? 'danger' : 'neutral')
  const columns: Column<ClientPackage>[] = [
    { key: 'holder', header: t('catalog.packages.colHolder'), cell: (h) => <span className="text-body-strong text-primary">{clientName(h.clientId)}</span> },
    { key: 'package', header: t('catalog.packages.colPackage'), cell: (h) => pkgName(h.packageId) },
    { key: 'type', header: t('catalog.packages.colType'), cell: () => t('catalog.packages.typeServices') },
    { key: 'start', header: t('catalog.packages.colStart'), cell: (h) => fmtDate(h.startDate) },
    { key: 'expiry', header: t('catalog.packages.colExpiry'), cell: (h) => fmtDate(h.expiresAt) },
    { key: 'price', header: t('catalog.packages.colPrice'), align: 'right', cell: (h) => money(h.price) },
    { key: 'status', header: t('catalog.packages.colStatus'), cell: (h) => <Chip tone={tone(h.status)}>{t(`catalog.packages.status.${h.status}`)}</Chip> },
  ]
  return (
    <>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.common.search')} className="max-w-[300px]" />
        <Menu
          align="left"
          trigger={({ open, toggle }) => (
            <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
              {status === 'all' ? t('catalog.packages.allStatuses') : t(`catalog.packages.status.${status}`)}
              <ChevronDown size={16} aria-hidden />
            </button>
          )}
          groups={[{ items: (['all', 'active', 'pending', 'used', 'expired', 'canceled'] as const).map((s) => ({ label: s === 'all' ? t('catalog.packages.allStatuses') : t(`catalog.packages.status.${s}`), checked: status === s, onSelect: () => setStatus(s) })) }]}
        />
        <div className="ml-auto">
          <SortButton
            value={sort}
            onChange={setSort}
            options={[
              { value: 'start_desc', label: t('catalog.packages.sortStartDesc') },
              { value: 'start_asc', label: t('catalog.packages.sortStartAsc') },
              { value: 'expiry_asc', label: t('catalog.packages.sortExpiryAsc') },
              { value: 'expiry_desc', label: t('catalog.packages.sortExpiryDesc') },
            ]}
          />
        </div>
      </Toolbar>
      <DataTable columns={columns} rows={rows} rowKey={(h) => h.id} onRowClick={(h) => onOpenClient(h.clientId)} empty={<EmptyState icon={<Users size={26} />} title={t('catalog.packages.noHoldersTitle')} body={t('catalog.packages.noHoldersBody')} />} />
    </>
  )
}

function PackageFiltersDrawer({ open, filters, onClose, onApply }: { open: boolean; filters: PackageFilters; onClose: () => void; onApply: (f: PackageFilters) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(filters)
  const [section, setSection] = useState<string | null>('status')
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setDraft(filters)
  }
  const triOptions = [
    { value: 'all', label: t('catalog.packages.any') },
    { value: 'yes', label: t('catalog.common.yes') },
    { value: 'no', label: t('catalog.common.no') },
  ]
  const group = (key: string, label: string, body: ReactNode) => (
    <div className="border-b border-line">
      <button type="button" aria-expanded={section === key} onClick={() => setSection(section === key ? null : key)} className="flex w-full items-center justify-between py-4 text-left text-body-lg text-ink">
        {label}
        <ChevronDown size={18} className={clsx('transition-transform', section === key && 'rotate-180')} aria-hidden />
      </button>
      {section === key && <div className="pb-4">{body}</div>}
    </div>
  )
  const radios = (value: string, options: { value: string; label: string }[], onChange: (v: string) => void) => (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-3 text-body text-ink">
          <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
          {o.label}
        </label>
      ))}
    </div>
  )
  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title={t('catalog.packages.allFilters')}
      footer={
        <>
          <Button onClick={() => setDraft(NO_FILTERS)}>{t('catalog.common.clearFilters')}</Button>
          <Button variant="primary" onClick={() => onApply(draft)}>
            {t('catalog.common.apply')}
          </Button>
        </>
      }
    >
      {group(
        'status',
        t('catalog.packages.fStatus'),
        radios(
          draft.status,
          [
            { value: 'active', label: t('catalog.common.active') },
            { value: 'archived', label: t('catalog.common.archived') },
            { value: 'all', label: t('catalog.menuFilters.allStatuses') },
          ],
          (v) => setDraft({ ...draft, status: v as PackageFilters['status'] }),
        ),
      )}
      {group('online', t('catalog.packages.fOnline'), radios(draft.online, triOptions, (v) => setDraft({ ...draft, online: v as Tri })))}
      {group('gift', t('catalog.packages.fGift'), radios(draft.gift, triOptions, (v) => setDraft({ ...draft, gift: v as Tri })))}
      {group('commission', t('catalog.packages.fCommission'), radios(draft.commission, triOptions, (v) => setDraft({ ...draft, commission: v as Tri })))}
      {group(
        'price',
        t('catalog.packages.fPrice'),
        <div className="grid grid-cols-2 gap-3">
          <TextInput type="number" min={0} prefix="€" placeholder={t('catalog.packages.min')} aria-label={t('catalog.packages.min')} value={draft.minPrice} onChange={(e) => setDraft({ ...draft, minPrice: e.target.value === '' ? '' : Number(e.target.value) })} />
          <TextInput type="number" min={0} prefix="€" placeholder={t('catalog.packages.max')} aria-label={t('catalog.packages.max')} value={draft.maxPrice} onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value === '' ? '' : Number(e.target.value) })} />
        </div>,
      )}
    </SideDrawer>
  )
}

function SortablePackage({ p }: { p: PackageDef }) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx('flex items-center gap-3 rounded-lg border border-line bg-surface p-3', isDragging && 'relative z-10 shadow-md')}>
      <button type="button" aria-label={t('catalog.order.dragItem', { name: p.name })} className="flex h-9 w-9 cursor-grab items-center justify-center text-muted" {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden />
      </button>
      <PackageSwatch theme={p.theme} size={36} />
      <span className="flex-1 text-body-lg text-ink">{p.name}</span>
      <span className="text-body text-muted">{money(p.price)}</span>
    </div>
  )
}

function ManageOrderModal({ open, onClose, packages }: { open: boolean; onClose: () => void; packages: PackageDef[] }) {
  const { t } = useTranslation()
  const [ids, setIds] = useState(packages.map((p) => p.id))
  const [lastOpen, setLastOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setIds(packages.map((p) => p.id))
  }
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setIds(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('catalog.menu.manageOrder')}
      subtitle={t('catalog.packages.orderSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('catalog.common.cancel')}</Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true)
              await savePackageOrder(ids)
              setSaving(false)
              toast(t('catalog.toasts.orderSaved'))
              onClose()
            }}
          >
            {t('catalog.common.save')}
          </Button>
        </>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 pb-2">
            {ids.map((id) => {
              const p = packages.find((x) => x.id === id)
              return p ? <SortablePackage key={id} p={p} /> : null
            })}
          </div>
        </SortableContext>
      </DndContext>
    </Modal>
  )
}
