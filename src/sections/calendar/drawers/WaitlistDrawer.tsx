import clsx from 'clsx'
import { addDays, parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowDownUp, ArrowLeft, CalendarCheck, CalendarDays, ChevronRight, Pencil, PersonStanding, Plus, RefreshCw, Search, SmilePlus, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Select, TextArea, UnderlineTabs, confirm, toast } from '@/components/ui'
import { removeWaitlistEntry, saveWaitlistEntry } from '@/api/appointments'
import { crud } from '@/api/client'
import { updateExt, useExt } from '@/api/ext'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { fullName, money } from '@/lib/format'
import { durationLong, todayISO, toISODate } from '@/lib/time'
import type { ID, ISODate, Service, ServiceAddOn, WaitlistEntry } from '@/types'
import { AddClientModal } from '../appointment/ClientPanel'
import { ServicePicker, useCategoryEdge } from '../appointment/ServicePanels'
import { TEAM_PARAM, useCalendarParams, useLocationMembers } from '../hooks'
import { clockOptions, memberName } from '../lib'
import { ClientAvatar, Dropdown, DropMenu, MonthsPicker } from '../ui'
import { WAITLIST_ADDONS, type WaitlistAddOns } from './AppointmentDrawers'
import { CountChip, DrawerShell, PillTrigger, RoundButton, SelectButton } from './Shell'

type Period = 'all' | 'today' | '3d' | '7d' | '30d' | 'calendar'
type SortKey = 'created_asc' | 'created_desc' | 'price_desc' | 'price_asc' | 'requested_asc' | 'requested_desc'
type Tab = 'waiting' | 'expired' | 'booked'
type Pref = WaitlistEntry['preferences'][number]
interface FormItem {
  serviceId: ID
  variantId?: ID
  teamMemberId: ID | null
  addOns: ServiceAddOn[]
}
interface FormState {
  clientId: ID | null
  walkIn: boolean
  prefs: Pref[]
  items: FormItem[]
  notes: string
}

const PERIODS: Period[] = ['all', 'today', '3d', '7d', '30d']
const SORTS: SortKey[] = ['created_asc', 'created_desc', 'price_desc', 'price_asc', 'requested_asc', 'requested_desc']
const END_OF_DAY = '23:59'
const RANGES = { morning: ['06:00', '12:00'], afternoon: ['12:00', '17:00'], evening: ['17:00', END_OF_DAY] } as const

/** "06:00 – 12:00" (end of day shows as 00:00) or "Any time". */
const rangeText = (p: Pick<Pref, 'from' | 'to'>, anyTime: string) => (p.from && p.to ? `${p.from} – ${p.to === END_OF_DAY ? '00:00' : p.to}` : anyTime)

/** Waiting entries whose preferred dates have all passed count as expired. */
export const waitlistStatus = (w: WaitlistEntry, today: ISODate): Tab => (w.status === 'waiting' && w.preferences.length > 0 && w.preferences.every((p) => p.date < today) ? 'expired' : w.status)

/** Waitlist drawer (calendar.md §5): entries, filters and the add / edit flows. */
export function WaitlistDrawer() {
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'form'; id?: ID }>({ kind: 'list' })
  if (view.kind === 'form') return <WaitlistForm key={view.id ?? 'new'} entryId={view.id} onDone={() => setView({ kind: 'list' })} />
  return <WaitlistList onAdd={() => setView({ kind: 'form' })} onEdit={(id) => setView({ kind: 'form', id })} />
}

// ─── List ──────────────────────────────────────────────────────────────

function WaitlistList({ onAdd, onEdit }: { onAdd: () => void; onEdit: (id: ID) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const { date: calendarDate, locationId } = useCalendarParams()
  const entries = useDb((s) => s.waitlist)
  const services = useDb((s) => s.services)
  const appointments = useDb((s) => s.appointments)
  const addOnsByEntry = useExt<WaitlistAddOns>('calendar', WAITLIST_ADDONS, {})
  const [period, setPeriod] = useState<Period>('all')
  const [sort, setSort] = useState<SortKey>('created_asc')
  const [tab, setTab] = useState<Tab>('waiting')
  const today = todayISO()

  const priceOf = (w: WaitlistEntry) =>
    w.items.reduce((sum, it, i) => {
      const service = services.find((s) => s.id === it.serviceId)
      const variant = service?.variants.find((v) => v.id === it.variantId)
      return sum + (variant?.price ?? service?.price ?? 0) + (addOnsByEntry[w.id]?.[i] ?? []).reduce((x, o) => x + o.price, 0)
    }, 0)
  const firstDate = (w: WaitlistEntry) => [...w.preferences].map((p) => p.date).sort()[0] ?? ''

  const range = useMemo((): [ISODate, ISODate] | null => {
    const plus = (n: number) => toISODate(addDays(parseISO(today), n))
    switch (period) {
      case 'today':
        return [today, today]
      case '3d':
        return [today, plus(2)]
      case '7d':
        return [today, plus(6)]
      case '30d':
        return [today, plus(29)]
      case 'calendar':
        return [calendarDate, calendarDate]
      default:
        return null
    }
  }, [period, today, calendarDate])

  const byTab = useMemo(() => {
    const inRange = (w: WaitlistEntry) => {
      if (!range) return true
      const dates = w.preferences.map((p) => p.date)
      const booked = w.appointmentId ? appointments.find((a) => a.id === w.appointmentId)?.date : undefined
      if (booked) dates.push(booked)
      return dates.some((d) => d >= range[0] && d <= range[1])
    }
    const result: Record<Tab, WaitlistEntry[]> = { waiting: [], expired: [], booked: [] }
    for (const w of entries) {
      const status = waitlistStatus(w, today)
      // "All upcoming" lists upcoming waiting entries and every expired or booked one.
      if (status === 'waiting' && !range && !w.preferences.some((p) => p.date >= today)) continue
      if (!inRange(w)) continue
      result[status].push(w)
    }
    const cmp = (a: WaitlistEntry, b: WaitlistEntry) => {
      switch (sort) {
        case 'created_desc':
          return b.createdAt.localeCompare(a.createdAt)
        case 'price_desc':
          return priceOf(b) - priceOf(a)
        case 'price_asc':
          return priceOf(a) - priceOf(b)
        case 'requested_asc':
          return firstDate(a).localeCompare(firstDate(b))
        case 'requested_desc':
          return firstDate(b).localeCompare(firstDate(a))
        default:
          return a.createdAt.localeCompare(b.createdAt)
      }
    }
    ;(Object.keys(result) as Tab[]).forEach((k) => result[k].sort(cmp))
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, range, sort, today, appointments, services, addOnsByEntry])

  const list = byTab[tab]

  const bookNow = (w: WaitlistEntry) => {
    const date = [...w.preferences].map((p) => p.date).filter((d) => d >= today).sort()[0] ?? today
    navigate(`/calendar/book-from-waitlist-entry/${w.id}?${new URLSearchParams({ date, view: 'day', location_id: locationId, [TEAM_PARAM]: 'e-working' }).toString()}`)
  }

  const remove = async (w: WaitlistEntry, name: string) => {
    if (!(await confirm({ title: t('calendar.waitlist.remove'), body: t('calendar.waitlist.removeBody', { name }), confirmLabel: t('calendar.waitlist.removeConfirm'), tone: 'danger' }))) return
    await removeWaitlistEntry(w.id)
    updateExt<WaitlistAddOns>('calendar', WAITLIST_ADDONS, {}, (cur) => {
      const next = { ...cur }
      delete next[w.id]
      return next
    })
    toast(t('calendar.toasts.waitlistRemoved'))
  }

  const periodLabel = period === 'calendar' ? format(parseISO(calendarDate), 'EEE d MMM') : t(`calendar.waitlist.period.${period}`)

  return (
    <DrawerShell
      testId="waitlist-drawer"
      title={t('calendar.waitlist.title')}
      headerRight={
        <>
          <DropMenu
            align="right"
            width={220}
            trigger={({ open, toggle }) => <RoundButton size={44} onClick={toggle} aria-expanded={open} aria-label={t('calendar.waitlist.more')} data-testid="waitlist-more" />}
            groups={[
              {
                items: [
                  { label: t('calendar.waitlist.viewReports'), onSelect: () => navigate('/reports/table/waitlist-detail') },
                  { label: t('calendar.waitlist.settings'), onSelect: () => navigate('/setup/scheduling/waitlist') },
                ],
              },
            ]}
          />
          <Button variant="primary" className="h-11 rounded-full px-5" onClick={onAdd} data-testid="waitlist-add">
            {t('calendar.waitlist.add')}
          </Button>
        </>
      }
      above={null}
      bodyClassName="!px-0 !pb-0"
    >
      <div className="flex min-h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-8">
          <Dropdown
            width={250}
            trigger={({ open, toggle }) => (
              <PillTrigger open={open} onClick={toggle} data-testid="waitlist-period">
                {periodLabel}
              </PillTrigger>
            )}
            panelClassName="p-1.5"
          >
            {(closeMenu) => (
              <div role="menu">
                {PERIODS.map((p) => (
                  <MenuRow
                    key={p}
                    checked={period === p}
                    onClick={() => {
                      setPeriod(p)
                      closeMenu()
                    }}
                  >
                    {t(`calendar.waitlist.period.${p}`)}
                  </MenuRow>
                ))}
                <div className="mx-3 my-1 border-t border-line" />
                <MenuRow
                  checked={period === 'calendar'}
                  hint={t('calendar.waitlist.period.calendarDate')}
                  onClick={() => {
                    setPeriod('calendar')
                    closeMenu()
                  }}
                >
                  {format(parseISO(calendarDate), 'EEE d MMM')}
                </MenuRow>
              </div>
            )}
          </Dropdown>
          <Dropdown
            align="right"
            width={290}
            trigger={({ open, toggle }) => (
              <PillTrigger open={open} onClick={toggle} icon={<ArrowDownUp size={16} aria-hidden />} aria-label={`${t('calendar.waitlist.sortLabel')}: ${t(`calendar.waitlist.sort.${sort}`)}`} data-testid="waitlist-sort">
                {t(`calendar.waitlist.sort.${sort}`)}
              </PillTrigger>
            )}
            panelClassName="p-1.5"
          >
            {(closeMenu) => (
              <div role="menu">
                {SORTS.map((s) => (
                  <MenuRow
                    key={s}
                    checked={sort === s}
                    onClick={() => {
                      setSort(s)
                      closeMenu()
                    }}
                  >
                    {t(`calendar.waitlist.sort.${s}`)}
                  </MenuRow>
                ))}
              </div>
            )}
          </Dropdown>
        </div>
        <UnderlineTabs
          className="mt-6 px-8"
          value={tab}
          onChange={setTab}
          items={(['waiting', 'expired', 'booked'] as Tab[]).map((k) => ({ value: k, label: t(`calendar.waitlist.tabs.${k}`), count: byTab[k].length }))}
        />
        <div className="flex-1 bg-sunken px-8 py-6" data-testid="waitlist-list">
          {list.length ? (
            <>
              <h3 className="mb-4 flex items-center gap-2 text-body-lg font-semibold text-ink">
                {t(`calendar.waitlist.sections.${tab}`)} <CountChip value={list.length} className="bg-surface" />
              </h3>
              <div className="flex flex-col gap-4">
                {list.map((w) => (
                  <WaitlistCard
                    key={w.id}
                    entry={w}
                    tab={tab}
                    addOns={addOnsByEntry[w.id] ?? []}
                    onBook={() => bookNow(w)}
                    onEdit={() => onEdit(w.id)}
                    onRemove={(name) => void remove(w, name)}
                    onViewAppointment={() => w.appointmentId && drawer.open('appointment', { id: w.appointmentId })}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState className="mt-16" icon={<CalendarCheck size={28} />} title={t('calendar.waitlist.emptyTitle')} body={t('calendar.waitlist.emptyBody')} />
          )}
        </div>
      </div>
    </DrawerShell>
  )
}

function MenuRow({ checked, hint, onClick, children }: { checked?: boolean; hint?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-body text-ink hover:bg-sunken">
      <span>
        <span className="block">{children}</span>
        {hint && <span className="block text-small text-muted">{hint}</span>}
      </span>
      {checked && <span className="text-ink">✓</span>}
    </button>
  )
}

function WaitlistCard({ entry, tab, addOns, onBook, onEdit, onRemove, onViewAppointment }: { entry: WaitlistEntry; tab: Tab; addOns: ServiceAddOn[][]; onBook: () => void; onEdit: () => void; onRemove: (name: string) => void; onViewAppointment: () => void }) {
  const { t } = useTranslation()
  const client = useDb((s) => (entry.clientId ? s.clients.find((c) => c.id === entry.clientId) : undefined))
  const services = useDb((s) => s.services)
  const members = useDb((s) => s.teamMembers)
  const appointment = useDb((s) => (entry.appointmentId ? s.appointments.find((a) => a.id === entry.appointmentId) : undefined))
  const name = fullName(client, t('calendar.walkIn'))
  return (
    <div className="rounded-xl border border-line bg-surface p-6" data-testid="waitlist-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body-lg text-ink">{name}</p>
          {client?.email && <p className="truncate text-body text-muted">{client.email}</p>}
        </div>
        <ClientAvatar name={client?.firstName} photo={client?.photo} walkIn={!client} size={56} />
      </div>
      <ul className="mt-4 flex flex-col gap-1.5">
        {entry.preferences.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-body text-muted">
            <CalendarDays size={16} aria-hidden />
            {format(parseISO(p.date), 'MMM d')}, {rangeText(p, t('calendar.waitlist.anyTime'))}
          </li>
        ))}
      </ul>
      <div className="my-4 border-t border-line" />
      <div className="flex flex-col gap-3">
        {entry.items.map((it, i) => {
          const service = services.find((s) => s.id === it.serviceId)
          const variant = service?.variants.find((v) => v.id === it.variantId)
          const extras = addOns[i] ?? []
          return (
            <div key={i}>
              <div className="flex items-start justify-between gap-3 text-body-lg text-ink">
                <span>{variant ? `${service?.name} · ${variant.name}` : service?.name}</span>
                <span>{money((variant?.price ?? service?.price ?? 0) + extras.reduce((s, o) => s + o.price, 0))}</span>
              </div>
              <p className="text-body text-muted">
                {durationLong((variant?.durationMin ?? service?.durationMin ?? 0) + extras.reduce((s, o) => s + o.durationMin, 0))} • {it.teamMemberId ? memberName(members.find((m) => m.id === it.teamMemberId)) : t('calendar.waitlist.anyMember')}
              </p>
              {extras.length > 0 && <p className="text-small text-muted">{t('calendar.waitlist.addOnsLine', { names: extras.map((o) => o.name).join(', ') })}</p>}
            </div>
          )
        })}
      </div>
      {entry.notes && <p className="mt-3 text-small italic text-muted">{entry.notes}</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <DropMenu
          width={240}
          trigger={({ open, toggle }) => (
            <PillTrigger open={open} onClick={toggle} data-testid="waitlist-actions">
              {t('calendar.waitlist.actions')}
            </PillTrigger>
          )}
          groups={[
            {
              items:
                tab === 'booked'
                  ? [{ label: t('calendar.waitlist.viewAppointment'), icon: <CalendarCheck size={16} />, disabled: !appointment, onSelect: onViewAppointment }]
                  : [
                      ...(tab === 'waiting' ? [{ label: t('calendar.waitlist.bookNow'), icon: <CalendarDays size={16} />, onSelect: onBook }] : []),
                      { label: t('calendar.waitlist.editPreferences'), icon: <Pencil size={16} />, onSelect: onEdit },
                    ],
            },
            { items: [{ label: t('calendar.waitlist.remove'), danger: true, onSelect: () => onRemove(name) }] },
          ]}
        />
        {tab === 'booked' && appointment && <span className="chip bg-success-subtle text-success">{t('calendar.waitlist.bookedFor', { date: format(parseISO(appointment.date), 'EEE d MMM') })}</span>}
        {tab === 'expired' && <span className="chip bg-sunken text-muted">{t('calendar.waitlist.tabs.expired')}</span>}
      </div>
    </div>
  )
}

// ─── Add / edit ────────────────────────────────────────────────────────

type Panel = 'client' | 'datetime' | 'service' | 'addons' | 'summary' | 'edit-service'
const STEPS: Panel[] = ['client', 'datetime', 'service', 'addons']

function WaitlistForm({ entryId, onDone }: { entryId?: ID; onDone: () => void }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const { locationId } = useCalendarParams()
  const existing = useDb((s) => (entryId ? s.waitlist.find((w) => w.id === entryId) : undefined))
  const services = useDb((s) => s.services)
  const clients = useDb((s) => s.clients)
  const storedAddOns = useExt<WaitlistAddOns>('calendar', WAITLIST_ADDONS, {})
  const members = useLocationMembers(locationId)
  const edge = useCategoryEdge()
  const today = todayISO()
  const isEdit = Boolean(existing)

  const initial = useMemo<FormState>(
    () =>
      existing
        ? {
            clientId: existing.clientId,
            walkIn: !existing.clientId,
            prefs: existing.preferences.map((p) => ({ ...p })),
            items: existing.items.map((it, i) => ({ ...it, addOns: storedAddOns[existing.id]?.[i] ?? [] })),
            notes: existing.notes,
          }
        : { clientId: null, walkIn: false, prefs: [{ date: today }], items: [], notes: '' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [form, setForm] = useState<FormState>(initial)
  const [panel, setPanel] = useState<Panel>(isEdit ? 'summary' : 'client')
  const [stepsDone, setStepsDone] = useState(isEdit)
  const [index, setIndex] = useState<number | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const changed = JSON.stringify(form) !== JSON.stringify(initial)
  const client = clients.find((c) => c.id === form.clientId)

  const serviceOf = (id: ID) => services.find((s) => s.id === id)
  const eligible = (serviceId: ID) => {
    const service = serviceOf(serviceId)
    return members.filter((m) => !service || ((m.serviceIds === 'all' || m.serviceIds.includes(service.id)) && (service.teamMemberIds === 'all' || service.teamMemberIds.includes(m.id))))
  }

  const pickService = (service: Service, variantId?: ID) => {
    if (replacing && index !== null) {
      const old = form.items[index]
      const keep = old.teamMemberId && eligible(service.id).some((m) => m.id === old.teamMemberId) ? old.teamMemberId : null
      setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { serviceId: service.id, variantId, teamMemberId: keep, addOns: [] } : it)) }))
      setReplacing(false)
      setPanel(service.addOnGroups.length ? 'addons' : 'edit-service')
      return
    }
    const next = form.items.length
    setForm((f) => ({ ...f, items: [...f.items, { serviceId: service.id, variantId, teamMemberId: null, addOns: [] }] }))
    setIndex(next)
    if (service.addOnGroups.length) setPanel('addons')
    else {
      setStepsDone(true)
      setPanel('summary')
    }
  }

  const save = async () => {
    if (!form.items.length) return toast(t('calendar.waitlist.needService'), 'error')
    if (!form.prefs.length) return toast(t('calendar.waitlist.needTime'), 'error')
    setBusy(true)
    try {
      const saved = await saveWaitlistEntry({
        id: existing?.id,
        clientId: form.clientId,
        preferences: form.prefs,
        items: form.items.map(({ serviceId, variantId, teamMemberId }) => ({ serviceId, variantId, teamMemberId })),
        notes: form.notes.trim(),
        source: existing?.source ?? 'in_person',
        appointmentId: existing?.appointmentId,
      })
      updateExt<WaitlistAddOns>('calendar', WAITLIST_ADDONS, {}, (cur) => ({ ...cur, [saved.id]: form.items.map((i) => i.addOns) }))
      // New preferred dates bring an expired entry back to the waiting list.
      if (existing && waitlistStatus(existing, today) === 'expired' && form.prefs.some((p) => p.date >= today)) await crud('waitlist').update(saved.id, { status: 'waiting' })
      toast(t(isEdit ? 'calendar.toasts.waitlistUpdated' : 'calendar.toasts.waitlistAdded'))
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const backButton = (onClick: () => void) => (
    <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onClick} className="mb-4 self-start rounded-full" data-testid="waitlist-back">
      {t('calendar.waitlist.back')}
    </Button>
  )

  // Breadcrumb for the first pass (Client › Date and time › Service › Service add-ons).
  const crumbs = !stepsDone && STEPS.includes(panel) && (
    <nav className="mb-2 flex flex-wrap items-center gap-2 text-body" aria-label={t('calendar.waitlist.steps.label')}>
      {STEPS.map((step, i) => {
        const current = STEPS.indexOf(panel)
        const label = t(`calendar.waitlist.steps.${step}`)
        return (
          <span key={step} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={14} className="text-muted" aria-hidden />}
            {i < current && step !== 'addons' ? (
              <button type="button" onClick={() => setPanel(step)} className="text-muted hover:text-ink hover:underline">
                {label}
              </button>
            ) : (
              <span className={clsx(i === current ? 'font-semibold text-ink' : 'text-muted')} aria-current={i === current ? 'step' : undefined}>
                {label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )

  if (panel === 'client')
    return (
      <DrawerShell testId="waitlist-form" above={<div className="px-8 pt-8">{crumbs}</div>} title={undefined}>
        {stepsDone && backButton(() => setPanel('summary'))}
        <ClientStep
          onPick={(clientId, walkIn) => {
            setForm((f) => ({ ...f, clientId, walkIn }))
            setPanel(stepsDone ? 'summary' : 'datetime')
          }}
        />
      </DrawerShell>
    )

  if (panel === 'datetime')
    return (
      <DrawerShell
        testId="waitlist-form"
        above={<div className="px-8 pt-8">{crumbs}</div>}
        footer={
          <Button variant="primary" size="lg" className="w-full rounded-full" disabled={!form.prefs.length} onClick={() => setPanel('service')} data-testid="waitlist-next">
            {t('calendar.waitlist.next')}
          </Button>
        }
      >
        <h2 className="mb-6 font-display text-title-1 text-ink">{t('calendar.waitlist.selectDateTime')}</h2>
        <PreferenceRows prefs={form.prefs} onChange={(prefs) => setForm((f) => ({ ...f, prefs }))} />
      </DrawerShell>
    )

  if (panel === 'service')
    return (
      <DrawerShell testId="waitlist-form" above={<div className="px-8 pt-8">{crumbs}</div>}>
        {stepsDone && backButton(() => (replacing ? (setReplacing(false), setPanel('edit-service')) : setPanel('summary')))}
        <ServicePicker locationId={locationId} onPick={pickService} />
      </DrawerShell>
    )

  if (panel === 'addons' && index !== null && form.items[index]) {
    const item = form.items[index]
    const service = serviceOf(item.serviceId)
    return (
      <AddOnsStep
        crumbs={crumbs}
        service={service}
        value={item.addOns}
        onBack={stepsDone ? () => setPanel('summary') : undefined}
        onContinue={(addOns) => {
          setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, addOns } : it)) }))
          setStepsDone(true)
          setPanel('summary')
        }}
      />
    )
  }

  if (panel === 'edit-service' && index !== null && form.items[index]) {
    const item = form.items[index]
    return (
      <EditWaitlistService
        item={item}
        service={serviceOf(item.serviceId)}
        edgeColor={edge(item.serviceId)}
        members={eligible(item.serviceId)}
        onBack={() => setPanel('summary')}
        onChangeService={() => {
          setReplacing(true)
          setPanel('service')
        }}
        onApply={(teamMemberId) => {
          setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, teamMemberId } : it)) }))
          setPanel('summary')
        }}
      />
    )
  }

  // Summary: "New waitlist entry" / "Edit waitlist entry".
  return (
    <DrawerShell
      testId="waitlist-form"
      above={isEdit ? <div className="px-8 pt-6">{backButton(onDone)}</div> : null}
      title={t(isEdit ? 'calendar.waitlist.editTitle' : 'calendar.waitlist.newTitle')}
      footer={
        <Button variant="primary" size="lg" className="w-full rounded-full" loading={busy} disabled={!form.items.length || !form.prefs.length || (isEdit && !changed)} onClick={() => void save()} data-testid="waitlist-save">
          {t('calendar.waitlist.save')}
        </Button>
      }
    >
      {!isEdit && (
        <div className="mb-8 rounded-xl border border-line p-6" data-testid="waitlist-client-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-body-lg font-semibold text-ink">{fullName(client, t('calendar.walkIn'))}</p>
              {client?.email && <p className="truncate text-body text-muted">{client.email}</p>}
            </div>
            <ClientAvatar name={client?.firstName} photo={client?.photo} walkIn={!client} size={64} />
          </div>
          <div className="mt-4">
            <DropMenu
              width={220}
              trigger={({ open, toggle }) => (
                <PillTrigger open={open} onClick={toggle}>
                  {t('calendar.waitlist.actions')}
                </PillTrigger>
              )}
              groups={[
                {
                  items: [
                    ...(client ? [{ label: t('calendar.waitlist.viewProfile'), icon: <SmilePlus size={16} />, onSelect: () => drawer.open('client', { id: client.id }) }] : []),
                    { label: t('calendar.waitlist.changeClient'), icon: <RefreshCw size={16} />, onSelect: () => setPanel('client') },
                  ],
                },
              ]}
            />
          </div>
        </div>
      )}
      <h3 className="mb-4 text-title-3 font-semibold text-ink">{t('calendar.waitlist.preferred')}</h3>
      <PreferenceRows prefs={form.prefs} onChange={(prefs) => setForm((f) => ({ ...f, prefs }))} />
      <h3 className="mb-4 mt-10 text-title-3 font-semibold text-ink">{t('calendar.waitlist.services')}</h3>
      <div className="flex flex-col gap-5">
        {form.items.map((item, i) => {
          const service = serviceOf(item.serviceId)
          const variant = service?.variants.find((v) => v.id === item.variantId)
          const extras = item.addOns
          return (
            <div key={i} className="group relative flex gap-4" data-testid="waitlist-service-line">
              <span className="w-1 shrink-0 rounded-full" style={{ background: edge(item.serviceId) }} aria-hidden />
              <button
                type="button"
                onClick={() => {
                  setIndex(i)
                  setPanel('edit-service')
                }}
                className="min-w-0 flex-1 py-1 text-left"
              >
                <span className="flex items-start justify-between gap-3 text-body-lg text-ink">
                  <span>{variant ? `${service?.name} · ${variant.name}` : service?.name}</span>
                  <span>{money((variant?.price ?? service?.price ?? 0) + extras.reduce((s, o) => s + o.price, 0))}</span>
                </span>
                <span className="block text-body text-muted">
                  {durationLong((variant?.durationMin ?? service?.durationMin ?? 0) + extras.reduce((s, o) => s + o.durationMin, 0))} • {item.teamMemberId ? memberName(members.find((m) => m.id === item.teamMemberId)) : t('calendar.waitlist.anyMember')}
                </span>
                {extras.length > 0 && <span className="block text-small text-muted">{t('calendar.waitlist.addOnsLine', { names: extras.map((o) => o.name).join(', ') })}</span>}
              </button>
              <div className="absolute -top-1 right-0 hidden gap-1 rounded-md bg-surface p-0.5 shadow-sm group-focus-within:flex group-hover:flex">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIndex(i)
                    setPanel('edit-service')
                  }}
                >
                  {t('calendar.waitlist.edit')}
                </Button>
                <Button size="sm" variant="ghost" className="!text-danger" onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, x) => x !== i) }))}>
                  {t('calendar.waitlist.removeService')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <Button icon={<Plus size={16} />} className="mt-5 rounded-full" onClick={() => setPanel('service')} data-testid="waitlist-add-service">
        {t('calendar.waitlist.addService')}
      </Button>
      <h3 className="mb-4 mt-10 text-title-3 font-semibold text-ink">{t('calendar.waitlist.notes')}</h3>
      <TextArea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={t('calendar.waitlist.notesPlaceholder')} aria-label={t('calendar.waitlist.notes')} maxLength={1000} className="min-h-[140px]" />
    </DrawerShell>
  )
}

function ClientStep({ onPick }: { onPick: (clientId: ID | null, walkIn: boolean) => void }) {
  const { t } = useTranslation()
  const clients = useDb((s) => s.clients)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const live = clients.filter((c) => !c.deletedAt)
    const hits = q ? live.filter((c) => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(q)) : live
    return [...hits].sort((a, b) => fullName(a).localeCompare(fullName(b))).slice(0, 50)
  }, [clients, query])
  const row = (key: string, avatar: ReactNode, title: ReactNode, sub: ReactNode, onClick: () => void, testId?: string) => (
    <button key={key} type="button" onClick={onClick} className="flex w-full items-center gap-5 rounded-lg px-2 py-3 text-left hover:bg-sunken" data-testid={testId}>
      {avatar}
      <span className="min-w-0">
        <span className="block truncate text-body-strong text-ink">{title}</span>
        {sub && <span className="block truncate text-body text-muted">{sub}</span>}
      </span>
    </button>
  )
  const circle = (icon: ReactNode) => <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">{icon}</span>
  return (
    <div>
      <h2 className="mb-6 font-display text-title-1 text-ink">{t('calendar.waitlist.selectClient')}</h2>
      <label className="relative mb-4 block">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !query.trim()) onPick(null, true)
          }}
          placeholder={t('calendar.waitlist.searchClient')}
          aria-label={t('calendar.waitlist.searchClient')}
          className="input h-14 pl-12"
          data-testid="waitlist-client-search"
        />
      </label>
      {row('add', circle(<Plus size={24} aria-hidden />), t('calendar.waitlist.addNewClient'), null, () => setAdding(true))}
      {row('walk', circle(<PersonStanding size={24} aria-hidden />), t('calendar.waitlist.walkIn'), null, () => onPick(null, true), 'waitlist-walkin')}
      <div className="my-2 border-t border-line" />
      {results.map((c) => row(c.id, <ClientAvatar name={c.firstName} photo={c.photo} size={64} />, fullName(c), c.email || c.phone, () => onPick(c.id, false), 'waitlist-client-option'))}
      {!results.length && <p className="px-2 py-4 text-body text-muted">{t('calendar.waitlist.noClients')}</p>}
      <AddClientModal open={adding} initialQuery={query} onClose={() => setAdding(false)} onCreated={(id) => onPick(id, false)} />
    </div>
  )
}

/** Preferred date + start time rows with "Add another time". */
function PreferenceRows({ prefs, onChange }: { prefs: Pref[]; onChange: (prefs: Pref[]) => void }) {
  const { t } = useTranslation()
  const today = todayISO()
  const set = (i: number, patch: Partial<Pref>) => onChange(prefs.map((p, x) => (x === i ? { ...p, ...patch } : p)))
  return (
    <div className="flex flex-col gap-4" data-testid="waitlist-prefs">
      <div className={clsx('grid gap-4 text-body-strong text-ink', prefs.length > 1 ? 'grid-cols-[1fr_1fr_40px]' : 'grid-cols-2')}>
        <span>{t('calendar.waitlist.date')}</span>
        <span>{t('calendar.waitlist.startTime')}</span>
      </div>
      {prefs.map((p, i) => (
        <div key={i} className={clsx('-mt-2 grid items-center gap-4', prefs.length > 1 ? 'grid-cols-[1fr_1fr_40px]' : 'grid-cols-2')}>
          <Dropdown
            className="w-full"
            trigger={({ open, toggle }) => (
              <SelectButton open={open} onClick={toggle} className="w-full" aria-label={t('calendar.waitlist.date')}>
                {format(parseISO(p.date), 'EEE, MMM d')}
              </SelectButton>
            )}
            panelClassName="p-5"
          >
            {(close) => (
              <MonthsPicker
                months={1}
                value={p.date}
                isDisabled={(d) => d < today}
                onSelect={(date) => {
                  set(i, { date })
                  close()
                }}
              />
            )}
          </Dropdown>
          <Dropdown
            className="w-full"
            align="right"
            width={417}
            trigger={({ open, toggle }) => (
              <SelectButton open={open} onClick={toggle} className="w-full" aria-label={t('calendar.waitlist.startTime')}>
                {rangeText(p, t('calendar.waitlist.anyTime'))}
              </SelectButton>
            )}
            panelClassName="p-4"
          >
            {(close) => (
              <TimeRangePanel
                value={p}
                onApply={(from, to) => {
                  set(i, { from, to })
                  close()
                }}
              />
            )}
          </Dropdown>
          {prefs.length > 1 && (
            <button type="button" onClick={() => onChange(prefs.filter((_, x) => x !== i))} aria-label={t('calendar.waitlist.deleteTime')} title={t('calendar.waitlist.deleteTime')} className="icon-btn h-10 w-10">
              <Trash2 size={20} aria-hidden />
            </button>
          )}
        </div>
      ))}
      <Button icon={<Plus size={16} />} className="self-start rounded-full" onClick={() => onChange([...prefs, { date: prefs[prefs.length - 1]?.date ?? today }])} data-testid="waitlist-add-time">
        {t('calendar.waitlist.addTime')}
      </Button>
    </div>
  )
}

const FROM_OPTIONS = clockOptions(15)
const TO_OPTIONS = [...clockOptions(15, 15), END_OF_DAY]

/** Start time popover: Any time / Morning / Afternoon / Evening, From–To, Clear and Apply. */
function TimeRangePanel({ value, onApply }: { value: Pick<Pref, 'from' | 'to'>; onApply: (from?: string, to?: string) => void }) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(value.from ?? '')
  const [to, setTo] = useState(value.to ?? '')
  const invalid = Boolean(from && to && to <= from)
  const preset = !from && !to ? 'any' : (Object.entries(RANGES).find(([, [a, b]]) => a === from && b === to)?.[0] ?? null)
  const chip = (key: 'any' | keyof typeof RANGES) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        if (key === 'any') {
          setFrom('')
          setTo('')
        } else {
          setFrom(RANGES[key][0])
          setTo(RANGES[key][1])
        }
      }}
      aria-pressed={preset === key}
      className={clsx('h-9 whitespace-nowrap rounded-full border px-3 text-body transition-colors', preset === key ? 'border-primary bg-primary text-on-primary' : 'border-line-strong text-ink hover:bg-sunken')}
    >
      {t(`calendar.waitlist.time.${key}`)}
    </button>
  )
  return (
    <div className="flex flex-col gap-4" data-testid="waitlist-time-panel">
      <div className="flex gap-1.5">{(['any', 'morning', 'afternoon', 'evening'] as const).map(chip)}</div>
      <div className="grid grid-cols-2 gap-3">
        <Select aria-label={t('calendar.waitlist.time.from')} value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t('calendar.waitlist.time.from')} options={FROM_OPTIONS} />
        <Select aria-label={t('calendar.waitlist.time.to')} value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('calendar.waitlist.time.to')} options={TO_OPTIONS.map((o) => ({ value: o, label: o === END_OF_DAY ? '00:00' : o }))} />
      </div>
      {invalid && <p className="-mt-2 text-small text-danger">{t('calendar.waitlist.time.rangeError')}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setFrom('')
            setTo('')
            onApply(undefined, undefined)
          }}
        >
          {t('calendar.waitlist.time.clear')}
        </Button>
        <Button variant="primary" className="rounded-full" disabled={invalid} onClick={() => (from || to ? onApply(from || '00:00', to || END_OF_DAY) : onApply(undefined, undefined))} data-testid="waitlist-time-apply">
          {t('calendar.waitlist.time.apply')}
        </Button>
      </div>
    </div>
  )
}

/** Step 4 "Service add-ons": optional extras of the chosen service. */
function AddOnsStep({ crumbs, service, value, onBack, onContinue }: { crumbs: ReactNode; service?: Service; value: ServiceAddOn[]; onBack?: () => void; onContinue: (addOns: ServiceAddOn[]) => void }) {
  const { t } = useTranslation()
  const [chosen, setChosen] = useState<ServiceAddOn[]>(value)
  const groups = service?.addOnGroups ?? []
  const missing = groups.some((g) => g.required && !g.options.some((o) => chosen.some((c) => c.id === o.id)))
  const toggle = (groupId: string, option: ServiceAddOn, multiple: boolean) =>
    setChosen((cur) => {
      const group = groups.find((g) => g.id === groupId)
      const has = cur.some((c) => c.id === option.id)
      if (multiple) return has ? cur.filter((c) => c.id !== option.id) : [...cur, option]
      const others = cur.filter((c) => !group?.options.some((o) => o.id === c.id))
      return has ? others : [...others, option]
    })
  return (
    <DrawerShell
      testId="waitlist-form"
      above={<div className="px-8 pt-8">{crumbs}</div>}
      footer={
        <Button variant="primary" size="lg" className="w-full rounded-full" disabled={missing} onClick={() => onContinue(chosen)} data-testid="waitlist-addons-continue">
          {t('calendar.waitlist.continue')}
        </Button>
      }
    >
      {onBack && (
        <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} className="mb-4 rounded-full">
          {t('calendar.waitlist.back')}
        </Button>
      )}
      <h2 className="font-display text-title-1 text-ink">{t('calendar.waitlist.selectAddOns')}</h2>
      <p className="mt-1 text-body text-muted">{t('calendar.waitlist.addOnsFor', { service: service?.name ?? '' })}</p>
      <div className="mt-6 flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.id}>
            <h3 className="flex items-center gap-2 text-body-lg font-semibold text-ink">
              {g.name}
              <span className="chip bg-sunken text-caption text-muted">{g.required ? t('calendar.waitlist.required') : t(g.multiple ? 'calendar.waitlist.chooseAny' : 'calendar.waitlist.chooseOne')}</span>
            </h3>
            <div className="mt-2 flex flex-col">
              {g.options.map((o) => {
                const checked = chosen.some((c) => c.id === o.id)
                return (
                  <label key={o.id} className="flex cursor-pointer items-center gap-3 border-b border-line py-3 last:border-b-0">
                    <input type={g.multiple ? 'checkbox' : 'radio'} name={g.id} checked={checked} onChange={() => toggle(g.id, o, g.multiple)} onClick={() => !g.multiple && checked && toggle(g.id, o, false)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-lg text-ink">{o.name}</span>
                      {o.durationMin > 0 && <span className="block text-body text-muted">{durationLong(o.durationMin)}</span>}
                    </span>
                    <span className="text-body-lg text-ink">{money(o.price)}</span>
                  </label>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </DrawerShell>
  )
}

/** "Edit service" for a waitlist line: the service and a Team member select. */
function EditWaitlistService({ item, service, edgeColor, members, onBack, onChangeService, onApply }: { item: FormItem; service?: Service; edgeColor: string; members: ReturnType<typeof useLocationMembers>; onBack: () => void; onChangeService: () => void; onApply: (teamMemberId: ID | null) => void }) {
  const { t } = useTranslation()
  const [member, setMember] = useState<ID | null>(item.teamMemberId)
  const variant = service?.variants.find((v) => v.id === item.variantId)
  return (
    <DrawerShell
      testId="waitlist-form"
      footer={
        <Button variant="primary" size="lg" className="w-full rounded-full" onClick={() => onApply(member)} data-testid="waitlist-service-apply">
          {t('calendar.waitlist.apply')}
        </Button>
      }
      above={
        <div className="px-8 pt-6">
          <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} className="rounded-full">
            {t('calendar.waitlist.back')}
          </Button>
        </div>
      }
      title={t('calendar.waitlist.editService')}
    >
      <button type="button" onClick={onChangeService} className="flex w-full items-center gap-4 overflow-hidden rounded-lg border border-line py-5 pr-5 text-left hover:bg-sunken">
        <span className="w-1 self-stretch" style={{ background: edgeColor }} aria-hidden />
        <span className="flex-1 text-body-lg text-ink">{variant ? `${service?.name} · ${variant.name}` : service?.name}</span>
        <ChevronRight size={18} className="text-muted" aria-hidden />
      </button>
      <label className="mb-1.5 mt-6 block text-body-strong text-ink" htmlFor="waitlist-member">
        {t('calendar.waitlist.teamMember')}
      </label>
      <Select id="waitlist-member" value={member ?? ''} onChange={(e) => setMember(e.target.value || null)} options={[{ value: '', label: t('calendar.waitlist.anyMember') }, ...members.map((m) => ({ value: m.id, label: memberName(m) }))]} data-testid="waitlist-member" />
    </DrawerShell>
  )
}
