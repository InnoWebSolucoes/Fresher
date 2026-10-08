import type { TFunction } from 'i18next'
import type { ClockTime, Weekday } from '@/types'

/**
 * Option lists and label helpers for the Scheduling settings pages
 * (reference/settings-scheduling.md). Values match the shared `Settings`
 * fields so the calendar and online booking keep their semantics.
 */

const K = 'settings.sched'

/** Time zones offered in "Time and calendar settings" (the seed value is "(GMT +01:00) Lisbon"). Values are stored; `key` names the city label. */
const ZONES: { value: string; key: string }[] = [
  { value: '(GMT -11:00) Pago Pago', key: 'pagoPago' },
  { value: '(GMT -10:00) Honolulu', key: 'honolulu' },
  { value: '(GMT -08:00) Anchorage', key: 'anchorage' },
  { value: '(GMT -07:00) Los Angeles', key: 'losAngeles' },
  { value: '(GMT -07:00) Vancouver', key: 'vancouver' },
  { value: '(GMT -06:00) Denver', key: 'denver' },
  { value: '(GMT -06:00) Mexico City', key: 'mexicoCity' },
  { value: '(GMT -05:00) Chicago', key: 'chicago' },
  { value: '(GMT -04:00) New York', key: 'newYork' },
  { value: '(GMT -04:00) Toronto', key: 'toronto' },
  { value: '(GMT -04:00) Caracas', key: 'caracas' },
  { value: '(GMT -03:00) São Paulo', key: 'saoPaulo' },
  { value: '(GMT -03:00) Buenos Aires', key: 'buenosAires' },
  { value: '(GMT -03:00) Santiago', key: 'santiago' },
  { value: '(GMT -02:00) Fernando de Noronha', key: 'noronha' },
  { value: '(GMT -01:00) Cape Verde', key: 'capeVerde' },
  { value: '(GMT +00:00) Azores', key: 'azores' },
  { value: '(GMT +00:00) Reykjavik', key: 'reykjavik' },
  { value: '(GMT +01:00) Lisbon', key: 'lisbon' },
  { value: '(GMT +01:00) Madeira', key: 'madeira' },
  { value: '(GMT +01:00) London', key: 'london' },
  { value: '(GMT +01:00) Dublin', key: 'dublin' },
  { value: '(GMT +01:00) Casablanca', key: 'casablanca' },
  { value: '(GMT +01:00) Lagos', key: 'lagos' },
  { value: '(GMT +01:00) Luanda', key: 'luanda' },
  { value: '(GMT +02:00) Madrid', key: 'madrid' },
  { value: '(GMT +02:00) Paris', key: 'paris' },
  { value: '(GMT +02:00) Brussels', key: 'brussels' },
  { value: '(GMT +02:00) Amsterdam', key: 'amsterdam' },
  { value: '(GMT +02:00) Berlin', key: 'berlin' },
  { value: '(GMT +02:00) Zurich', key: 'zurich' },
  { value: '(GMT +02:00) Rome', key: 'rome' },
  { value: '(GMT +02:00) Johannesburg', key: 'johannesburg' },
  { value: '(GMT +02:00) Maputo', key: 'maputo' },
  { value: '(GMT +03:00) Athens', key: 'athens' },
  { value: '(GMT +03:00) Istanbul', key: 'istanbul' },
  { value: '(GMT +03:00) Moscow', key: 'moscow' },
  { value: '(GMT +03:00) Nairobi', key: 'nairobi' },
  { value: '(GMT +04:00) Dubai', key: 'dubai' },
  { value: '(GMT +05:00) Karachi', key: 'karachi' },
  { value: '(GMT +05:30) Kolkata', key: 'kolkata' },
  { value: '(GMT +07:00) Bangkok', key: 'bangkok' },
  { value: '(GMT +08:00) Singapore', key: 'singapore' },
  { value: '(GMT +08:00) Hong Kong', key: 'hongKong' },
  { value: '(GMT +09:00) Tokyo', key: 'tokyo' },
  { value: '(GMT +10:00) Brisbane', key: 'brisbane' },
  { value: '(GMT +11:00) Sydney', key: 'sydney' },
  { value: '(GMT +13:00) Auckland', key: 'auckland' },
]

export const TIME_ZONES: string[] = ZONES.map((z) => z.value)

/** "(GMT +01:00) Lisbon" → "(GMT +01:00) Lisboa" in Portuguese; unknown values are shown as stored. */
export function timeZoneLabel(t: TFunction, value: string): string {
  const zone = ZONES.find((z) => z.value === value)
  if (!zone) return value
  return `${value.slice(0, value.indexOf(')') + 1)} ${t(`${K}.zones.${zone.key}`)}`
}

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

/** Suggested resource types (reference §4) with the icon used when one is created. `name` is the English name; the label is translated. */
export const RESOURCE_SUGGESTIONS: { name: string; key: string; icon: string }[] = [
  { name: 'Bed', key: 'bed', icon: 'bed' },
  { name: 'Chair', key: 'chair', icon: 'armchair' },
  { name: 'Room', key: 'room', icon: 'door-open' },
  { name: 'Equipment', key: 'equipment', icon: 'wrench' },
  { name: 'Manicure station', key: 'manicureStation', icon: 'hand' },
  { name: 'Studio', key: 'studio', icon: 'sparkles' },
  { name: 'Pool', key: 'pool', icon: 'waves' },
  { name: 'Tanning station', key: 'tanningStation', icon: 'sun' },
  { name: 'Table', key: 'table', icon: 'lamp' },
  { name: 'Sauna', key: 'sauna', icon: 'flame' },
]

export const resourceSuggestionLabel = (t: TFunction, suggestion: { key: string }) => t(`${K}.resourceTypes.${suggestion.key}`)

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
