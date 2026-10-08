import { format, parseISO } from 'date-fns'
import { computeTotals, lineTotal, PAYMENT_LABELS, salePaid } from '@/api/sales'
import { round2 } from '@/lib/format'
import type { Appointment, AppointmentItem, GiftCard, ID, Payment, Sale, SaleItem } from '@/types'
import type { Ctx } from './context'
import type { Fact } from './helpers'
import { L } from './labels'

const cache = <T,>() => new WeakMap<Ctx, T>()
const memo = <T,>(store: WeakMap<Ctx, T>, ctx: Ctx, build: () => T): T => {
  let v = store.get(ctx)
  if (!v) {
    v = build()
    store.set(ctx, v)
  }
  return v
}

/** Client-related filter attributes shared by every fact. */
export function clientAttrs(ctx: Ctx, clientId: ID | null, date: string): Fact['a'] {
  const c = clientId ? ctx.byId.client.get(clientId) : undefined
  return {
    client: clientId ?? 'walk_in',
    clientTags: c?.tagIds.length ? c.tagIds : ['none'],
    clientSegments: ctx.segmentsOf(clientId),
    clientGender: c ? (c.gender ?? 'undisclosed') : 'undisclosed',
    clientRetention: !c ? 'walk_in' : ctx.firstVisit.get(c.id) === date ? 'new' : 'returning',
    blockedClients: c?.blocked ? 'blocked' : 'not_blocked',
    loyalty: c?.referredById ? ['referred'] : ['none'],
  }
}

export const channelAttr = (channel: string) => (channel === 'offline' ? ['offline'] : [channel, 'online'])

export const channelLabel = (channel: string) => L(`opt.channel.${channel}`)

// ─── Sale lines ────────────────────────────────────────────────────────────

export interface LineFact extends Fact {
  sale: Sale
  item: SaleItem
  refund: boolean
  date: string
  time: string
  /** Signed quantity: sold positive, refunded negative. */
  qty: number
  grossIncl: number
  itemDisc: number
  cartDisc: number
  refundIncl: number
  netIncl: number
  rate: number
  tax: number
  /** Tax-exclusive amounts. */
  gross: number
  itemDiscEx: number
  cartDiscEx: number
  refunds: number
  net: number
  cost: number
  upsell: boolean
  giftCard: boolean
}

const lineStore = cache<LineFact[]>()

/** Every sale and refund line (drafts and voided sales excluded). */
export function lineFacts(ctx: Ctx): LineFact[] {
  return memo(lineStore, ctx, () => {
    const out: LineFact[] = []
    for (const sale of ctx.d.sales ?? []) {
      if (sale.status === 'draft' || sale.status === 'voided') continue
      const refund = sale.kind === 'refund'
      const date = ctx.day(sale.createdAt)
      const time = format(parseISO(sale.createdAt), 'HH:mm')
      const totals = computeTotals(sale)
      const pays = ctx.salePayments.get(sale.id) ?? []
      const methods = [...new Set(pays.map((p) => p.method))]
      const registers = [...new Set(pays.map((p) => (p.registerSessionId ? ctx.byId.session.get(p.registerSessionId)?.registerId : undefined)).filter(Boolean) as string[])]
      const balance = round2(totals.total - salePaid(sale, ctx.d.payments))
      const base = { ...clientAttrs(ctx, sale.clientId, date), location: sale.locationId, channel: channelAttr(sale.channel), status: refund ? 'refunded' : sale.status, paymentMethod: methods, register: registers.length ? registers : ['none'] }
      for (const item of sale.items) {
        const rate = item.taxRate || 0
        const lt = lineTotal(item)
        const qty = refund ? -item.quantity : item.quantity
        const grossIncl = refund ? 0 : round2(item.unitPrice * item.quantity)
        const itemDisc = refund ? 0 : round2(grossIncl - lt)
        const cartDisc = refund || !totals.itemsTotal ? 0 : round2((totals.cartDiscount * lt) / totals.itemsTotal)
        const refundIncl = refund ? lt : 0
        const netIncl = round2(grossIncl - itemDisc - cartDisc + refundIncl)
        const tax = round2((netIncl * rate) / (1 + rate))
        const product = item.type === 'product' && item.refId ? ctx.byId.product.get(item.refId) : undefined
        const service = item.type === 'service' && item.refId ? ctx.byId.service.get(item.refId) : undefined
        const apptItem = item.appointmentItemId ? ctx.apptItem.get(item.appointmentItemId) : undefined
        const unitCost = product ? product.supplyPrice : (service?.cost ?? 0)
        const discountCategory = itemDisc && cartDisc ? 'both' : itemDisc ? 'item' : cartDisc ? 'cart' : 'none'
        out.push({
          sale,
          item,
          refund,
          date,
          time,
          qty,
          grossIncl,
          itemDisc,
          cartDisc,
          refundIncl,
          netIncl,
          rate,
          tax,
          gross: round2(grossIncl / (1 + rate)),
          itemDiscEx: round2(itemDisc / (1 + rate)),
          cartDiscEx: round2(cartDisc / (1 + rate)),
          refunds: round2(refundIncl / (1 + rate)),
          net: round2(netIncl - tax),
          cost: round2(unitCost * qty),
          upsell: (item.type === 'service_addon' || item.type === 'product') && Boolean(sale.appointmentId),
          giftCard: item.type === 'gift_card',
          a: {
            ...base,
            teamMember: item.teamMemberId ?? 'none',
            type: item.type,
            item: item.refId ?? item.name,
            serviceCategory: service?.categoryId ?? 'none',
            category: service?.categoryId ?? product?.categoryId ?? `t_${item.type}`,
            productCategory: product?.categoryId ?? 'none',
            brand: product?.brandId ?? 'none',
            supplier: product?.supplierId ?? 'none',
            resource: apptItem?.item.resourceId ?? 'none',
            discountCategory,
            discountType: item.discount?.type ?? sale.cartDiscount?.type ?? 'none',
            taxName: rate ? `${Math.round(rate * 100)}` : 'none',
          },
          n: { totalSales: totals.total, amountDue: balance, cartDiscounts: cartDisc, saleValue: totals.total },
        })
      }
    }
    return out
  })
}

export const typeLabel = (type: string) => L(`opt.typeSingle.${type}`)

// ─── Appointments ──────────────────────────────────────────────────────────

export interface ApptFact extends Fact {
  appt: Appointment
  date: string
  value: number
  services: number
  online: boolean
  cancelled: boolean
  noShow: boolean
  isNew: boolean
  durationMin: number
}

const apptStore = cache<ApptFact[]>()

export const apptValue = (a: Appointment) => round2(a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0))

export function apptFacts(ctx: Ctx): ApptFact[] {
  return memo(apptStore, ctx, () =>
    (ctx.d.appointments ?? []).map((appt) => {
      const services = appt.items.map((i) => ctx.byId.service.get(i.serviceId))
      return {
        appt,
        date: appt.date,
        value: apptValue(appt),
        services: appt.items.length,
        online: appt.channel !== 'offline',
        cancelled: appt.status === 'cancelled',
        noShow: appt.status === 'no_show',
        isNew: Boolean(appt.clientId && ctx.firstVisit.get(appt.clientId) === appt.date),
        durationMin: appt.items.reduce((s, i) => s + i.durationMin, 0),
        a: {
          ...clientAttrs(ctx, appt.clientId, appt.date),
          location: appt.locationId,
          teamMember: [...new Set(appt.items.map((i) => i.teamMemberId))],
          category: services.map((s) => s?.categoryId ?? 'none'),
          serviceCategory: services.map((s) => s?.categoryId ?? 'none'),
          service: appt.items.map((i) => i.serviceId),
          channel: channelAttr(appt.channel),
          appointmentType: appt.groupId ? 'group' : appt.repeat ? 'repeating' : 'single',
          appointmentStatus: appt.status,
          cancellationReason: appt.cancellation?.reasonId ?? 'none',
        },
      }
    }),
  )
}

export interface ApptItemFact extends Fact {
  appt: Appointment
  item: AppointmentItem
  date: string
}

const apptItemStore = cache<ApptItemFact[]>()

export function apptItemFacts(ctx: Ctx): ApptItemFact[] {
  return memo(apptItemStore, ctx, () =>
    apptFacts(ctx).flatMap((f) =>
      f.appt.items.map((item) => {
        const service = ctx.byId.service.get(item.serviceId)
        return { appt: f.appt, item, date: f.date, a: { ...f.a, teamMember: item.teamMemberId, category: service?.categoryId ?? 'none', serviceCategory: service?.categoryId ?? 'none', service: item.serviceId } }
      }),
    ),
  )
}

// ─── Payments ──────────────────────────────────────────────────────────────

export interface PayFact extends Fact {
  p: Payment
  sale?: Sale
  date: string
  method: string
}

const payStore = cache<PayFact[]>()

export const methodLabel = (p: Payment) => (p.method === 'custom' ? p.methodLabel : PAYMENT_LABELS[p.method])

export function payFacts(ctx: Ctx): PayFact[] {
  return memo(payStore, ctx, () =>
    (ctx.d.payments ?? [])
      .filter((p) => p.status === 'succeeded')
      .map((p) => {
        const sale = p.saleId ? ctx.byId.sale.get(p.saleId) : undefined
        const date = ctx.day(p.at)
        const members = sale ? [...new Set(sale.items.map((i) => i.teamMemberId).filter(Boolean) as string[])] : []
        return {
          p,
          sale,
          date,
          method: methodLabel(p),
          a: {
            ...clientAttrs(ctx, p.clientId, date),
            location: p.locationId,
            teamMember: p.collectedById ? [p.collectedById] : members.length ? members : ['none'],
            type: sale ? [...new Set(sale.items.map((i) => i.type))] : ['service'],
            paymentMethod: p.method,
            giftCards: p.method === 'gift_card' ? 'only' : 'exclude',
            deposits: p.kind === 'deposit' ? 'only' : 'exclude',
            processedBy: p.by,
            transactionType: p.kind,
          },
          n: { paymentAmount: p.amount },
        }
      }),
  )
}

// ─── Liabilities: gift cards and prepayments ───────────────────────────────

export interface LiabilityEvent extends Fact {
  key: string
  at: string
  date: string
  liability: 'gift_card' | 'prepayment'
  activity: 'collection' | 'redemption' | 'expiration' | 'refund'
  amount: number
  ref: string
  clientId: ID | null
  saleId?: ID
  appointmentId?: ID
  locationId: ID
  card?: GiftCard
}

const liabilityStore = cache<LiabilityEvent[]>()

export function liabilityEvents(ctx: Ctx): LiabilityEvent[] {
  return memo(liabilityStore, ctx, () => {
    const out: LiabilityEvent[] = []
    const push = (e: Omit<LiabilityEvent, 'a' | 'date'>) => out.push({ ...e, date: ctx.day(e.at), a: { location: e.locationId, liabilityType: e.liability, activity: e.activity, ...clientAttrs(ctx, e.clientId, ctx.day(e.at)) } })
    for (const card of ctx.d.giftCards ?? []) {
      const sale = ctx.byId.sale.get(card.saleId)
      const locationId = sale?.locationId ?? ctx.d.locations[0]?.id
      if (sale && (sale.status === 'unpaid' || sale.status === 'voided' || sale.status === 'draft')) continue
      push({ key: `gi_${card.id}`, at: card.issuedAt, liability: 'gift_card', activity: 'collection', amount: card.value, ref: card.code, clientId: card.purchaserClientId, saleId: card.saleId, locationId, card })
      if (card.status === 'cancelled') {
        const refund = (ctx.d.sales ?? []).find((s) => s.refundOfId === card.saleId)
        push({ key: `gr_${card.id}`, at: refund?.createdAt ?? card.issuedAt, liability: 'gift_card', activity: 'refund', amount: -card.balance, ref: card.code, clientId: card.purchaserClientId, saleId: refund?.id, locationId, card })
      } else if (card.expiresAt && card.expiresAt < ctx.today && card.balance > 0) {
        push({ key: `ge_${card.id}`, at: `${card.expiresAt}T23:59:00`, liability: 'gift_card', activity: 'expiration', amount: -card.balance, ref: card.code, clientId: card.ownerClientId ?? card.purchaserClientId, locationId, card })
      }
    }
    for (const p of ctx.d.payments ?? []) {
      if (p.method !== 'gift_card' || !p.giftCardId || p.status !== 'succeeded') continue
      const card = (ctx.d.giftCards ?? []).find((g) => g.id === p.giftCardId)
      push({ key: `gp_${p.id}`, at: p.at, liability: 'gift_card', activity: 'redemption', amount: -p.amount, ref: card?.code ?? '-', clientId: p.clientId, saleId: p.saleId, locationId: p.locationId, card })
    }
    for (const appt of ctx.d.appointments ?? []) {
      if (!appt.deposit) continue
      push({ key: `dc_${appt.id}`, at: appt.deposit.paidAt, liability: 'prepayment', activity: 'collection', amount: appt.deposit.amount, ref: appt.ref, clientId: appt.clientId, appointmentId: appt.id, locationId: appt.locationId })
      const sale = appt.saleId ? ctx.byId.sale.get(appt.saleId) : undefined
      if (sale) push({ key: `dr_${appt.id}`, at: sale.createdAt, liability: 'prepayment', activity: 'redemption', amount: -appt.deposit.amount, ref: appt.ref, clientId: appt.clientId, saleId: sale.id, appointmentId: appt.id, locationId: appt.locationId })
      else if (appt.status === 'cancelled' && appt.cancellation && !appt.cancellation.late)
        push({ key: `df_${appt.id}`, at: appt.cancellation.at, liability: 'prepayment', activity: 'refund', amount: -appt.deposit.amount, ref: appt.ref, clientId: appt.clientId, appointmentId: appt.id, locationId: appt.locationId })
    }
    return out.sort((a, b) => a.at.localeCompare(b.at))
  })
}

/** Balance of events strictly before a date. */
export const balanceBefore = (events: LiabilityEvent[], date: string) => round2(events.filter((e) => e.date < date).reduce((s, e) => s + e.amount, 0))
