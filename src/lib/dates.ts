import { format as formatEn, setDefaultOptions } from 'date-fns'
import { enUS, pt } from 'date-fns/locale'
import { getLang, onLangChange, type Lang } from '@/i18n/language'

/**
 * Locale-aware date-fns `format`. Code keeps writing the English patterns
 * ('MMM d, yyyy'); in Portuguese they are rewritten to the Portuguese order
 * ('d MMM yyyy' → "7 out 2026") and use 24-hour time.
 */
const PT_PATTERNS: Record<string, string> = {
  'MMM d': 'd MMM',
  'MMM d, yyyy': 'd MMM yyyy',
  'MMM d, yyyy, HH:mm': 'd MMM yyyy, HH:mm',
  'MMM d, HH:mm': 'd MMM, HH:mm',
  'EEE, MMM d': 'EEE, d MMM',
  'EEE, MMM d, yyyy': 'EEE, d MMM yyyy',
  'EEE, MMM d, HH:mm': 'EEE, d MMM, HH:mm',
  'EEEE, MMM d': 'EEEE, d MMM',
  'EEEE, MMM d, yyyy': 'EEEE, d MMM yyyy',
  'EEEE, MMMM d': "EEEE, d 'de' MMMM",
  'EEEE, MMMM d, yyyy': "EEEE, d 'de' MMMM 'de' yyyy",
  'EEEE d MMMM': "EEEE, d 'de' MMMM",
  'EEEE, d MMMM yyyy': "EEEE, d 'de' MMMM 'de' yyyy",
  'MMMM d, yyyy': "d 'de' MMMM 'de' yyyy",
  'MMMM d': "d 'de' MMMM",
  'd MMMM yyyy': "d 'de' MMMM 'de' yyyy",
  'd MMMM': "d 'de' MMMM",
  "EEEE, d MMM yyyy 'at' HH:mm": "EEEE, d MMM yyyy 'às' HH:mm",
  'MMMM yyyy': "MMMM 'de' yyyy",
  'dd MMM yyyy, h:mmaaa': 'dd MMM yyyy, HH:mm',
  'h:mm a': 'HH:mm',
  'h:mmaaa': 'HH:mm',
  'h:mm': 'HH:mm',
  'ha': 'HH:00',
  'h a': 'HH:00',
}

const LOCALES = { pt, en: enUS } as const

function applyLocale(lang: Lang) {
  // weekStartsOn stays Sunday in both languages (calendar weeks and pay periods depend on it).
  setDefaultOptions({ locale: LOCALES[lang], weekStartsOn: 0 })
}
applyLocale(getLang())
onLangChange(applyLocale)

/** Patterns made only of numbers (ids, file names, ISO dates) are never rewritten or capitalised. */
const TEXTUAL = /E|MMM|LLL|a|Q/

export function format(...args: Parameters<typeof formatEn>): string {
  const [date, pattern, options] = args
  if (getLang() !== 'pt') return formatEn(date, pattern, options)
  const text = formatEn(date, PT_PATTERNS[pattern] ?? pattern, { locale: pt, ...options })
  // "quarta-feira, 7 out" → "Quarta-feira, 7 out" when the date starts the label.
  return TEXTUAL.test(pattern) ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** "Oct 5 – 11, 2026" / "5 – 11 out 2026", across months and years too. */
export function formatRange(a: Date, b: Date): string {
  const sameYear = a.getFullYear() === b.getFullYear()
  const sameMonth = sameYear && a.getMonth() === b.getMonth()
  if (getLang() === 'pt') {
    if (sameMonth) return `${formatEn(a, 'd')} – ${formatEn(b, 'd MMM yyyy', { locale: pt })}`
    if (sameYear) return `${formatEn(a, 'd MMM', { locale: pt })} – ${formatEn(b, 'd MMM yyyy', { locale: pt })}`
    return `${formatEn(a, 'd MMM yyyy', { locale: pt })} – ${formatEn(b, 'd MMM yyyy', { locale: pt })}`
  }
  if (sameMonth) return `${formatEn(a, 'MMM d')} – ${formatEn(b, 'd, yyyy')}`
  if (sameYear) return `${formatEn(a, 'MMM d')} – ${formatEn(b, 'MMM d, yyyy')}`
  return `${formatEn(a, 'MMM d, yyyy')} – ${formatEn(b, 'MMM d, yyyy')}`
}
