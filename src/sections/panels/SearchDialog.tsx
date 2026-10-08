import clsx from 'clsx'
import { format, parseISO } from 'date-fns'
import {
  ArrowUpRight,
  Box,
  CalendarDays,
  CircleHelp,
  Compass,
  Gift,
  MessageCircle,
  Package,
  PackageCheck,
  Scissors,
  Search,
  Settings,
  SlidersHorizontal,
  Tag,
  Truck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { DrawerProps } from '@/app/sectionRegistry'
import { PAGES } from '@/app/routeRegistry'
import { SETTINGS_CATEGORIES } from '@/app/navigation'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { useDrawer } from '@/lib/drawer'
import { canAccess, type SectionId } from '@/lib/permissions'
import { fullName, initialsOf, money } from '@/lib/format'
import { computeTotals } from '@/api/sales'
import { StatusChip } from '@/components/ui'
import type { AppointmentStatus, SaleStatus } from '@/types'
import { Highlight } from './shared'

export type SearchCategory = 'clients' | 'appointments' | 'sales' | 'team' | 'services' | 'products' | 'stockOrders' | 'giftCards' | 'packages' | 'clientPackages' | 'navigation' | 'actions' | 'settings'

const CATEGORIES: { key: SearchCategory; icon: LucideIcon; section: SectionId }[] = [
  { key: 'clients', icon: Users, section: 'clients' },
  { key: 'appointments', icon: CalendarDays, section: 'calendar' },
  { key: 'sales', icon: Tag, section: 'sales' },
  { key: 'team', icon: Users, section: 'team' },
  { key: 'services', icon: Scissors, section: 'catalog' },
  { key: 'products', icon: Box, section: 'catalog' },
  { key: 'stockOrders', icon: Truck, section: 'catalog' },
  { key: 'giftCards', icon: Gift, section: 'sales' },
  { key: 'packages', icon: Package, section: 'catalog' },
  { key: 'clientPackages', icon: PackageCheck, section: 'sales' },
  { key: 'navigation', icon: Compass, section: 'calendar' },
  { key: 'actions', icon: Zap, section: 'calendar' },
  { key: 'settings', icon: Settings, section: 'settings' },
]

interface Result {
  key: string
  category: SearchCategory
  title: string
  subtitle?: string
  avatar?: string
  status?: { kind: 'appointment'; value: AppointmentStatus } | { kind: 'text'; value: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
  run: () => void
}

type Opener = { open: (name: string, params?: Record<string, string>) => void; go: (to: string) => void }

interface ActionDef {
  key: string
  section: SectionId
  run: (o: Opener) => void
}

const ACTIONS: ActionDef[] = [
  { key: 'newAppointment', section: 'calendar', run: (o) => o.open('new-appointment') },
  { key: 'newGroupAppointment', section: 'calendar', run: (o) => o.go('/calendar/book-appointment-for-group/new') },
  { key: 'blockTime', section: 'calendar', run: (o) => o.go('/calendar/blocked-time') },
  { key: 'quickSale', section: 'sales', run: (o) => o.open('checkout') },
  { key: 'sellGiftCard', section: 'sales', run: (o) => o.open('checkout', { d_add: 'gift_card' }) },
  { key: 'addClient', section: 'clients', run: (o) => o.go('/clients/list/add') },
  { key: 'addService', section: 'catalog', run: (o) => o.go('/catalogue/services/service/add/new') },
  { key: 'addProduct', section: 'catalog', run: (o) => o.go('/catalogue/products/add') },
  { key: 'newStockOrder', section: 'catalog', run: (o) => o.go('/catalogue/orders/new') },
  { key: 'newStocktake', section: 'catalog', run: (o) => o.go('/catalogue/stocktakes/new') },
  { key: 'addSupplier', section: 'catalog', run: (o) => o.go('/catalogue/suppliers/add') },
  { key: 'addTeamMember', section: 'team', run: (o) => o.go('/team/team-members/add') },
  { key: 'runPayRun', section: 'team', run: (o) => o.go('/team/payrun/new') },
  { key: 'newCampaign', section: 'marketing', run: (o) => o.go('/marketing/blast-campaigns/new') },
  { key: 'messageClient', section: 'connect', run: (o) => o.go('/connect') },
  { key: 'performanceInsights', section: 'home', run: (o) => o.open('performance-insights') },
  { key: 'contactSupport', section: 'account', run: (o) => o.open('resources', { tab: 'help', view: 'email' }) },
]

const SALE_TONES: Record<SaleStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { completed: 'success', part_paid: 'warning', unpaid: 'warning', refunded: 'danger', voided: 'neutral', draft: 'neutral' }

const PER_CATEGORY = 5

/** Global search: centred dialog over the page (top-bar.md §2). Opened as the `search` drawer. */
export function SearchDialog({ close }: DrawerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { open: openDrawer } = useDrawer()
  const user = useCurrentUser()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SearchCategory | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [active, setActive] = useState(0)

  const workspace = useDb((s) => s.workspace)
  const clients = useDb((s) => s.clients)
  const appointments = useDb((s) => s.appointments)
  const sales = useDb((s) => s.sales)
  const teamMembers = useDb((s) => s.teamMembers)
  const services = useDb((s) => s.services)
  const products = useDb((s) => s.products)
  const stockOrders = useDb((s) => s.stockOrders)
  const suppliers = useDb((s) => s.suppliers)
  const giftCards = useDb((s) => s.giftCards)
  const packages = useDb((s) => s.packages)
  const clientPackages = useDb((s) => s.clientPackages)

  useEffect(() => {
    // The drawer host focuses its panel after mounting; take focus back.
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [])

  const allowed = useMemo(() => CATEGORIES.filter((c) => !user || ['navigation', 'actions'].includes(c.key) || canAccess(user.role, c.section)), [user])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q || q === '/' || !user) return []
    const words = q.split(/\s+/)
    const match = (...fields: (string | undefined)[]) => {
      const hay = fields.filter(Boolean).join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    }
    const opener: Opener = { open: (name, params = {}) => openDrawer(name, params), go: (to) => navigate(to) }
    const can = (key: SearchCategory) => allowed.some((c) => c.key === key)
    const out: Result[] = []
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const memberById = new Map(teamMembers.map((m) => [m.id, m]))

    if (can('clients')) {
      clients
        .filter((c) => !c.deletedAt && match(`${c.firstName} ${c.lastName}`, c.email, c.phone))
        .slice(0, 50)
        .forEach((c) => out.push({ key: c.id, category: 'clients', title: fullName(c), subtitle: c.email || c.phone, avatar: initialsOf(c), run: () => openDrawer('client', { id: c.id }) }))
    }
    if (can('appointments')) {
      appointments
        .filter((a) => {
          const c = a.clientId ? clientById.get(a.clientId) : null
          return match(fullName(c), a.ref, ...a.items.map((i) => i.name), ...a.items.map((i) => fullName(memberById.get(i.teamMemberId), '')))
        })
        .sort((a, b) => `${b.date}${b.items[0]?.start}`.localeCompare(`${a.date}${a.items[0]?.start}`))
        .slice(0, 50)
        .forEach((a) => {
          const c = a.clientId ? clientById.get(a.clientId) : null
          const first = a.items[0]
          const member = first ? memberById.get(first.teamMemberId) : undefined
          const total = a.items.reduce((s, i) => s + i.price, 0)
          out.push({
            key: a.id,
            category: 'appointments',
            title: `${format(parseISO(a.date), 'EEE, MMM d')}, ${first?.start ?? ''} • ${fullName(c, t('panels.search.walkIn'))}`,
            subtitle: `${a.items.map((i) => i.name).join(', ')}${member ? ` ${t('panels.search.with')} ${fullName(member)}` : ''} • #${a.ref} • ${money(total)}`,
            status: { kind: 'appointment', value: a.status },
            run: () => openDrawer('appointment', { id: a.id }),
          })
        })
    }
    if (can('sales')) {
      sales
        .filter((s) => s.kind === 'sale' && s.status !== 'draft')
        .filter((s) => match(`#${s.number}`, String(s.number), fullName(s.clientId ? clientById.get(s.clientId) : null, '')))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
        .forEach((s) => {
          const c = s.clientId ? clientById.get(s.clientId) : null
          out.push({
            key: s.id,
            category: 'sales',
            title: `#${s.number} • ${money(computeTotals(s).total)}`,
            subtitle: `${format(parseISO(s.completedAt ?? s.createdAt), 'EEE, MMM d, HH:mm')} • ${fullName(c, t('panels.search.walkIn'))}`,
            status: { kind: 'text', value: t(`panels.search.saleStatus.${s.status}`), tone: SALE_TONES[s.status] },
            run: () => openDrawer('sale', { id: s.id }),
          })
        })
    }
    if (can('team')) {
      teamMembers
        .filter((m) => !m.archived && match(fullName(m), m.email, m.jobTitle))
        .forEach((m) => out.push({ key: m.id, category: 'team', title: fullName(m), subtitle: m.email || m.jobTitle, avatar: initialsOf(m), run: () => openDrawer('team-member', { id: m.id }) }))
    }
    if (can('services')) {
      services
        .filter((s) => !s.archived && match(s.name, s.treatmentType))
        .forEach((s) => out.push({ key: s.id, category: 'services', title: s.name, subtitle: `${s.durationMin} min • ${money(s.price)}`, run: () => navigate(`/catalogue/services/service/edit/${s.id}`) }))
    }
    if (can('products')) {
      products
        .filter((p) => !p.archived && match(p.name, p.barcode, ...p.skus))
        .forEach((p) => out.push({ key: p.id, category: 'products', title: p.name, subtitle: `${money(p.retailPrice)} • ${t('panels.search.inStock', { count: p.stock })}`, run: () => openDrawer('product', { id: p.id }) }))
    }
    if (can('stockOrders')) {
      const supplierById = new Map(suppliers.map((s) => [s.id, s]))
      stockOrders
        .filter((o) => match(o.number, supplierById.get(o.supplierId)?.name))
        .forEach((o) =>
          out.push({ key: o.id, category: 'stockOrders', title: `${t('panels.search.order')} ${o.number}`, subtitle: `${supplierById.get(o.supplierId)?.name ?? ''} • ${t(`panels.search.orderStatus.${o.status}`)}`, run: () => openDrawer('stock-order', { id: o.id }) }),
        )
    }
    if (can('giftCards')) {
      giftCards
        .filter((g) => match(g.code, g.customCode, g.recipientName, fullName(g.ownerClientId ? clientById.get(g.ownerClientId) : null, '')))
        .slice(0, 50)
        .forEach((g) => out.push({ key: g.id, category: 'giftCards', title: `${g.customCode ?? g.code} • ${money(g.value)}`, subtitle: `${t('panels.search.balance')} ${money(g.balance)}${g.ownerClientId ? ` • ${fullName(clientById.get(g.ownerClientId))}` : ''}`, run: () => openDrawer('gift-card', { id: g.id }) }))
    }
    if (can('packages')) {
      packages
        .filter((p) => !p.archived && match(p.name, p.description))
        .forEach((p) => out.push({ key: p.id, category: 'packages', title: p.name, subtitle: money(p.price), run: () => navigate(`/catalogue/packages/edit/${p.id}`) }))
    }
    if (can('clientPackages')) {
      const pkgById = new Map(packages.map((p) => [p.id, p]))
      clientPackages
        .filter((cp) => match(pkgById.get(cp.packageId)?.name, fullName(clientById.get(cp.clientId), '')))
        .slice(0, 50)
        .forEach((cp) =>
          out.push({
            key: cp.id,
            category: 'clientPackages',
            title: pkgById.get(cp.packageId)?.name ?? '',
            subtitle: `${fullName(clientById.get(cp.clientId))} • ${t(`panels.search.packageStatus.${cp.status}`)}`,
            run: () => openDrawer('client', { id: cp.clientId }),
          }),
        )
    }
    PAGES.filter((p) => p.layout !== 'public' && !p.path.includes(':') && p.section !== 'settings' && canAccess(user.role, p.section))
      .map((p) => ({ p, title: t(`pages.${p.id}.title`) }))
      .filter(({ title }) => match(title))
      .forEach(({ p, title }) => out.push({ key: p.id, category: 'navigation', title, subtitle: p.path, run: () => navigate(p.path) }))
    ACTIONS.filter((a) => canAccess(user.role, a.section))
      .map((a) => ({ a, title: t(`panels.search.actionLabels.${a.key}`) }))
      .filter(({ title }) => match(title))
      .forEach(({ a, title }) => out.push({ key: a.key, category: 'actions', title, run: () => a.run(opener) }))
    if (canAccess(user.role, 'settings')) {
      const seen = new Set<string>()
      SETTINGS_CATEGORIES.forEach((cat) =>
        cat.groups.forEach((g) =>
          g.links.forEach((l) => {
            const title = t(l.label)
            if (seen.has(l.to) || !match(title, t(cat.title))) return
            seen.add(l.to)
            out.push({ key: l.to, category: 'settings', title, subtitle: t(cat.title), run: () => navigate(l.to) })
          }),
        ),
      )
    }
    return out
  }, [query, user, allowed, clients, appointments, sales, teamMembers, services, products, stockOrders, suppliers, giftCards, packages, clientPackages, openDrawer, navigate, t])

  const counts = useMemo(() => {
    const map = new Map<SearchCategory, number>()
    results.forEach((r) => map.set(r.category, (map.get(r.category) ?? 0) + 1))
    return map
  }, [results])

  const visible = useMemo(() => {
    if (category) return results.filter((r) => r.category === category)
    const taken = new Map<SearchCategory, number>()
    return results.filter((r) => {
      const n = taken.get(r.category) ?? 0
      taken.set(r.category, n + 1)
      return n < PER_CATEGORY
    })
  }, [results, category])

  const filtersOpen = showFilters || query === '/'
  const filterOptions = allowed.filter((c) => t(`panels.search.categories.${c.key}`).toLowerCase().includes(filterQuery.trim().toLowerCase()))
  const q = query.trim()

  const footer = q && q !== '/' ? [
    { key: 'help', icon: CircleHelp, label: t('panels.search.searchHelp', { query: q }), run: () => openDrawer('resources', { tab: 'help', view: 'help-center', d_q: q }) },
    { key: 'chat', icon: MessageCircle, label: t('panels.search.chatSupport'), run: () => openDrawer('resources', { tab: 'help', view: 'chat' }) },
  ] : []
  const total = (filtersOpen ? filterOptions.length : visible.length) + (filtersOpen ? 0 : footer.length)

  const pickCategory = (c: SearchCategory) => {
    setCategory(c)
    setShowFilters(false)
    setFilterQuery('')
    if (query === '/') setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }

  const runIndex = (i: number) => {
    if (filtersOpen) {
      const c = filterOptions[i]
      if (c) pickCategory(c.key)
      return
    }
    if (i < visible.length) visible[i].run()
    else footer[i - visible.length]?.run()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (total ? (a + 1) % total : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (total ? (a - 1 + total) % total : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runIndex(active)
    } else if (e.key === 'Backspace' && !query && category) {
      setCategory(null)
    } else if (e.key === 'Escape' && (filtersOpen || category)) {
      e.stopPropagation()
      e.nativeEvent.stopImmediatePropagation()
      if (filtersOpen) {
        setShowFilters(false)
        if (query === '/') setQuery('')
      } else setCategory(null)
    }
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const rowClass = (i: number) => clsx('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left', active === i ? 'bg-sunken' : 'hover:bg-sunken')

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[8vh]" data-testid="search-dialog">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={t('panels.search.title')} className="relative flex max-h-[84vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl bg-raised shadow-lg" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search size={20} className="shrink-0 text-muted" aria-hidden />
          {category && (
            <span className="chip shrink-0 gap-1 bg-primary-subtle text-primary">
              {t(`panels.search.categories.${category}`)}
              <button type="button" aria-label={t('panels.search.clearCategory')} onClick={() => setCategory(null)} className="rounded-full hover:bg-primary/10">
                <X size={12} aria-hidden />
              </button>
            </span>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder={t('panels.search.placeholder')}
            aria-label={t('panels.search.title')}
            role="combobox"
            aria-expanded={total > 0}
            aria-controls="search-results"
            aria-activedescendant={total ? `search-row-${active}` : undefined}
            className="h-16 min-w-0 flex-1 bg-transparent text-body-lg text-ink outline-none placeholder:text-subtle"
          />
          {query && (
            <button type="button" className="icon-btn h-9 w-9" aria-label={t('panels.search.clear')} onClick={() => setQuery('')}>
              <X size={18} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={clsx('icon-btn h-10 w-10 rounded-full', filtersOpen && 'bg-sunken')}
            aria-label={t('panels.search.filterByCategory')}
            title={t('panels.search.filterByCategory')}
            aria-pressed={filtersOpen}
            onClick={() => {
              setShowFilters((s) => !s)
              setActive(0)
            }}
          >
            <SlidersHorizontal size={18} aria-hidden />
          </button>
        </div>

        <div ref={listRef} id="search-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtersOpen ? (
            <div>
              <div className="flex items-center gap-2 px-3 pb-2 pt-2">
                <p className="flex-1 text-body-strong text-ink">{t('panels.search.filterBy')}</p>
                <kbd className="rounded-xs border border-line px-1.5 text-caption text-muted">/</kbd>
              </div>
              <input
                value={filterQuery}
                onChange={(e) => {
                  setFilterQuery(e.target.value)
                  setActive(0)
                }}
                placeholder={t('panels.search.searchFilter')}
                aria-label={t('panels.search.searchFilter')}
                className="input mx-3 mb-2 h-10 w-[calc(100%-24px)]"
              />
              {filterOptions.map((c, i) => (
                <button key={c.key} id={`search-row-${i}`} data-index={i} type="button" role="option" aria-selected={active === i} onMouseEnter={() => setActive(i)} onClick={() => pickCategory(c.key)} className={rowClass(i)}>
                  <span className="chip bg-surface text-ink ring-1 ring-line-strong">{t(`panels.search.categories.${c.key}`)}</span>
                </button>
              ))}
            </div>
          ) : !q ? (
            <div className="px-4 py-10 text-center">
              <Search size={28} className="mx-auto text-subtle" aria-hidden />
              <p className="mt-3 text-body text-muted">{t('panels.search.empty', { name: workspace.name })}</p>
              <p className="mt-1 text-small text-subtle">{t('panels.search.emptyHint')}</p>
            </div>
          ) : (
            <>
              {counts.size > 0 && (
                <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1">
                  {allowed
                    .filter((c) => counts.has(c.key))
                    .map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        aria-pressed={category === c.key}
                        onClick={() => setCategory(category === c.key ? null : c.key)}
                        className={clsx('inline-flex h-9 items-center gap-2 rounded-full px-4 text-body ring-1 transition-colors', category === c.key ? 'bg-ink text-canvas ring-ink' : 'bg-surface text-ink ring-line-strong hover:bg-sunken')}
                      >
                        {t(`panels.search.categories.${c.key}`)}
                        <span className={clsx('rounded-full px-1.5 text-caption', category === c.key ? 'bg-canvas/20' : 'bg-sunken text-muted')}>{counts.get(c.key)}</span>
                      </button>
                    ))}
                </div>
              )}
              {visible.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="font-display text-title-3 text-ink">{t('panels.search.noResults')}</p>
                  <p className="mt-1 text-body text-muted">{t('panels.search.noResultsBody', { query: q })}</p>
                </div>
              )}
              {visible.map((r, i) => {
                const Icon = CATEGORIES.find((c) => c.key === r.category)?.icon ?? Search
                return (
                  <button key={`${r.category}-${r.key}`} id={`search-row-${i}`} data-index={i} type="button" role="option" aria-selected={active === i} onMouseEnter={() => setActive(i)} onClick={r.run} className={rowClass(i)}>
                    {r.avatar ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-small font-semibold text-primary" aria-hidden>
                        {r.avatar}
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-muted" aria-hidden>
                        <Icon size={20} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-lg text-ink">
                        <Highlight text={r.title} query={q} />
                      </span>
                      {r.subtitle && (
                        <span className="block truncate text-body text-muted">
                          <Highlight text={r.subtitle} query={q} />
                        </span>
                      )}
                    </span>
                    {!category && <span className="hidden shrink-0 text-caption text-subtle sm:inline">{t(`panels.search.categories.${r.category}`)}</span>}
                    {r.status?.kind === 'appointment' && <StatusChip status={r.status.value} />}
                    {r.status?.kind === 'text' && (
                      <span className={clsx('chip shrink-0', { success: 'bg-success-subtle text-success', warning: 'bg-warning-subtle text-warning', danger: 'bg-danger-subtle text-danger', neutral: 'bg-sunken text-muted' }[r.status.tone])}>{r.status.value}</span>
                    )}
                  </button>
                )
              })}
              {category && (counts.get(category) ?? 0) > visible.length && <p className="px-3 py-2 text-small text-muted">{t('panels.search.refine')}</p>}
            </>
          )}
        </div>

        {!filtersOpen && footer.length > 0 && (
          <div className="border-t border-line p-2">
            {footer.map((f, fi) => {
              const i = visible.length + fi
              const Icon = f.icon
              return (
                <button key={f.key} id={`search-row-${i}`} data-index={i} type="button" onMouseEnter={() => setActive(i)} onClick={f.run} className={rowClass(i)}>
                  <Icon size={20} className="text-muted" aria-hidden />
                  <span className="flex-1 text-body text-ink">{f.label}</span>
                  <ArrowUpRight size={18} className="text-muted" aria-hidden />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
