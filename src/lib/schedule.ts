import { differenceInCalendarWeeks, parseISO } from 'date-fns'
import type { ClosedPeriod, DbData, ID, ISODate, Shift, TimeOff, TimeRange } from '@/types'
import { toMinutes, weekdayOf } from './time'

type ScheduleData = Pick<DbData, 'shiftPatterns' | 'shiftOverrides' | 'closedPeriods' | 'timeOff'>

/** True when the business (or this location) is closed on `date`. */
export function closedPeriodOn(closed: ClosedPeriod[], date: ISODate, locationId?: ID): ClosedPeriod | undefined {
  return closed.find(
    (p) => p.startDate <= date && date <= p.endDate && (p.locationIds.length === 0 || !locationId || p.locationIds.includes(locationId)),
  )
}

/** Time off for a member on a date (handles "Repeat until"). */
export function timeOffOn(timeOff: TimeOff[], teamMemberId: ID, date: ISODate): TimeOff[] {
  return timeOff.filter((t) => t.teamMemberId === teamMemberId && (t.startDate === date || (t.repeatUntil && t.startDate <= date && date <= t.repeatUntil)))
}

/**
 * Scheduled shifts for one member on one day, before time off and closed
 * periods. Overrides win over repeating patterns.
 */
export function rawShifts(data: Pick<DbData, 'shiftPatterns' | 'shiftOverrides'>, teamMemberId: ID, date: ISODate, locationId?: ID): Shift[] {
  const overrides = data.shiftOverrides.filter((o) => o.teamMemberId === teamMemberId && o.date === date && (!locationId || o.locationId === locationId))
  if (overrides.length) {
    return overrides.flatMap((o) => o.ranges.map((r) => ({ teamMemberId, locationId: o.locationId, date, start: r.start, end: r.end })))
  }
  const day = weekdayOf(date)
  return data.shiftPatterns
    .filter((p) => p.teamMemberId === teamMemberId && (!locationId || p.locationId === locationId) && p.startDate <= date && (!p.endDate || date <= p.endDate))
    .flatMap((p) => {
      const weekIndex = ((differenceInCalendarWeeks(parseISO(date), parseISO(p.startDate), { weekStartsOn: 1 }) % p.scheduleType) + p.scheduleType) % p.scheduleType
      const ranges = p.weeks[weekIndex]?.[day] ?? []
      return ranges.map((r) => ({ teamMemberId, locationId: p.locationId, date, start: r.start, end: r.end }))
    })
}

/** Subtract `cut` ranges from `ranges` (all in minutes). */
export function subtractRanges(ranges: [number, number][], cut: [number, number][]): [number, number][] {
  let result = ranges
  for (const [cs, ce] of cut) {
    result = result.flatMap(([s, e]): [number, number][] => {
      if (ce <= s || cs >= e) return [[s, e]]
      const parts: [number, number][] = []
      if (cs > s) parts.push([s, cs])
      if (ce < e) parts.push([ce, e])
      return parts
    })
  }
  return result
}

/**
 * Working windows for a member on a day in minutes: shifts minus time off,
 * empty on closed days.
 */
export function workingWindows(data: ScheduleData, teamMemberId: ID, date: ISODate, locationId?: ID): [number, number][] {
  const shifts = rawShifts(data, teamMemberId, date, locationId)
  if (!shifts.length) return []
  if (closedPeriodOn(data.closedPeriods, date, shifts[0].locationId)) return []
  const windows = shifts.map((s): [number, number] => [toMinutes(s.start), toMinutes(s.end)])
  const off = timeOffOn(data.timeOff, teamMemberId, date).map((t): [number, number] => [toMinutes(t.startTime), toMinutes(t.endTime)])
  return subtractRanges(windows, off)
}

export function rangesTotalMinutes(ranges: TimeRange[]): number {
  return ranges.reduce((sum, r) => sum + Math.max(0, toMinutes(r.end) - toMinutes(r.start)), 0)
}
