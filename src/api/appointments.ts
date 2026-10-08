import { addDays, addMonths, addWeeks, differenceInHours, format, parseISO } from 'date-fns'
import { commit, db } from '@/store/db'
import type { Appointment, AppointmentItem, AppointmentStatus, BlockedTime, BookingChannel, ID, ISODate, RepeatRule, WaitlistEntry } from '@/types'
import { bookingRef, uid } from '@/lib/ids'
import { at, now, nowISO, toClock, toISODate, toMinutes } from '@/lib/time'
import { round2 } from '@/lib/format'
import { activity, actorName, ApiError, latency } from './client'
import { notifyAppointment, pushNotification, queueMessage } from './messaging'
import { taxRateFor } from './sales'

export interface NewAppointmentItem {
  serviceId: ID
  variantId?: ID
  teamMemberId: ID
  start: string
  durationMin?: number
  extraTime?: AppointmentItem['extraTime']
  price?: number
  originalPrice?: number
  priceNote?: string
  addOns?: AppointmentItem['addOns']
  resourceId?: ID
  preferred?: boolean
}

export interface CreateAppointmentInput {
  clientId: ID | null
  locationId: ID
  date: ISODate
  items: NewAppointmentItem[]
  source?: Appointment['source']
  channel?: BookingChannel
  note?: string
  repeat?: RepeatRule
  groupId?: ID | 'new'
  deposit?: number
  waitlistEntryId?: ID
  /** Send the "New appointment" message (default true). */
  notify?: boolean
  createdBy?: string
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  started: 'Started',
  completed: 'Completed',
  no_show: 'No-show',
  cancelled: 'Canceled',
}

function buildItems(input: NewAppointmentItem[]): AppointmentItem[] {
  const { services } = db()
  return input.map((item) => {
    const service = services.find((s) => s.id === item.serviceId)
    if (!service) throw new ApiError('not_found', 'Service not found')
    const variant = service.variants.find((v) => v.id === item.variantId)
    return {
      id: uid('ai'),
      serviceId: service.id,
      variantId: variant?.id,
      name: variant ? `${service.name} · ${variant.name}` : service.name,
      teamMemberId: item.teamMemberId,
      start: item.start,
      durationMin: item.durationMin ?? variant?.durationMin ?? service.durationMin,
      extraTime: item.extraTime ?? service.extraTime,
      price: item.price ?? variant?.price ?? service.price,
      originalPrice: item.originalPrice,
      priceNote: item.priceNote,
      addOns: item.addOns ?? [],
      resourceId: item.resourceId,
      preferred: item.preferred ?? false,
    }
  })
}

/** Dates for a repeat rule, starting with `date` (max 52 occurrences for "never"). */
export function repeatDates(date: ISODate, rule: RepeatRule): ISODate[] {
  if (rule.frequency === 'none') return [date]
  const unit = rule.frequency === 'daily' ? 'day' : rule.frequency === 'weekly' ? 'week' : rule.frequency === 'monthly' ? 'month' : rule.unit
  const step = rule.frequency === 'custom' ? Math.max(1, rule.interval) : 1
  const limit = rule.ends === 'after' ? (rule.count ?? 2) : 52
  const dates: ISODate[] = []
  let current = parseISO(date)
  while (dates.length < limit) {
    const iso = toISODate(current)
    if (rule.ends === 'on' && rule.until && iso > rule.until) break
    dates.push(iso)
    current = unit === 'day' ? addDays(current, step) : unit === 'week' ? addWeeks(current, step) : addMonths(current, step)
  }
  return dates
}

/** Create an appointment (and its repeats). Returns the first occurrence. */
export async function createAppointment(input: CreateAppointmentInput): Promise<Appointment> {
  await latency()
  const data = db()
  const client = data.clients.find((c) => c.id === input.clientId)
  if (client?.blocked && input.channel && input.channel !== 'offline') throw new ApiError('blocked', 'This client is blocked from booking online')
  const by = input.createdBy ?? actorName()
  const online = (input.channel ?? 'offline') !== 'offline'
  const dates = repeatDates(input.date, input.repeat ?? { frequency: 'none', interval: 1, unit: 'week', ends: 'never' })
  const seriesId = dates.length > 1 ? uid('series') : undefined
  let groupId = input.groupId === 'new' ? uid('grp') : input.groupId
  const created: Appointment[] = dates.map((date, index) => {
    const appt: Appointment = {
      id: uid('apt'),
      ref: bookingRef(),
      clientId: input.clientId,
      locationId: input.locationId,
      date,
      items: buildItems(input.items),
      status: 'booked',
      source: input.source ?? (online ? 'online' : 'phone'),
      channel: input.channel ?? 'offline',
      createdAt: nowISO(),
      createdBy: by,
      repeat: seriesId ? { ...input.repeat!, seriesId } : undefined,
      groupId,
      waitlistEntryId: index === 0 ? input.waitlistEntryId : undefined,
      requested: input.items.some((i) => i.preferred),
      activity: [],
      formResponseIds: [],
    }
    appt.activity.push({ ...activity('Appointment created', `Booked by ${by.split(' ')[0]}, reference ${appt.ref}`), by })
    if (input.deposit && index === 0) appt.deposit = { amount: round2(input.deposit), paidAt: nowISO() }
    return appt
  })

  commit((d) => {
    for (const appt of created) {
      if (appt.deposit) {
        const paymentId = uid('pay')
        appt.deposit.paymentId = paymentId
        d.payments.push({ id: paymentId, saleId: '', kind: 'deposit', method: 'online_card', methodLabel: 'Deposit (card)', amount: appt.deposit.amount, at: nowISO(), by, status: 'succeeded', clientId: appt.clientId, locationId: appt.locationId })
        d.wallet.balance = round2(d.wallet.balance + appt.deposit.amount)
        d.wallet.transactions.unshift({ id: uid('wt'), at: nowISO(), type: 'deposit', description: `Deposit for appointment ${appt.ref}`, amount: appt.deposit.amount })
      }
      d.appointments.push(appt)
    }
    if (groupId) {
      const group = d.groups.find((g) => g.id === groupId)
      if (group) group.appointmentIds.push(created[0].id)
      else d.groups.push({ id: groupId, organiserClientId: input.clientId, appointmentIds: [created[0].id], createdAt: nowISO() })
    }
    if (input.note) d.clientNotes.push({ id: uid('cn'), clientId: input.clientId ?? '', html: input.note, kind: 'appointment', appointmentId: created[0].id, createdAt: nowISO(), by })
    if (input.waitlistEntryId) {
      const entry = d.waitlist.find((w) => w.id === input.waitlistEntryId)
      if (entry) {
        entry.status = 'booked'
        entry.appointmentId = created[0].id
      }
    }
  })
  groupId = undefined

  const first = created[0]
  if (input.notify !== false) notifyAppointment(first, 'confirmation')
  if (online) {
    const member = data.teamMembers.find((m) => m.id === first.items[0].teamMemberId)
    pushNotification({
      tab: 'appointments',
      title: 'New online booking',
      body: `${format(parseISO(first.date), 'EEE d MMM')} ${first.items[0].start} ${first.items[0].name} for ${client?.firstName ?? 'Walk-In'} booked with ${member?.firstName ?? 'the team'}`,
      link: `/calendar?date=${first.date}&drawer=appointment&id=${first.id}`,
      initials: client ? `${client.firstName[0]}${client.lastName[0]}` : 'W',
    })
  }
  return first
}

export async function updateAppointment(id: ID, patch: Partial<Pick<Appointment, 'clientId' | 'date' | 'locationId' | 'repeat' | 'paymentPolicy'>> & { items?: AppointmentItem[] }, logTitle = 'Appointment updated'): Promise<void> {
  await latency()
  commit((d) => {
    const appt = d.appointments.find((a) => a.id === id)
    if (!appt) throw new ApiError('not_found', 'Appointment not found')
    Object.assign(appt, patch)
    appt.requested = appt.items.some((i) => i.preferred)
    appt.activity.unshift(activity(logTitle))
  })
}

export async function setStatus(id: ID, status: AppointmentStatus): Promise<void> {
  await latency(200, 450)
  commit((d) => {
    const appt = d.appointments.find((a) => a.id === id)
    if (!appt) throw new ApiError('not_found', 'Appointment not found')
    appt.activity.unshift(activity(`Status changed to ${STATUS_LABEL[status]}`, `From ${STATUS_LABEL[appt.status]}`))
    appt.status = status
  })
}

/** Is a cancellation now inside the late-cancellation window? */
export function isLateCancellation(appointment: Appointment): boolean {
  const start = at(appointment.date, appointment.items[0]?.start ?? '00:00')
  return differenceInHours(start, now()) < db().settings.paymentPolicy.cancellationWindowHours
}

export const appointmentTotal = (a: Pick<Appointment, 'items'>) => round2(a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0))

/** Records a fee as a paid sale charged to the card on file. */
function chargeFee(appointment: Appointment, type: 'late_cancellation_fee' | 'no_show_fee', amount: number): void {
  commit((d) => {
    const number = d.meta.nextSaleNumber++
    const saleId = uid('sale')
    const paymentId = uid('pay')
    const at = nowISO()
    d.sales.push({
      id: saleId,
      number,
      kind: 'sale',
      status: 'completed',
      clientId: appointment.clientId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      createdAt: at,
      completedAt: at,
      createdBy: actorName(),
      items: [{ id: uid('si'), type, name: type === 'no_show_fee' ? 'No-show fee' : 'Late cancellation fee', detail: appointment.items[0]?.name, quantity: 1, unitPrice: amount, teamMemberId: appointment.items[0]?.teamMemberId ?? null, appointmentId: appointment.id, taxRate: taxRateFor(type) }],
      serviceCharges: [],
      tips: [],
      paymentIds: [paymentId],
      channel: 'offline',
      notes: [],
      activity: [activity(`Sale ${number} created`, 'Fee charged to card on file')],
    })
    d.payments.push({ id: paymentId, saleId, kind: 'sale', method: 'online_card', methodLabel: 'Card on file', amount, at, by: actorName(), status: 'succeeded', clientId: appointment.clientId, locationId: appointment.locationId })
  })
}

export async function cancelAppointment(id: ID, options: { reasonId: string; notify: boolean; chargeFee?: boolean; by?: string }): Promise<void> {
  await latency()
  const appt = db().appointments.find((a) => a.id === id)
  if (!appt) throw new ApiError('not_found', 'Appointment not found')
  const late = isLateCancellation(appt)
  const policy = db().settings.paymentPolicy
  const fee = late && options.chargeFee ? round2((appointmentTotal(appt) * policy.lateCancelFeePct) / 100) : 0
  commit((d) => {
    const a = d.appointments.find((x) => x.id === id)!
    a.status = 'cancelled'
    a.cancellation = { reasonId: options.reasonId, at: nowISO(), late, fee, by: options.by ?? actorName() }
    a.activity.unshift(activity('Appointment canceled', late ? 'Late cancellation' : undefined))
  })
  if (fee > 0) chargeFee(appt, 'late_cancellation_fee', fee)
  if (options.notify) notifyAppointment(db().appointments.find((a) => a.id === id)!, 'cancellation')
}

export async function markNoShow(id: ID, options: { notify: boolean; chargeFee?: boolean }): Promise<void> {
  await latency()
  const appt = db().appointments.find((a) => a.id === id)
  if (!appt) throw new ApiError('not_found', 'Appointment not found')
  const fee = options.chargeFee ? round2((appointmentTotal(appt) * db().settings.paymentPolicy.noShowFeePct) / 100) : 0
  commit((d) => {
    const a = d.appointments.find((x) => x.id === id)!
    a.status = 'no_show'
    a.noShowFee = fee || undefined
    a.activity.unshift(activity('Marked as no-show'))
  })
  if (fee > 0) chargeFee(appt, 'no_show_fee', fee)
  if (options.notify) notifyAppointment(db().appointments.find((a) => a.id === id)!, 'no_show')
}

export async function undoNoShow(id: ID): Promise<void> {
  await latency(200, 400)
  commit((d) => {
    const a = d.appointments.find((x) => x.id === id)
    if (!a) return
    a.status = 'booked'
    a.noShowFee = undefined
    a.activity.unshift(activity('No-show undone'))
  })
}

/**
 * Move an appointment. `start` moves the first item; following items keep
 * their offsets. `teamMemberId` reassigns every item (drag between columns).
 */
export async function rescheduleAppointment(id: ID, target: { date: ISODate; start: string; teamMemberId?: ID; durationMin?: number }, options: { notify: boolean; by?: string } = { notify: true }): Promise<void> {
  await latency()
  const before = db().appointments.find((a) => a.id === id)
  if (!before) throw new ApiError('not_found', 'Appointment not found')
  const delta = toMinutes(target.start) - toMinutes(before.items[0].start)
  const from = `${format(parseISO(before.date), 'dd MMM yyyy')} at ${before.items[0].start}`
  commit((d) => {
    const a = d.appointments.find((x) => x.id === id)!
    a.date = target.date
    a.items = a.items.map((item, index) => ({
      ...item,
      start: toClock(toMinutes(item.start) + delta),
      teamMemberId: target.teamMemberId ?? item.teamMemberId,
      durationMin: index === 0 && target.durationMin ? target.durationMin : item.durationMin,
    }))
    const member = d.teamMembers.find((m) => m.id === a.items[0].teamMemberId)
    a.activity.unshift({ ...activity('Appointment rescheduled', `Rescheduled by ${(options.by ?? actorName()).split(' ')[0]} from ${from} to ${format(parseISO(a.date), 'dd MMM yyyy')} at ${a.items[0].start} with ${member?.firstName}`), by: options.by ?? actorName() })
  })
  if (options.notify) notifyAppointment(db().appointments.find((a) => a.id === id)!, 'reschedule')
}

export async function addAppointmentNote(appointmentId: ID, html: string): Promise<void> {
  await latency()
  const appt = db().appointments.find((a) => a.id === appointmentId)
  commit((d) => {
    d.clientNotes.unshift({ id: uid('cn'), clientId: appt?.clientId ?? '', html, kind: 'appointment', appointmentId, createdAt: nowISO(), by: actorName() })
    d.appointments.find((a) => a.id === appointmentId)?.activity.unshift(activity('Note added'))
  })
}

// ─── Groups ──────────────────────────────────────────────────────────────

export async function addToGroup(groupId: ID | 'new', appointmentId: ID): Promise<ID> {
  await latency()
  const id = groupId === 'new' ? uid('grp') : groupId
  commit((d) => {
    const appt = d.appointments.find((a) => a.id === appointmentId)
    let group = d.groups.find((g) => g.id === id)
    if (!group) {
      group = { id, organiserClientId: appt?.clientId ?? null, appointmentIds: [], createdAt: nowISO() }
      d.groups.push(group)
    }
    if (!group.appointmentIds.includes(appointmentId)) group.appointmentIds.push(appointmentId)
    if (appt) appt.groupId = id
  })
  return id
}

export async function removeFromGroup(appointmentId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const appt = d.appointments.find((a) => a.id === appointmentId)
    const group = d.groups.find((g) => g.id === appt?.groupId)
    if (group) group.appointmentIds = group.appointmentIds.filter((x) => x !== appointmentId)
    if (appt) appt.groupId = undefined
  })
}

export async function ungroup(groupId: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.appointments.forEach((a) => {
      if (a.groupId === groupId) a.groupId = undefined
    })
    d.groups = d.groups.filter((g) => g.id !== groupId)
  })
}

// ─── Blocked time ────────────────────────────────────────────────────────

export async function saveBlockedTime(input: Omit<BlockedTime, 'id'> & { id?: ID }): Promise<BlockedTime> {
  await latency()
  const record: BlockedTime = { ...input, id: input.id ?? uid('bt') }
  const dates = input.repeat && !input.id ? repeatDates(input.date, input.repeat) : [input.date]
  commit((d) => {
    if (input.id) {
      const index = d.blockedTimes.findIndex((b) => b.id === input.id)
      if (index !== -1) d.blockedTimes[index] = record
    } else {
      dates.forEach((date, i) => d.blockedTimes.push({ ...record, id: i === 0 ? record.id : uid('bt'), date }))
    }
  })
  return record
}

export async function deleteBlockedTime(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.blockedTimes = d.blockedTimes.filter((b) => b.id !== id)
  })
}

// ─── Waitlist ────────────────────────────────────────────────────────────

export async function saveWaitlistEntry(input: Omit<WaitlistEntry, 'id' | 'createdAt' | 'status'> & { id?: ID }): Promise<WaitlistEntry> {
  await latency()
  const existing = db().waitlist.find((w) => w.id === input.id)
  const record: WaitlistEntry = { status: 'waiting', createdAt: nowISO(), ...existing, ...input, id: input.id ?? uid('wl') }
  commit((d) => {
    const index = d.waitlist.findIndex((w) => w.id === record.id)
    if (index === -1) d.waitlist.push(record)
    else d.waitlist[index] = record
  })
  if (!existing && record.clientId) {
    const client = db().clients.find((c) => c.id === record.clientId)
    if (client && db().automations.find((a) => a.key === 'waitlist-joined')?.enabled) {
      queueMessage({ clientId: client.id, to: client.email, toName: `${client.firstName} ${client.lastName}`, channel: 'email', type: 'waitlist', subject: "You're on the waitlist", body: `Hi ${client.firstName}, you're on the waitlist. We'll let you know as soon as a time slot becomes available.` })
    }
  }
  return record
}

export async function removeWaitlistEntry(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.waitlist = d.waitlist.filter((w) => w.id !== id)
  })
}
