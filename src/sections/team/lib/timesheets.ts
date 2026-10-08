import type { BlockedTimeType, DbData, Timesheet, TimesheetBreak } from '@/types'
import { rawShifts } from '@/lib/schedule'
import { toMinutes } from '@/lib/time'

export function breakMinutes(b: Pick<TimesheetBreak, 'start' | 'end'>): number {
  return b.end ? Math.max(0, toMinutes(b.end) - toMinutes(b.start)) : 0
}

export interface TimesheetTotals {
  span: number
  breaks: number
  unpaid: number
  /** Hours worked: clock-in to clock-out minus all breaks. */
  worked: number
  /** Total paid hours: clock-in to clock-out minus unpaid breaks. */
  paid: number
}

export function timesheetTotals(ts: Pick<Timesheet, 'clockIn' | 'clockOut' | 'breaks'>, types: BlockedTimeType[]): TimesheetTotals {
  const span = ts.clockOut ? Math.max(0, toMinutes(ts.clockOut) - toMinutes(ts.clockIn)) : 0
  const breaks = ts.breaks.reduce((s, b) => s + breakMinutes(b), 0)
  const unpaid = ts.breaks.filter((b) => !types.find((t) => t.id === b.typeId)?.paid).reduce((s, b) => s + breakMinutes(b), 0)
  return { span, breaks, unpaid, worked: Math.max(0, span - breaks), paid: Math.max(0, span - unpaid) }
}

/** Late when the clock-in is after the first scheduled shift of the day. */
export function isLate(data: Pick<DbData, 'shiftPatterns' | 'shiftOverrides'>, ts: Timesheet): boolean {
  const shifts = rawShifts(data, ts.teamMemberId, ts.date, ts.locationId)
  if (!shifts.length) return false
  const first = shifts.map((s) => s.start).sort()[0]
  return toMinutes(ts.clockIn) > toMinutes(first)
}
