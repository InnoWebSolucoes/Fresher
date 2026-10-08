import { format, parseISO } from 'date-fns'
import { round2 } from '@/lib/format'
import type { CashRegister, CustomPaymentMethod, Payment, RegisterSession, Sale } from '@/types'
import { dayOf } from '../shared/data'

/**
 * Register period maths (sales.md §2): payments collected through a
 * register while it was open, grouped like the reference (terminals, online,
 * redemptions, custom methods, cash), with expected / counted / difference.
 */

export interface BreakdownLine {
  key: string
  /** i18n key under sales.register.lines or a literal custom method name. */
  labelKey?: string
  label?: string
  expected: number
  /** Count and Close modals let you type the counted amount. */
  editable?: boolean
}

export interface BreakdownGroup {
  key: 'terminals' | 'online' | 'redemptions' | 'custom'
  lines: BreakdownLine[]
  expected: number
}

export interface CashBlock {
  openingFloat: number
  cashPayments: number
  cashIn: number
  cashOut: number
  expected: number
}

export interface RegisterBreakdown {
  groups: BreakdownGroup[]
  cash: CashBlock
  total: number
  tips: number
  /** Cash payments taken through this register (for the activity tab). */
  cashPayments: Payment[]
}

const sum = (list: number[]) => round2(list.reduce((s, n) => s + n, 0))

export function sessionPayments(session: RegisterSession, register: CashRegister | undefined, payments: Payment[]): Payment[] {
  const from = session.openedAt
  const to = session.closedAt
  return payments.filter((p) => {
    if (p.status !== 'succeeded' || p.kind === 'deposit') return false
    if (p.method === 'cash') return p.registerSessionId === session.id
    return Boolean(register) && p.locationId === register!.locationId && p.at >= from && (!to || p.at <= to)
  })
}

export function registerBreakdown(session: RegisterSession, register: CashRegister | undefined, payments: Payment[], sales: Sale[], customMethods: CustomPaymentMethod[]): RegisterBreakdown {
  const list = sessionPayments(session, register, payments)
  const by = (pred: (p: Payment) => boolean) => sum(list.filter(pred).map((p) => p.amount))
  const custom = customMethods.filter((m) => m.active && !m.system && m.name.trim().toLowerCase() !== 'other').sort((a, b) => a.order - b.order)
  const groups: BreakdownGroup[] = [
    {
      key: 'terminals',
      lines: [
        { key: 'card_terminal', labelKey: 'cardTerminal', expected: by((p) => p.method === 'card_terminal' || p.method === 'manual_card') },
        { key: 'qr_code', labelKey: 'qrCode', expected: by((p) => p.method === 'qr_code') },
        { key: 'self_checkout', labelKey: 'selfCheckout', expected: by((p) => p.method === 'self_checkout') },
      ],
      expected: 0,
    },
    { key: 'online', lines: [{ key: 'online_card', labelKey: 'card', expected: by((p) => p.method === 'online_card') }], expected: 0 },
    {
      key: 'redemptions',
      lines: [
        { key: 'gift_card', labelKey: 'giftCards', expected: by((p) => p.method === 'gift_card') },
        { key: 'deposit', labelKey: 'deposits', expected: by((p) => p.method === 'deposit') },
        { key: 'credit', labelKey: 'credit', expected: 0 },
      ],
      expected: 0,
    },
    {
      key: 'custom',
      lines: [
        { key: 'other', labelKey: 'other', editable: true, expected: by((p) => p.method === 'other' || (p.method === 'custom' && !custom.some((m) => m.id === p.customMethodId))) },
        ...custom.map((m) => ({ key: `custom:${m.id}`, label: m.name, editable: true, expected: by((p) => p.method === 'custom' && p.customMethodId === m.id) })),
      ],
      expected: 0,
    },
  ]
  groups.forEach((g) => (g.expected = sum(g.lines.map((l) => l.expected))))

  const cashPayments = list.filter((p) => p.method === 'cash')
  const cashIn = sum(session.movements.filter((m) => m.type === 'cash_in').map((m) => m.amount))
  const cashOut = sum(session.movements.filter((m) => m.type === 'cash_out').map((m) => m.amount))
  const cashPaid = sum(cashPayments.map((p) => p.amount))
  const cash: CashBlock = { openingFloat: session.openingFloat, cashPayments: cashPaid, cashIn, cashOut: -cashOut, expected: round2(session.openingFloat + cashPaid + cashIn - cashOut) }

  const saleIds = new Set(list.filter((p) => p.kind === 'sale').map((p) => p.saleId))
  const tips = sum(sales.filter((s) => saleIds.has(s.id)).flatMap((s) => s.tips.map((t) => t.amount)))
  return { groups, cash, total: round2(sum(groups.map((g) => g.expected)) + cash.expected), tips, cashPayments }
}

/** Counted amount for a line: what was typed in the count, else the expected amount. */
export const countedFor = (session: RegisterSession, key: string, expected: number) => session.counted?.[key] ?? expected

/** Closed balance: the cash counted when the register was closed. */
export const closedBalance = (session: RegisterSession, expectedCash: number) => countedFor(session, 'cash', expectedCash)

/** "23:55 – Oct 8, 00:01" or "08:55 – 20:10". */
export function sessionTimeRange(session: RegisterSession): string {
  const open = parseISO(session.openedAt)
  if (!session.closedAt) return format(open, 'HH:mm')
  const closed = parseISO(session.closedAt)
  return dayOf(session.openedAt) === dayOf(session.closedAt) ? `${format(open, 'HH:mm')} – ${format(closed, 'HH:mm')}` : `${format(open, 'HH:mm')} – ${format(closed, 'MMM d, HH:mm')}`
}
