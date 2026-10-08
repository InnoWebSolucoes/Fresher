import i18n, { type TOptions } from 'i18next'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { getLang } from '@/i18n/language'

/**
 * Text the mock API writes into data at runtime (notifications, activity
 * entries, outbox messages, sale lines, error messages) is created in the
 * language active at that moment, like text a user typed.
 *
 * Falls back to the key when i18next has not been set up (unit tests that
 * import the API without the app).
 */
export function t(key: string, options?: TOptions): string {
  const text: unknown = options ? i18n.t(key, options) : i18n.t(key)
  return typeof text === 'string' ? text : key
}

/** A date label used mid-sentence: Portuguese day and month names are lowercase in running text. */
export function inline(label: string): string {
  return getLang() === 'pt' ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

/** "Wed, Oct 7 at 14:00" / "qua, 7 out às 14:00". */
export function dateAt(date: Date | string, time: string | undefined, pattern = 'EEE, MMM d', midSentence = true): string {
  const label = format(typeof date === 'string' ? parseISO(date) : date, pattern)
  return t('api.common.dateAt', { date: midSentence ? inline(label) : label, time: time ?? '' })
}

/**
 * A yyyy-MM-dd day inside a message: kept as is in English (as it always was)
 * and written out in Portuguese ("8 nov 2026").
 */
export function isoDay(iso: string): string {
  return getLang() === 'pt' ? format(parseISO(iso), 'd MMM yyyy') : iso
}

/** "a, b or c" / "a, b ou c". */
export function orList(items: string[]): string {
  if (items.length < 2) return items.join('')
  return t('api.common.orList', { list: items.slice(0, -1).join(', '), last: items[items.length - 1] })
}
