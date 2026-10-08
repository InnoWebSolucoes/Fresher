import { addDays, format, getDaysInMonth, parseISO } from 'date-fns'
import { commit, db } from '@/store/db'
import type { AddOnState, BillingDetails, DbData, ISODate } from '@/types'
import { round2 } from '@/lib/format'
import { uid } from '@/lib/ids'
import { now, nowISO, toISODate, todayISO } from '@/lib/time'
import { ApiError, latency } from './client'
import { pushNotification, queueMessage } from './messaging'

/**
 * Add-ons and integrations (reference/add-ons.md). Records live in
 * `db.addOns`; integration settings (pixel ids, accounting sync options,
 * payout accounts, data connector credentials) are kept in the typed
 * `config` field of the record.
 */
export const TAX_RATE = 0.23

export function findAddOn(addOns: AddOnState[] | undefined, slug: string): AddOnState | undefined {
  return addOns?.find((a) => a.slug === slug)
}

/** Active or on a free trial. */
export function isAddOnOn(record: AddOnState | undefined): boolean {
  return record?.status === 'active' || record?.status === 'trial'
}

/** "On free trial" while a trial is running (also for paid add-ons enabled with a trial). */
export function isOnTrial(record: AddOnState | undefined): boolean {
  if (!record) return false
  if (record.status === 'trial') return true
  return record.status === 'active' && Boolean(record.trialEndsAt && record.trialEndsAt >= todayISO())
}

/** Typed reads of `config` values. */
export const configString = (record: AddOnState | undefined, key: string): string | undefined => {
  const v = record?.config?.[key]
  return typeof v === 'string' ? v : undefined
}
export const configBool = (record: AddOnState | undefined, key: string): boolean | undefined => {
  const v = record?.config?.[key]
  return typeof v === 'boolean' ? v : undefined
}
export const configNumber = (record: AddOnState | undefined, key: string): number | undefined => {
  const v = record?.config?.[key]
  return typeof v === 'number' ? v : undefined
}

export interface OrderLine {
  description: string
  quantity: number
  unitPrice: number
}

export interface OrderQuote {
  quantity: number
  unitPrice: number
  subtotal: number
  tax: number
  discount: number
  totalMonthly: number
  /** Pro-rata amount charged today (no trial). */
  payNow: number
  /** Days left in this month including today, and days in the month. */
  prorata: { days: number; of: number }
  trialEndsAt?: ISODate
  billingStartsAt: ISODate
}

/**
 * Price an add-on order the way the enable screens show it (IVA 23%, pro-rata
 * first month). A running trial (Premium Support) passes its own end date.
 */
export function quoteOrder(quantity: number, unitPrice: number, trialDays = 0, discountPct = 0, trialEndsOverride?: ISODate): OrderQuote {
  const today = now()
  const subtotal = round2(quantity * unitPrice)
  const tax = round2(subtotal * TAX_RATE)
  const discount = round2(((subtotal + tax) * discountPct) / 100)
  const totalMonthly = round2(subtotal + tax - discount)
  const of = getDaysInMonth(today)
  const days = of - today.getDate() + 1
  const payNow = round2((totalMonthly * days) / of)
  const trialEndsAt = trialEndsOverride ?? (trialDays ? toISODate(addDays(today, trialDays)) : undefined)
  const billingStartsAt = trialEndsAt ? toISODate(addDays(parseISO(trialEndsAt), 1)) : toISODate(today)
  return { quantity, unitPrice, subtotal, tax, discount, totalMonthly, payNow, prorata: { days, of }, trialEndsAt, billingStartsAt }
}

const DISCOUNT_CODES: Record<string, number> = { WELCOME10: 10, INNOWEB10: 10 }

/** Validate a discount code typed on an enable screen; returns the % off. */
export async function checkDiscountCode(code: string): Promise<number> {
  await latency(300, 600)
  const pct = DISCOUNT_CODES[code.trim().toUpperCase()]
  if (!pct) throw new ApiError('invalid_code', 'This discount code is invalid or has expired')
  return pct
}

function nextInvoiceNumber(data: Pick<DbData, 'invoices'>, date: ISODate): string {
  return `IB-${format(parseISO(date), 'yyyyMM')}-${String(300 + data.invoices.length)}`
}

export interface EnableOptions {
  /** Shown in notifications and the invoice. */
  name: string
  trialDays?: number
  /** Keep the add-on's running trial (Premium Support plan activation). */
  keepTrial?: boolean
  /** Paid add-ons: the order that becomes an invoice (due after the trial, paid now otherwise). */
  order?: { line: OrderLine; quote: OrderQuote }
  billing?: BillingDetails
  card?: { brand: string; last4: string; expiry: string }
  config?: Record<string, unknown>
}

/** Turn an add-on on (enable screens, free add-ons, integrations). */
export async function enableAddOn(slug: string, options: EnableOptions): Promise<void> {
  await latency(600, 1000)
  const at = nowISO()
  const today = todayISO()
  let trialEnd: ISODate | undefined
  commit((d) => {
    let record = d.addOns.find((a) => a.slug === slug)
    if (!record) {
      record = { slug, status: 'inactive' }
      d.addOns.push(record)
    }
    const runningTrial = options.keepTrial && record.trialEndsAt && record.trialEndsAt >= today ? record.trialEndsAt : undefined
    trialEnd = runningTrial ?? (options.trialDays ? toISODate(addDays(now(), options.trialDays)) : undefined)
    record.enabledAt = runningTrial ? (record.enabledAt ?? at) : at
    record.status = 'active'
    record.trialEndsAt = trialEnd
    record.disabledAt = undefined
    record.disabledReason = undefined
    record.config = { ...(record.config ?? {}), ...(options.config ?? {}), ...(options.order ? { activated: true, billingStartsAt: options.order.quote.billingStartsAt } : {}) }
    if (options.order) {
      const { line, quote } = options.order
      const trial = Boolean(trialEnd)
      const date = trial ? quote.billingStartsAt : today
      const factor = trial ? 1 : quote.prorata.days / quote.prorata.of
      const unitPrice = round2(line.unitPrice * factor * (1 - (quote.discount ? quote.discount / (quote.subtotal + quote.tax) : 0)))
      const subtotal = round2(unitPrice * line.quantity)
      const tax = round2(subtotal * TAX_RATE)
      d.invoices.unshift({
        id: uid('inv'),
        number: nextInvoiceNumber(d, date),
        date,
        lines: [{ description: trial ? line.description : `${line.description} (pro-rata, ${quote.prorata.days} days)`, quantity: line.quantity, unitPrice }],
        subtotal,
        tax,
        total: round2(subtotal + tax),
        status: trial ? 'due' : 'paid',
      })
    }
    if (options.billing) d.workspace.plan.billingDetails = options.billing
    if (options.card) d.workspace.plan.card = options.card
  })
  const trialNote = trialEnd ? `Your free trial ends on ${format(parseISO(trialEnd), 'MMM d, yyyy')}.` : undefined
  pushNotification({ tab: 'actions', title: `${options.name} enabled`, body: trialNote ?? `${options.name} is now active in your workspace.`, link: `/add-ons/manage/${slug}` })
  const owner = db().users.find((u) => u.role === 'owner')
  if (owner && options.order) {
    queueMessage({
      clientId: null,
      to: owner.email,
      toName: `${owner.firstName} ${owner.lastName}`,
      channel: 'email',
      type: 'other',
      subject: `${options.name} add-on order confirmation`,
      body: `Hi ${owner.firstName}, thanks for enabling ${options.name}. ${trialNote ?? 'Your invoice is available in Billing.'}`,
      link: { label: 'View billing', href: '/setup/billing/invoices-and-fees' },
    })
  }
}

/** Turn an add-on off (manage page › Options › Disable, integrations › Disconnect). */
export async function disableAddOn(slug: string, reason: string): Promise<void> {
  if (!reason) throw new ApiError('reason_required', 'Select a reason')
  await latency(500, 900)
  commit((d) => {
    const record = d.addOns.find((a) => a.slug === slug)
    if (!record) throw new ApiError('not_found', 'Add-on not found')
    record.status = 'inactive'
    record.trialEndsAt = undefined
    record.disabledAt = nowISO()
    record.disabledReason = reason
    if (record.config) record.config = { ...record.config, activated: false, connected: false }
  })
}

/** Merge settings into an add-on's config (integration ids, sync options…). */
export async function updateAddOnConfig(slug: string, patch: Record<string, unknown>): Promise<void> {
  await latency()
  commit((d) => {
    const record = d.addOns.find((a) => a.slug === slug)
    if (!record) throw new ApiError('not_found', 'Add-on not found')
    record.config = { ...(record.config ?? {}), ...patch }
  })
}

/** Accounting integrations: run a sync now and record when. */
export async function syncAccounting(slug: string): Promise<{ sales: number; payments: number }> {
  await latency(900, 1400)
  const record = findAddOn(db().addOns, slug)
  // First sync sends everything since the start date chosen in the wizard.
  const since = configString(record, 'lastSyncedAt') ?? configString(record, 'syncFrom') ?? record?.enabledAt ?? nowISO()
  const sales = db().sales.filter((s) => s.createdAt > since && s.status !== 'draft' && s.status !== 'voided').length
  const payments = db().payments.filter((p) => p.at > since && p.status === 'succeeded').length
  commit((d) => {
    const r = d.addOns.find((a) => a.slug === slug)
    if (r) r.config = { ...(r.config ?? {}), lastSyncedAt: nowISO(), syncedSales: (configNumber(r, 'syncedSales') ?? 0) + sales }
  })
  return { sales, payments }
}

export interface PaymentsAccount {
  id: string
  accountType: string
  firstName: string
  lastName: string
  businessName: string
  nipc: string
  vat?: string
  email: string
  mobile: string
  address: string
  iban: string
  status: 'verifying' | 'verified'
  createdAt: string
}

const isAccount = (v: unknown): v is PaymentsAccount => typeof v === 'object' && v !== null && 'iban' in v && 'businessName' in v

/** Payout accounts added through the Payments onboarding wizard. */
export function paymentsAccounts(record: AddOnState | undefined): PaymentsAccount[] {
  const list = record?.config?.accounts
  return Array.isArray(list) ? list.filter(isAccount) : []
}

/** Payments onboarding: submit a new legal entity / payout account. */
export async function addPaymentsAccount(account: Omit<PaymentsAccount, 'id' | 'status' | 'createdAt'>): Promise<PaymentsAccount> {
  await latency(800, 1200)
  const record: PaymentsAccount = { ...account, id: uid('acct'), status: 'verifying', createdAt: nowISO() }
  commit((d) => {
    let r = d.addOns.find((a) => a.slug === 'payments')
    if (!r) {
      r = { slug: 'payments', status: 'active', enabledAt: nowISO() }
      d.addOns.push(r)
    }
    r.status = 'active'
    r.config = { ...(r.config ?? {}), accounts: [...paymentsAccounts(r), record] }
  })
  pushNotification({ tab: 'actions', title: 'Payments account submitted', body: `${account.businessName} is being verified. We'll let you know when payouts are ready.`, link: '/add-ons/manage/payments' })
  return record
}

/** Simulated verification finishing a few seconds after submitting. */
export async function verifyPaymentsAccount(id: string): Promise<void> {
  await latency(1200, 1800)
  commit((d) => {
    const r = d.addOns.find((a) => a.slug === 'payments')
    if (r) r.config = { ...(r.config ?? {}), accounts: paymentsAccounts(r).map((a) => (a.id === id ? { ...a, status: 'verified' as const } : a)) }
  })
  pushNotification({ tab: 'actions', title: 'Payments account verified', body: 'Your business details were verified. Payouts are enabled.', link: '/add-ons/manage/payments' })
}

/** Remove a payout account (manage page › Payout accounts). */
export async function removePaymentsAccount(id: string): Promise<void> {
  await latency()
  commit((d) => {
    const r = d.addOns.find((a) => a.slug === 'payments')
    if (r) r.config = { ...(r.config ?? {}), accounts: paymentsAccounts(r).filter((a) => a.id !== id) }
  })
}
