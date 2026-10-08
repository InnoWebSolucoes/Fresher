import { commit, db } from '@/store/db'
import type { Client, GiftCard, ID, Settings } from '@/types'
import { uid } from '@/lib/ids'
import { now, nowISO } from '@/lib/time'
import { money } from '@/lib/format'
import { activity, ApiError, latency } from './client'
import { queueMessage } from './messaging'
import { readExt, writeExt } from './ext'

/**
 * Checkout helpers that sit next to `checkout()` in ./sales: quick sale
 * layout, gift card actions (share, extend), payment links, drafts and the
 * in-progress cart that survives a page refresh.
 */

// ─── In-progress cart (db.ext.checkout) ─────────────────────────────────

const NS = 'checkout'
/** A saved cart is restored for this long after its last change. */
const CART_TTL_MS = 4 * 60 * 60 * 1000

export interface SavedCart<T = unknown> {
  savedAt: number
  state: T
}

type CartBag = Record<string, SavedCart>

const freshCarts = (bag: CartBag) => {
  const cutoff = now().getTime() - CART_TTL_MS
  return Object.fromEntries(Object.entries(bag).filter(([, v]) => v && v.savedAt >= cutoff)) as CartBag
}

/** The cart saved for a checkout opened with these drawer params, if still fresh. */
export function readSavedCart<T>(key: string): T | undefined {
  const saved = readExt<CartBag>(NS, 'carts', {})[key]
  if (!saved || saved.savedAt < now().getTime() - CART_TTL_MS) return undefined
  return saved.state as T
}

/** Save the in-progress cart (instant, no latency: it runs on every change). */
export function saveCart(key: string, state: unknown): void {
  const bag = freshCarts(readExt<CartBag>(NS, 'carts', {}))
  writeExt(NS, 'carts', { ...bag, [key]: { savedAt: now().getTime(), state } })
}

/** Forget the in-progress cart (sale completed, cancelled or the drawer was closed). */
export function clearSavedCart(key: string): void {
  const bag = readExt<CartBag>(NS, 'carts', {})
  if (!(key in bag)) return
  const next = { ...bag }
  delete next[key]
  writeExt(NS, 'carts', next)
}

/**
 * Rewards and package benefits applied to lines of a saved (unpaid) sale.
 * Sale lines keep the package id but not the reward or benefit, so they are
 * remembered here until the sale is paid.
 */
export type LineOffer = { rewardId?: ID; redeem?: { clientPackageId: ID; benefitId: ID } }

export function readLineOffers(): Record<ID, LineOffer> {
  return readExt<Record<ID, LineOffer>>(NS, 'lineOffers', {})
}

export function rememberLineOffers(offers: Record<ID, LineOffer>): void {
  const current = readLineOffers()
  const next = { ...current }
  for (const [itemId, offer] of Object.entries(offers)) {
    if (offer.rewardId || offer.redeem) next[itemId] = offer
    else delete next[itemId]
  }
  if (JSON.stringify(next) !== JSON.stringify(current)) writeExt(NS, 'lineOffers', next)
}

/** Save the "Quick sale items" layout (calendar.md §10, max 12 items). */
export async function saveQuickSaleItems(items: Settings['quickSaleItems']): Promise<void> {
  await latency()
  if (items.length > 12) throw new ApiError('too_many', 'Max 12 items')
  commit((d) => {
    d.settings.quickSaleItems = items.map((i) => ({ type: i.type, id: i.id }))
  })
}

/** Email a gift card to someone (gift card drawer › Actions › Share). */
export async function shareGiftCard(cardId: ID, to: string, toName?: string): Promise<void> {
  await latency()
  const data = db()
  const card = data.giftCards.find((g) => g.id === cardId)
  if (!card) throw new ApiError('not_found', 'Gift card not found')
  const owner = data.clients.find((c) => c.id === (card.ownerClientId ?? card.purchaserClientId))
  queueMessage({
    clientId: owner?.id ?? null,
    to,
    toName: toName || to,
    channel: 'email',
    type: 'gift_card',
    subject: `Your ${money(card.value)} gift card for ${data.workspace.name}`,
    body: `You have a ${money(card.value)} gift card for ${data.workspace.name}.\n\nCode: ${card.code}${card.customCode ? `\nCustom code: ${card.customCode}` : ''}\nBalance: ${money(card.balance)}${card.expiresAt ? `\nValid until ${card.expiresAt}` : ''}\n\nShow this code at checkout or use it when booking online.`,
    saleId: card.saleId,
  })
  commit((d) => {
    d.giftCards.find((g) => g.id === cardId)?.activity.unshift(activity('Gift card shared', `Sent to ${to}`))
  })
}

/** Change a gift card's expiry date (Actions › Extend). `expiresAt` undefined = never expires. */
export async function extendGiftCard(cardId: ID, expiresAt: string | undefined): Promise<GiftCard> {
  await latency()
  commit((d) => {
    const card = d.giftCards.find((g) => g.id === cardId)
    if (!card) return
    card.expiresAt = expiresAt
    if (card.status === 'expired' && card.balance > 0) card.status = 'active'
    card.activity.unshift(activity('Gift card extended', expiresAt ? `New expiry date ${expiresAt}` : 'Never expires'))
  })
  const card = db().giftCards.find((g) => g.id === cardId)
  if (!card) throw new ApiError('not_found', 'Gift card not found')
  return card
}

/** Self checkout: text the client a link to pay from their phone. */
export async function sendPaymentLink(input: { clientId: ID | null; phone: string; name: string; amount: number; saleRef: string }): Promise<string> {
  await latency()
  const token = uid('pl').replace('pl_', '')
  const link = `https://pay.innoweb.example/checkout/${token}`
  queueMessage({
    clientId: input.clientId,
    to: input.phone,
    toName: input.name,
    channel: 'sms',
    type: 'other',
    subject: 'Payment link',
    body: `${db().workspace.name}: your bill of ${money(input.amount)} is ready. Pay securely here: ${link}`,
    link: { label: 'Pay now', href: link },
  })
  return link
}

/** Remove a draft sale that was never paid (checkout › Cancel sale). */
export async function discardDraftSale(saleId: ID): Promise<void> {
  await latency()
  const sale = db().sales.find((s) => s.id === saleId)
  if (!sale) return
  if (sale.paymentIds.length) throw new ApiError('has_payments', 'This sale has payments and cannot be discarded')
  commit((d) => {
    const s = d.sales.find((x) => x.id === saleId)
    if (!s) return
    if (s.status === 'draft') {
      d.sales = d.sales.filter((x) => x.id !== saleId)
    } else {
      s.status = 'voided'
      s.activity.unshift(activity('Sale canceled'))
    }
    const appt = d.appointments.find((a) => a.saleId === saleId)
    if (appt) appt.saleId = undefined
  })
}

/** Quick "Add new client" from the checkout client picker. */
export async function quickCreateClient(input: { firstName: string; lastName: string; email: string; phone: string }): Promise<Client> {
  await latency()
  const email = input.email.trim().toLowerCase()
  if (email && db().clients.some((c) => !c.deletedAt && c.email.toLowerCase() === email)) throw new ApiError('duplicate', 'A client with this email already exists')
  const client: Client = {
    id: uid('cl'),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email,
    phone: input.phone.trim(),
    sourceId: db().clientSources.find((s) => s.id === 'src_walkin')?.id ?? db().clientSources[0]?.id ?? 'src_walkin',
    tagIds: [],
    addresses: [],
    emergencyContacts: [],
    notifications: { email: true, sms: true, whatsapp: false },
    marketing: { email: false, sms: false, whatsapp: false },
    marketplace: false,
    allergies: [],
    patchTests: [],
    rewards: [],
    walletBalance: 0,
    files: [],
    createdAt: nowISO(),
  }
  commit((d) => {
    d.clients.push(client)
  })
  return client
}
