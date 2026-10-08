import clsx from 'clsx'
import { ArrowLeft, CalendarCheck, CalendarClock, ChevronRight, CreditCard, Gift, Layers, Plus, ShoppingBag, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { addDays, format, parseISO } from 'date-fns'
import { Button, EmptyState, SearchInput, Select } from '@/components/ui'
import { useDb } from '@/store/db'
import { durationLabel, toClock, toMinutes, toISODate, useNow } from '@/lib/time'
import { fullName, money } from '@/lib/format'
import { PALETTE } from '@/styles/palette'
import type { Appointment, ID, Service } from '@/types'
import { useCheckout, type CartCategory } from './context'
import { Breadcrumb } from './Breadcrumb'
import { Tile } from './ui'

const CATEGORIES: { id: Exclude<CartCategory, null>; icon: ReactNode }[] = [
  { id: 'appointments', icon: <CalendarClock size={24} aria-hidden /> },
  { id: 'services', icon: <CalendarCheck size={24} aria-hidden /> },
  { id: 'products', icon: <ShoppingBag size={24} aria-hidden /> },
  { id: 'packages', icon: <Layers size={24} aria-hidden /> },
  { id: 'memberships', icon: <CreditCard size={24} aria-hidden /> },
  { id: 'giftCards', icon: <Gift size={24} aria-hidden /> },
]

/** Cart step: search, category tiles and the quick sale layout (calendar.md §10 step 2). */
export function CartStep() {
  const { t } = useTranslation()
  const c = useCheckout()
  const [query, setQuery] = useState('')

  if (c.category) return <CategoryView />

  return (
    <div>
      <Breadcrumb />
      <h1 className="mt-3 font-display text-title-1 text-ink">{t('checkout.cart.title')}</h1>
      <SearchInput className="mt-6" value={query} onChange={setQuery} placeholder={t('checkout.cart.search')} />
      {query.trim() ? (
        <SearchResults query={query.trim()} />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {CATEGORIES.map((cat) => (
              <Tile key={cat.id} align="left" className="min-h-[104px]" icon={cat.icon} label={t(`checkout.cart.categories.${cat.id}`)} onClick={() => c.setCategory(cat.id)} testId={`category-${cat.id}`} />
            ))}
          </div>
          <QuickSale />
        </>
      )}
    </div>
  )
}

function CategoryHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { t } = useTranslation()
  const c = useCheckout()
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => c.setCategory(null)} aria-label={t('checkout.common.goBack')} className="icon-btn -ml-2">
          <ArrowLeft size={22} aria-hidden />
        </button>
        <h1 className="font-display text-title-2 text-ink">{title}</h1>
      </div>
      {action}
    </div>
  )
}

function CategoryView() {
  const c = useCheckout()
  switch (c.category) {
    case 'appointments':
      return <AppointmentsCategory />
    case 'services':
      return <ServicesCategory />
    case 'products':
      return <ProductsCategory />
    case 'packages':
      return <PackagesCategory />
    case 'memberships':
      return <MembershipsCategory />
    case 'giftCards':
      return <GiftCardsCategory />
    default:
      return null
  }
}

function RowButton({ onClick, children, disabled, testId }: { onClick: () => void; children: ReactNode; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className="flex w-full items-start justify-between gap-4 rounded-lg border border-line bg-surface px-6 py-4 text-left transition-colors hover:bg-sunken/60 disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  )
}

// ── Appointments ─────────────────────────────────────────────────────────

function AppointmentsCategory() {
  const { t } = useTranslation()
  const c = useCheckout()
  const now = useNow()
  const data = useDb(useShallow((s) => ({ appointments: s.appointments, clients: s.clients, teamMembers: s.teamMembers, sales: s.sales })))
  const [query, setQuery] = useState('')
  const [day, setDay] = useState<'today' | 'yesterday' | 'tomorrow'>('today')
  const [memberFilter, setMemberFilter] = useState<ID | ''>('')
  const [showFilters, setShowFilters] = useState(false)
  const date = toISODate(addDays(now, day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0))
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const rows = useMemo(() => {
    const q = query.toLowerCase()
    return data.appointments
      .filter((a) => a.date === date && a.status !== 'cancelled' && a.status !== 'no_show')
      .filter((a) => {
        const sale = a.saleId ? data.sales.find((s) => s.id === a.saleId) : undefined
        return !sale || sale.status === 'unpaid' || sale.status === 'draft' || sale.status === 'voided'
      })
      .filter((a) => !memberFilter || a.items.some((i) => i.teamMemberId === memberFilter))
      .filter((a) => {
        if (!q) return true
        const client = data.clients.find((x) => x.id === a.clientId)
        return `${fullName(client)} ${a.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q)
      })
      .sort((a, b) => a.items[0].start.localeCompare(b.items[0].start))
  }, [data.appointments, data.sales, data.clients, date, memberFilter, query])

  const end = (a: Appointment) => {
    const last = a.items[a.items.length - 1]
    return toClock(toMinutes(last.start) + last.durationMin + last.addOns.reduce((s, o) => s + o.durationMin, 0))
  }
  const earlier = day === 'today' ? rows.filter((a) => toMinutes(a.items[0].start) < nowMin) : day === 'yesterday' ? rows : []
  const later = day === 'today' ? rows.filter((a) => toMinutes(a.items[0].start) >= nowMin) : day === 'tomorrow' ? rows : []

  const pick = (a: Appointment) => {
    if (c.linkAppointment(a.id)) c.setCategory(null)
  }

  const renderRow = (a: Appointment) => {
    const client = data.clients.find((x) => x.id === a.clientId)
    const member = data.teamMembers.find((m) => m.id === a.items[0].teamMemberId)
    const total = a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0)
    const duration = a.items.reduce((s, i) => s + i.durationMin, 0)
    const linked = c.appointmentId === a.id
    return (
      <RowButton key={a.id} onClick={() => pick(a)} disabled={linked} testId="appointment-row">
        <span className="min-w-0">
          <span className="block text-body-lg font-semibold text-ink">{fullName(client)}</span>
          <span className="block text-body text-muted">
            {a.items[0].start} – {end(a)}
          </span>
          <span className="mt-3 block text-body text-muted">{[durationLabel(duration), member ? fullName(member) : undefined, a.items.map((i) => i.name).join(', ')].filter(Boolean).join(' • ')}</span>
        </span>
        <span className="text-body-lg font-semibold text-ink tabular">{linked ? t('checkout.cart.inCart') : money(total)}</span>
      </RowButton>
    )
  }

  return (
    <div>
      <CategoryHeader title={t('checkout.cart.categories.appointments')} />
      <SearchInput value={query} onChange={setQuery} placeholder={t('checkout.cart.search')} />
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-body-strong text-muted">{t('checkout.cart.selectAppointment')}</p>
        <div className="flex items-center gap-2">
          <Select
            aria-label={t('checkout.cart.day')}
            className="h-10 w-40 rounded-full"
            value={day}
            onChange={(e) => setDay(e.target.value as typeof day)}
            options={[
              { value: 'today', label: t('checkout.cart.today') },
              { value: 'yesterday', label: t('checkout.cart.yesterday') },
              { value: 'tomorrow', label: t('checkout.cart.tomorrow') },
            ]}
          />
          <button type="button" aria-label={t('checkout.cart.filters')} title={t('checkout.cart.filters')} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)} className={clsx('flex h-10 w-10 items-center justify-center rounded-full border', memberFilter ? 'border-primary text-primary' : 'border-line-strong text-ink hover:bg-sunken')}>
            <SlidersHorizontal size={18} aria-hidden />
          </button>
        </div>
      </div>
      {showFilters && (
        <div className="mt-3 rounded-lg border border-line bg-sunken/50 p-4">
          <label className="label" htmlFor="appt-member-filter">
            {t('checkout.cart.teamMember')}
          </label>
          <Select id="appt-member-filter" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} options={[{ value: '', label: t('checkout.cart.allTeam') }, ...c.members.filter((m) => m.bookable).map((m) => ({ value: m.id, label: fullName(m) }))]} />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarClock size={26} aria-hidden />} title={t('checkout.cart.noAppointments')} body={t('checkout.cart.noAppointmentsBody')} />
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {earlier.length > 0 && (
            <section>
              <h2 className="mb-3 text-body-strong text-muted">{day === 'today' ? t('checkout.cart.earlierToday') : format(parseISO(date), 'EEEE, d MMM')}</h2>
              <div className="flex flex-col gap-3">{earlier.map(renderRow)}</div>
            </section>
          )}
          {later.length > 0 && (
            <section>
              <h2 className="mb-3 text-body-strong text-muted">{day === 'today' ? t('checkout.cart.laterToday') : format(parseISO(date), 'EEEE, d MMM')}</h2>
              <div className="flex flex-col gap-3">{later.map(renderRow)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ── Services ─────────────────────────────────────────────────────────────

export function useAddService() {
  const c = useCheckout()
  return (service: Service, variantId?: ID) => {
    const variant = service.variants.find((v) => v.id === variantId)
    c.addLine({ type: 'service', refId: service.id, name: variant ? `${service.name} - ${variant.name}` : service.name, quantity: 1, unitPrice: variant?.price ?? service.price, teamMemberId: c.memberForService(service.id) })
  }
}

function ServicesCategory() {
  const { t } = useTranslation()
  const data = useDb(useShallow((s) => ({ services: s.services, categories: s.serviceCategories })))
  const addService = useAddService()
  const c = useCheckout()
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()
  const groups = data.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({ cat, services: data.services.filter((s) => s.categoryId === cat.id && !s.archived && s.locationIds.includes(c.locationId) && (!q || s.name.toLowerCase().includes(q))).sort((a, b) => a.order - b.order) }))
    .filter((g) => g.services.length)
  return (
    <div>
      <CategoryHeader title={t('checkout.cart.categories.services')} />
      <SearchInput value={query} onChange={setQuery} placeholder={t('checkout.cart.searchServices')} />
      {groups.length === 0 && <EmptyState title={t('checkout.cart.noResults')} body={t('checkout.cart.noResultsBody')} />}
      {groups.map(({ cat, services }) => (
        <section key={cat.id} className="mt-6">
          <h2 className="mb-2 text-body-strong text-ink">{cat.name}</h2>
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {services.flatMap((s) => {
              const options = s.variants.length ? s.variants.map((v) => ({ id: v.id, name: `${s.name} - ${v.name}`, price: v.price, duration: v.durationMin })) : [{ id: '', name: s.name, price: s.price, duration: s.durationMin }]
              return options.map((o) => (
                <button key={`${s.id}${o.id}`} type="button" onClick={() => addService(s, o.id || undefined)} className="relative flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-sunken/60" data-testid="service-option">
                  <span className="absolute bottom-3 left-0 top-3 w-1 rounded-full" style={{ background: PALETTE[cat.color].edge }} aria-hidden />
                  <span>
                    <span className="block text-body-lg text-ink">{o.name}</span>
                    <span className="block text-body text-muted">{durationLabel(o.duration)}</span>
                  </span>
                  <span className="text-body-lg text-ink tabular">
                    {s.priceType === 'from' ? `${t('checkout.cart.from')} ` : ''}
                    {s.priceType === 'free' ? t('checkout.summary.free') : money(o.price)}
                  </span>
                </button>
              ))
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ── Products ─────────────────────────────────────────────────────────────

function ProductsCategory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = useCheckout()
  const products = useDb((s) => s.products)
  const brands = useDb((s) => s.brands)
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()
  const list = products.filter((p) => !p.archived && p.retailSales && (!q || `${p.name} ${p.barcode ?? ''}`.toLowerCase().includes(q)))
  const any = products.some((p) => !p.archived && p.retailSales)
  return (
    <div>
      <CategoryHeader title={t('checkout.cart.categories.products')} />
      {!any ? (
        <EmptyState icon={<ShoppingBag size={26} aria-hidden />} title={t('checkout.cart.noProducts')} action={<Button onClick={() => navigate('/catalogue/products')}>{t('checkout.cart.manageProducts')}</Button>} />
      ) : (
        <>
          <SearchInput value={query} onChange={setQuery} placeholder={t('checkout.cart.searchProducts')} />
          <div className="mt-6 flex flex-col divide-y divide-line rounded-lg border border-line">
            {list.map((p) => {
              const out = p.trackStock && p.stock <= 0
              return (
                <button key={p.id} type="button" disabled={out} onClick={() => c.addLine({ type: 'product', refId: p.id, name: p.name, quantity: 1, unitPrice: p.retailPrice, teamMemberId: c.defaultMemberId })} className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-sunken/60 disabled:cursor-not-allowed disabled:opacity-50" data-testid="product-option">
                  <span>
                    <span className="block text-body-lg text-ink">{p.name}</span>
                    <span className="block text-body text-muted">{[brands.find((b) => b.id === p.brandId)?.name, p.trackStock ? (out ? t('checkout.cart.outOfStock') : t('checkout.cart.inStock', { count: p.stock })) : undefined].filter(Boolean).join(' • ')}</span>
                  </span>
                  <span className="text-body-lg text-ink tabular">{money(p.retailPrice)}</span>
                </button>
              )
            })}
            {list.length === 0 && <p className="px-6 py-8 text-center text-body text-muted">{t('checkout.cart.noResults')}</p>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Packages and memberships ─────────────────────────────────────────────

function PackagesCategory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = useCheckout()
  const packages = useDb((s) => s.packages)
  const [query, setQuery] = useState('')
  const list = packages.filter((p) => !p.archived && (!query || p.name.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => a.order - b.order)
  return (
    <div>
      <CategoryHeader
        title={t('checkout.cart.categories.packages')}
        action={
          <Button className="rounded-full" icon={<Plus size={16} aria-hidden />} onClick={() => c.setModal({ kind: 'sellCustom', type: 'package' })}>
            {t('checkout.cart.sellCustom')}
          </Button>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder={t('checkout.cart.search')} />
      {packages.filter((p) => !p.archived).length === 0 ? (
        <div className="mt-6 rounded-lg border border-line">
          <EmptyState
            icon={<Layers size={26} aria-hidden />}
            title={t('checkout.cart.noPackages')}
            body={
              <>
                <button type="button" className="text-primary hover:underline" onClick={() => navigate('/catalogue/packages')}>
                  {t('checkout.cart.clickHere')}
                </button>{' '}
                {t('checkout.cart.noPackagesBody')}{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => c.setModal({ kind: 'sellCustom', type: 'package' })}>
                  {t('checkout.cart.customPackage')}
                </button>{' '}
                {t('checkout.cart.now')}
              </>
            }
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {list.map((p) => (
            <RowButton key={p.id} testId="package-option" onClick={() => c.addLine({ type: 'package', refId: p.id, name: p.name, detail: t('checkout.cart.benefits', { count: p.benefits.length }), quantity: 1, unitPrice: p.price, teamMemberId: c.defaultMemberId })}>
              <span>
                <span className="block text-body-lg font-semibold text-ink">{p.name}</span>
                <span className="block text-body text-muted">
                  {t('checkout.cart.benefits', { count: p.benefits.length })} • {t('checkout.cart.expiresIn', { value: p.expiresValue, unit: t(`checkout.cart.units.${p.expiresUnit}`, { count: p.expiresValue }) })}
                </span>
              </span>
              <span className="text-body-lg text-ink tabular">{money(p.price)}</span>
            </RowButton>
          ))}
        </div>
      )}
      {!c.clientId && <p className="mt-4 text-small text-muted">{t('checkout.cart.clientNeeded')}</p>}
    </div>
  )
}

function MembershipsCategory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = useCheckout()
  const memberships = useDb((s) => s.memberships)
  const [query, setQuery] = useState('')
  const list = memberships.filter((m) => !m.archived && (!query || m.name.toLowerCase().includes(query.toLowerCase())))
  return (
    <div>
      <CategoryHeader
        title={t('checkout.cart.categories.memberships')}
        action={
          <Button className="rounded-full" icon={<Plus size={16} aria-hidden />} onClick={() => c.setModal({ kind: 'sellCustom', type: 'membership' })}>
            {t('checkout.cart.sellCustom')}
          </Button>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder={t('checkout.cart.search')} />
      {memberships.filter((m) => !m.archived).length === 0 ? (
        <div className="mt-6 rounded-lg border border-line">
          <EmptyState
            icon={<CreditCard size={26} aria-hidden />}
            title={t('checkout.cart.noMemberships')}
            body={
              <>
                <button type="button" className="text-primary hover:underline" onClick={() => navigate('/catalogue/memberships')}>
                  {t('checkout.cart.clickHere')}
                </button>{' '}
                {t('checkout.cart.noMembershipsBody')}
              </>
            }
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {list.map((m) => (
            <RowButton key={m.id} testId="membership-option" onClick={() => c.addLine({ type: 'membership', refId: m.id, name: m.name, detail: m.interval === 'month' ? t('checkout.cart.monthly') : t('checkout.cart.weekly'), quantity: 1, unitPrice: m.firstPeriodPrice ?? m.price, teamMemberId: c.defaultMemberId })}>
              <span>
                <span className="block text-body-lg font-semibold text-ink">{m.name}</span>
                <span className="block text-body text-muted">{m.description}</span>
                {m.firstPeriodPrice !== undefined && <span className="mt-1 block text-small text-muted">{t('checkout.cart.firstPeriod', { price: money(m.firstPeriodPrice), regular: money(m.price) })}</span>}
              </span>
              <span className="text-body-lg text-ink tabular">
                {money(m.price)} <span className="text-body text-muted">/ {m.interval === 'month' ? t('checkout.cart.month') : t('checkout.cart.week')}</span>
              </span>
            </RowButton>
          ))}
        </div>
      )}
      {!c.clientId && <p className="mt-4 text-small text-muted">{t('checkout.cart.clientNeeded')}</p>}
    </div>
  )
}

// ── Gift cards ───────────────────────────────────────────────────────────

function GiftCardsCategory() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = useCheckout()
  const settings = useDb((s) => s.settings.giftCards)
  const addGift = (value: number) => {
    const key = c.addLine({ type: 'gift_card', name: 'Gift Card', quantity: 1, unitPrice: value, teamMemberId: c.defaultMemberId, giftCard: { value, expiry: settings.expiry, isGift: true, sendEmail: Boolean(c.clientId) } })
    c.setModal({ kind: 'giftCard', key })
  }
  return (
    <div>
      <CategoryHeader title={t('checkout.cart.categories.giftCards')} />
      {!settings.enabled ? (
        <EmptyState icon={<Gift size={26} aria-hidden />} title={t('checkout.cart.noGiftCards')} action={<Button onClick={() => navigate('/setup/sales/gift-cards')}>{t('checkout.cart.manageGiftCards')}</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {settings.values.map((v) => (
            <GiftTile key={v} icon={<Gift size={30} aria-hidden />} title={t('checkout.cart.giftCard')} sub={money(v)} onClick={() => addGift(v)} />
          ))}
          <GiftTile icon={<Plus size={30} aria-hidden />} title={t('checkout.cart.giftCard')} sub={t('checkout.cart.customAmount')} onClick={() => c.setModal({ kind: 'giftCard', key: null })} />
        </div>
      )}
    </div>
  )
}

function GiftTile({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-[120px] overflow-hidden rounded-lg border border-line bg-surface text-left hover:border-line-strong" data-testid="gift-card-option">
      <span className="flex w-[96px] shrink-0 items-center justify-center bg-sunken text-primary">{icon}</span>
      <span className="flex flex-col justify-center px-5">
        <span className="text-body-lg text-ink">{title}</span>
        <span className="text-body text-muted">{sub}</span>
      </span>
    </button>
  )
}

// ── Quick sale and search ────────────────────────────────────────────────

function QuickSale() {
  const { t } = useTranslation()
  const c = useCheckout()
  const data = useDb(useShallow((s) => ({ items: s.settings.quickSaleItems, services: s.services, products: s.products, categories: s.serviceCategories })))
  const addService = useAddService()
  const tiles = data.items
    .map((item) => {
      if (item.type === 'service') {
        const s = data.services.find((x) => x.id === item.id && !x.archived)
        if (!s) return null
        const color = PALETTE[data.categories.find((cat) => cat.id === s.categoryId)?.color ?? 'blue'].edge
        return { key: `s${s.id}`, name: s.name, price: s.price, color, onClick: () => addService(s) }
      }
      const p = data.products.find((x) => x.id === item.id && !x.archived)
      if (!p) return null
      return { key: `p${p.id}`, name: p.name, price: p.retailPrice, color: PALETTE.amber.edge, onClick: () => c.addLine({ type: 'product', refId: p.id, name: p.name, quantity: 1, unitPrice: p.retailPrice, teamMemberId: c.defaultMemberId }) }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-body-lg font-semibold text-ink">{t('checkout.cart.quickSale')}</h2>
        <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => c.setModal({ kind: 'quickSale' })}>
          {t('checkout.cart.edit')}
        </button>
      </div>
      {tiles.length === 0 ? (
        <button type="button" onClick={() => c.setModal({ kind: 'quickSale' })} className="flex w-full items-center justify-between rounded-lg border border-dashed border-line-strong px-6 py-6 text-left text-body text-muted hover:bg-sunken/60">
          {t('checkout.cart.quickSaleEmpty')}
          <ChevronRight size={18} aria-hidden />
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {tiles.map((tile) => (
            <button key={tile.key} type="button" onClick={tile.onClick} className="relative flex h-[120px] flex-col justify-center overflow-hidden rounded-lg border border-line bg-surface pl-8 pr-5 text-left hover:border-line-strong" data-testid="quick-sale-tile">
              <span className="absolute bottom-0 left-0 top-0 w-2" style={{ background: tile.color }} aria-hidden />
              <span className="text-body-lg text-ink">{tile.name}</span>
              <span className="text-body text-muted tabular">{money(tile.price)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SearchResults({ query }: { query: string }) {
  const { t } = useTranslation()
  const c = useCheckout()
  const data = useDb(useShallow((s) => ({ services: s.services, products: s.products, packages: s.packages, memberships: s.memberships })))
  const addService = useAddService()
  const q = query.toLowerCase()
  const results = [
    ...data.services.filter((s) => !s.archived && s.name.toLowerCase().includes(q)).map((s) => ({ key: s.id, kind: t('checkout.cart.kinds.service'), name: s.name, price: s.price, add: () => addService(s) })),
    ...data.products.filter((p) => !p.archived && p.retailSales && p.name.toLowerCase().includes(q)).map((p) => ({ key: p.id, kind: t('checkout.cart.kinds.product'), name: p.name, price: p.retailPrice, add: () => c.addLine({ type: 'product', refId: p.id, name: p.name, quantity: 1, unitPrice: p.retailPrice, teamMemberId: c.defaultMemberId }) })),
    ...data.packages.filter((p) => !p.archived && p.name.toLowerCase().includes(q)).map((p) => ({ key: p.id, kind: t('checkout.cart.kinds.package'), name: p.name, price: p.price, add: () => c.addLine({ type: 'package', refId: p.id, name: p.name, detail: t('checkout.cart.benefits', { count: p.benefits.length }), quantity: 1, unitPrice: p.price, teamMemberId: c.defaultMemberId }) })),
    ...data.memberships.filter((m) => !m.archived && m.name.toLowerCase().includes(q)).map((m) => ({ key: m.id, kind: t('checkout.cart.kinds.membership'), name: m.name, price: m.firstPeriodPrice ?? m.price, add: () => c.addLine({ type: 'membership', refId: m.id, name: m.name, detail: m.interval === 'month' ? t('checkout.cart.monthly') : t('checkout.cart.weekly'), quantity: 1, unitPrice: m.firstPeriodPrice ?? m.price, teamMemberId: c.defaultMemberId }) })),
  ].slice(0, 40)
  if (!results.length) return <EmptyState title={t('checkout.cart.noResults')} body={t('checkout.cart.noResultsBody')} />
  return (
    <div className="mt-6 flex flex-col divide-y divide-line rounded-lg border border-line">
      {results.map((r) => (
        <button key={r.key} type="button" onClick={r.add} className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-sunken/60" data-testid="search-result">
          <span>
            <span className="block text-body-lg text-ink">{r.name}</span>
            <span className="block text-body text-muted">{r.kind}</span>
          </span>
          <span className="text-body-lg text-ink tabular">{money(r.price)}</span>
        </button>
      ))}
    </div>
  )
}
