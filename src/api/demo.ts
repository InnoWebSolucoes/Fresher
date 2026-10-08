import { addDays, format, parseISO } from 'date-fns'
import { commit, db, replaceAll } from '@/store/db'
import { useSessionStore } from '@/store/session'
import type { Appointment, BookingChannel, ID, ISODate, Review } from '@/types'
import { buildSeed } from '@/mock/seed'
import { getAvailableSlots, type Slot } from '@/lib/availability'
import { uid } from '@/lib/ids'
import { now, nowISO, toISODate } from '@/lib/time'
import { round2 } from '@/lib/format'
import { ApiError, latency } from './client'
import { cancelAppointment, createAppointment, rescheduleAppointment } from './appointments'
import { checkout, sellGiftCardOnline } from './sales'
import { pushNotification, queueMessage } from './messaging'

/**
 * Presenter tools (SPEC §5). Client-side activity enters the demo through
 * these functions; each one updates the calendar, notifications, client
 * profile, sales and reports exactly as a real event would.
 */

const clientName = (clientId: ID | null) => {
  const c = db().clients.find((x) => x.id === clientId)
  return c ? `${c.firstName} ${c.lastName}` : 'Walk-In'
}

export async function resetDemo(): Promise<void> {
  await latency(400, 700)
  const override = db().meta?.todayOverride
  const data = buildSeed(now())
  data.meta.todayOverride = override
  replaceAll(data)
  const session = useSessionStore.getState()
  if (session.currentUserId && !data.users.some((u) => u.id === session.currentUserId)) session.setCurrentUser(null)
}

/** Time travel: set the demo's "now" (ISO), or clear it with null. */
export async function setDemoNow(iso: string | null): Promise<void> {
  await latency(100, 200)
  commit((d) => {
    d.meta.todayOverride = iso ?? undefined
  })
}

export interface OnlineBookingQuery {
  clientId: ID
  serviceId: ID
  variantId?: ID
  teamMemberId: ID | null
  locationId: ID
  date: ISODate
}

/** Free online slots for the booking form (uses the availability engine). */
export function findOnlineSlots(q: OnlineBookingQuery, excludeAppointmentId?: ID): Slot[] {
  return getAvailableSlots(db(), {
    locationId: q.locationId,
    date: q.date,
    items: [{ serviceId: q.serviceId, variantId: q.variantId, teamMemberId: q.teamMemberId }],
    online: true,
    now: now(),
    excludeAppointmentId,
  })
}

/** Search forward from `date` for the first day with online availability. */
export function firstOnlineSlotFrom(q: OnlineBookingQuery, days = 21): { date: ISODate; slots: Slot[] } | null {
  for (let i = 0; i < days; i++) {
    const date = toISODate(addDays(parseISO(q.date), i))
    const slots = findOnlineSlots({ ...q, date })
    if (slots.length) return { date, slots }
  }
  return null
}

export async function simulateOnlineBooking(input: OnlineBookingQuery & { slot: Slot; channel: BookingChannel; deposit: boolean }): Promise<Appointment> {
  const service = db().services.find((s) => s.id === input.serviceId)
  if (!service) throw new ApiError('not_found', 'Service not found')
  const assignment = input.slot.assignments[0]
  const variant = service.variants.find((v) => v.id === input.variantId)
  const price = variant?.price ?? service.price
  const depositPct = db().settings.paymentPolicy.depositPct
  return createAppointment({
    clientId: input.clientId,
    locationId: input.locationId,
    date: input.date,
    items: [{ serviceId: service.id, variantId: variant?.id, teamMemberId: assignment.teamMemberId, start: assignment.start, resourceId: assignment.resourceId, preferred: Boolean(input.teamMemberId) }],
    source: 'online',
    channel: input.channel,
    deposit: input.deposit ? round2((price * depositPct) / 100) : undefined,
    createdBy: clientName(input.clientId),
  })
}

/** Upcoming appointments a client could change online. */
export function upcomingAppointments(): Appointment[] {
  const today = toISODate(now())
  return db()
    .appointments.filter((a) => a.clientId && a.date >= today && (a.status === 'booked' || a.status === 'confirmed'))
    .sort((a, b) => (a.date + a.items[0].start).localeCompare(b.date + b.items[0].start))
}

export async function simulateClientReschedule(appointmentId: ID, date: ISODate, slot: Slot): Promise<void> {
  const appt = db().appointments.find((a) => a.id === appointmentId)
  if (!appt) throw new ApiError('not_found', 'Appointment not found')
  const who = clientName(appt.clientId)
  await rescheduleAppointment(appointmentId, { date, start: slot.start, teamMemberId: slot.assignments[0].teamMemberId }, { notify: true, by: who })
  pushNotification({ tab: 'appointments', title: 'Appointment rescheduled', body: `${who} moved ${appt.items[0].name} to ${format(parseISO(date), 'EEE d MMM')} at ${slot.start}`, link: `/calendar?date=${date}&drawer=appointment&id=${appointmentId}` })
}

export async function simulateClientCancel(appointmentId: ID): Promise<{ late: boolean; fee: number }> {
  const appt = db().appointments.find((a) => a.id === appointmentId)
  if (!appt) throw new ApiError('not_found', 'Appointment not found')
  const who = clientName(appt.clientId)
  await cancelAppointment(appointmentId, { reasonId: 'cr_unavailable', notify: true, chargeFee: true, by: who })
  const after = db().appointments.find((a) => a.id === appointmentId)!
  pushNotification({
    tab: 'appointments',
    title: after.cancellation?.late ? 'Late cancellation' : 'Appointment canceled',
    body: `${who} canceled ${appt.items[0].name} on ${format(parseISO(appt.date), 'EEE d MMM')} at ${appt.items[0].start}${after.cancellation?.fee ? ` · €${after.cancellation.fee.toFixed(2)} fee charged` : ''}`,
    link: `/calendar?date=${appt.date}&drawer=appointment&id=${appointmentId}`,
  })
  return { late: Boolean(after.cancellation?.late), fee: after.cancellation?.fee ?? 0 }
}

export async function simulateGiftCardPurchase(clientId: ID, value: number, recipientName?: string) {
  return sellGiftCardOnline(clientId, value, recipientName)
}

export async function simulateStoreOrder(clientId: ID, lines: { productId: ID; qty: number }[], fulfilment: 'pickup' | 'shipping'): Promise<void> {
  const data = db()
  const shipping = fulfilment === 'shipping' ? 4.5 : 0
  const items = lines.map((l) => {
    const p = data.products.find((x) => x.id === l.productId)!
    return { type: 'product' as const, refId: p.id, name: p.name, quantity: l.qty, unitPrice: p.retailPrice, teamMemberId: null }
  })
  const total = round2(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) + shipping)
  const sale = await checkout({
    clientId,
    locationId: data.locations[0].id,
    items: [...items, ...(shipping ? [{ type: 'shipping' as const, name: 'Shipping', quantity: 1, unitPrice: shipping, teamMemberId: null }] : [])],
    tips: [],
    payments: [{ method: 'online_card', amount: total, methodLabel: 'Card (online)' }],
  })
  const number = db().meta.nextOrderNumber
  commit((d) => {
    d.meta.nextOrderNumber++
    d.productOrders.unshift({ id: uid('po'), number, clientId, items: lines.map((l) => ({ productId: l.productId, qty: l.qty, price: d.products.find((p) => p.id === l.productId)!.retailPrice })), shipping, total, fulfilment, status: 'new', saleId: sale.id, createdAt: nowISO() })
    const s = d.sales.find((x) => x.id === sale.id)
    if (s) s.channel = 'store'
  })
  const client = data.clients.find((c) => c.id === clientId)!
  pushNotification({ tab: 'online_sales', title: 'New product order', body: `Order #${number} from ${client.firstName} ${client.lastName} • €${total.toFixed(2)}`, link: '/sales/store-orders', initials: `${client.firstName[0]}${client.lastName[0]}` })
  queueMessage({ clientId, to: client.email, toName: `${client.firstName} ${client.lastName}`, channel: 'email', type: 'receipt', subject: `Order #${number} confirmed`, body: `Thanks ${client.firstName}! We received your order #${number} (${items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}). ${fulfilment === 'pickup' ? "We'll let you know when it's ready to collect." : "We'll email you when it ships."}`, saleId: sale.id })
}

export async function simulateReview(input: { clientId: ID; appointmentId?: ID; rating: Review['rating']; text: string }): Promise<void> {
  await latency()
  const appt = db().appointments.find((a) => a.id === input.appointmentId)
  const memberId = appt?.items[0].teamMemberId
  commit((d) => {
    d.reviews.unshift({ id: uid('rev'), clientId: input.clientId, appointmentId: input.appointmentId, teamMemberId: memberId, serviceName: appt?.items[0].name, rating: input.rating, text: input.text, at: nowISO(), platform: 'marketplace', hasImages: false })
    const member = d.teamMembers.find((m) => m.id === memberId)
    if (member) {
      const mine = d.reviews.filter((r) => r.teamMemberId === member.id)
      member.reviewCount = mine.length
      member.rating = round2(mine.reduce((s, r) => s + r.rating, 0) / mine.length)
    }
  })
  const c = db().clients.find((x) => x.id === input.clientId)!
  pushNotification({ tab: 'reviews', title: `New ${input.rating}-star review`, body: `${c.firstName} ${c.lastName}: "${input.text || 'No comment'}"`, link: '/clients/online-reputation?tab=all', initials: `${c.firstName[0]}${c.lastName[0]}` })
}

export async function simulateClientMessage(clientId: ID, text: string): Promise<void> {
  await latency()
  const at = nowISO()
  commit((d) => {
    let conv = d.conversations.find((c) => c.clientId === clientId)
    if (!conv) {
      conv = { id: uid('cv'), clientId, status: 'open', unread: true, updatedAt: at, messages: [] }
      d.conversations.unshift(conv)
    }
    conv.messages.push({ id: uid('cm'), from: 'client', text, at })
    conv.status = 'open'
    conv.unread = true
    conv.updatedAt = at
  })
  const c = db().clients.find((x) => x.id === clientId)!
  pushNotification({ tab: 'actions', title: 'New client message', body: `${c.firstName} ${c.lastName}: ${text}`, link: '/connect', initials: `${c.firstName[0]}${c.lastName[0]}` })
}

// ─── Business events ─────────────────────────────────────────────────────

export async function simulateLowStock(productId: ID): Promise<void> {
  await latency()
  const product = db().products.find((p) => p.id === productId)
  if (!product) return
  const target = Math.max(0, product.lowStockLevel - 2)
  commit((d) => {
    const p = d.products.find((x) => x.id === productId)!
    d.stockMovements.push({ id: uid('sm'), productId, locationId: d.locations[0].id, qty: target - p.stock, reason: 'Sale', by: 'Online store', at: nowISO() })
    p.stock = target
  })
  pushNotification({ tab: 'actions', title: 'Low stock', body: `${product.name} has ${target} left (low stock level ${product.lowStockLevel}). Reorder ${product.reorderQty}.`, link: `/catalogue/products?drawer=product&id=${productId}` })
}

/** The next card payment at checkout fails with "Card declined". */
export function armCardDecline(): void {
  ;(globalThis as unknown as { __ibDeclineNext?: boolean }).__ibDeclineNext = true
}

export async function simulatePayout(): Promise<number> {
  await latency()
  const amount = round2(Math.max(0, db().wallet.available))
  if (amount <= 0) throw new ApiError('empty', 'There is nothing available to pay out')
  commit((d) => {
    d.payouts.unshift({ id: uid('po'), amount, at: nowISO(), status: 'paid', bankLast4: '4417' })
    d.wallet.balance = round2(d.wallet.balance - amount)
    d.wallet.available = 0
    d.wallet.transactions.unshift({ id: uid('wt'), at: nowISO(), type: 'payout', description: 'Payout to bank account ending 4417', amount: -amount })
  })
  pushNotification({ tab: 'actions', title: 'Payout completed', body: `€${amount.toFixed(2)} was sent to your bank account ending 4417.`, link: '/dashboard?drawer=wallet&tab=accounts' })
  return amount
}

const marketingModules = import.meta.glob<{ approvePendingCampaign?: (id: ID) => Promise<unknown> }>('./marketing.ts')

/** Approves the oldest campaign waiting for review (Marketing owns the transition). */
export async function simulateCampaignApproval(): Promise<string> {
  const pending = db().campaigns.find((c) => c.status === 'pending')
  if (!pending) throw new ApiError('none', 'No campaigns are waiting for review')
  const loader = marketingModules['./marketing.ts']
  const mod = loader ? await loader() : undefined
  if (mod?.approvePendingCampaign) {
    await mod.approvePendingCampaign(pending.id)
  } else {
    await latency()
    commit((d) => {
      const c = d.campaigns.find((x) => x.id === pending.id)!
      c.status = c.scheduledAt && c.scheduledAt > nowISO() ? 'scheduled' : 'sent'
      if (c.status === 'sent') c.sentAt = nowISO()
    })
  }
  pushNotification({ tab: 'actions', title: 'Campaign approved', body: `"${pending.name}" passed review and is ${db().campaigns.find((c) => c.id === pending.id)?.status}.`, link: `/marketing/blast-campaigns/${pending.id}` })
  return pending.name
}
