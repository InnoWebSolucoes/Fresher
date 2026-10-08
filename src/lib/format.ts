import { parseISO } from 'date-fns'
import i18n from 'i18next'
import { format } from '@/lib/dates'
import { getLang, localeTag } from '@/i18n/language'

const toDate = (d: Date | string) => (typeof d === 'string' ? parseISO(d) : d)

/** Thousands separators and decimals in the current language ("1,234.5" / "1234,5"). */
export function num(n: number, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(localeTag(), options)
}

// Portuguese puts the symbol after the amount with a non-breaking space, so "527,00 €" never wraps.
const withSymbol = (negative: boolean, text: string) => (getLang() === 'pt' ? `${negative ? '-' : ''}${text}\u00a0€` : `${negative ? '-' : ''}€${text}`)

/** €25, €28.75 (English) / 25 €, 28,75 € (Portuguese). Whole euros drop the cents, as in the reference. */
export function money(amount: number): string {
  const abs = Math.abs(Math.round(amount * 100) / 100)
  const text = Number.isInteger(abs) ? num(abs) : num(abs, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return withSymbol(amount < 0 && abs > 0, text)
}

/** €25.00 / 25,00 € — fixed two decimals for tables and receipts. */
export function money2(amount: number): string {
  const abs = Math.abs(amount)
  return withSymbol(amount < 0 && abs >= 0.005, num(abs, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
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

export const fullName = (p: { firstName: string; lastName: string } | null | undefined, fallback = i18n.t('common.walkIn')) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : fallback

export const initialsOf = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase() : i18n.t('common.walkIn').charAt(0).toUpperCase()

