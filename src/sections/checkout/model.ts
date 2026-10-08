import type { CartItem, PaymentInput } from '@/api/sales'
import { taxRateFor, availablePackageBenefits, availableRewards, computeTotals } from '@/api/sales'
import type { LineOffer } from '@/api/checkout'
import type { Appointment, ClientReward, Deal, DbData, ID, PaletteColor, Sale, SaleItem } from '@/types'
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
  const items = lines.map((l) => ({ ...l, id: l.key, taxRate: taxRateFor(l.type, l.refId) }) as unknown as SaleItem)
  return computeTotals({ items, tips: tips.filter((t) => t.amount > 0), cartDiscount, serviceCharges })
}

/**
 * Cash quick amounts (calendar.md §10, §10.9): the balance, then the next
 * round notes (€28.75 → €29, €30, €40; €25 → €30, €35, €40), then €100.
 */
export function quickAmounts(due: number): number[] {
  if (due <= 0) return [5, 10, 20, 50, 100]
  const ceilTo = (n: number, step: number) => round2(Math.ceil(n / step - 1e-9) * step)
  const extra: number[] = []
  const push = (v: number) => {
    if (v > due + 1e-9 && !extra.includes(v)) extra.push(v)
  }
  ;[1, 5, 10, 20].forEach((step) => push(ceilTo(due, step)))
  for (let next = ceilTo(due, 5) + 5; extra.length < 3; next += 5) push(round2(next))
  const notes = extra.sort((a, b) => a - b).slice(0, 3)
  const top = Math.max(100, ceilTo(notes[notes.length - 1] + 0.01, 100))
  return [round2(due), ...notes, top]
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
export function lineDuration(line: Pick<Line, 'type' | 'refId' | 'appointmentItemId' | 'appointmentId' | 'name'>, data: Pick<DbData, 'services' | 'appointments'>): number | undefined {
  if (line.type === 'manual') return 5
  if (line.type === 'service') {
    const appt = line.appointmentId ? data.appointments.find((a) => a.id === line.appointmentId) : undefined
    const item = appt?.items.find((i) => i.id === line.appointmentItemId)
    if (item) return item.durationMin
    const service = data.services.find((s) => s.id === line.refId)
    // Variant lines are named "Service - Variant" (see useAddService).
    return service?.variants.find((v) => `${service.name} - ${v.name}` === line.name)?.durationMin ?? service?.durationMin
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

/** Lines of an existing sale (paying an unpaid / part-paid sale or a draft), with their remembered rewards and package sessions. */
export function linesFromSale(sale: Sale, offers: Record<ID, LineOffer> = {}): Line[] {
  return sale.items.map((i) => ({
    ...(i.type !== 'package' && (offers[i.id]?.redeem || offers[i.id]?.rewardId) ? offers[i.id] : {}),
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

// ─── Rewards, package benefits and discounts ────────────────────────────

/** Something that lowers a line's price: a package session, a client reward or a point-of-sale deal. */
export type Offer =
  | { kind: 'benefit'; key: string; clientPackageId: ID; benefitId: ID; packageName: string; left: number; expiresAt?: string }
  | { kind: 'reward'; key: string; reward: ClientReward }
  | { kind: 'deal'; key: string; deal: Deal }

/** Price of a line before any reward, benefit or discount. */
export const basePrice = (line: Pick<Line, 'unitPrice' | 'originalPrice'>): number => (line.originalPrice !== undefined && line.originalPrice > line.unitPrice ? line.originalPrice : line.unitPrice)

/** Key of the offer applied to a line ('' = none). */
export function appliedOfferKey(line: Pick<Line, 'redeem' | 'rewardId' | 'discount'>): string {
  if (line.redeem) return `benefit:${line.redeem.clientPackageId}:${line.redeem.benefitId}`
  if (line.rewardId) return `reward:${line.rewardId}`
  if (line.discount?.dealId) return `deal:${line.discount.dealId}`
  return ''
}

/** Unit price of a line once the offer is applied (deals stay a line discount). */
export function offerUnitPrice(base: number, offer: Offer): number {
  if (offer.kind === 'benefit') return 0
  if (offer.kind === 'deal') return base
  const r = offer.reward
  if (r.type === 'percent') return round2(Math.max(0, base * (1 - r.value / 100)))
  if (r.type === 'amount') return round2(Math.max(0, base - r.value))
  return 0
}

/** Item total of one unit with the offer, for "€21.25 ~~€25~~" labels. */
export function offerTotal(base: number, offer: Offer): number {
  if (offer.kind !== 'deal') return offerUnitPrice(base, offer)
  return round2(Math.max(0, offer.deal.discountType === 'percent' ? base * (1 - offer.deal.value / 100) : base - offer.deal.value))
}

export interface OfferLabels {
  packageBenefit: string
  manualReward: string
}

/** The patch that applies (or, with null, removes) an offer on a line. */
export function applyOffer(line: Line, offer: Offer | null, labels: OfferLabels): Partial<Line> {
  const base = basePrice(line)
  const cleared: Partial<Line> = { unitPrice: base, originalPrice: undefined, benefitNote: undefined, redeem: undefined, rewardId: undefined, discount: undefined }
  if (!offer) return cleared
  if (offer.kind === 'deal') return { ...cleared, discount: { type: offer.deal.discountType === 'percent' ? 'percent' : 'amount', value: offer.deal.value, dealId: offer.deal.id }, benefitNote: offer.deal.name }
  if (offer.kind === 'benefit') return { ...cleared, unitPrice: 0, originalPrice: base, benefitNote: labels.packageBenefit, redeem: { clientPackageId: offer.clientPackageId, benefitId: offer.benefitId } }
  return { ...cleared, unitPrice: offerUnitPrice(base, offer), originalPrice: base, benefitNote: labels.manualReward, rewardId: offer.reward.id }
}

const rewardFits = (reward: ClientReward, type: Line['type']) => {
  if (reward.type === 'free_service') return type === 'service'
  if (reward.type === 'free_product') return type === 'product'
  return type === 'service' || type === 'service_addon' || type === 'product'
}

/**
 * Offers a line can use: the client's package sessions for the service, the
 * client's unused rewards and active point-of-sale deals. Sessions and rewards
 * already used by other lines of the cart are left out.
 */
export function offersForLine(line: Line, lines: Line[], clientId: ID | null, deals: Deal[], today: string): Offer[] {
  const others = lines.filter((l) => l.key !== line.key)
  const out: Offer[] = []
  if (clientId && line.type === 'service' && line.refId) {
    const data = availablePackageBenefits(clientId, line.refId)
    for (const b of data) {
      const used = others.filter((l) => l.redeem?.clientPackageId === b.clientPackageId && l.redeem.benefitId === b.benefitId).reduce((s, l) => s + l.quantity, 0)
      const left = b.left - used
      if (left >= line.quantity) out.push({ kind: 'benefit', key: `benefit:${b.clientPackageId}:${b.benefitId}`, clientPackageId: b.clientPackageId, benefitId: b.benefitId, packageName: b.packageName, left })
    }
  }
  if (clientId) {
    for (const reward of availableRewards(clientId)) {
      if (!rewardFits(reward, line.type) || others.some((l) => l.rewardId === reward.id)) continue
      out.push({ kind: 'reward', key: `reward:${reward.id}`, reward })
    }
  }
  for (const deal of dealsForLine(line, deals, today)) out.push({ kind: 'deal', key: `deal:${deal.id}`, deal })
  return out
}

/** Offers stored on a cart line, as remembered for saved sales. */
export const lineOfferOf = (line: Pick<Line, 'redeem' | 'rewardId'>): LineOffer => ({ rewardId: line.rewardId, redeem: line.redeem })
