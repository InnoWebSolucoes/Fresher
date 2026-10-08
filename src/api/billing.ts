import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { commit, db } from '@/store/db'
import type { BillingDetails, ID, Invoice, PlanType } from '@/types'
import { uid } from '@/lib/ids'
import { now, todayISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { ApiError, latency } from './client'
import { pushNotification, queueMessage } from './messaging'
import { bookableMembers, readSettingsExtra, writeSettingsExtra } from './settings'

/**
 * Billing (SPEC §7, reference/settings-billing.md): plan, invoices, payment
 * card, billing details, message credits and bank accounts. Prices exclude
 * IVA (23%).
 */

export const IVA_RATE = 0.23

export const PLANS: Record<PlanType, { price: number; perMember: boolean }> = {
  independent: { price: 19.95, perMember: false },
  team: { price: 12.95, perMember: true },
}

/** Monthly price excluding IVA for a plan and a number of bookable team members. */
export function planMonthly(type: PlanType, bookable: number): number {
  const plan = PLANS[type]
  return round2(plan.perMember ? plan.price * Math.max(1, bookable) : plan.price)
}

export function bookableCount(): number {
  return bookableMembers(db()).length
}

export interface InvoiceLine {
  description: string
  quantity: number
  unitPrice: number
}

export function invoiceTotals(lines: InvoiceLine[]): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0))
  const tax = round2(subtotal * IVA_RATE)
  return { subtotal, tax, total: round2(subtotal + tax) }
}

/** Next invoice number in the seed's format: IB-202610-204. */
export function nextInvoiceNumber(): string {
  const highest = db().invoices.reduce((max, inv) => {
    const n = Number(inv.number.split('-').pop())
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 200)
  return `IB-${format(now(), 'yyyyMM')}-${highest + 1}`
}

/** Create a paid invoice (charged to the card on file) and email it to the account owner. Commit only, no latency. */
export function addInvoice(lines: InvoiceLine[], status: Invoice['status'] = 'paid'): Invoice {
  const invoice: Invoice = { id: uid('inv'), number: nextInvoiceNumber(), date: todayISO(), lines, ...invoiceTotals(lines), status }
  commit((d) => {
    d.invoices.unshift(invoice)
  })
  const details = db().workspace.plan.billingDetails
  const owner = db().users.find((u) => u.role === 'owner')
  queueMessage({
    clientId: null,
    to: owner?.email ?? 'owner@demo.app',
    toName: details ? `${details.firstName} ${details.lastName}` : (owner ? `${owner.firstName} ${owner.lastName}` : 'Account owner'),
    channel: 'email',
    type: 'other',
    subject: `Invoice ${invoice.number}`,
    body: `Your invoice ${invoice.number} for €${invoice.total.toFixed(2)} (IVA included) is available in Settings › Billing › Invoices and fees.`,
    link: { label: 'View invoice', href: '/setup/billing/invoices-and-fees' },
  })
  return invoice
}

// ─── Plan ────────────────────────────────────────────────────────────────

export interface PlanChangeQuote {
  lines: InvoiceLine[]
  subtotal: number
  tax: number
  total: number
  /** Days left in the current month, including today. */
  daysLeft: number
  daysInMonth: number
}

/** Pro-rata charge for switching plans today (rest of the current month). */
export function quotePlanChange(from: PlanType, to: PlanType, bookable: number): PlanChangeQuote {
  const today = now()
  const daysInMonth = differenceInCalendarDays(endOfMonth(today), startOfMonth(today)) + 1
  const daysLeft = differenceInCalendarDays(endOfMonth(today), today) + 1
  const factor = daysLeft / daysInMonth
  const period = `${format(today, 'd MMM')} – ${format(endOfMonth(today), 'd MMM yyyy')}`
  const label = (type: PlanType) => (type === 'team' ? 'Team plan' : 'Independent plan')
  const newUnit = PLANS[to].price
  const newQty = PLANS[to].perMember ? Math.max(1, bookable) : 1
  const oldQty = PLANS[from].perMember ? Math.max(1, bookable) : 1
  const lines: InvoiceLine[] = [
    { description: `${label(to)} · ${newQty} bookable team member${newQty === 1 ? '' : 's'} (pro-rata ${period})`, quantity: newQty, unitPrice: round2(newUnit * factor) },
    { description: `Unused time on ${label(from)} (${period})`, quantity: oldQty, unitPrice: -round2(PLANS[from].price * factor) },
  ]
  return { lines, ...invoiceTotals(lines), daysLeft, daysInMonth }
}

/**
 * Switch plan (Change your plan → Confirm) and create the pro-rata invoice
 * (a credit when moving to a cheaper plan). The Independent plan covers one
 * bookable team member: `keepBookableId` stays bookable and the others are
 * made non-bookable (their profiles, history and logins are kept).
 */
export async function changePlan(to: PlanType, keepBookableId?: ID): Promise<Invoice> {
  await latency(600, 1000)
  const data = db()
  const from = data.workspace.plan.type
  const members = bookableMembers(data)
  const bookable = members.length
  if (from === to) throw new ApiError('same_plan', 'You are already on this plan')
  if (!data.workspace.plan.card) throw new ApiError('no_card', 'Add a payment method before changing your plan')
  if (to === 'independent' && bookable > 1 && !members.some((m) => m.id === keepBookableId)) throw new ApiError('too_many_members', 'Choose the team member who stays bookable on the Independent plan')
  const quote = quotePlanChange(from, to, bookable)
  commit((d) => {
    d.workspace.plan.type = to
    d.workspace.plan.status = 'active'
    if (to === 'independent' && bookable > 1)
      d.teamMembers.forEach((m) => {
        if (m.bookable && !m.archived && m.id !== keepBookableId) m.bookable = false
      })
  })
  writeSettingsExtra(PLAN_CANCEL_KEY, null)
  const invoice = addInvoice(quote.lines)
  pushNotification({ tab: 'actions', title: 'Plan changed', body: `You're now on the ${to === 'team' ? 'Team' : 'Independent'} plan.`, link: '/setup/billing/subscriptions' })
  return invoice
}

/** End a free trial and start paying for the current plan. */
export async function activatePlan(): Promise<Invoice> {
  await latency(600, 1000)
  const data = db()
  if (!data.workspace.plan.card) throw new ApiError('no_card', 'Add a payment method to activate your plan')
  const type = data.workspace.plan.type
  const bookable = bookableCount()
  const qty = PLANS[type].perMember ? Math.max(1, bookable) : 1
  commit((d) => {
    d.workspace.plan.status = 'active'
  })
  return addInvoice([{ description: `${type === 'team' ? 'Team' : 'Independent'} plan · ${qty} bookable team member${qty === 1 ? '' : 's'} (monthly)`, quantity: qty, unitPrice: PLANS[type].price }])
}

export const PLAN_CANCEL_KEY = 'billing.planCancellation'
export interface PlanCancellation {
  requestedAt: string
  /** Access continues until the end of the paid period. */
  endsOn: string
}

export async function cancelPlan(): Promise<PlanCancellation> {
  await latency()
  const cancellation: PlanCancellation = { requestedAt: now().toISOString(), endsOn: format(endOfMonth(now()), 'yyyy-MM-dd') }
  writeSettingsExtra(PLAN_CANCEL_KEY, cancellation)
  return cancellation
}

export async function resumePlan(): Promise<void> {
  await latency()
  writeSettingsExtra(PLAN_CANCEL_KEY, null)
}

// ─── Billing details and card ─────────────────────────────────────────────

export async function updateBillingDetails(details: BillingDetails): Promise<void> {
  await latency()
  commit((d) => {
    d.workspace.plan.billingDetails = details
  })
}

/** Luhn check for card numbers (spaces ignored). */
export function luhnValid(number: string): boolean {
  const digits = number.replace(/\s+/g, '')
  if (!/^\d{12,19}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

export function cardBrand(number: string): string {
  const d = number.replace(/\s+/g, '')
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3[47]/.test(d)) return 'American Express'
  if (/^6/.test(d)) return 'Discover'
  return 'Card'
}

/** "MM/YY" in the future (or this month). */
export function expiryValid(expiry: string): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(expiry.trim())
  if (!m) return false
  const month = Number(m[1])
  const year = 2000 + Number(m[2])
  if (month < 1 || month > 12) return false
  const today = now()
  return year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth() + 1)
}

export async function updateCard(input: { number: string; expiry: string; cvc: string; name: string }): Promise<void> {
  await latency(700, 1200)
  if (!luhnValid(input.number)) throw new ApiError('card_invalid', 'Your card number is invalid')
  if (!expiryValid(input.expiry)) throw new ApiError('card_expired', 'Your card has expired')
  const digits = input.number.replace(/\s+/g, '')
  if (digits.endsWith('0002')) throw new ApiError('card_declined', 'Your card was declined. Try a different card.')
  commit((d) => {
    d.workspace.plan.card = { brand: cardBrand(digits), last4: digits.slice(-4), expiry: input.expiry.replace(/\s+/g, '') }
  })
}

export async function removeCard(): Promise<void> {
  await latency()
  commit((d) => {
    d.workspace.plan.card = undefined
  })
}

// ─── Communication balance ────────────────────────────────────────────────
//
// workspace.messageCredits is the communication balance in euros (Marketing ›
// Automations shows the same figure); text and WhatsApp messages are paid
// from it. Auto top-up lives with Marketing (setAutoTopUp in @/api/marketing).

/** One-off top-up amounts (excluding IVA). */
export const TOP_UP_AMOUNTS = [10, 25, 50, 100]

/** Add `amount` to the communication balance, charged to the card on file (invoice + email). */
export async function topUpCommunicationBalance(amount: number): Promise<Invoice> {
  await latency(600, 1000)
  if (!(amount > 0)) throw new ApiError('invalid', 'Choose an amount')
  if (!db().workspace.plan.card) throw new ApiError('no_card', 'Add a payment method to top up')
  commit((d) => {
    d.workspace.messageCredits = round2(d.workspace.messageCredits + amount)
  })
  return addInvoice([{ description: 'Communication balance top-up', quantity: 1, unitPrice: amount }])
}

// ─── Bank accounts ────────────────────────────────────────────────────────

export const BANK_ACCOUNTS_KEY = 'billing.bankAccounts'
export interface BankAccount {
  id: ID
  holder: string
  bankName: string
  /** Last 4 characters of the IBAN. */
  last4: string
  country: string
  primary: boolean
  addedAt: string
}

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  { id: 'ba_main', holder: 'Studio Aliados, Lda', bankName: 'Millennium bcp', last4: '4417', country: 'Portugal', primary: true, addedAt: '2025-11-02T10:00:00.000Z' },
]

/** IBAN checksum (mod 97). */
export function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const rearranged = s.slice(4) + s.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let remainder = 0
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97
  return remainder === 1
}

export async function addBankAccount(input: { holder: string; bankName: string; iban: string }): Promise<BankAccount> {
  await latency(700, 1100)
  if (!ibanValid(input.iban)) throw new ApiError('iban_invalid', 'Enter a valid IBAN')
  const iban = input.iban.replace(/\s+/g, '').toUpperCase()
  const accounts = readSettingsExtra(BANK_ACCOUNTS_KEY, DEFAULT_BANK_ACCOUNTS)
  const account: BankAccount = { id: uid('ba'), holder: input.holder.trim(), bankName: input.bankName.trim(), last4: iban.slice(-4), country: iban.startsWith('PT') ? 'Portugal' : iban.slice(0, 2), primary: accounts.length === 0, addedAt: now().toISOString() }
  writeSettingsExtra(BANK_ACCOUNTS_KEY, [...accounts, account])
  return account
}

export async function setPrimaryBankAccount(id: ID): Promise<void> {
  await latency()
  const accounts = readSettingsExtra(BANK_ACCOUNTS_KEY, DEFAULT_BANK_ACCOUNTS)
  writeSettingsExtra(
    BANK_ACCOUNTS_KEY,
    accounts.map((a) => ({ ...a, primary: a.id === id })),
  )
}

export async function removeBankAccount(id: ID): Promise<void> {
  await latency()
  const accounts = readSettingsExtra(BANK_ACCOUNTS_KEY, DEFAULT_BANK_ACCOUNTS)
  const target = accounts.find((a) => a.id === id)
  if (target?.primary) throw new ApiError('primary', 'Set another account as primary before removing this one')
  writeSettingsExtra(
    BANK_ACCOUNTS_KEY,
    accounts.filter((a) => a.id !== id),
  )
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────

/** Render an invoice as an A4 PDF (jsPDF + autotable). */
export async function invoicePdf(invoice: Invoice): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const data = db()
  const details = data.workspace.plan.billingDetails
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const eur = (n: number) => `${n < 0 ? '-' : ''}€${Math.abs(n).toFixed(2)}`
  doc.setFillColor(14, 110, 106)
  doc.rect(0, 0, 595, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(20)
  doc.text('Innoweb Bookings', 40, 56)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(['Innoweb Solutions, Lda', 'Rua de Santa Catarina 100, 4000-442 Porto, Portugal', 'NIF PT516000000'], 40, 74)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(20)
  doc.text('Invoice', 555, 56, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text([`Invoice no. ${invoice.number}`, `Date ${format(parseISO(invoice.date), 'd MMM yyyy')}`, `Status ${invoice.status === 'paid' ? 'Paid' : 'Due'}`], 555, 74, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.text('Billed to', 40, 130)
  doc.setFont('helvetica', 'normal')
  const billed = details ? [details.businessName || `${details.firstName} ${details.lastName}`, `${details.firstName} ${details.lastName}`, details.address, details.vatNumber ? `VAT ${details.vatNumber}` : ''].filter(Boolean) : [data.workspace.name]
  doc.text(billed, 40, 146)
  autoTable(doc, {
    startY: 210,
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: invoice.lines.map((l) => [l.description, String(l.quantity), eur(l.unitPrice), eur(round2(l.quantity * l.unitPrice))]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [14, 110, 106], textColor: 255 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 40, right: 40 },
  })
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24
  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, 400, y)
    doc.text(value, 555, y, { align: 'right' })
    y += 18
  }
  row('Subtotal', eur(invoice.subtotal))
  row('IVA 23%', eur(invoice.tax))
  row('Total', eur(invoice.total), true)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(`Paid with ${data.workspace.plan.card ? `${data.workspace.plan.card.brand} ending ${data.workspace.plan.card.last4}` : 'card on file'}. Prices exclude IVA unless stated.`, 40, 800)
  return doc.output('blob')
}

// ─── Payments: card terminals ───
//
// Settings › Payments › Card terminals. Terminals live in the extras bag at
// `payments.terminals`; ordering one charges the card on file (invoice +
// email) and ships it, pairing takes the 6-digit code shown on the device.

export type TerminalStatus = 'online' | 'offline' | 'shipping' | 'awaiting_pairing'

export interface CardTerminal {
  id: ID
  name: string
  model: string
  serial: string
  locationId: ID
  status: TerminalStatus
  pairedAt?: string
  orderedAt?: string
  /** yyyy-MM-dd */
  estimatedDelivery?: string
  deliveredAt?: string
  invoiceId?: ID
  lastCheckedAt?: string
}

export interface TerminalModel {
  id: string
  name: string
  /** Excluding IVA. */
  price: number
  serialPrefix: string
}

export const TERMINALS_KEY = 'payments.terminals'

export const TERMINAL_MODELS: TerminalModel[] = [
  { id: 'innoweb_s1', name: 'Innoweb Terminal S1', price: 149, serialPrefix: 'IBT-S1' },
  { id: 'innoweb_pro', name: 'Innoweb Terminal Pro', price: 249, serialPrefix: 'IBT-PRO' },
]

const TERMINAL_DAY_MS = 24 * 60 * 60 * 1000

/** The terminal every demo workspace starts with (paired about 6 months ago). */
export function defaultTerminals(): CardTerminal[] {
  return [
    {
      id: 'term_front_desk',
      name: 'Front desk terminal',
      model: 'Innoweb Terminal S1',
      serial: 'IBT-S1-204817',
      locationId: 'loc_baixa',
      status: 'online',
      pairedAt: new Date(now().getTime() - 183 * TERMINAL_DAY_MS).toISOString(),
    },
  ]
}

/** Current terminals (the stored list, or the default one when never saved). */
export function readTerminals(): CardTerminal[] {
  return readSettingsExtra<CardTerminal[] | null>(TERMINALS_KEY, null) ?? defaultTerminals()
}

function patchTerminal(id: ID, patch: Partial<CardTerminal>): CardTerminal {
  const list = readTerminals()
  const current = list.find((t) => t.id === id)
  if (!current) throw new ApiError('not_found', 'Terminal not found')
  const next = { ...current, ...patch }
  writeSettingsExtra(
    TERMINALS_KEY,
    list.map((t) => (t.id === id ? next : t)),
  )
  return next
}

function randomTerminalSerial(prefix: string): string {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => String(b % 10)).join('')
  return `${prefix}-${digits}`
}

/** `days` business days from now (Mon–Fri), as yyyy-MM-dd. */
function businessDaysFromNow(days: number): string {
  const date = new Date(now().getTime())
  let left = days
  while (left > 0) {
    date.setTime(date.getTime() + TERMINAL_DAY_MS)
    const weekday = date.getDay()
    if (weekday !== 0 && weekday !== 6) left--
  }
  return format(date, 'yyyy-MM-dd')
}

export interface TerminalOrderInput {
  modelId: string
  quantity: number
  locationId: ID
}

/** Subtotal / IVA / total for a terminal order (prices exclude IVA). */
export function quoteTerminalOrder(input: Pick<TerminalOrderInput, 'modelId' | 'quantity'>): { lines: InvoiceLine[]; subtotal: number; tax: number; total: number } {
  const model = TERMINAL_MODELS.find((m) => m.id === input.modelId) ?? TERMINAL_MODELS[0]
  const lines: InvoiceLine[] = [{ description: `${model.name} card terminal`, quantity: input.quantity, unitPrice: model.price }]
  return { lines, ...invoiceTotals(lines) }
}

/**
 * "Order a terminal": charges the card on file (paid invoice, emailed), adds
 * the terminals as Shipping and notifies the team.
 */
export async function orderTerminals(input: TerminalOrderInput): Promise<{ terminals: CardTerminal[]; invoice: Invoice; estimatedDelivery: string }> {
  await latency(900, 1500)
  const data = db()
  const model = TERMINAL_MODELS.find((m) => m.id === input.modelId)
  if (!model) throw new ApiError('not_found', 'Choose a terminal')
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 5) throw new ApiError('quantity', 'You can order between 1 and 5 terminals')
  const location = data.locations.find((l) => l.id === input.locationId)
  if (!location) throw new ApiError('not_found', 'Choose a delivery location')
  if (!data.workspace.plan.card) throw new ApiError('no_card', 'Add a payment method to order a terminal')
  const existing = readTerminals()
  const estimatedDelivery = businessDaysFromNow(3)
  const orderedAt = now().toISOString()
  const quote = quoteTerminalOrder(input)
  const invoice = addInvoice(quote.lines)
  const atLocation = existing.filter((t) => t.locationId === location.id).length
  const terminals: CardTerminal[] = Array.from({ length: input.quantity }, (_, i) => ({
    id: uid('term'),
    name: `${location.name} terminal ${atLocation + i + 1}`,
    model: model.name,
    serial: randomTerminalSerial(model.serialPrefix),
    locationId: location.id,
    status: 'shipping',
    orderedAt,
    estimatedDelivery,
    invoiceId: invoice.id,
  }))
  writeSettingsExtra(TERMINALS_KEY, [...existing, ...terminals])
  pushNotification({
    tab: 'actions',
    title: 'Terminal order placed',
    body: `${input.quantity} × ${model.name} on the way to ${location.name}. Estimated delivery ${format(parseISO(estimatedDelivery), 'MMM d')}.`,
    link: '/setup/payments/terminals',
  })
  return { terminals, invoice, estimatedDelivery }
}

/** A shipped terminal arrived: it now waits for its pairing code. */
export async function markTerminalDelivered(id: ID): Promise<CardTerminal> {
  await latency()
  return patchTerminal(id, { status: 'awaiting_pairing', deliveredAt: now().toISOString() })
}

/**
 * Pair a terminal with the 6-digit code shown on its screen. Without
 * `terminalId` a terminal the business already owns is added and paired.
 */
export async function pairTerminal(input: { terminalId?: ID; code: string; locationId?: ID; name?: string }): Promise<CardTerminal> {
  const code = input.code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(code)) throw new ApiError('invalid_code', 'Enter the 6-digit pairing code shown on your terminal')
  await latency(1200, 2000)
  const pairedAt = now().toISOString()
  if (input.terminalId) {
    const patch: Partial<CardTerminal> = { status: 'online', pairedAt, lastCheckedAt: pairedAt }
    // A terminal paired straight from Shipping has obviously arrived.
    if (readTerminals().find((t) => t.id === input.terminalId)?.status === 'shipping') patch.deliveredAt = pairedAt
    if (input.locationId) patch.locationId = input.locationId
    return patchTerminal(input.terminalId, patch)
  }
  const data = db()
  const location = data.locations.find((l) => l.id === input.locationId) ?? data.locations[0]
  const existing = readTerminals()
  const terminal: CardTerminal = {
    id: uid('term'),
    name: input.name?.trim() || `${location?.name ?? 'Front desk'} terminal ${existing.filter((t) => t.locationId === location?.id).length + 1}`,
    model: TERMINAL_MODELS[0].name,
    serial: randomTerminalSerial(TERMINAL_MODELS[0].serialPrefix),
    locationId: location?.id ?? 'loc_baixa',
    status: 'online',
    pairedAt,
    lastCheckedAt: pairedAt,
  }
  writeSettingsExtra(TERMINALS_KEY, [...existing, terminal])
  return terminal
}

/** Disconnect a terminal from the workspace; it stays listed, awaiting a new pairing code. */
export async function unpairTerminal(id: ID): Promise<CardTerminal> {
  await latency()
  return patchTerminal(id, { status: 'awaiting_pairing', pairedAt: undefined })
}

export async function renameTerminal(id: ID, name: string): Promise<CardTerminal> {
  await latency()
  if (!name.trim()) throw new ApiError('required', 'Enter a terminal name')
  return patchTerminal(id, { name: name.trim() })
}

export async function assignTerminalLocation(id: ID, locationId: ID): Promise<CardTerminal> {
  await latency()
  if (!db().locations.some((l) => l.id === locationId)) throw new ApiError('not_found', 'Location not found')
  return patchTerminal(id, { locationId })
}

/** Ping a paired terminal. An offline terminal comes back online when it answers. */
export async function testTerminalConnection(id: ID): Promise<CardTerminal> {
  await latency(900, 1600)
  const terminal = readTerminals().find((t) => t.id === id)
  if (!terminal) throw new ApiError('not_found', 'Terminal not found')
  if (terminal.status === 'shipping' || terminal.status === 'awaiting_pairing') throw new ApiError('not_paired', 'Pair this terminal before testing its connection')
  return patchTerminal(id, { status: 'online', lastCheckedAt: now().toISOString() })
}
