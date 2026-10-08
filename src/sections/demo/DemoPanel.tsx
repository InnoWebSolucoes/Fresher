import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { CalendarPlus, CreditCard, Gift, Inbox, MessageSquare, Package, RefreshCw, RotateCcw, Send, ShoppingBag, Star, TimerReset, UserCog, Wallet, X, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDb } from '@/store/db'
import { useSessionStore } from '@/store/session'
import { Button, Checkbox, Select, TextArea, TextInput, confirm, toast } from '@/components/ui'
import { switchUser } from '@/api/auth'
import { isLateCancellation } from '@/api/appointments'
import {
  armCardDecline,
  firstOnlineSlotFrom,
  findOnlineSlots,
  resetDemo,
  setDemoNow,
  simulateCampaignApproval,
  simulateClientCancel,
  simulateClientMessage,
  simulateClientReschedule,
  simulateGiftCardPurchase,
  simulateLowStock,
  simulateOnlineBooking,
  simulatePayout,
  simulateReview,
  simulateStoreOrder,
  upcomingAppointments,
} from '@/api/demo'
import { eligibleMembers, type Slot } from '@/lib/availability'
import { money, money2 } from '@/lib/format'
import { now, toISODate } from '@/lib/time'
import { landingPath } from '@/lib/permissions'
import type { BookingChannel, MessageLog, Review } from '@/types'

type Tab = 'simulate' | 'outbox' | 'settings'

/**
 * Presenter panel, toggled with Ctrl+Shift+D (SPEC §5). Phones and tablets have
 * no keyboard shortcut, so adding `?demo=1` to any URL opens it too (the flag is
 * then removed from the address).
 */
export function DemoPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('simulate')
  const [params, setParams] = useSearchParams()
  const demoFlag = params.get('demo')

  useEffect(() => {
    if (demoFlag === null || demoFlag === '0') return
    setOpen(true)
    if ((['simulate', 'outbox', 'settings'] as string[]).includes(demoFlag)) setTab(demoFlag as Tab)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('demo')
        return next
      },
      { replace: true },
    )
  }, [demoFlag, setParams])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = (e: Event) => {
      setOpen(true)
      const detail = (e as CustomEvent<Tab | undefined>).detail
      if (detail) setTab(detail)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('ib-open-demo', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('ib-open-demo', onOpen)
    }
  }, [])

  if (!open) return null
  return (
    // Phones: full screen, kept under confirm dialogs (z-80) so "Reset demo" can still be confirmed.
    <aside
      className="fixed inset-0 z-[75] flex flex-col overflow-hidden bg-surface shadow-lg md:inset-auto md:bottom-4 md:right-4 md:top-4 md:z-[95] md:w-[460px] md:max-w-[calc(100vw-2rem)] md:rounded-xl md:border md:border-line"
      role="dialog"
      aria-label={t('demo.title')}
      data-testid="demo-panel"
    >
      <header className="flex items-center justify-between bg-rail px-4 py-3 text-white md:px-5 md:py-4">
        <div>
          <p className="text-caption uppercase tracking-wide text-accent">{t('demo.kicker')}</p>
          <h2 className="font-display text-title-3">{t('demo.title')}</h2>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="rounded-md p-2.5 hover:bg-white/10 md:p-2">
          <X size={20} aria-hidden />
        </button>
      </header>
      <nav className="flex border-b border-line max-md:overflow-x-auto max-md:overflow-y-hidden max-md:[scrollbar-width:none]" role="tablist">
        {(['simulate', 'outbox', 'settings'] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={clsx('flex-1 border-b-2 py-3 text-body-strong max-md:flex-auto max-md:whitespace-nowrap max-md:px-4', tab === key ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink')}>
            {t(`demo.tabs.${key}`)}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'simulate' && <SimulateTab onDone={() => undefined} />}
        {tab === 'outbox' && <OutboxTab onNavigate={() => setOpen(false)} />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </aside>
  )
}

function Section({ icon: Icon, title, children, defaultOpen = false }: { icon: LucideIcon; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-2 rounded-lg border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Icon size={18} className="text-primary" aria-hidden />
        <span className="flex-1 text-body-strong">{title}</span>
        <span className="text-muted" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="flex flex-col gap-3 border-t border-line px-4 py-4">{children}</div>}
    </section>
  )
}

function useClientOptions() {
  const clients = useDb((s) => s.clients)
  return useMemo(
    () =>
      clients
        .filter((c) => !c.deletedAt && !c.blocked)
        .map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [clients],
  )
}

const randomOf = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]

function ClientSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useTranslation()
  const options = useClientOptions()
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} />
        <Button onClick={() => onChange(randomOf(options).value)} title={t('demo.random')}>
          <RefreshCw size={16} aria-hidden />
        </Button>
      </div>
    </div>
  )
}

function SimulateTab({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="mb-2 text-caption uppercase tracking-wide text-muted">{t('demo.clientActions')}</p>
      <Section icon={CalendarPlus} title={t('demo.booking.title')} defaultOpen>
        <OnlineBookingForm onDone={onDone} />
      </Section>
      <Section icon={RotateCcw} title={t('demo.reschedule.title')}>
        <RescheduleForm />
      </Section>
      <Section icon={XCircle} title={t('demo.cancel.title')}>
        <CancelForm />
      </Section>
      <Section icon={Gift} title={t('demo.giftCard.title')}>
        <GiftCardForm />
      </Section>
      <Section icon={ShoppingBag} title={t('demo.store.title')}>
        <StoreOrderForm />
      </Section>
      <Section icon={Star} title={t('demo.review.title')}>
        <ReviewForm />
      </Section>
      <Section icon={MessageSquare} title={t('demo.message.title')}>
        <MessageForm />
      </Section>
      <p className="mb-2 mt-5 text-caption uppercase tracking-wide text-muted">{t('demo.businessEvents')}</p>
      <BusinessEvents />
    </div>
  )
}

/** Online booking channels; labels are translated when the form renders. */
const CHANNELS: { value: BookingChannel; labelKey: string }[] = [
  { value: 'marketplace', labelKey: 'sales.appointments.channels.marketplace' },
  { value: 'book_now_link', labelKey: 'sales.appointments.channels.book_now_link' },
  { value: 'instagram', labelKey: 'sales.appointments.channels.instagram' },
  { value: 'facebook', labelKey: 'sales.appointments.channels.facebook' },
  { value: 'google', labelKey: 'nav.reserveWithGoogle' },
]

function SlotPicker({ slots, value, onChange }: { slots: Slot[]; value: Slot | null; onChange: (s: Slot) => void }) {
  const { t } = useTranslation()
  if (!slots.length) return <p className="text-small text-muted">{t('demo.noSlots')}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {slots.slice(0, 24).map((slot) => (
        <button key={slot.start} type="button" onClick={() => onChange(slot)} className={clsx('rounded-full px-3 py-1 text-small ring-1', value?.start === slot.start ? 'bg-primary text-on-primary ring-primary' : 'ring-line-strong hover:bg-sunken')}>
          {slot.start}
        </button>
      ))}
    </div>
  )
}

function OnlineBookingForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clients = useClientOptions()
  const services = useDb((s) => s.services)
  const teamMembers = useDb((s) => s.teamMembers)
  const locations = useDb((s) => s.locations)
  const [clientId, setClientId] = useState(() => clients[0]?.value ?? '')
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const bookable = useMemo(() => services.filter((s) => s.onlineBooking && !s.archived && s.locationIds.includes(locationId)), [services, locationId])
  const [serviceId, setServiceId] = useState(bookable[0]?.id ?? '')
  const [memberId, setMemberId] = useState('')
  const [date, setDate] = useState(toISODate(now()))
  const [channel, setChannel] = useState<BookingChannel>('marketplace')
  const [deposit, setDeposit] = useState(false)
  const [found, setFound] = useState<{ date: string; slots: Slot[] } | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const service = services.find((s) => s.id === serviceId)
  const members = service ? eligibleMembers({ teamMembers }, service, locationId, true) : []

  useEffect(() => {
    if (!bookable.some((s) => s.id === serviceId)) setServiceId(bookable[0]?.id ?? '')
  }, [bookable, serviceId])

  const search = () => {
    const result = firstOnlineSlotFrom({ clientId, serviceId, teamMemberId: memberId || null, locationId, date })
    setFound(result)
    setSlot(result?.slots[0] ?? null)
    return result
  }

  const book = async (randomSlot: boolean) => {
    const result = found ?? search()
    if (!result) return toast(t('demo.noSlots'), 'error')
    const chosen = randomSlot ? randomOf(result.slots) : (slot ?? result.slots[0])
    setBusy(true)
    try {
      const appt = await simulateOnlineBooking({ clientId, serviceId, teamMemberId: memberId || null, locationId, date: result.date, slot: chosen, channel, deposit })
      toast(t('demo.booking.done', { time: `${format(parseISO(appt.date), 'EEE d MMM')} ${appt.items[0].start}` }))
      setFound(null)
      setSlot(null)
      onDone()
      navigate(`/calendar?date=${appt.date}&location_id=${appt.locationId}&drawer=appointment&id=${appt.id}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ClientSelect label={t('demo.client')} value={clientId} onChange={setClientId} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('demo.location')}</label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.internalName ?? l.name }))} />
        </div>
        <div>
          <label className="label">{t('demo.channel')}</label>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as BookingChannel)} options={CHANNELS.map((c) => ({ value: c.value, label: t(c.labelKey) }))} />
        </div>
      </div>
      <div>
        <label className="label">{t('demo.service')}</label>
        <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setFound(null) }} options={bookable.map((s) => ({ value: s.id, label: `${s.name} · ${money(s.price)}` }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('demo.teamMember')}</label>
          <Select value={memberId} onChange={(e) => { setMemberId(e.target.value); setFound(null) }} options={[{ value: '', label: t('demo.anyProfessional') }, ...members.map((m) => ({ value: m.id, label: m.firstName }))]} />
        </div>
        <div>
          <label className="label">{t('demo.from')}</label>
          <input type="date" className="input" value={date} min={toISODate(now())} onChange={(e) => { setDate(e.target.value); setFound(null) }} />
        </div>
      </div>
      <Checkbox label={t('demo.booking.deposit')} checked={deposit} onChange={setDeposit} />
      <Button onClick={search}>{t('demo.findTimes')}</Button>
      {found && (
        <div>
          <p className="mb-1.5 text-small text-muted">{format(parseISO(found.date), 'EEEE d MMMM')}</p>
          <SlotPicker slots={found.slots} value={slot} onChange={setSlot} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} onClick={() => book(false)} disabled={!found || !slot}>
          {t('demo.booking.book')}
        </Button>
        <Button loading={busy} onClick={() => book(true)}>
          {t('demo.booking.random')}
        </Button>
      </div>
    </>
  )
}

function AppointmentSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const appointments = useDb((s) => s.appointments)
  const clients = useDb((s) => s.clients)
  const options = useMemo(() => {
    void appointments
    return upcomingAppointments()
      .slice(0, 60)
      .map((a) => {
        const c = clients.find((x) => x.id === a.clientId)
        return { value: a.id, label: `${format(parseISO(a.date), 'EEE d MMM')} ${a.items[0].start} · ${c?.firstName} ${c?.lastName} · ${a.items[0].name}` }
      })
  }, [appointments, clients])
  useEffect(() => {
    if (!options.some((o) => o.value === value) && options[0]) onChange(options[0].value)
  }, [options, value, onChange])
  return (
    <div>
      <label className="label">{t('demo.appointment')}</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} />
    </div>
  )
}

function RescheduleForm() {
  const { t } = useTranslation()
  const appointments = useDb((s) => s.appointments)
  const [id, setId] = useState('')
  const [date, setDate] = useState(toISODate(now()))
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [busy, setBusy] = useState(false)
  const appt = appointments.find((a) => a.id === id)
  const find = () => {
    if (!appt) return
    const found = findOnlineSlots({ clientId: appt.clientId!, serviceId: appt.items[0].serviceId, variantId: appt.items[0].variantId, teamMemberId: appt.items[0].preferred ? appt.items[0].teamMemberId : null, locationId: appt.locationId, date }, appt.id)
    setSlots(found)
    setSlot(found[0] ?? null)
  }
  return (
    <>
      <AppointmentSelect value={id} onChange={(v) => { setId(v); setSlots(null) }} />
      <div>
        <label className="label">{t('demo.newDate')}</label>
        <input type="date" className="input" value={date} min={toISODate(now())} onChange={(e) => { setDate(e.target.value); setSlots(null) }} />
      </div>
      <Button onClick={find} disabled={!appt}>
        {t('demo.findTimes')}
      </Button>
      {slots && <SlotPicker slots={slots} value={slot} onChange={setSlot} />}
      <Button
        variant="primary"
        loading={busy}
        disabled={!slot || !appt}
        onClick={async () => {
          setBusy(true)
          try {
            await simulateClientReschedule(id, date, slot!)
            toast(t('demo.reschedule.done'))
            setSlots(null)
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('demo.reschedule.action')}
      </Button>
    </>
  )
}

function CancelForm() {
  const { t } = useTranslation()
  const appointments = useDb((s) => s.appointments)
  const policy = useDb((s) => s.settings.paymentPolicy)
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const appt = appointments.find((a) => a.id === id)
  const late = appt ? isLateCancellation(appt) : false
  return (
    <>
      <AppointmentSelect value={id} onChange={setId} />
      {appt && <p className={clsx('rounded-md px-3 py-2 text-small', late ? 'bg-warning-subtle text-warning' : 'bg-sunken text-muted')}>{late ? t('demo.cancel.late', { hours: policy.cancellationWindowHours, pct: policy.lateCancelFeePct }) : t('demo.cancel.free', { hours: policy.cancellationWindowHours })}</p>}
      <Button
        variant="danger"
        loading={busy}
        disabled={!appt}
        onClick={async () => {
          setBusy(true)
          try {
            const result = await simulateClientCancel(id)
            toast(result.fee ? t('demo.cancel.doneFeeAmount', { fee: money2(result.fee) }) : t('demo.cancel.done'))
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('demo.cancel.action')}
      </Button>
    </>
  )
}

function GiftCardForm() {
  const { t } = useTranslation()
  const clients = useClientOptions()
  const values = useDb((s) => s.settings.giftCards.values)
  const [clientId, setClientId] = useState(clients[1]?.value ?? '')
  const [value, setValue] = useState(String(values[1] ?? 50))
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <ClientSelect label={t('demo.purchaser')} value={clientId} onChange={setClientId} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t('demo.giftCard.value')}</label>
          <Select value={value} onChange={(e) => setValue(e.target.value)} options={values.map((v) => ({ value: String(v), label: money(v) }))} />
        </div>
        <div>
          <label className="label">{t('demo.giftCard.recipient')}</label>
          <TextInput value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={t('demo.optional')} />
        </div>
      </div>
      <Button
        variant="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const card = await simulateGiftCardPurchase(clientId, Number(value), recipient || undefined)
            toast(t('demo.giftCard.done', { code: card.code }))
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('demo.giftCard.action')}
      </Button>
    </>
  )
}

function StoreOrderForm() {
  const { t } = useTranslation()
  const clients = useClientOptions()
  const products = useDb((s) => s.products)
  const sellable = useMemo(() => products.filter((p) => p.retailSales && !p.archived && p.stock > 0), [products])
  const [clientId, setClientId] = useState(clients[2]?.value ?? '')
  const [productId, setProductId] = useState(sellable[0]?.id ?? '')
  const [qty, setQty] = useState(1)
  const [fulfilment, setFulfilment] = useState<'pickup' | 'shipping'>('shipping')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <ClientSelect label={t('demo.client')} value={clientId} onChange={setClientId} />
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <div>
          <label className="label">{t('demo.store.product')}</label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={sellable.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.retailPrice)}` }))} />
        </div>
        <div>
          <label className="label">{t('demo.store.qty')}</label>
          <TextInput type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
        </div>
      </div>
      <Select value={fulfilment} onChange={(e) => setFulfilment(e.target.value as 'pickup' | 'shipping')} options={[{ value: 'shipping', label: t('demo.store.shippingAmount', { amount: money2(4.5) }) }, { value: 'pickup', label: t('demo.store.pickup') }]} />
      <Button
        variant="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await simulateStoreOrder(clientId, [{ productId, qty }], fulfilment)
            toast(t('demo.store.done'))
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('demo.store.action')}
      </Button>
    </>
  )
}

function ReviewForm() {
  const { t } = useTranslation()
  const clients = useClientOptions()
  const appointments = useDb((s) => s.appointments)
  const [clientId, setClientId] = useState(clients[3]?.value ?? '')
  const [rating, setRating] = useState<Review['rating']>(5)
  const [text, setText] = useState(() => t('demo.review.defaultText'))
  const [busy, setBusy] = useState(false)
  const lastVisit = useMemo(() => appointments.filter((a) => a.clientId === clientId && a.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0], [appointments, clientId])
  return (
    <>
      <ClientSelect label={t('demo.client')} value={clientId} onChange={setClientId} />
      <p className="text-small text-muted">{lastVisit ? t('demo.review.for', { service: lastVisit.items[0].name, date: format(parseISO(lastVisit.date), 'd MMM') }) : t('demo.review.noVisit')}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={t('demo.review.rating')}>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className="p-1">
            <Star size={22} className={n <= rating ? 'fill-accent text-accent' : 'text-line-strong'} aria-hidden />
          </button>
        ))}
      </div>
      <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      <Button
        variant="primary"
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await simulateReview({ clientId, appointmentId: lastVisit?.id, rating, text })
            toast(t('demo.review.done'))
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('demo.review.action')}
      </Button>
    </>
  )
}

function MessageForm() {
  const { t } = useTranslation()
  const clients = useClientOptions()
  const [clientId, setClientId] = useState(clients[4]?.value ?? '')
  const [text, setText] = useState(() => t('demo.message.defaultText'))
  const [busy, setBusy] = useState(false)
  return (
    <>
      <ClientSelect label={t('demo.client')} value={clientId} onChange={setClientId} />
      <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      <Button
        variant="primary"
        icon={<Send size={16} />}
        loading={busy}
        disabled={!text.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            await simulateClientMessage(clientId, text.trim())
            toast(t('demo.message.done'))
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('demo.message.action')}
      </Button>
    </>
  )
}

function BusinessEvents() {
  const { t } = useTranslation()
  const products = useDb((s) => s.products)
  const campaigns = useDb((s) => s.campaigns)
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key)
    try {
      const message = await fn()
      if (message) toast(message)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }
  const pending = campaigns.filter((c) => c.status === 'pending').length
  return (
    <div className="flex flex-col gap-2">
      <Section icon={Package} title={t('demo.events.lowStock')}>
        <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.stock})` }))} />
        <Button loading={busy === 'stock'} onClick={() => run('stock', async () => { await simulateLowStock(productId); return t('demo.events.lowStockDone') })}>
          {t('demo.events.trigger')}
        </Button>
      </Section>
      <EventRow icon={CreditCard} title={t('demo.events.cardDeclined')} hint={t('demo.events.cardDeclinedHint')} loading={busy === 'card'} onClick={() => run('card', async () => { armCardDecline(); return t('demo.events.cardDeclinedDone') })} />
      <EventRow icon={Wallet} title={t('demo.events.payout')} hint={t('demo.events.payoutHint')} loading={busy === 'payout'} onClick={() => run('payout', async () => t('demo.events.payoutDoneAmount', { amount: money2(await simulatePayout()) }))} />
      <EventRow icon={Send} title={t('demo.events.campaign')} hint={t('demo.events.campaignHint', { count: pending })} loading={busy === 'campaign'} onClick={() => run('campaign', async () => t('demo.events.campaignDone', { name: await simulateCampaignApproval() }))} />
    </div>
  )
}

function EventRow({ icon: Icon, title, hint, onClick, loading }: { icon: LucideIcon; title: string; hint: string; onClick: () => void; loading: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-4 py-3">
      <Icon size={18} className="shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-strong">{title}</p>
        <p className="text-small text-muted">{hint}</p>
      </div>
      <Button size="sm" loading={loading} onClick={onClick}>
        {t('demo.events.trigger')}
      </Button>
    </div>
  )
}

function OutboxTab({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const messages = useDb((s) => s.messages)
  const [channel, setChannel] = useState<'all' | MessageLog['channel']>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () =>
      messages
        .filter((m) => channel === 'all' || m.channel === channel)
        .filter((m) => `${m.toName} ${m.to} ${m.subject} ${m.body}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 80),
    [messages, channel, query],
  )
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} options={[{ value: 'all', label: t('demo.outbox.all') }, { value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }, { value: 'whatsapp', label: 'WhatsApp' }]} className="w-36" />
        <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('demo.outbox.search')} />
      </div>
      {visible.length === 0 && <p className="py-10 text-center text-body text-muted">{t('demo.outbox.empty')}</p>}
      <ul className="flex flex-col gap-3" data-testid="demo-outbox">
        {visible.map((m) =>
          m.channel === 'email' ? (
            <li key={m.id} className="overflow-hidden rounded-lg border border-line">
              <div className="flex items-center gap-2 bg-sunken px-3 py-2 text-caption text-muted">
                <Inbox size={14} aria-hidden />
                <span className="truncate">
                  {t('demo.outbox.to')} {m.toName} &lt;{m.to}&gt;
                </span>
                <span className="ml-auto shrink-0">{format(parseISO(m.at), 'd MMM HH:mm')}</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-body-strong">{m.subject}</p>
                <p className="mt-1 whitespace-pre-line text-small text-muted">{m.body}</p>
                {m.link && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      onNavigate()
                      navigate(m.link!.href)
                    }}
                  >
                    {m.link.label}
                  </Button>
                )}
              </div>
            </li>
          ) : (
            <li key={m.id} className="rounded-lg bg-sunken p-3">
              <p className="mb-1.5 flex justify-between text-caption text-muted">
                <span>
                  {m.channel === 'sms' ? 'SMS' : 'WhatsApp'} · {m.to}
                </span>
                <span>{format(parseISO(m.at), 'd MMM HH:mm')}</span>
              </p>
              <p className={clsx('max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-small text-white', m.channel === 'whatsapp' ? 'bg-success' : 'bg-info')}>{m.body}</p>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function SettingsTab() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const users = useDb((s) => s.users)
  const override = useDb((s) => s.meta.todayOverride)
  const currentUserId = useSessionStore((s) => s.currentUserId)
  const [when, setWhen] = useState(() => format(now(), "yyyy-MM-dd'T'HH:mm"))
  const [busy, setBusy] = useState<string | null>(null)
  const ROLE_LABELS: Record<string, string> = { u_owner: t('demo.roles.owner'), u_staff: t('demo.roles.receptionist'), u_stylist: t('demo.roles.teamMember') }

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-body-strong">
          <UserCog size={18} className="text-primary" aria-hidden />
          {t('demo.switchRole')}
        </h3>
        <div className="flex flex-col gap-2">
          {users
            .filter((u) => ROLE_LABELS[u.id])
            .map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={async () => {
                  await switchUser(u.id)
                  toast(t('demo.switched', { name: `${u.firstName} ${u.lastName}` }))
                  navigate(landingPath(u.role))
                }}
                className={clsx('flex items-center justify-between rounded-lg border px-4 py-3 text-left', currentUserId === u.id ? 'border-primary bg-primary-subtle/50' : 'border-line hover:bg-sunken')}
              >
                <span>
                  <span className="block text-body-strong">{ROLE_LABELS[u.id]}</span>
                  <span className="block text-small text-muted">
                    {u.firstName} {u.lastName} · {u.email}
                  </span>
                </span>
                {currentUserId === u.id && <span className="chip bg-primary text-on-primary">{t('demo.current')}</span>}
              </button>
            ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-body-strong">
          <TimerReset size={18} className="text-primary" aria-hidden />
          {t('demo.timeTravel')}
        </h3>
        <p className="mb-2 text-small text-muted">{override ? t('demo.timeTravelOn', { when: format(parseISO(override), 'EEE d MMM yyyy, HH:mm') }) : t('demo.timeTravelOff')}</p>
        <div className="flex gap-2">
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} aria-label={t('demo.timeTravel')} />
          <Button variant="primary" loading={busy === 'time'} onClick={async () => { setBusy('time'); await setDemoNow(new Date(when).toISOString()); setBusy(null); toast(t('demo.timeSet')) }}>
            {t('demo.apply')}
          </Button>
        </div>
        {override && (
          <Button variant="link" className="mt-2" onClick={async () => { await setDemoNow(null); toast(t('demo.timeCleared')) }}>
            {t('demo.backToNow')}
          </Button>
        )}
      </section>
      <section className="rounded-lg border border-danger/30 bg-danger-subtle/40 p-4">
        <h3 className="text-body-strong">{t('demo.reset')}</h3>
        <p className="mb-3 mt-1 text-small text-muted">{t('demo.resetHint')}</p>
        <Button
          variant="danger"
          loading={busy === 'reset'}
          onClick={async () => {
            if (!(await confirm({ title: t('demo.resetConfirm'), body: t('demo.resetHint'), confirmLabel: t('demo.reset') }))) return
            setBusy('reset')
            await resetDemo()
            setBusy(null)
            toast(t('demo.resetDone'))
          }}
        >
          {t('demo.reset')}
        </Button>
      </section>
    </div>
  )
}
