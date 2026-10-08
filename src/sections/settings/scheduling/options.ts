import type { TFunction } from 'i18next'
import type { ClockTime, Weekday } from '@/types'

/**
 * Option lists and label helpers for the Scheduling settings pages
 * (reference/settings-scheduling.md). Values match the shared `Settings`
 * fields so the calendar and online booking keep their semantics.
 */

const K = 'settings.sched'

/** Time zones offered in "Time and calendar settings" (the seed value is "(GMT +01:00) Lisbon"). */
export const TIME_ZONES: string[] = [
  '(GMT -11:00) Pago Pago',
  '(GMT -10:00) Honolulu',
  '(GMT -08:00) Anchorage',
  '(GMT -07:00) Los Angeles',
  '(GMT -07:00) Vancouver',
  '(GMT -06:00) Denver',
  '(GMT -06:00) Mexico City',
  '(GMT -05:00) Chicago',
  '(GMT -04:00) New York',
  '(GMT -04:00) Toronto',
  '(GMT -04:00) Caracas',
  '(GMT -03:00) São Paulo',
  '(GMT -03:00) Buenos Aires',
  '(GMT -03:00) Santiago',
  '(GMT -02:00) Fernando de Noronha',
  '(GMT -01:00) Cape Verde',
  '(GMT +00:00) Azores',
  '(GMT +00:00) Reykjavik',
  '(GMT +01:00) Lisbon',
  '(GMT +01:00) Madeira',
  '(GMT +01:00) London',
  '(GMT +01:00) Dublin',
  '(GMT +01:00) Casablanca',
  '(GMT +01:00) Lagos',
  '(GMT +01:00) Luanda',
  '(GMT +02:00) Madrid',
  '(GMT +02:00) Paris',
  '(GMT +02:00) Brussels',
  '(GMT +02:00) Amsterdam',
  '(GMT +02:00) Berlin',
  '(GMT +02:00) Zurich',
  '(GMT +02:00) Rome',
  '(GMT +02:00) Johannesburg',
  '(GMT +02:00) Maputo',
  '(GMT +03:00) Athens',
  '(GMT +03:00) Istanbul',
  '(GMT +03:00) Moscow',
  '(GMT +03:00) Nairobi',
  '(GMT +04:00) Dubai',
  '(GMT +05:00) Karachi',
  '(GMT +05:30) Kolkata',
  '(GMT +07:00) Bangkok',
  '(GMT +08:00) Singapore',
  '(GMT +08:00) Hong Kong',
  '(GMT +09:00) Tokyo',
  '(GMT +10:00) Brisbane',
  '(GMT +11:00) Sydney',
  '(GMT +13:00) Auckland',
]

/** Weekdays in the order the reference lists them (Sunday … Saturday); 0 = Monday in our model. */
export const WEEK_SUNDAY_FIRST: Weekday[] = [6, 0, 1, 2, 3, 4, 5]

/** Monday … Sunday, rotated so the business's first day of the week comes first. */
export function orderedWeek(firstDay: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((firstDay + i) % 7) as Weekday)
}

export const weekdayName = (t: TFunction, day: Weekday) => t(`${K}.weekdays.${day}`)

/** "30 minutes", "1 hour", "1 hour 30 minutes". */
export function durationOption(t: TFunction, min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return t(`${K}.dur.minutes`, { count: m })
  if (!m) return t(`${K}.dur.hours`, { count: h })
  return `${t(`${K}.dur.hours`, { count: h })} ${t(`${K}.dur.minutes`, { count: m })}`
}

/** Blocked time type durations: 5 minutes … 8 hours. */
export const BLOCK_DURATIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480]

/** Booking window "Clients can book up to … in advance" (days). */
export const ADVANCE_DAYS = [7, 14, 21, 30, 60, 90, 120, 150, 180, 270, 365, 455, 545, 730]
const MONTHS_BY_DAYS: Record<number, number> = { 30: 1, 60: 2, 90: 3, 120: 4, 150: 5, 180: 6, 270: 9, 365: 12, 455: 15, 545: 18, 730: 24 }

/** "1 week", "12 months", "45 days". */
export function periodLabel(t: TFunction, days: number): string {
  if (MONTHS_BY_DAYS[days]) return t(`${K}.dur.months`, { count: MONTHS_BY_DAYS[days] })
  if (days % 7 === 0 && days < 30) return t(`${K}.dur.weeks`, { count: days / 7 })
  return t(`${K}.dur.days`, { count: days })
}

/** "15 minutes", "1 hour", "48 hours". */
export function minutesLabel(t: TFunction, min: number): string {
  if (min < 60 || min % 60 !== 0) return durationOption(t, min)
  return t(`${K}.dur.hours`, { count: min / 60 })
}

/** Booking window "and no later than … before start time" (minutes; 0 = immediately). */
export const NOTICE_MINUTES = [0, 15, 30, 45, 60, 120, 180, 240, 300, 360, 480, 720, 1440]

/** "Clients can cancel or reschedule …" (minutes; 0 = anytime). */
export const CANCEL_MINUTES = [0, 30, 60, 120, 180, 240, 300, 360, 720, 1440, 2880]

/** Schedule optimization "Time slot interval". */
export const SLOT_INTERVALS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]

/** Booked appointment reassignment "Reassignment cut off". */
export const REASSIGN_CUTOFFS = [15, 30, 60, 120]

/** Keeps a saved value selectable even when it isn't one of the standard options. */
export function withValue(list: number[], value: number): number[] {
  return list.includes(value) ? list : [...list, value].sort((a, b) => a - b)
}

/** Suggested resource types (reference §4) with the icon used when one is created. */
export const RESOURCE_SUGGESTIONS: { name: string; icon: string }[] = [
  { name: 'Bed', icon: 'bed' },
  { name: 'Chair', icon: 'armchair' },
  { name: 'Room', icon: 'door-open' },
  { name: 'Equipment', icon: 'wrench' },
  { name: 'Manicure station', icon: 'hand' },
  { name: 'Studio', icon: 'sparkles' },
  { name: 'Pool', icon: 'waves' },
  { name: 'Tanning station', icon: 'sun' },
  { name: 'Table', icon: 'lamp' },
  { name: 'Sauna', icon: 'flame' },
]

/** Quarter-hour clock times for the resource weekly availability editor. */
export const CLOCK_TIMES: ClockTime[] = Array.from({ length: 24 * 4 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`).concat('23:59')

/** "21:00" or "9:00pm" following the business time format. */
export function formatClock(clock: ClockTime, format: '12h' | '24h'): string {
  if (format === '24h') return clock
  const [h, m] = clock.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

/** Simple email check for comma-separated address lists. */
export const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/
