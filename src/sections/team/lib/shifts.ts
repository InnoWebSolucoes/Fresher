import { addDays, differenceInCalendarDays, parseISO, startOfWeek } from 'date-fns'
import i18n from 'i18next'
import { format, formatRange } from '@/lib/dates'
import type { ClosedPeriod, DbData, ID, ISODate, TimeOff, TimeRange } from '@/types'
import { closedPeriodOn, rawShifts, subtractRanges, timeOffOn } from '@/lib/schedule'
import { toClock, toMinutes } from '@/lib/time'

/** 00:00 … 23:55 in 5-minute steps (team.md §4.2). */
export const TIME_OPTIONS: string[] = Array.from({ length: 288 }, (_, i) => toClock(i * 5))

export const weekStart = (date: ISODate): ISODate => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd')
export const weekDays = (start: ISODate): ISODate[] => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(start), i), 'yyyy-MM-dd'))
export const shiftDate = (date: ISODate, days: number): ISODate => format(addDays(parseISO(date), days), 'yyyy-MM-dd')

/** "Oct 5 – 11, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function rangeLabel(from: ISODate, to: ISODate): string {
  return formatRange(parseISO(from), parseISO(to))
}

/** "9 hr", "8 hr 30 min", "0 min" (roster totals); "9 h", "8 h 30 min" in Portuguese. */
export function hoursLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h && m) return i18n.t('team.hoursLabel.hoursMinutes', { h, m })
  if (h) return i18n.t('team.hoursLabel.hours', { h })
  return i18n.t('team.hoursLabel.minutes', { m })
}

export const rangeMinutes = (r: TimeRange) => Math.max(0, toMinutes(r.end) - toMinutes(r.start))
export const rangesMinutes = (ranges: TimeRange[]) => ranges.reduce((s, r) => s + rangeMinutes(r), 0)

type ScheduleData = Pick<DbData, 'shiftPatterns' | 'shiftOverrides' | 'closedPeriods' | 'timeOff'>

export interface DayCell {
  date: ISODate
  closed?: ClosedPeriod
  /** Scheduled ranges before time off. */
  shifts: TimeRange[]
  timeOff: TimeOff[]
  /** Shifts left after time off (what's shown under a time-off pill). */
  remaining: TimeRange[]
  minutes: number
}

/** One roster cell: shifts, time off and closed days for a member at a location. */
export function dayCell(data: ScheduleData, memberId: ID, locationId: ID, date: ISODate): DayCell {
  const shifts = rawShifts(data, memberId, date, locationId).map((s) => ({ start: s.start, end: s.end }))
  const closed = closedPeriodOn(data.closedPeriods, date, locationId)
  const timeOff = timeOffOn(data.timeOff, memberId, date)
  const windows = subtractRanges(
    shifts.map((s): [number, number] => [toMinutes(s.start), toMinutes(s.end)]),
    timeOff.map((t): [number, number] => [toMinutes(t.startTime), toMinutes(t.endTime)]),
  )
  const remaining = windows.map(([s, e]) => ({ start: toClock(s), end: toClock(e) }))
  const minutes = closed ? 0 : windows.reduce((sum, [s, e]) => sum + (e - s), 0)
  return { date, closed, shifts, timeOff, remaining, minutes }
}

/** Minutes of time off that fall inside the member's shifts (Add time off "Time off total"). */
export function timeOffTotal(data: ScheduleData, memberId: ID, date: ISODate, start: string, end: string, repeatUntil?: ISODate): number {
  const last = repeatUntil && repeatUntil > date ? repeatUntil : date
  const days = Math.min(366, differenceInCalendarDays(parseISO(last), parseISO(date)) + 1)
  let total = 0
  for (let i = 0; i < days; i++) {
    const day = shiftDate(date, i)
    const shifts = rawShifts(data, memberId, day)
    if (!shifts.length) {
      if (days === 1) total += Math.max(0, toMinutes(end) - toMinutes(start))
      continue
    }
    for (const s of shifts) {
      const from = Math.max(toMinutes(s.start), toMinutes(start))
      const to = Math.min(toMinutes(s.end), toMinutes(end))
      total += Math.max(0, to - from)
    }
  }
  return total
}

/** Validates a list of ranges: end after start and no overlaps. Returns an error key or null. */
export function rangesError(ranges: TimeRange[]): 'endAfterStart' | 'overlap' | null {
  if (ranges.some((r) => toMinutes(r.end) <= toMinutes(r.start))) return 'endAfterStart'
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 1; i < sorted.length; i++) if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) return 'overlap'
  return null
}

/** "Thu, Oct 8, 2026" */
export const fmtDayUS = (date: ISODate) => format(parseISO(date), 'EEE, MMM d, yyyy')
/** "Tue, Oct 6" */
export const fmtDayShortUS = (date: ISODate) => format(parseISO(date), 'EEE, MMM d')
