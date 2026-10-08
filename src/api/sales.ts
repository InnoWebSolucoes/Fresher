import { addDays, addMonths, addWeeks, addYears, parseISO } from 'date-fns'
import { commit, db } from '@/store/db'
import type { GiftCard, ID, Payment, PaymentMethod, Sale, SaleItem, SaleStatus } from '@/types'
import { giftCode, uid } from '@/lib/ids'
import { nowISO, toISODate, todayISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { activity, actorName, ApiError, latency } from './client'
import { notifyAppointment, pushNotification, queueMessage } from './messaging'

/** One line in the checkout cart. */
export interface CartItem {
  id?: ID
  type: SaleItem['type']
  refId?: ID
  name: string
  detail?: string
  quantity: number
  unitPrice: number
  originalPrice?: number
  discount?: SaleItem['discount']
  teamMemberId: ID | null
  appointmentId?: ID
  appointmentItemId?: ID
  /** Gift card options (type 'gift_card'). */
  giftCard?: { value: number; expiry: string; customCode?: string; isGift: boolean; sendEmail: boolean; ownerClientId?: ID | null }
  benefitNote?: string
}

export interface PaymentInput {
  method: PaymentMethod
  amount: number
  customMethodId?: ID
  methodLabel?: string
  giftCardId?: ID
  change?: number
  collectedById?: ID
}

export interface CheckoutInput {
  /** Pay an existing unpaid/part-paid sale or a draft. */
  saleId?: ID
  clientId: ID | null
  locationId: ID
  appointmentId?: ID
  items: CartItem[]
  tips: { teamMemberId: ID; amount: number }[]
  cartDiscount?: Sale['cartDiscount']
  serviceCharges?: Sale['serviceCharges']
  receiptNote?: string
  payments: PaymentInput[]
  /** Status to save with when not fully paid. */
  saveAs?: 'unpaid' | 'draft'
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  other: 'Other',
  gift_card: 'Gift card',
  card_terminal: 'Card terminal',
  self_checkout: 'Self checkout',
  qr_code: 'QR code',
  manual_card: 'Manual card entry',
  deposit: 'Deposit',
  online_card: 'Card',
  custom: 'Other',
}

export function lineTotal(item: Pick<SaleItem, 'unitPrice' | 'quantity' | 'discount'>): number {
  const gross = item.unitPrice * item.quantity
  if (!item.discount) return round2(gross)
  return round2(item.discount.type === 'percent' ? gross * (1 - item.discount.value / 100) : gross - item.discount.value)
}

/** Totals for a cart or sale (prices are tax inclusive). */
export function computeTotals(sale: Pick<Sale, 'items' | 'tips' | 'cartDiscount' | 'serviceCharges'>) {
  const itemsTotal = round2(sale.items.reduce((s, i) => s + lineTotal(i), 0))
  const itemsBeforeDiscounts = round2(sale.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0))
  const cartDiscount = sale.cartDiscount ? round2(sale.cartDiscount.type === 'percent' ? (itemsTotal * sale.cartDiscount.value) / 100 : sale.cartDiscount.value) : 0
  const subtotal = round2(itemsTotal - cartDiscount)
  const serviceCharges = round2((sale.serviceCharges ?? []).reduce((s, c) => s + c.amount, 0))
  const taxable = sale.items.filter((i) => i.taxRate > 0)
  const taxBase = round2(taxable.reduce((s, i) => s + lineTotal(i), 0) * (itemsTotal ? subtotal / itemsTotal : 1))
  const tax = round2((taxBase * 0.23) / 1.23)
  const tips = round2(sale.tips.reduce((s, t) => s + t.amount, 0))
  const total = round2(subtotal + serviceCharges + tips)
  return { itemsBeforeDiscounts, itemsTotal, cartDiscount, subtotal, serviceCharges, tax, tips, total }
}

export function salePaid(sale: Pick<Sale, 'paymentIds'>, payments = db().payments): number {
  return round2(payments.filter((p) => sale.paymentIds.includes(p.id) && p.status === 'succeeded').reduce((s, p) => s + p.amount, 0))
}

export function saleBalance(sale: Sale): number {
  return round2(computeTotals(sale).total - salePaid(sale))
}

function expiryDate(expiry: string): string | undefined {
  if (expiry === 'Never') return undefined
  const [n, unit] = expiry.split(' ')
  const count = Number(n)
  const base = parseISO(todayISO())
  const date = unit.startsWith('day') ? addDays(base, count) : unit.startsWith('week') ? addWeeks(base, count) : unit.startsWith('month') ? addMonths(base, count) : addYears(base, count)
  return toISODate(date)
}

/** The open register session at a location, if any. */
export function openRegisterSession(locationId: ID) {
  const data = db()
  const registerIds = data.registers.filter((r) => r.locationId === locationId && !r.archived).map((r) => r.id)
  return data.registerSessions.find((s) => registerIds.includes(s.registerId) && !s.closedAt)
}

/**
 * Checkout: creates or updates a sale with its payments. Issues gift cards,
 * client packages and memberships, moves product stock, redeems gift cards,
 * applies deposits and completes the appointment. Returns the sale id.
 */
export async function checkout(input: CheckoutInput): Promise<Sale> {
  await latency(500, 900)
  const data = db()
  const by = actorName()
  const at = nowISO()
  const existing = input.saleId ? data.sales.find((s) => s.id === input.saleId) : undefined
  const appointment = input.appointmentId ? data.appointments.find((a) => a.id === input.appointmentId) : undefined

  // Gift card balances must cover redemptions.
  for (const p of input.payments.filter((x) => x.method === 'gift_card')) {
    const card = data.giftCards.find((g) => g.id === p.giftCardId)
    if (!card || card.status !== 'active' || card.balance + 0.001 < p.amount) throw new ApiError('gift_card', 'Gift card balance is too low')
  }
  const declined = input.payments.find((p) => (window as unknown as { __ibDeclineNext?: boolean }).__ibDeclineNext && ['card_terminal', 'manual_card', 'qr_code', 'self_checkout'].includes(p.method))
  if (declined) {
    ;(window as unknown as { __ibDeclineNext?: boolean }).__ibDeclineNext = false
    throw new ApiError('card_declined', 'Card declined. Ask the client for another payment method.')
  }

  const items: SaleItem[] = input.items.map((c) => ({ ...c, id: c.id ?? uid('si'), taxRate: c.type === 'gift_card' ? 0 : 0.23, giftCard: undefined }) as SaleItem)
  const draft: Sale = existing
    ? { ...existing, items, tips: input.tips, cartDiscount: input.cartDiscount, serviceCharges: input.serviceCharges ?? [], receiptNote: input.receiptNote }
    : {
        id: uid('sale'),
        number: 0,
        kind: 'sale',
        status: 'unpaid',
        clientId: input.clientId,
        locationId: input.locationId,
        appointmentId: input.appointmentId,
        createdAt: at,
        createdBy: by,
        items,
        cartDiscount: input.cartDiscount,
        serviceCharges: input.serviceCharges ?? [],
        tips: input.tips,
        receiptNote: input.receiptNote,
        paymentIds: [],
        channel: appointment?.channel ?? 'offline',
        notes: [],
        activity: [],
      }
  const totals = computeTotals(draft)
  // Deposit held on the appointment is applied automatically.
  const deposit = appointment?.deposit && !existing ? data.payments.find((p) => p.id === appointment.deposit?.paymentId && p.kind === 'deposit') : undefined
  const alreadyPaid = existing ? salePaid(existing) : 0
  const newPaid = round2(input.payments.reduce((s, p) => s + p.amount, 0) + (deposit?.amount ?? 0))
  const paid = round2(alreadyPaid + newPaid)
  const status: SaleStatus = paid + 0.004 >= totals.total ? 'completed' : paid > 0 ? 'part_paid' : input.saveAs === 'draft' ? 'draft' : 'unpaid'

  const session = openRegisterSession(input.locationId)
  const createdPayments: Payment[] = input.payments.map((p) => ({
    id: uid('pay'),
    saleId: draft.id,
    kind: 'sale',
    method: p.method,
    customMethodId: p.customMethodId,
    methodLabel: p.methodLabel ?? (p.method === 'gift_card' ? `Gift card (${data.giftCards.find((g) => g.id === p.giftCardId)?.code})` : PAYMENT_LABELS[p.method]),
    amount: round2(p.amount),
    change: p.change,
    at,
    by,
    collectedById: p.collectedById,
    giftCardId: p.giftCardId,
    registerSessionId: p.method === 'cash' ? session?.id : undefined,
    status: 'succeeded',
    clientId: input.clientId,
    locationId: input.locationId,
  }))

  const issuedCards: GiftCard[] = []
  commit((d) => {
    let sale = d.sales.find((s) => s.id === draft.id)
    if (!sale) {
      draft.number = d.meta.nextSaleNumber++
      d.sales.push(draft)
      sale = d.sales.find((s) => s.id === draft.id)!
      sale.activity.unshift(activity(`Sale ${draft.number} created`, status === 'completed' ? `Completed by ${by}` : undefined))
    } else {
      Object.assign(sale, { items, tips: input.tips, cartDiscount: input.cartDiscount, serviceCharges: input.serviceCharges ?? [], receiptNote: input.receiptNote })
    }
    if (deposit) {
      const dep = d.payments.find((p) => p.id === deposit.id)!
      dep.saleId = sale.id
      sale.paymentIds.push(dep.id)
    }
    for (const p of createdPayments) {
      p.saleId = sale.id
      d.payments.push(p)
      sale.paymentIds.push(p.id)
      sale.activity.unshift(activity(`€${p.amount.toFixed(2)} paid by ${p.methodLabel}`, `Paid with ${p.methodLabel}. Payment taken by ${by}`))
      if (p.method === 'gift_card' && p.giftCardId) {
        const card = d.giftCards.find((g) => g.id === p.giftCardId)!
        card.balance = round2(card.balance - p.amount)
        if (card.balance <= 0.004) card.status = 'redeemed'
        card.activity.unshift(activity('Gift card redeemed', `€${p.amount.toFixed(2)} in sale ${sale.number}`))
      }
      if (['card_terminal', 'qr_code', 'self_checkout', 'manual_card'].includes(p.method)) {
        d.wallet.balance = round2(d.wallet.balance + p.amount * 0.985)
        d.wallet.available = round2(d.wallet.available + p.amount * 0.985)
        d.wallet.transactions.unshift({ id: uid('wt'), at, type: 'payment', description: `${p.methodLabel} · Sale ${sale.number}`, amount: p.amount })
      }
    }
    const wasCompleted = sale.status === 'completed'
    sale.status = status
    if (status === 'completed' && !wasCompleted) {
      sale.completedAt = at
      // Side effects that happen once, when the sale is paid in full.
      input.items.forEach((cartItem, index) => {
        const line = sale!.items[index]
        if (cartItem.type === 'gift_card' && cartItem.giftCard) {
          const gc: GiftCard = {
            id: uid('gc'),
            code: giftCode(),
            customCode: cartItem.giftCard.customCode,
            value: cartItem.giftCard.value,
            price: cartItem.unitPrice,
            balance: cartItem.giftCard.value,
            issuedAt: at,
            expiresAt: expiryDate(cartItem.giftCard.expiry),
            status: 'active',
            purchaserClientId: input.clientId,
            ownerClientId: cartItem.giftCard.isGift ? null : (cartItem.giftCard.ownerClientId ?? input.clientId),
            saleId: sale!.id,
            isGift: cartItem.giftCard.isGift,
            onlinePurchase: false,
            activity: [activity('Gift card purchased', `View sale ${sale!.number}`)],
          }
          d.giftCards.push(gc)
          issuedCards.push(gc)
          line.giftCardId = gc.id
          line.detail = `${gc.code} • €${gc.value} value • ${cartItem.giftCard.expiry === 'Never' ? 'never expires' : `valid for ${cartItem.giftCard.expiry}`}`
        }
        if (cartItem.type === 'package' && cartItem.refId && input.clientId) {
          const def = d.packages.find((p) => p.id === cartItem.refId)
          if (def) {
            const start = parseISO(todayISO())
            const expires = def.expiresUnit === 'days' ? addDays(start, def.expiresValue) : def.expiresUnit === 'weeks' ? addWeeks(start, def.expiresValue) : def.expiresUnit === 'months' ? addMonths(start, def.expiresValue) : addYears(start, def.expiresValue)
            const cp = { id: uid('cpkg'), packageId: def.id, clientId: input.clientId, saleId: sale!.id, startDate: todayISO(), expiresAt: toISODate(expires), status: 'active' as const, usage: def.benefits.map((b) => ({ benefitId: b.id, used: 0 })), price: cartItem.unitPrice }
            d.clientPackages.push(cp)
            line.clientPackageId = cp.id
          }
        }
        if (cartItem.type === 'membership' && cartItem.refId && input.clientId) {
          const def = d.memberships.find((m) => m.id === cartItem.refId)
          if (def) {
            const cm = { id: uid('cmem'), membershipId: def.id, clientId: input.clientId, saleId: sale!.id, startDate: todayISO(), nextBillingAt: toISODate(def.interval === 'month' ? addMonths(parseISO(todayISO()), 1) : addWeeks(parseISO(todayISO()), 1)), status: 'active' as const, price: def.price }
            d.clientMemberships.push(cm)
            line.clientMembershipId = cm.id
          }
        }
        if (cartItem.type === 'product' && cartItem.refId) {
          const product = d.products.find((p) => p.id === cartItem.refId)
          if (product?.trackStock) {
            product.stock -= cartItem.quantity
            d.stockMovements.push({ id: uid('sm'), productId: product.id, locationId: input.locationId, qty: -cartItem.quantity, reason: 'Sale', by, at, ref: `Sale ${sale!.number}` })
            if (product.lowStockNotify && product.stock <= product.lowStockLevel) {
              d.notifications.unshift({ id: uid('nt'), tab: 'actions', title: 'Low stock', body: `${product.name} has ${product.stock} left (low stock level ${product.lowStockLevel}).`, at, read: false, link: `/catalogue/products?drawer=product&id=${product.id}` })
            }
          }
        }
      })
      if (input.appointmentId) {
        const appt = d.appointments.find((a) => a.id === input.appointmentId)
        if (appt) {
          appt.status = 'completed'
          appt.saleId = sale.id
          appt.activity.unshift(activity('Appointment checked out', `Sale ${sale.number}`))
        }
      }
      if (sale.tips.length) {
        d.notifications.unshift({ id: uid('nt'), tab: 'tips', title: 'New tip', body: `€${round2(sale.tips.reduce((s, t) => s + t.amount, 0)).toFixed(2)} tip in sale ${sale.number}`, at, read: false, link: `/sales/sales-list?drawer=sale&id=${sale.id}` })
      }
    } else if (input.appointmentId) {
      const appt = d.appointments.find((a) => a.id === input.appointmentId)
      if (appt) appt.saleId = sale.id
    }
  })

  const saved = db().sales.find((s) => s.id === draft.id)!
  if (status === 'completed' && appointment) notifyAppointment(db().appointments.find((a) => a.id === appointment.id)!, 'thank_you')
  for (const [index, cartItem] of input.items.entries()) {
    const card = issuedCards.find((g) => g.id === saved.items[index]?.giftCardId)
    if (card && cartItem.giftCard?.sendEmail && input.clientId) {
      const client = db().clients.find((c) => c.id === input.clientId)
      if (client) queueMessage({ clientId: client.id, to: client.email, toName: `${client.firstName} ${client.lastName}`, channel: 'email', type: 'gift_card', subject: `Your €${card.value} gift card for ${db().workspace.name}`, body: `Gift card code ${card.code}. Use it at checkout or when booking online.${card.expiresAt ? ` Valid until ${card.expiresAt}.` : ''}`, saleId: saved.id })
    }
  }
  return saved
}

/** Find an active gift card by code or custom code (Redeem gift). */
export async function findGiftCard(code: string): Promise<GiftCard> {
  await latency()
  const value = code.trim().toUpperCase()
  const card = db().giftCards.find((g) => g.code === value || g.customCode?.toUpperCase() === value)
  if (!card) throw new ApiError('not_found', 'No gift card found with this code')
  if (card.status !== 'active') throw new ApiError('inactive', `This gift card is ${card.status}`)
  return card
}

export interface RefundInput {
  saleId: ID
  /** Items to refund (ids of the original sale lines) or a fixed amount. */
  itemIds?: ID[]
  amount?: number
  method: PaymentMethod
  methodLabel?: string
  reason: string
}

export async function refundSale(input: RefundInput): Promise<Sale> {
  await latency(500, 900)
  const data = db()
  const original = data.sales.find((s) => s.id === input.saleId)
  if (!original) throw new ApiError('not_found', 'Sale not found')
  const lines = input.itemIds ? original.items.filter((i) => input.itemIds!.includes(i.id)) : []
  const amount = input.amount ?? round2(lines.reduce((s, i) => s + lineTotal(i), 0) * (computeTotals(original).itemsTotal ? computeTotals(original).subtotal / computeTotals(original).itemsTotal : 1))
  const by = actorName()
  const at = nowISO()
  const refundId = uid('sale')
  commit((d) => {
    const number = d.meta.nextSaleNumber++
    const paymentId = uid('pay')
    const items: SaleItem[] = lines.length
      ? lines.map((l) => ({ ...l, id: uid('si'), unitPrice: -round2((lineTotal(l) / l.quantity) * (amount / (lines.reduce((s, x) => s + lineTotal(x), 0) || 1))), discount: undefined }))
      : [{ id: uid('si'), type: 'manual', name: 'Refund amount', quantity: 1, unitPrice: -amount, teamMemberId: null, taxRate: 0.23 }]
    d.sales.push({
      id: refundId,
      number,
      kind: 'refund',
      status: 'refunded',
      clientId: original.clientId,
      locationId: original.locationId,
      createdAt: at,
      completedAt: at,
      createdBy: by,
      items,
      serviceCharges: [],
      tips: [],
      paymentIds: [paymentId],
      refundOfId: original.id,
      refundReason: input.reason,
      channel: original.channel,
      notes: [],
      activity: [activity(`Refund ${number} created`, `Refund of sale ${original.number}`)],
    })
    d.payments.push({ id: paymentId, saleId: refundId, kind: 'refund', method: input.method, methodLabel: input.methodLabel ?? PAYMENT_LABELS[input.method], amount: -amount, at, by, status: 'succeeded', clientId: original.clientId, locationId: original.locationId, registerSessionId: input.method === 'cash' ? openRegisterSession(original.locationId)?.id : undefined })
    const o = d.sales.find((s) => s.id === original.id)!
    o.refundedById = refundId
    o.activity.unshift(activity('Sale refunded', `€${amount.toFixed(2)} · ${input.reason}`))
    for (const line of lines) {
      if (line.type === 'product' && line.refId) {
        const product = d.products.find((p) => p.id === line.refId)
        if (product?.trackStock) {
          product.stock += line.quantity
          d.stockMovements.push({ id: uid('sm'), productId: product.id, locationId: original.locationId, qty: line.quantity, reason: 'Return', by, at, ref: `Refund ${number}` })
        }
      }
      if (line.type === 'gift_card' && line.giftCardId) {
        const card = d.giftCards.find((g) => g.id === line.giftCardId)
        if (card) card.status = 'cancelled'
      }
    }
  })
  return db().sales.find((s) => s.id === refundId)!
}

export async function voidSale(saleId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const sale = d.sales.find((s) => s.id === saleId)
    if (!sale) return
    sale.status = 'voided'
    sale.activity.unshift(activity('Sale voided'))
    const appt = d.appointments.find((a) => a.saleId === saleId)
    if (appt) appt.saleId = undefined
  })
}

export async function addSaleNote(saleId: ID, text: string): Promise<void> {
  await latency()
  commit((d) => {
    d.sales.find((s) => s.id === saleId)?.notes.unshift({ id: uid('sn'), text, at: nowISO(), by: actorName() })
  })
}

/** Edit sale details: team member per item, tip split, payment collector. */
export async function editSaleDetails(saleId: ID, patch: { itemTeam: Record<ID, ID | null>; tips: Sale['tips']; collectedBy?: Record<ID, ID> }): Promise<void> {
  await latency()
  commit((d) => {
    const sale = d.sales.find((s) => s.id === saleId)
    if (!sale) return
    sale.items.forEach((i) => {
      if (i.id in patch.itemTeam) i.teamMemberId = patch.itemTeam[i.id]
    })
    sale.tips = patch.tips
    for (const [paymentId, memberId] of Object.entries(patch.collectedBy ?? {})) {
      const p = d.payments.find((x) => x.id === paymentId)
      if (p) p.collectedById = memberId
    }
    sale.activity.unshift(activity('Sale details edited'))
  })
}

/** Online gift card purchase by a client (demo panel). */
export async function sellGiftCardOnline(clientId: ID, value: number, recipientName?: string): Promise<GiftCard> {
  const sale = await checkout({
    clientId,
    locationId: db().locations[0].id,
    items: [{ type: 'gift_card', name: 'Gift Card', quantity: 1, unitPrice: value, teamMemberId: null, giftCard: { value, expiry: db().settings.giftCards.expiry, isGift: Boolean(recipientName), sendEmail: true } }],
    tips: [],
    payments: [{ method: 'online_card', amount: value, methodLabel: 'Card (online)' }],
  })
  const cardId = sale.items[0].giftCardId!
  commit((d) => {
    const s = d.sales.find((x) => x.id === sale.id)
    if (s) s.channel = 'marketplace'
    const card = d.giftCards.find((g) => g.id === cardId)
    if (card) {
      card.onlinePurchase = true
      card.recipientName = recipientName
    }
  })
  const client = db().clients.find((c) => c.id === clientId)
  pushNotification({ tab: 'online_sales', title: 'Gift card sold online', body: `${client?.firstName} ${client?.lastName} bought a €${value} gift card`, link: `/sales/gift-cards?drawer=gift-card&id=${cardId}`, initials: client ? `${client.firstName[0]}${client.lastName[0]}` : undefined })
  return db().giftCards.find((g) => g.id === cardId)!
}
