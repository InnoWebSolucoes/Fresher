import { format, parseISO } from 'date-fns'
import type { TFunction } from 'i18next'
import type { Appointment, AppointmentItem, Deal, ID, RepeatRule, Service, TeamMember } from '@/types'
import type { NewAppointmentItem } from '@/api/appointments'
import { findConflicts, itemTotalMinutes, type AvailabilityData } from '@/lib/availability'
import { uid } from '@/lib/ids'
import { round2, taxIncluded } from '@/lib/format'
import { toClock, toMinutes } from '@/lib/time'
import type { AppointmentDraft, DraftItem } from '../store'

export const newKey = () => uid('dl')

export function draftItemFromService(service: Service, teamMemberId: ID | null, variantId?: ID): DraftItem {
  const variant = service.variants.find((v) => v.id === variantId)
  return {
    key: newKey(),
    serviceId: service.id,
    variantId: variant?.id,
    name: variant ? `${service.name} · ${variant.name}` : service.name,
    teamMemberId,
    durationMin: variant?.durationMin ?? service.durationMin,
    extraTime: service.extraTime.map((e) => ({ ...e })),
    price: variant?.price ?? service.price,
    preferred: false,
    addOns: [],
  }
}

export function draftItemsFromAppointment(appt: Appointment): DraftItem[] {
  return appt.items.map((i) => ({
    key: i.id,
    itemId: i.id,
    serviceId: i.serviceId,
    variantId: i.variantId,
    name: i.name,
    teamMemberId: i.teamMemberId,
    durationMin: i.durationMin,
    extraTime: i.extraTime.map((e) => ({ ...e })),
    price: i.price,
    originalPrice: i.originalPrice,
    priceNote: i.priceNote,
    preferred: i.preferred,
    addOns: i.addOns,
    resourceId: i.resourceId,
  }))
}

export function draftFromAppointment(appt: Appointment): AppointmentDraft {
  return {
    clientId: appt.clientId,
    walkIn: !appt.clientId,
    locationId: appt.locationId,
    date: appt.date,
    start: appt.items[0]?.start ?? '09:00',
    items: draftItemsFromAppointment(appt),
    repeat: appt.repeat ?? { frequency: 'none', interval: 1, unit: 'week', ends: 'never' },
    note: '',
    paymentPolicy: Boolean(appt.paymentPolicy),
    groupId: appt.groupId,
    waitlistEntryId: appt.waitlistEntryId,
  }
}

export const itemMinutes = (i: Pick<DraftItem, 'durationMin' | 'extraTime'>) => itemTotalMinutes(i.durationMin, i.extraTime)
export const itemPrice = (i: Pick<DraftItem, 'price' | 'addOns'>) => i.price + i.addOns.reduce((s, o) => s + o.price, 0)

/** Items laid out back to back from the appointment start. */
export function layout(items: DraftItem[], start: string | null): { item: DraftItem; start: string }[] {
  let cursor = toMinutes(start ?? '09:00')
  return items.map((item) => {
    const at = toClock(cursor)
    cursor += itemMinutes(item)
    return { item, start: at }
  })
}

export function totals(items: DraftItem[], deposit = 0) {
  const total = round2(items.reduce((s, i) => s + itemPrice(i), 0))
  const tax = taxIncluded(total)
  return { total, tax, subtotal: round2(total - tax), deposit, toPay: round2(Math.max(0, total - deposit)) }
}

/** Pick a member for "Any team member" lines: the first eligible one free at that time. */
export function resolveMember(data: AvailabilityData, draft: AppointmentDraft, index: number, eligible: TeamMember[]): ID | null {
  const laid = layout(draft.items, draft.start)[index]
  if (!laid) return eligible[0]?.id ?? null
  for (const m of eligible) {
    const conflicts = findConflicts(data, {
      id: '__draft__',
      date: draft.date,
      locationId: draft.locationId,
      items: [{ id: 'x', teamMemberId: m.id, start: laid.start, durationMin: laid.item.durationMin, extraTime: laid.item.extraTime }],
    })
    if (!conflicts.length) return m.id
  }
  return eligible[0]?.id ?? null
}

export function toNewItems(draft: AppointmentDraft, memberFor: (index: number) => ID): NewAppointmentItem[] {
  return layout(draft.items, draft.start).map(({ item, start }, index) => ({
    serviceId: item.serviceId,
    variantId: item.variantId,
    teamMemberId: item.teamMemberId ?? memberFor(index),
    start,
    durationMin: item.durationMin,
    extraTime: item.extraTime,
    price: item.price,
    originalPrice: item.originalPrice,
    priceNote: item.priceNote,
    addOns: item.addOns,
    resourceId: item.resourceId,
    preferred: item.preferred,
  }))
}

export function toAppointmentItems(draft: AppointmentDraft, memberFor: (index: number) => ID): AppointmentItem[] {
  return layout(draft.items, draft.start).map(({ item, start }, index) => ({
    id: item.itemId ?? uid('ai'),
    serviceId: item.serviceId,
    variantId: item.variantId,
    name: item.name,
    teamMemberId: item.teamMemberId ?? memberFor(index),
    start,
    durationMin: item.durationMin,
    extraTime: item.extraTime,
    price: item.price,
    originalPrice: item.originalPrice,
    priceNote: item.priceNote,
    addOns: item.addOns,
    resourceId: item.resourceId,
    preferred: item.preferred,
  }))
}

/** Active point-of-sale deals that apply to a service. */
export function dealsForService(deals: Deal[], serviceId: ID, today: string): Deal[] {
  return deals.filter(
    (d) =>
      d.status === 'active' &&
      d.pos &&
      d.startsAt <= today &&
      (!d.endsAt || d.endsAt >= today) &&
      (d.appliesTo.services === 'all' || d.appliesTo.services.includes(serviceId)),
  )
}

export function discounted(base: number, deal: Deal): number {
  return round2(Math.max(0, deal.discountType === 'percent' ? base * (1 - deal.value / 100) : base - deal.value))
}

export function repeatLabel(rule: RepeatRule | undefined, t: TFunction): string {
  if (!rule || rule.frequency === 'none') return t('calendar.repeat.none')
  const unit = rule.frequency === 'daily' ? 'day' : rule.frequency === 'weekly' ? 'week' : rule.frequency === 'monthly' ? 'month' : rule.unit
  const every = rule.frequency === 'custom' ? Math.max(1, rule.interval) : 1
  const base = every === 1 ? t(`calendar.repeat.every_${unit}`) : t(`calendar.repeat.everyN_${unit}`, { count: every })
  if (rule.ends === 'after') return t('calendar.repeat.withCount', { base, count: rule.count ?? 2 })
  if (rule.ends === 'on' && rule.until) return t('calendar.repeat.withUntil', { base, date: format(parseISO(rule.until), 'd MMM yyyy') })
  return base
}

export const sameItems = (a: DraftItem[], b: DraftItem[]) => JSON.stringify(a.map((i) => ({ ...i, key: '' }))) === JSON.stringify(b.map((i) => ({ ...i, key: '' })))
