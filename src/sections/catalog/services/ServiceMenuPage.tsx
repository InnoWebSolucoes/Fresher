import clsx from 'clsx'
import { ArrowDownUp, BookOpen, ChevronDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Chip, EmptyState, Field, LearnMore, Menu, MenuButton, Modal, Page, PageHeader, SearchInput, Select, confirm, toast, usePageLoading, type MenuGroup } from '@/components/ui'
import { useDb } from '@/store/db'
import { durationLong } from '@/lib/time'
import { money } from '@/lib/format'
import { PALETTE } from '@/styles/palette'
import type { Bundle, ID, Service, ServiceCategory } from '@/types'
import { deleteBundle, deleteCategory, deleteService, setBundleArchived, setCategoryArchived, setServiceArchived } from '@/api/catalog'
import { useBundleOrder } from '../catalogExt'
import { bundleDuration, bundlePrice } from '../lib'
import { CardsSkeleton, CategoryModal, CountBadge, FiltersButton, PillButton, ToolbarCard } from '../ui'
import { QuickLinkModal, type QuickLinkTarget } from './QuickLinkModal'
import { exportServiceMenu, exportServiceMenuPdf } from './exportMenu'

type TriState = 'all' | 'yes' | 'no'
interface MenuFilters {
  type: 'all' | 'services' | 'bundles'
  teamMember: string
  online: TriState
  commissions: TriState
  resources: TriState
  employees: TriState
}
const NO_FILTERS: MenuFilters = { type: 'all', teamMember: '', online: 'all', commissions: 'all', resources: 'all', employees: 'all' }

type Item = { kind: 'service'; service: Service; order: number } | { kind: 'bundle'; bundle: Bundle; order: number }

const priceText = (priceType: Service['priceType'], price: number, free: string, from: string) => (priceType === 'free' ? free : priceType === 'from' ? `${from} ${money(price)}` : money(price))

export function ServiceMenuPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const [params, setParams] = useSearchParams()
  const categories = useDb((s) => s.serviceCategories)
  const services = useDb((s) => s.services)
  const bundles = useDb((s) => s.bundles)
  const teamMembers = useDb((s) => s.teamMembers)
  const settings = useDb((s) => s.settings)
  const bundleOrder = useBundleOrder()
  const [query, setQuery] = useState('')
  const [selectedCat, setSelectedCat] = useState<ID | 'all'>('all')
  const [filters, setFilters] = useState<MenuFilters>(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [categoryModal, setCategoryModal] = useState<{ category?: ServiceCategory } | null>(null)
  const [quickLink, setQuickLink] = useState<QuickLinkTarget | null>(null)

  const statusParam = params.get('services-status')
  const status: 'active' | 'archived' | 'all' = statusParam === 'Archived' ? 'archived' : statusParam === 'All' ? 'all' : 'active'
  const filterCount = (status !== 'active' ? 1 : 0) + Object.entries(filters).filter(([k, v]) => v !== NO_FILTERS[k as keyof MenuFilters]).length

  // Archived categories (and everything in them) only show under Status = Archived / All statuses.
  const sortedCats = useMemo(() => [...categories].filter((c) => status !== 'active' || !c.archived).sort((a, b) => a.order - b.order), [categories, status])

  const itemsByCat = useMemo(() => {
    const q = query.trim().toLowerCase()
    const archivedCat = new Set(categories.filter((c) => c.archived).map((c) => c.id))
    const statusOk = (archived: boolean, categoryId: ID) => {
      if (status === 'all') return true
      const off = archived || archivedCat.has(categoryId)
      return status === 'archived' ? off : !off
    }
    const tri = (f: TriState, v: boolean) => f === 'all' || (f === 'yes' ? v : !v)
    const map = new Map<ID, Item[]>()
    sortedCats.forEach((c) => map.set(c.id, []))
    if (filters.type !== 'bundles')
      services.forEach((s) => {
        if (!statusOk(s.archived, s.categoryId)) return
        if (q && !s.name.toLowerCase().includes(q) && !s.variants.some((v) => v.name.toLowerCase().includes(q))) return
        if (filters.teamMember && s.teamMemberIds !== 'all' && !s.teamMemberIds.includes(filters.teamMember)) return
        if (!tri(filters.online, s.onlineBooking) || !tri(filters.commissions, s.commissionEnabled) || !tri(filters.resources, s.resourceTypeIds.length > 0)) return
        if (!tri(filters.employees, s.teamMemberIds === 'all' || s.teamMemberIds.length > 0)) return
        map.get(s.categoryId)?.push({ kind: 'service', service: s, order: s.order })
      })
    if (filters.type !== 'services' && !filters.teamMember && filters.commissions === 'all' && filters.resources === 'all' && filters.employees === 'all')
      bundles.forEach((b) => {
        if (!statusOk(b.archived, b.categoryId)) return
        if (q && !b.name.toLowerCase().includes(q)) return
        if (!tri(filters.online, b.onlineBooking)) return
        map.get(b.categoryId)?.push({ kind: 'bundle', bundle: b, order: bundleOrder[b.id] ?? -1 })
      })
    map.forEach((list) => list.sort((a, b) => a.order - b.order))
    return map
  }, [query, status, filters, services, bundles, sortedCats, categories, bundleOrder])

  const narrowed = query.trim() !== '' || filterCount > 0
  const totalCount = [...itemsByCat.values()].reduce((s, l) => s + l.length, 0)
  const visibleCats = sortedCats.filter((c) => (selectedCat === 'all' || c.id === selectedCat) && (!narrowed || (itemsByCat.get(c.id)?.length ?? 0) > 0 || (c.archived && !query.trim())))

  const exportData = { services, bundles, serviceCategories: categories, settings }

  const doExport = async (kind: 'pdf' | 'xlsx' | 'csv') => {
    if (kind === 'pdf') await exportServiceMenuPdf(exportData)
    else await exportServiceMenu(kind, exportData)
    toast(t('catalog.toasts.downloaded'))
  }

  const setStatus = (next: typeof status) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next === 'active') p.delete('services-status')
      else p.set('services-status', next === 'archived' ? 'Archived' : 'All')
      return p
    })

  // ── Actions ──
  const archiveSvc = async (s: Service) => {
    if (!(await confirm({ title: t('catalog.menu.archiveTitle'), body: t('catalog.menu.archiveBody'), confirmLabel: t('catalog.common.archive') }))) return
    await setServiceArchived(s.id, true)
    toast(t('catalog.toasts.serviceArchived'))
  }
  const unarchiveSvc = async (s: Service) => {
    await setServiceArchived(s.id, false)
    toast(t('catalog.toasts.serviceUnarchived'))
  }
  const deleteSvc = async (s: Service) => {
    if (!(await confirm({ title: t('catalog.menu.deleteTitle'), body: t('catalog.menu.deleteBody'), confirmLabel: t('catalog.common.delete') }))) return
    await deleteService(s.id)
    toast(t('catalog.toasts.serviceDeleted'))
  }
  const archiveBun = async (b: Bundle, archived: boolean) => {
    if (archived && !(await confirm({ title: t('catalog.menu.archiveBundleTitle'), body: t('catalog.menu.archiveBundleBody'), confirmLabel: t('catalog.common.archive') }))) return
    await setBundleArchived(b.id, archived)
    toast(archived ? t('catalog.toasts.bundleArchived') : t('catalog.toasts.bundleUnarchived'))
  }
  const deleteBun = async (b: Bundle) => {
    if (!(await confirm({ title: t('catalog.menu.deleteBundleTitle'), body: t('catalog.menu.deleteBundleBody'), confirmLabel: t('catalog.common.delete') }))) return
    await deleteBundle(b.id)
    toast(t('catalog.toasts.bundleDeleted'))
  }
  const archiveCat = async (c: ServiceCategory, archived: boolean) => {
    if (archived && !(await confirm({ title: t('catalog.menu.archiveCategoryTitle'), body: t('catalog.menu.archiveCategoryBody', { name: c.name }), confirmLabel: t('catalog.common.archive') }))) return
    await setCategoryArchived(c.id, archived)
    if (archived && selectedCat === c.id && status === 'active') setSelectedCat('all')
    toast(archived ? t('catalog.toasts.categoryArchived') : t('catalog.toasts.categoryUnarchived'))
  }
  const deleteCat = async (c: ServiceCategory) => {
    const count = services.filter((s) => s.categoryId === c.id).length + bundles.filter((b) => b.categoryId === c.id).length
    if (!(await confirm({ title: t('catalog.menu.deleteCategoryTitle'), body: count ? t('catalog.menu.deleteCategoryBodyItems', { count }) : t('catalog.menu.deleteCategoryBody'), confirmLabel: t('catalog.common.delete') }))) return
    await deleteCategory(c.id)
    if (selectedCat === c.id) setSelectedCat('all')
    toast(t('catalog.toasts.categoryDeleted'))
  }

  if (loading) {
    return (
      <Page wide>
        <CardsSkeleton />
      </Page>
    )
  }

  return (
    <Page wide>
      <PageHeader
        title={t('catalog.menu.title')}
        subtitle={
          <>
            {t('catalog.menu.subtitle')} <LearnMore topic="Service menu">{t('catalog.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <>
            <Menu
              width={260}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('catalog.common.options')}
                </MenuButton>
              )}
              groups={[
                {
                  items: [
                    { label: t('catalog.menu.quickLink'), onSelect: () => setQuickLink({ kind: 'menu' }) },
                    { label: t('catalog.menu.setMenuOrder'), onSelect: () => navigate('/catalogue/services/menu-order') },
                    { label: t('catalog.menu.setBookingSequence'), onSelect: () => navigate('/catalogue/services/booking-sequence') },
                    { label: t('catalog.menu.bulkEdit'), onSelect: () => navigate('/catalogue/services/bulk-edit') },
                    { label: t('catalog.menu.settings'), onSelect: () => navigate('/setup/scheduling/booking-options') },
                  ],
                },
                {
                  heading: t('catalog.common.downloads'),
                  items: [
                    { label: t('catalog.common.downloadPdf'), onSelect: () => void doExport('pdf') },
                    { label: t('catalog.common.downloadExcel'), onSelect: () => void doExport('xlsx') },
                    { label: t('catalog.common.downloadCsv'), onSelect: () => void doExport('csv') },
                  ],
                },
              ]}
            />
            <Menu
              width={220}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle} primary>
                  {t('catalog.common.add')}
                </MenuButton>
              )}
              groups={[
                {
                  items: [
                    { label: t('catalog.menu.addService'), onSelect: () => navigate(`/catalogue/services/service/add/new${selectedCat !== 'all' ? `?category=${selectedCat}` : ''}`) },
                    { label: t('catalog.menu.addBundle'), onSelect: () => navigate(`/catalogue/services/package/add/new${selectedCat !== 'all' ? `?category=${selectedCat}` : ''}`) },
                    { label: t('catalog.menu.addCategory'), onSelect: () => setCategoryModal({}) },
                  ],
                },
              ]}
            />
          </>
        }
      />

      <ToolbarCard>
        <SearchInput value={query} onChange={setQuery} placeholder={t('catalog.menu.search')} className="max-w-[280px]" />
        <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} />
        <div className="ml-auto">
          <PillButton icon={<ArrowDownUp size={16} aria-hidden />} onClick={() => navigate('/catalogue/services/menu-order')}>
            {t('catalog.menu.manageOrder')}
          </PillButton>
        </div>
      </ToolbarCard>

      {status !== 'active' && (
        <div className="mb-4 flex items-center gap-2">
          <Chip tone="primary">{status === 'archived' ? t('catalog.menu.showingArchived') : t('catalog.menu.showingAll')}</Chip>
          <Button variant="link" onClick={() => setStatus('active')}>
            {t('catalog.common.clearFilters')}
          </Button>
        </div>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="card p-5 lg:sticky lg:top-6">
          <h2 className="mb-3 px-3 font-display text-title-3 text-ink">{t('catalog.menu.categories')}</h2>
          <button type="button" onClick={() => setSelectedCat('all')} className={clsx('flex h-11 w-full items-center justify-between rounded-md px-3 text-left text-body', selectedCat === 'all' ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}>
            {t('catalog.menu.allCategories')}
            <CountBadge value={totalCount} />
          </button>
          {sortedCats
            .filter((c) => status !== 'archived' || c.archived || (itemsByCat.get(c.id)?.length ?? 0) > 0)
            .map((c) => (
            <button key={c.id} type="button" onClick={() => setSelectedCat(c.id)} className={clsx('flex h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-body', selectedCat === c.id ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken', c.archived && 'text-muted')}>
              <span className="truncate">{c.name}</span>
              <CountBadge value={itemsByCat.get(c.id)?.length ?? 0} />
            </button>
          ))}
          <button type="button" onClick={() => setCategoryModal({})} className="mt-2 px-3 py-2 text-body-strong text-primary hover:underline">
            {t('catalog.menu.addCategory')}
          </button>
        </aside>

        <div className="flex min-w-0 flex-col gap-8">
          {visibleCats.length === 0 && (
            <div className="card">
              <EmptyState
                icon={<BookOpen size={26} />}
                title={narrowed ? t('catalog.menu.noResultsTitle') : t('catalog.menu.emptyTitle')}
                body={narrowed ? t('catalog.menu.noResultsBody') : t('catalog.menu.emptyBody')}
                action={
                  narrowed ? (
                    <Button
                      onClick={() => {
                        setQuery('')
                        setFilters(NO_FILTERS)
                        setStatus('active')
                      }}
                    >
                      {t('catalog.common.clearFilters')}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => setCategoryModal({})}>
                      {t('catalog.menu.addCategory')}
                    </Button>
                  )
                }
              />
            </div>
          )}
          {visibleCats.map((c) => {
            const items = itemsByCat.get(c.id) ?? []
            return (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 id={`cat-${c.id}`} className="flex items-center gap-3 font-display text-title-2 text-ink">
                      {c.name}
                      {c.archived && <Chip>{t('catalog.common.archived')}</Chip>}
                    </h2>
                    {c.description && <p className="text-body text-muted">{c.description}</p>}
                  </div>
                  <Menu
                    width={220}
                    trigger={({ open, toggle }) => (
                      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
                        {t('catalog.common.actions')}
                        <ChevronDown size={16} aria-hidden />
                      </button>
                    )}
                    groups={
                      c.archived
                        ? [
                            { items: [{ label: t('catalog.common.edit'), onSelect: () => setCategoryModal({ category: c }) }] },
                            {
                              items: [
                                { label: t('catalog.common.unarchive'), onSelect: () => void archiveCat(c, false) },
                                { label: t('catalog.common.permanentlyDelete'), danger: true, onSelect: () => void deleteCat(c) },
                              ],
                            },
                          ]
                        : [
                            {
                              items: [
                                { label: t('catalog.common.edit'), onSelect: () => setCategoryModal({ category: c }) },
                                { label: t('catalog.menu.categoryAddService'), onSelect: () => navigate(`/catalogue/services/service/add/new?category=${c.id}`) },
                                { label: t('catalog.menu.categoryAddBundle'), onSelect: () => navigate(`/catalogue/services/package/add/new?category=${c.id}`) },
                              ],
                            },
                            {
                              items: [
                                { label: t('catalog.common.archive'), onSelect: () => void archiveCat(c, true) },
                                { label: t('catalog.common.permanentlyDelete'), danger: true, onSelect: () => void deleteCat(c) },
                              ],
                            },
                          ]
                    }
                  />
                </div>
                {items.length === 0 ? (
                  <div className="card flex flex-col items-center gap-2 px-6 py-8 text-center">
                    <p className="text-body text-muted">{c.archived ? t('catalog.menu.archivedCategoryEmpty') : t('catalog.menu.emptyCategory')}</p>
                    {c.archived ? (
                      <Button size="sm" onClick={() => void archiveCat(c, false)}>
                        {t('catalog.common.unarchive')}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => navigate(`/catalogue/services/service/add/new?category=${c.id}`)}>
                        {t('catalog.menu.categoryAddService')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {items.map((item) =>
                      item.kind === 'service' ? (
                        <ServiceCard
                          key={item.service.id}
                          service={item.service}
                          color={PALETTE[c.color]?.edge}
                          onOpen={() => navigate(`/catalogue/services/service/edit/${item.service.id}`)}
                          menu={
                            item.service.archived
                              ? [
                                  { items: [{ label: t('catalog.common.unarchive'), onSelect: () => void unarchiveSvc(item.service) }] },
                                  { items: [{ label: t('catalog.common.permanentlyDelete'), danger: true, onSelect: () => void deleteSvc(item.service) }] },
                                ]
                              : [
                                  {
                                    items: [
                                      { label: t('catalog.common.edit'), onSelect: () => navigate(`/catalogue/services/service/edit/${item.service.id}`) },
                                      { label: t('catalog.common.duplicate'), onSelect: () => navigate(`/catalogue/services/service/add/new?duplicate=${item.service.id}`) },
                                      { label: t('catalog.menu.quickLink'), onSelect: () => setQuickLink({ kind: 'service', id: item.service.id, name: item.service.name }) },
                                    ],
                                  },
                                  {
                                    items: [
                                      { label: t('catalog.common.archive'), onSelect: () => void archiveSvc(item.service) },
                                      { label: t('catalog.common.permanentlyDelete'), danger: true, onSelect: () => void deleteSvc(item.service) },
                                    ],
                                  },
                                ]
                          }
                        />
                      ) : (
                        <BundleCard
                          key={item.bundle.id}
                          bundle={item.bundle}
                          color={PALETTE[c.color]?.edge}
                          duration={bundleDuration(item.bundle, services)}
                          price={bundlePrice(item.bundle, services)}
                          onOpen={() => navigate(`/catalogue/services/package/edit/${item.bundle.id}`)}
                          menu={
                            item.bundle.archived
                              ? [
                                  { items: [{ label: t('catalog.common.unarchive'), onSelect: () => void archiveBun(item.bundle, false) }] },
                                  { items: [{ label: t('catalog.common.permanentlyDelete'), danger: true, onSelect: () => void deleteBun(item.bundle) }] },
                                ]
                              : [
                                  {
                                    items: [
                                      { label: t('catalog.common.edit'), onSelect: () => navigate(`/catalogue/services/package/edit/${item.bundle.id}`) },
                                      { label: t('catalog.common.duplicate'), onSelect: () => navigate(`/catalogue/services/package/add/new?duplicate=${item.bundle.id}`) },
                                      { label: t('catalog.menu.quickLink'), onSelect: () => setQuickLink({ kind: 'bundle', id: item.bundle.id, name: item.bundle.name }) },
                                    ],
                                  },
                                  {
                                    items: [
                                      { label: t('catalog.common.archive'), onSelect: () => void archiveBun(item.bundle, true) },
                                      { label: t('catalog.common.permanentlyDelete'), danger: true, onSelect: () => void deleteBun(item.bundle) },
                                    ],
                                  },
                                ]
                          }
                        />
                      ),
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <MenuFiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        status={status}
        filters={filters}
        teamMembers={teamMembers.filter((m) => !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
        onApply={(nextStatus, next) => {
          setStatus(nextStatus)
          setFilters(next)
          setFiltersOpen(false)
        }}
      />
      <CategoryModal open={Boolean(categoryModal)} category={categoryModal?.category} onClose={() => setCategoryModal(null)} />
      <QuickLinkModal target={quickLink} onClose={() => setQuickLink(null)} />
    </Page>
  )
}

type MenuGroups = MenuGroup[]

function CardShell({ color, archived, onOpen, menu, children }: { color?: string; archived: boolean; onOpen: () => void; menu: MenuGroups; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
      className={clsx('group flex cursor-pointer overflow-hidden rounded-lg border border-line bg-surface transition-shadow hover:shadow-sm', archived && 'opacity-80')}
    >
      <span className="w-1.5 shrink-0" style={{ background: color }} aria-hidden />
      <div className="flex min-w-0 flex-1 items-start gap-3 px-6 py-4">
        <div className="min-w-0 flex-1">{children}</div>
        {archived && <Chip>{t('catalog.common.archived')}</Chip>}
        <Menu label={t('catalog.common.more')} width={220} groups={menu} />
      </div>
    </article>
  )
}

function ServiceCard({ service, color, onOpen, menu }: { service: Service; color?: string; onOpen: () => void; menu: MenuGroups }) {
  const { t } = useTranslation()
  const free = t('catalog.priceTypes.free')
  const from = t('catalog.common.from')
  if (service.variants.length) {
    return (
      <CardShell color={color} archived={service.archived} onOpen={onOpen} menu={menu}>
        <p className="text-body-lg font-semibold text-ink">{service.name}</p>
        <div className="mt-3 flex flex-col gap-1.5 text-body text-muted">
          {[{ id: 'base', name: service.name, durationMin: service.durationMin, price: service.price, priceType: service.priceType }, ...service.variants].map((v) => (
            <div key={v.id} className="grid grid-cols-[1fr_1fr_auto] gap-4">
              <span className="truncate">{v.name}</span>
              <span>{durationLong(v.durationMin)}</span>
              <span className="text-right text-ink">{priceText(v.priceType, v.price, free, from)}</span>
            </div>
          ))}
        </div>
      </CardShell>
    )
  }
  return (
    <CardShell color={color} archived={service.archived} onOpen={onOpen} menu={menu}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body-lg font-semibold text-ink">{service.name}</p>
          <p className="text-body text-muted">{durationLong(service.durationMin)}</p>
          {service.description && <p className="mt-1 line-clamp-1 text-body text-muted">{service.description}</p>}
        </div>
        <span className="shrink-0 pt-2 text-body-lg text-ink">{priceText(service.priceType, service.price, free, from)}</span>
      </div>
    </CardShell>
  )
}

function BundleCard({ bundle, color, duration, price, onOpen, menu }: { bundle: Bundle; color?: string; duration: number; price: number; onOpen: () => void; menu: MenuGroups }) {
  const { t } = useTranslation()
  return (
    <CardShell color={color} archived={bundle.archived} onOpen={onOpen} menu={menu}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body-lg font-semibold text-ink">{bundle.name}</p>
          <p className="text-body text-muted">
            {durationLong(duration)} • {t('catalog.menu.servicesCount', { count: bundle.serviceIds.length })}
          </p>
        </div>
        <span className="shrink-0 pt-2 text-body-lg text-ink">{price === 0 ? t('catalog.priceTypes.free') : money(price)}</span>
      </div>
    </CardShell>
  )
}

function MenuFiltersModal({ open, onClose, status, filters, teamMembers, onApply }: { open: boolean; onClose: () => void; status: 'active' | 'archived' | 'all'; filters: MenuFilters; teamMembers: { value: string; label: string }[]; onApply: (status: 'active' | 'archived' | 'all', f: MenuFilters) => void }) {
  const { t } = useTranslation()
  const [draftStatus, setDraftStatus] = useState(status)
  const [draft, setDraft] = useState(filters)
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setDraftStatus(status)
      setDraft(filters)
    }
  }
  const tri = (key: 'online' | 'commissions' | 'resources' | 'employees', yes: string, no: string) => (
    <Field label={t(`catalog.menuFilters.${key}`)}>
      {(id) => <Select id={id} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value as TriState })} options={[{ value: 'all', label: t('catalog.menuFilters.allStatus') }, { value: 'yes', label: yes }, { value: 'no', label: no }]} />}
    </Field>
  )
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('catalog.common.filters')}
      footer={
        <>
          <Button
            onClick={() => {
              setDraftStatus('active')
              setDraft(NO_FILTERS)
            }}
          >
            {t('catalog.common.clearFilters')}
          </Button>
          <Button variant="primary" onClick={() => onApply(draftStatus, draft)}>
            {t('catalog.common.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t('catalog.menuFilters.status')}>
          {(id) => (
            <Select
              id={id}
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value as typeof status)}
              options={[
                { value: 'all', label: t('catalog.menuFilters.allStatuses') },
                { value: 'active', label: t('catalog.common.active') },
                { value: 'archived', label: t('catalog.common.archived') },
              ]}
            />
          )}
        </Field>
        <Field label={t('catalog.menuFilters.type')}>
          {(id) => (
            <Select
              id={id}
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as MenuFilters['type'] })}
              options={[
                { value: 'all', label: t('catalog.menuFilters.allTypes') },
                { value: 'services', label: t('catalog.menuFilters.services') },
                { value: 'bundles', label: t('catalog.menuFilters.bundles') },
              ]}
            />
          )}
        </Field>
        <Field label={t('catalog.menuFilters.teamMember')}>{(id) => <Select id={id} value={draft.teamMember} onChange={(e) => setDraft({ ...draft, teamMember: e.target.value })} placeholder={t('catalog.menuFilters.anyTeamMember')} options={teamMembers} />}</Field>
        {tri('online', t('catalog.common.enabled'), t('catalog.common.disabled'))}
        {tri('commissions', t('catalog.common.enabled'), t('catalog.common.disabled'))}
        {tri('resources', t('catalog.common.required'), t('catalog.common.notRequired'))}
        {tri('employees', t('catalog.common.required'), t('catalog.common.notRequired'))}
      </div>
    </Modal>
  )
}
