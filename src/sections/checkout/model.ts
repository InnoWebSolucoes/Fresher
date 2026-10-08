import type { CartItem, PaymentInput } from '@/api/sales'
import { computeTotals } from '@/api/sales'
import type { Appointment, Deal, DbData, ID, PaletteColor, Sale, SaleItem } from '@/types'
import { PALETTE } from '@/styles/palette'
import { round2 } from '@/lib/format'
import { uid } from '@/lib/ids'

/** A line in the checkout cart (CartItem plus a stable UI key). */
export interface Line extends CartItem {
  key: string
}

export type Step = 'cart' | 'tip' | 'payment'

export interface Tip {
  teamMemberId: ID
  amount: number
}

/** A payment added in this checkout but not yet sent to the API. */
export interface PendingPayment extends PaymentInput {
  key: string
}

export const newKey = () => uid('ln')

/** Strip UI-only fields before calling checkout(). */
export function toCartItems(lines: Line[]): CartItem[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return lines.map(({ key, ...rest }) => rest)
}

export function toPaymentInputs(payments: PendingPayment[]): PaymentInput[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return payments.map(({ key, ...rest }) => rest)
}

/** Totals for the cart, through the same computeTotals the API uses. */
export function cartTotals(lines: Line[], tips: Tip[], cartDiscount: Sale['cartDiscount'], serviceCharges: Sale['serviceCharges']) {
  const items = lines.map((l) => ({ ...l, id: l.key, taxRate: l.type === 'gift_card' ? 0 : 0.23 }) as unknown as SaleItem)
  return computeTotals({ items, tips: tips.filter((t) => t.amount > 0), cartDiscount, serviceCharges })
}

/** Cash quick amounts: the balance, then rounded-up notes (calendar.md §10). */
export function quickAmounts(due: number): number[] {
  if (due <= 0) return [5, 10, 20, 50, 100]
  const ceilTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step
  const list: number[] = []
  const push = (n: number) => {
    const v = round2(n)
    if (!list.includes(v) && v >= due - 1e-9) list.push(v)
  }
  push(due)
  push(Math.ceil(due))
  push(ceilTo(due, 5))
  push(ceilTo(due, 10))
  let next = ceilTo(due, 5) + 5
  while (list.length < 4) {
    push(next)
    next += 5
  }
  const top = Math.max(100, ceilTo(due + 0.01, 100))
  return [...list.slice(0, 4), top].filter((v, i, a) => a.indexOf(v) === i)
}

/** Parse a keypad string ("28.7") into a number. */
export function parseAmount(text: string): number {
  const n = Number(text)
  return Number.isFinite(n) ? round2(n) : 0
}

/** Keypad input rules: one dot, two decimals, sensible length. */
export function keypadPress(current: string, key: string, maxDecimals = 2): string {
  if (key === 'back') return current.slice(0, -1)
  if (key === '.') return current.includes('.') ? current : `${current || '0'}.`
  const [, dec] = current.split('.')
  if (dec !== undefined && dec.length >= maxDecimals) return current
  if (current.replace('.', '').length >= 7) return current
  if (current === '0') return key
  return current + key
}

/** Active point-of-sale deals that apply to a cart line (marketing deals with "pos"). */
export function dealsForLine(line: Pick<Line, 'type' | 'refId' | 'teamMemberId'>, deals: Deal[], today: string): Deal[] {
  return deals.filter((d) => {
    if (d.status !== 'active' || !d.pos) return false
    if (d.startsAt > today || (d.endsAt && d.endsAt < today)) return false
    if (d.teamMemberIds !== 'all' && (!line.teamMemberId || !d.teamMemberIds.includes(line.teamMemberId))) return false
    const scope = (list: 'all' | ID[]) => list === 'all' || (line.refId ? list.includes(line.refId) : false)
    switch (line.type) {
      case 'service':
      case 'service_addon':
        return scope(d.appliesTo.services)
      case 'product':
        return scope(d.appliesTo.products)
      case 'package':
        return scope(d.appliesTo.packages)
      case 'membership':
        return scope(d.appliesTo.memberships)
      case 'gift_card':
        return d.appliesTo.giftCards
      default:
        return false
    }
  })
}

/** Colour of the bar on the left of a cart line. */
export function lineColor(line: Pick<Line, 'type' | 'refId'>, data: Pick<DbData, 'services' | 'serviceCategories' | 'memberships'>): string {
  let color: PaletteColor = 'teal'
  if (line.type === 'service' || line.type === 'service_addon') {
    const svc = data.services.find((s) => s.id === line.refId)
    color = data.serviceCategories.find((c) => c.id === svc?.categoryId)?.color ?? 'blue'
  } else if (line.type === 'product') color = 'amber'
  else if (line.type === 'package') color = 'indigo'
  else if (line.type === 'membership') {
    const m = data.memberships.find((x) => x.id === line.refId)
    color = m && m.color in PALETTE ? (m.color as PaletteColor) : 'lavender'
  } else if (line.type === 'gift_card') color = 'purple'
  else if (line.type === 'late_cancellation_fee' || line.type === 'no_show_fee') color = 'red'
  return PALETTE[color].edge
}

/** Duration in minutes for service-like lines (for "1h 30min • Member"). */
export function lineDuration(line: Pick<Line, 'type' | 'refId' | 'appointmentItemId' | 'appointmentId'>, data: Pick<DbData, 'services' | 'appointments'>): number | undefined {
  if (line.type === 'manual') return 5
  if (line.type === 'service') {
    const appt = line.appointmentId ? data.appointments.find((a) => a.id === line.appointmentId) : undefined
    const item = appt?.items.find((i) => i.id === line.appointmentItemId)
    if (item) return item.durationMin
    return data.services.find((s) => s.id === line.refId)?.durationMin
  }
  if (line.type === 'service_addon') {
    for (const s of data.services) for (const g of s.addOnGroups) for (const o of g.options) if (o.id === line.refId) return o.durationMin || undefined
  }
  return undefined
}

/** Cart lines for an appointment: services with add-ons, or the fee for a late cancellation / no-show. */
export function linesFromAppointment(appt: Appointment): { lines: Line[]; feeOnly: boolean } {
  if (appt.status === 'no_show' && appt.noShowFee) {
    return { feeOnly: true, lines: [{ key: newKey(), type: 'no_show_fee', name: 'No-show fee', detail: appt.items[0]?.name, quantity: 1, unitPrice: appt.noShowFee, teamMemberId: appt.items[0]?.teamMemberId ?? null, appointmentId: appt.id }] }
  }
  if (appt.status === 'cancelled' && appt.cancellation?.fee) {
    return { feeOnly: true, lines: [{ key: newKey(), type: 'late_cancellation_fee', name: 'Late cancellation fee', detail: appt.items[0]?.name, quantity: 1, unitPrice: appt.cancellation.fee, teamMemberId: appt.items[0]?.teamMemberId ?? null, appointmentId: appt.id }] }
  }
  const lines: Line[] = appt.items.flatMap((it) => [
    { key: newKey(), type: 'service' as const, refId: it.serviceId, name: it.name, quantity: 1, unitPrice: it.price, originalPrice: it.originalPrice, teamMemberId: it.teamMemberId, appointmentId: appt.id, appointmentItemId: it.id, benefitNote: it.priceNote },
    ...it.addOns.map((ao) => ({ key: newKey(), type: 'service_addon' as const, refId: ao.id, name: ao.name, quantity: 1, unitPrice: ao.price, teamMemberId: it.teamMemberId, appointmentId: appt.id })),
  ])
  return { lines, feeOnly: false }
}

/** Lines of an existing sale (paying an unpaid / part-paid sale or a draft). */
export function linesFromSale(sale: Sale): Line[] {
  return sale.items.map((i) => ({
    key: newKey(),
    id: i.id,
    type: i.type,
    refId: i.refId,
    name: i.name,
    detail: i.detail,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    originalPrice: i.originalPrice,
    discount: i.discount,
    teamMemberId: i.teamMemberId,
    appointmentId: i.appointmentId,
    appointmentItemId: i.appointmentItemId,
    benefitNote: i.benefitNote,
  }))
}

/** Expiration options of the Edit gift card modal (calendar.md §10.9). */
export const EXPIRY_OPTIONS = ['14 days', '1 month', ...Array.from({ length: 10 }, (_, i) => `${i + 2} months`), '1 year', '2 years', '3 years', '4 years', '5 years', 'Never']

export function giftDetail(line: Pick<Line, 'giftCard' | 'unitPrice'>): string {
  const gc = line.giftCard
  if (!gc) return ''
  const value = `€${round2(gc.value)} value`
  const valid = gc.expiry === 'Never' ? 'never expires' : `valid for ${gc.expiry}`
  return [gc.customCode, value, valid].filter(Boolean).join(' • ')
}
