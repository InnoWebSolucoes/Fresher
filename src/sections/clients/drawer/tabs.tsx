import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { CalendarDays, ChevronDown, Pencil, Plus, Receipt, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Appointment, AppointmentStatus, Sale } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { money, num } from '@/lib/format'
import { todayISO } from '@/lib/time'
import { Button, EmptyState, Menu, PillTabs } from '@/components/ui'
import { useClientDrawer } from './context'
import { AppointmentCard, SaleCard } from './cards'
import { allergyName, SeverityIcon } from './dialogs'
import { InfoTip } from '../components/common'
import { TagChip } from '../components/TagPicker'
import { clientName, fmtLongDate, isPaidSale, saleItemsTotal } from '../lib/helpers'
import { countryLabel, pronounLabel, reactionLabel } from '../lib/constants'
import { addressLines, addressName } from '../components/AddressModal'

export function TabHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 md:mb-6">
      <h2 className="font-display text-title-2 text-ink md:text-title-1">{title}</h2>
      {action}
    </div>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between gap-3 first:mt-0">
      <h3 className="font-display text-title-3 text-ink">{title}</h3>
      {action}
    </div>
  )
}

export function PanelEmpty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <EmptyState icon={icon} title={title} body={body} action={action} />
    </div>
  )
}

/** Appointments and sales of the open client (shared by several tabs). */
export function useClientRecords() {
  const { client } = useClientDrawer()
  const appointments = useDb((s) => s.appointments)
  const sales = useDb((s) => s.sales)
  return useMemo(() => {
    const appts = appointments.filter((a) => a.clientId === client.id)
    const today = todayISO()
    const byTime = (a: Appointment) => `${a.date} ${a.items[0]?.start ?? ''}`
    const upcoming = appts.filter((a) => a.date >= today && !['cancelled', 'no_show', 'completed'].includes(a.status)).sort((a, b) => byTime(a).localeCompare(byTime(b)))
    const past = appts.filter((a) => !upcoming.includes(a)).sort((a, b) => byTime(b).localeCompare(byTime(a)))
    const clientSales = sales.filter((s) => s.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { appts, upcoming, past, sales: clientSales }
  }, [appointments, sales, client.id])
}

// ─── Overview ──────────────────────────────────────────────────────────────

export function OverviewTab() {
  const { t } = useTranslation()
  const { client, setTab } = useClientDrawer()
  const navigate = useNavigate()
  const reviews = useDb((s) => s.reviews)
  const { appts, upcoming, sales } = useClientRecords()
  const mine = reviews.filter((r) => r.clientId === client.id)
  const rating = mine.length ? num(mine.reduce((s, r) => s + r.rating, 0) / mine.length, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'
  const totalSales = sales.filter(isPaidSale).reduce((s, x) => s + saleItemsTotal(x), 0)
  const stat = (label: string, value: ReactNode, tip: string, wide?: boolean) => (
    <div className={clsx('rounded-lg border border-line bg-surface p-4 md:p-5', wide && 'col-span-2')}>
      <p className="flex items-center justify-between text-body-lg font-semibold text-ink">
        {label}
        <InfoTip text={tip} />
      </p>
      <p className="mt-2 font-display text-title-2 text-ink tabular md:text-title-1">{value}</p>
    </div>
  )
  return (
    <>
      <TabHeader title={t('clients.drawer.tabs.overview')} />
      {client.staffAlert && (
        <>
          <SectionTitle title={t('clients.alert.label')} />
          <div className="flex items-start gap-3 rounded-lg bg-primary-subtle/60 p-4 text-body-lg text-ink">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            {client.staffAlert}
          </div>
        </>
      )}
      {client.allergies.length > 0 && (
        <>
          <SectionTitle title={t('clients.drawer.tabs.allergies')} />
          <div className="flex flex-col gap-2">
            {client.allergies.map((a) => (
              <div key={a.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
                <SeverityIcon severity={a.severity} size={40} />
                <div>
                  <p className="text-body-lg font-semibold text-ink">{allergyName(a)}</p>
                  <p className="text-body text-muted">{[a.severity ? t(`clients.allergy.severityLabel.${a.severity}`) : t('clients.allergy.unknownSeverity'), reactionLabel(a.reaction)].filter(Boolean).join(' • ')}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <SectionTitle
        title={t('clients.wallet.title')}
        action={
          <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setTab('wallet')}>
            {t('clients.wallet.view')}
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3">{stat(t('clients.wallet.balance'), money(client.walletBalance), t('clients.wallet.balanceTip'), true)}</div>
      <SectionTitle title={t('clients.overview.summary')} />
      <div className="grid grid-cols-2 gap-3">
        {stat(t('clients.overview.totalSales'), money(totalSales), t('clients.overview.totalSalesTip'), true)}
        {stat(t('clients.overview.appointments'), appts.filter((a) => a.status !== 'cancelled').length, t('clients.overview.appointmentsTip'))}
        {stat(t('clients.overview.rating'), rating, t('clients.overview.ratingTip'))}
        {stat(t('clients.overview.canceled'), appts.filter((a) => a.status === 'cancelled').length, t('clients.overview.canceledTip'))}
        {stat(t('clients.overview.noShow'), appts.filter((a) => a.status === 'no_show').length, t('clients.overview.noShowTip'))}
      </div>
      <SectionTitle
        title={t('clients.overview.upcoming')}
        action={
          <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setTab('appointments')}>
            {t('clients.overview.viewAll')}
          </button>
        }
      />
      {upcoming[0] ? (
        <AppointmentCard appointment={upcoming[0]} last />
      ) : (
        <PanelEmpty
          icon={<CalendarDays size={24} aria-hidden />}
          title={t('clients.overview.noUpcoming')}
          body={t('clients.overview.noUpcomingBody')}
          action={
            <Button variant="primary" onClick={() => navigate(`/calendar?drawer=new-appointment&d_client=${client.id}`)}>
              {t('clients.drawer.bookNow')}
            </Button>
          }
        />
      )}
    </>
  )
}

// ─── Appointments ──────────────────────────────────────────────────────────

const MORE_STATUSES: AppointmentStatus[] = ['arrived', 'started', 'completed', 'no_show', 'cancelled']

export function AppointmentsTab() {
  const { t } = useTranslation()
  const { client } = useClientDrawer()
  const navigate = useNavigate()
  const { appts, upcoming, past } = useClientRecords()
  const [status, setStatus] = useState<'all' | AppointmentStatus>('all')
  const keep = (a: Appointment) => status === 'all' || a.status === status
  const groups = [
    { key: 'upcoming', title: t('clients.appointments.upcoming'), list: upcoming.filter(keep) },
    { key: 'past', title: t('clients.appointments.past'), list: past.filter(keep) },
  ].filter((g) => g.list.length)
  const moreActive = MORE_STATUSES.includes(status as AppointmentStatus)
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.appointments')}
        action={
          <Button size="sm" className="rounded-full" icon={<Plus size={14} aria-hidden />} onClick={() => navigate(`/calendar?drawer=new-appointment&d_client=${client.id}`)}>
            {t('clients.common.add')}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <PillTabs<'all' | 'booked' | 'confirmed'>
          value={moreActive ? ('none' as 'all') : (status as 'all' | 'booked' | 'confirmed')}
          onChange={setStatus}
          items={[
            { value: 'all', label: t('clients.appointments.all'), count: appts.length },
            { value: 'booked', label: t('clients.status.booked'), count: appts.filter((a) => a.status === 'booked').length },
            { value: 'confirmed', label: t('clients.status.confirmed'), count: appts.filter((a) => a.status === 'confirmed').length },
          ]}
        />
        <Menu
          width={200}
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-body-strong', moreActive ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken')}>
              {moreActive ? t(`clients.status.${status}`) : t('clients.common.more')}
              <ChevronDown size={14} aria-hidden />
            </button>
          )}
          groups={[{ items: MORE_STATUSES.map((s) => ({ label: t(`clients.status.${s}`), checked: s === status, hint: String(appts.filter((a) => a.status === s).length), onSelect: () => setStatus(s) })) }]}
        />
      </div>
      {groups.length === 0 ? (
        <PanelEmpty
          icon={<CalendarDays size={24} aria-hidden />}
          title={t('clients.appointments.emptyTitle')}
          body={t('clients.appointments.emptyBody')}
          action={
            <Button variant="primary" onClick={() => navigate(`/calendar?drawer=new-appointment&d_client=${client.id}`)}>
              {t('clients.drawer.bookNow')}
            </Button>
          }
        />
      ) : (
        groups.map((g) => (
          <div key={g.key} className="mb-4">
            <p className="mb-3 text-body-strong text-primary">{g.title}</p>
            {g.list.slice(0, 60).map((a, i) => (
              <AppointmentCard key={a.id} appointment={a} last={i === Math.min(g.list.length, 60) - 1} />
            ))}
          </div>
        ))
      )}
    </>
  )
}

// ─── Sales ─────────────────────────────────────────────────────────────────

type SaleFilter = 'all' | 'paid' | 'draft' | 'unpaid' | 'part_paid' | 'refunded' | 'voided'

export function SalesTab() {
  const { t } = useTranslation()
  const { client } = useClientDrawer()
  const drawer = useDrawer()
  const { sales } = useClientRecords()
  const [filter, setFilter] = useState<SaleFilter>('all')
  const match = (s: Sale, f: SaleFilter) => (f === 'all' ? true : f === 'paid' ? s.status === 'completed' : f === 'refunded' ? s.kind === 'refund' || s.status === 'refunded' : s.status === f)
  const list = sales.filter((s) => match(s, filter))
  const more: SaleFilter[] = ['unpaid', 'part_paid', 'refunded', 'voided']
  const moreActive = more.includes(filter)
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.sales')}
        action={
          <Button size="sm" className="rounded-full" onClick={() => drawer.open('checkout', { d_client: client.id })}>
            {t('clients.sales.sell')}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <PillTabs<SaleFilter>
          value={moreActive ? ('none' as SaleFilter) : filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: t('clients.sales.all'), count: sales.length },
            { value: 'paid', label: t('clients.sales.paid'), count: sales.filter((s) => match(s, 'paid')).length },
            { value: 'draft', label: t('clients.sales.drafts'), count: sales.filter((s) => match(s, 'draft')).length },
          ]}
        />
        <Menu
          width={200}
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className={clsx('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-body-strong', moreActive ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken')}>
              {moreActive ? t(`clients.sales.status.${filter}`) : t('clients.common.more')}
              <ChevronDown size={14} aria-hidden />
            </button>
          )}
          groups={[{ items: more.map((f) => ({ label: t(`clients.sales.status.${f}`), checked: f === filter, hint: String(sales.filter((s) => match(s, f)).length), onSelect: () => setFilter(f) })) }]}
        />
      </div>
      {list.length === 0 ? (
        <PanelEmpty
          icon={<Receipt size={24} aria-hidden />}
          title={t('clients.sales.emptyTitle')}
          body={t('clients.sales.emptyBody')}
          action={
            <Button variant="primary" onClick={() => drawer.open('checkout', { d_client: client.id })}>
              {t('clients.sales.sell')}
            </Button>
          }
        />
      ) : (
        list.slice(0, 60).map((s, i) => <SaleCard key={s.id} sale={s} last={i === Math.min(list.length, 60) - 1} />)
      )}
    </>
  )
}

// ─── Client details ────────────────────────────────────────────────────────

export function DetailsTab() {
  const { t } = useTranslation()
  const { client, edit, act } = useClientDrawer()
  const sources = useDb((s) => s.clientSources)
  const clients = useDb((s) => s.clients)
  const policy = useDb((s) => s.settings.paymentPolicy)
  const referrer = clients.find((c) => c.id === client.referredById)
  const channels = (v: { email: boolean; sms: boolean; whatsapp: boolean }) =>
    (['email', 'sms', 'whatsapp'] as const)
      .filter((k) => v[k])
      .map((k) => t(`clients.details.channels.${k}`))
      .join(' • ') || t('clients.details.none')
  const editLink = (section?: string, focus?: string) => (
    <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => edit(section, focus)}>
      {t('clients.common.edit')}
    </button>
  )
  const rows = (items: [string, ReactNode][]) => (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 md:gap-x-6">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-body-strong text-ink">{label}</dt>
          <dd className="break-words text-body text-muted">{value || '–'}</dd>
        </div>
      ))}
    </dl>
  )
  return (
    <>
      <TabHeader
        title={t('clients.drawer.tabs.details')}
        action={
          <Button size="sm" className="rounded-full" iconRight={<Pencil size={14} aria-hidden />} onClick={() => edit()}>
            {t('clients.common.edit')}
          </Button>
        }
      />
      <div className="flex flex-col divide-y divide-line">
        <section className="pb-6">
          <SectionTitle title={t('clients.details.profile')} action={editLink()} />
          {rows([
            [t('clients.details.fullName'), clientName(client)],
            [t('clients.form.email'), client.email],
            [t('clients.details.phone'), client.phone],
            [t('clients.details.dob'), client.birthday ? fmtLongDate(client.birthday) : ''],
            [t('clients.form.gender'), client.gender ? t(`clients.gender.${client.gender}`) : ''],
            [t('clients.form.pronouns'), pronounLabel(client.pronouns)],
            [t('clients.details.joined'), fmtLongDate(client.createdAt.slice(0, 10))],
          ])}
        </section>
        <section className="py-6">
          <SectionTitle title={t('clients.form.additional')} action={editLink('profile', 'source')} />
          {rows([
            [t('clients.form.source'), sources.find((s) => s.id === client.sourceId)?.name],
            [t('clients.form.referredBy'), referrer ? clientName(referrer) : ''],
            [t('clients.form.language'), client.language],
            [t('clients.form.country'), countryLabel(client.country)],
            [t('clients.form.occupation'), client.occupation],
            [t('clients.form.additionalEmail'), client.additionalEmail],
            [t('clients.form.additionalPhone'), client.additionalPhone],
          ])}
          <p className="mt-4 text-body-strong text-ink">{t('clients.form.tags')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {client.tagIds.map((id) => (
              <TagChip key={id} tagId={id} />
            ))}
            <button type="button" onClick={() => act({ kind: 'tags' })} className="chip gap-1 border border-line-strong bg-surface text-ink hover:bg-sunken">
              <Plus size={12} aria-hidden /> {t('clients.drawer.addTag')}
            </button>
          </div>
        </section>
        <section className="py-6">
          <SectionTitle title={t('clients.form.addresses')} action={editLink('addresses')} />
          {client.addresses.length ? (
            <div className="flex flex-col gap-3">
              {client.addresses.map((a) => (
                <div key={a.id} className="rounded-md bg-surface p-4 ring-1 ring-line">
                  <p className="text-body-strong text-ink">{addressName(a)}</p>
                  {addressLines(a).map((l) => (
                    <p key={l} className="text-body text-muted">
                      {l}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body text-muted">{t('clients.details.noAddress')}</p>
          )}
        </section>
        <section className="py-6">
          <SectionTitle title={t('clients.form.emergency')} action={editLink('emergency_contacts')} />
          {client.emergencyContacts.length ? (
            <div className="flex flex-col gap-3">
              {client.emergencyContacts.map((e) => (
                <div key={e.id} className="rounded-md bg-surface p-4 ring-1 ring-line">
                  <p className="text-body-strong text-ink">
                    {e.fullName || '–'} <span className="font-normal text-muted">· {e.primary ? t('clients.form.primaryContact') : t('clients.form.secondaryContact')}</span>
                  </p>
                  <p className="text-body text-muted">{[e.relationship, e.phone, e.email].filter(Boolean).join(' · ')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body text-muted">{t('clients.details.noEmergency')}</p>
          )}
        </section>
        <section className="py-6">
          <SectionTitle title={t('clients.details.notifications')} action={editLink('settings')} />
          <p className="text-body text-ink">
            <strong>{t('clients.details.clientNotifications')}</strong> {channels(client.notifications)}
          </p>
          <p className="mt-1 text-body text-ink">
            <strong>{t('clients.details.marketingMessages')}</strong> {channels(client.blocked ? { email: false, sms: false, whatsapp: false } : client.marketing)}
          </p>
        </section>
        <section className="pt-6">
          <SectionTitle title={t('clients.details.paymentPolicy')} />
          <p className="text-body text-muted">{policy.depositsEnabled ? t('clients.details.paymentPolicyOn', { pct: policy.depositPct }) : t('clients.details.paymentPolicyBody')}</p>
        </section>
      </div>
    </>
  )
}

// ─── Items ─────────────────────────────────────────────────────────────────

type ItemTab = 'services' | 'products' | 'memberships' | 'packages' | 'gift_cards'

export function ItemsTab() {
  const { t } = useTranslation()
  const { client } = useClientDrawer()
  const drawer = useDrawer()
  const { sales } = useClientRecords()
  const members = useDb((s) => s.teamMembers)
  const clientMemberships = useDb((s) => s.clientMemberships)
  const membershipDefs = useDb((s) => s.memberships)
  const clientPackages = useDb((s) => s.clientPackages)
  const packageDefs = useDb((s) => s.packages)
  const giftCards = useDb((s) => s.giftCards)
  const [tab, setTab] = useState<ItemTab>('services')

  const data = useMemo(() => {
    const paid = sales.filter((s) => s.kind === 'sale' && s.status !== 'voided' && s.status !== 'draft')
    const lines = (type: 'service' | 'product') => paid.flatMap((s) => s.items.filter((i) => i.type === type).map((i) => ({ sale: s, item: i })))
    return {
      services: lines('service'),
      products: lines('product'),
      memberships: clientMemberships.filter((m) => m.clientId === client.id),
      packages: clientPackages.filter((p) => p.clientId === client.id),
      giftCards: giftCards.filter((g) => g.ownerClientId === client.id || g.purchaserClientId === client.id),
    }
  }, [sales, clientMemberships, clientPackages, giftCards, client.id])

  const memberName = (id: string | null) => {
    const m = members.find((x) => x.id === id)
    return m ? `${m.firstName} ${m.lastName}` : ''
  }
  const counts: Record<ItemTab, number> = { services: data.services.length, products: data.products.length, memberships: data.memberships.length, packages: data.packages.length, gift_cards: data.giftCards.length }
  const row = (key: string, title: string, sub: string, amount: string, onView?: () => void, chip?: ReactNode) => (
    <div key={key} className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3 border-l-4 border-primary/40 pl-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-lg font-semibold text-ink md:flex-nowrap">
            {title} {chip}
          </p>
          <p className="text-small text-muted">{sub}</p>
        </div>
        <span className="shrink-0 text-body-lg font-semibold text-ink tabular">{amount}</span>
      </div>
      {onView && (
        <Button size="sm" className="mt-3 rounded-full" onClick={onView}>
          {t('clients.appt.viewSale')}
        </Button>
      )}
    </div>
  )
  const statusChip = (s: string) => <span className={clsx('chip h-5 px-2 text-caption', s === 'active' ? 'bg-success-subtle text-success' : 'bg-sunken text-muted')}>{t(`clients.items.status.${s}`, { defaultValue: s })}</span>
  return (
    <>
      <TabHeader title={t('clients.drawer.tabs.items')} />
      <div className="-mx-1 mb-5 overflow-x-auto px-1 pb-1">
        <PillTabs<ItemTab> className="flex-nowrap" value={tab} onChange={setTab} items={(['services', 'products', 'memberships', 'packages', 'gift_cards'] as const).map((k) => ({ value: k, label: t(`clients.items.${k}`), count: counts[k] || undefined }))} />
      </div>
      <div className="flex flex-col gap-3">
        {tab === 'services' && data.services.slice(0, 80).map(({ sale, item }) => row(item.id, item.name, `${format(parseISO(sale.createdAt), 'EEE d MMM')} · ${t('clients.items.with', { name: memberName(item.teamMemberId) })}`, money(item.unitPrice * item.quantity), () => drawer.open('sale', { id: sale.id })))}
        {tab === 'products' && data.products.slice(0, 80).map(({ sale, item }) => row(item.id, `${item.quantity > 1 ? `${item.quantity} × ` : ''}${item.name}`, format(parseISO(sale.createdAt), 'EEE d MMM yyyy'), money(item.unitPrice * item.quantity), () => drawer.open('sale', { id: sale.id })))}
        {tab === 'memberships' &&
          data.memberships.map((m) =>
            row(m.id, membershipDefs.find((d) => d.id === m.membershipId)?.name ?? '', t('clients.items.nextBilling', { date: m.nextBillingAt ? format(parseISO(m.nextBillingAt), 'd MMM yyyy') : '–' }), money(m.price), m.saleId ? () => drawer.open('sale', { id: m.saleId }) : undefined, statusChip(m.status)),
          )}
        {tab === 'packages' &&
          data.packages.map((p) =>
            row(p.id, packageDefs.find((d) => d.id === p.packageId)?.name ?? '', t('clients.items.expires', { date: format(parseISO(p.expiresAt), 'd MMM yyyy') }), money(p.price), p.saleId ? () => drawer.open('sale', { id: p.saleId }) : undefined, statusChip(p.status)),
          )}
        {tab === 'gift_cards' &&
          data.giftCards.map((g) => (
            <button key={g.id} type="button" onClick={() => drawer.open('gift-card', { id: g.id })} className="text-left">
              {row(g.id, `${t('clients.items.giftCard')} ${g.code}`, t('clients.items.balance', { balance: money(g.balance), value: money(g.value) }), money(g.value), undefined, statusChip(g.status))}
            </button>
          ))}
        {counts[tab] === 0 && <PanelEmpty icon={<Receipt size={24} aria-hidden />} title={t('clients.items.emptyTitle')} body={t(`clients.items.empty.${tab}`)} />}
      </div>
    </>
  )
}
