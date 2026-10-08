import { addDays, differenceInCalendarDays, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { format } from '@/lib/dates'
import type { DbData, ID, ISODate } from '@/types'
import { lineTotal } from '@/api/sales'
import { workingWindows } from '@/lib/schedule'
import { round2 } from '@/lib/format'
import { dayOf } from './pay'

export type PerfPeriod = 'month_to_date' | 'last_7_days' | 'week_to_date' | 'today'
export const PERF_PERIODS: PerfPeriod[] = ['month_to_date', 'last_7_days', 'week_to_date', 'today']

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function perfRange(period: PerfPeriod, today: ISODate): { from: ISODate; to: ISODate; prevFrom: ISODate; prevTo: ISODate } {
  const t = parseISO(today)
  const from = period === 'month_to_date' ? startOfMonth(t) : period === 'last_7_days' ? subDays(t, 6) : period === 'week_to_date' ? startOfWeek(t, { weekStartsOn: 1 }) : t
  const days = differenceInCalendarDays(t, from) + 1
  return { from: iso(from), to: today, prevFrom: iso(subDays(from, days)), prevTo: iso(subDays(from, 1)) }
}

type PerfData = Pick<DbData, 'sales' | 'appointments' | 'shiftPatterns' | 'shiftOverrides' | 'closedPeriods' | 'timeOff'>

interface Stats {
  sales: number
  appointments: number
  clients: number
  occupancy: number
  retention: number
  daily: { date: ISODate; value: number }[]
}

function stats(data: PerfData, memberId: ID, from: ISODate, to: ISODate): Stats {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  const daily = Array.from({ length: days }, (_, i) => ({ date: iso(addDays(parseISO(from), i)), value: 0 }))
  let sales = 0
  for (const s of data.sales) {
    if (s.kind !== 'sale' || s.status !== 'completed') continue
    const d = dayOf(s.completedAt ?? s.createdAt)
    if (d < from || d > to) continue
    const value = s.items.filter((i) => i.teamMemberId === memberId).reduce((sum, i) => sum + lineTotal(i), 0)
    if (!value) continue
    sales += value
    const bucket = daily.find((x) => x.date === d)
    if (bucket) bucket.value = round2(bucket.value + value)
  }
  const appts = data.appointments.filter((a) => a.date >= from && a.date <= to && a.status !== 'cancelled' && a.items.some((i) => i.teamMemberId === memberId))
  const clients = new Set(appts.map((a) => a.clientId).filter(Boolean) as string[])
  let booked = 0
  for (const a of appts) if (a.status !== 'no_show') booked += a.items.filter((i) => i.teamMemberId === memberId).reduce((sum, i) => sum + i.durationMin, 0)
  let working = 0
  for (const d of daily) working += workingWindows(data, memberId, d.date).reduce((sum, [s, e]) => sum + (e - s), 0)
  const returning = [...clients].filter((clientId) => data.appointments.some((a) => a.clientId === clientId && a.date < from && a.status === 'completed' && a.items.some((i) => i.teamMemberId === memberId))).length
  return {
    sales: round2(sales),
    appointments: appts.length,
    clients: clients.size,
    occupancy: working ? Math.min(100, Math.round((booked / working) * 100)) : 0,
    retention: clients.size ? Math.round((returning / clients.size) * 100) : 0,
    daily,
  }
}

export function change(current: number, previous: number): number {
  if (!previous) return current ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

export function memberPerformance(data: PerfData, memberId: ID, period: PerfPeriod, today: ISODate) {
  const r = perfRange(period, today)
  return { current: stats(data, memberId, r.from, r.to), previous: stats(data, memberId, r.prevFrom, r.prevTo), range: r }
}
