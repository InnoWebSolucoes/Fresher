import { computeTotals, lineTotal } from '@/api/sales'
import { round2 } from '@/lib/format'
import type { ISODate, Payment, PaymentMethod, Sale, SaleItemType } from '@/types'
import { dayOf, methodName } from '../shared/data'

/**
 * Daily sales summary (sales.md §1), computed from every sale, payment and
 * refund on one day:
 * - Transaction summary: quantities and gross totals per item type for the
 *   sales and refunds created that day (cart discounts spread over the
 *   lines, tips excluded, voided sales and drafts left out).
 * - Cash movement summary: payments collected and refunds paid that day per
 *   payment method, tips collected and the balance still outstanding on the
 *   day's unpaid sales.
 */

export const TRANSACTION_ROWS = ['services', 'addons', 'products', 'shipping', 'giftCards', 'packages', 'memberships', 'lateFees', 'noShowFees', 'refundAmount'] as const
export type TransactionRowKey = (typeof TRANSACTION_ROWS)[number]

const ROW_FOR_TYPE: Record<SaleItemType, TransactionRowKey> = {
  service: 'services',
  service_addon: 'addons',
  product: 'products',
  shipping: 'shipping',
  gift_card: 'giftCards',
  package: 'packages',
  membership: 'memberships',
  late_cancellation_fee: 'lateFees',
  no_show_fee: 'noShowFees',
  manual: 'services',
}

export interface TransactionRow {
  key: TransactionRowKey
  salesQty: number
  refundQty: number
  gross: number
}

export interface CashRow {
  /** 'cash', 'gift_card' or a method key; `label` is the method name. */
  key: string
  label: string
  collected: number
  refunded: number
}

export interface DailySummary {
  date: ISODate
  transactions: TransactionRow[]
  total: { salesQty: number; refundQty: number; gross: number }
  cash: CashRow
  methods: CashRow[]
  giftCards: CashRow
  payments: { collected: number; refunded: number }
  tips: { collected: number; refunded: number }
  outstanding: number
}

const METHOD_ORDER: PaymentMethod[] = ['card_terminal', 'manual_card', 'qr_code', 'self_checkout', 'online_card', 'deposit', 'other', 'custom']

export function computeDailySummary(sales: Sale[], payments: Payment[], date: ISODate): DailySummary {
  const rows = new Map<TransactionRowKey, TransactionRow>(TRANSACTION_ROWS.map((key) => [key, { key, salesQty: 0, refundQty: 0, gross: 0 }]))
  const paymentsById = new Map(payments.map((p) => [p.id, p]))

  let tips = 0
  let outstanding = 0
  for (const sale of sales) {
    if (sale.status === 'draft' || sale.status === 'voided') continue
    const totals = computeTotals(sale)
    const factor = totals.itemsTotal ? totals.subtotal / totals.itemsTotal : 1
    if (dayOf(sale.createdAt) === date) {
      for (const item of sale.items) {
        const gross = lineTotal(item) * factor
        if (sale.kind === 'refund') {
          const row = rows.get(item.type === 'manual' ? 'refundAmount' : ROW_FOR_TYPE[item.type])!
          row.refundQty += Math.abs(item.quantity)
          row.gross += gross
        } else {
          const row = rows.get(ROW_FOR_TYPE[item.type])!
          row.salesQty += item.quantity
          row.gross += gross
        }
      }
      if (sale.kind === 'sale' && (sale.status === 'unpaid' || sale.status === 'part_paid')) {
        const paid = sale.paymentIds.reduce((s, id) => {
          const p = paymentsById.get(id)
          return p && p.status === 'succeeded' ? s + p.amount : s
        }, 0)
        outstanding += Math.max(0, totals.total - paid)
      }
    }
    if (sale.kind === 'sale' && sale.status === 'completed' && sale.completedAt && dayOf(sale.completedAt) === date) tips += totals.tips
  }

  const transactions = [...rows.values()].map((r) => ({ ...r, gross: round2(r.gross) }))
  const total = transactions.reduce((acc, r) => ({ salesQty: acc.salesQty + r.salesQty, refundQty: acc.refundQty + r.refundQty, gross: round2(acc.gross + r.gross) }), { salesQty: 0, refundQty: 0, gross: 0 })

  const cash: CashRow = { key: 'cash', label: 'Cash', collected: 0, refunded: 0 }
  const giftCards: CashRow = { key: 'gift_card', label: 'Gift card', collected: 0, refunded: 0 }
  const methods = new Map<string, CashRow & { order: number }>()
  for (const p of payments) {
    if (p.status !== 'succeeded' || dayOf(p.at) !== date) continue
    let row: CashRow
    if (p.method === 'cash') row = cash
    else if (p.method === 'gift_card') row = giftCards
    else {
      const key = p.method === 'custom' ? `custom:${p.customMethodId ?? p.methodLabel}` : p.method
      if (!methods.has(key)) methods.set(key, { key, label: methodName(p), collected: 0, refunded: 0, order: METHOD_ORDER.indexOf(p.method) })
      row = methods.get(key)!
    }
    if (p.kind === 'refund') row.refunded += p.amount
    else row.collected += p.amount
  }
  const fix = (r: CashRow): CashRow => ({ key: r.key, label: r.label, collected: round2(r.collected), refunded: round2(r.refunded) })
  const methodRows = [...methods.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)).map(fix)
  const all = [fix(cash), ...methodRows, fix(giftCards)]

  return {
    date,
    transactions,
    total,
    cash: fix(cash),
    methods: methodRows,
    giftCards: fix(giftCards),
    payments: { collected: round2(all.reduce((s, r) => s + r.collected, 0)), refunded: round2(all.reduce((s, r) => s + r.refunded, 0)) },
    tips: { collected: round2(tips), refunded: 0 },
    outstanding: round2(outstanding),
  }
}
