import { format, parseISO } from 'date-fns'

const toDate = (d: Date | string) => (typeof d === 'string' ? parseISO(d) : d)

/** €25, €28.75 — whole euros drop the cents (as in the reference). */
export function money(amount: number): string {
  const negative = amount < 0
  const abs = Math.abs(Math.round(amount * 100) / 100)
  const text = Number.isInteger(abs) ? abs.toLocaleString('en-IE') : abs.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${negative ? '-' : ''}€${text}`
}

/** €25.00 — fixed two decimals for tables and receipts. */
export function money2(amount: number): string {
  const negative = amount < 0
  const abs = Math.abs(amount).toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${negative ? '-' : ''}€${abs}`
}

/** Round to cents. */
export const round2 = (n: number) => Math.round(n * 100) / 100

/** Tax contained in a tax-inclusive amount. */
export const taxIncluded = (gross: number, rate = 0.23) => round2((gross * rate) / (1 + rate))

// Date formats seen across the reference.
export const fmtDayLong = (d: Date | string) => format(toDate(d), 'EEE, d MMM yyyy') // Wed, 7 Oct 2026
export const fmtDayShort = (d: Date | string) => format(toDate(d), 'EEE d MMM') // Wed 7 Oct
export const fmtDayHeader = (d: Date | string) => format(toDate(d), 'EEE, MMM d') // Wed, Oct 7
export const fmtDate = (d: Date | string) => format(toDate(d), 'MMM d, yyyy') // Oct 7, 2026
export const fmtDateEU = (d: Date | string) => format(toDate(d), 'd MMM yyyy') // 7 Oct 2026
export const fmtDateTime = (d: Date | string) => format(toDate(d), 'd MMM yyyy, HH:mm') // 7 Oct 2026, 23:46
export const fmtDateTimeUS = (d: Date | string) => format(toDate(d), 'MMM d, yyyy, HH:mm') // Oct 7, 2026, 23:24
export const fmtTime = (d: Date | string) => format(toDate(d), 'HH:mm')
export const fmtFullDay = (d: Date | string) => format(toDate(d), 'EEEE, d MMM yyyy') // Wednesday, 7 Oct 2026

export const fullName = (p: { firstName: string; lastName: string } | null | undefined, fallback = 'Walk-In') =>
  p ? `${p.firstName} ${p.lastName}`.trim() : fallback

export const initialsOf = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase() : 'W'

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
