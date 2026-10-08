import { addDays, eachDayOfInterval, endOfDay, endOfMonth, isAfter, parseISO, startOfDay, startOfMonth, startOfWeek, subDays, subMonths } from 'date-fns'
import { format } from '@/lib/dates'
import type { Appointment, BookingChannel, DbData, ID } from '@/types'
import { computeTotals } from '@/api/sales'
import { workingWindows } from '@/lib/schedule'
import { round2 } from '@/lib/format'

export type Period = 'yesterday' | 'today' | 'week' | 'month'
export type ChannelGroup = 'offline' | 'bookNowLink' | 'marketplace' | 'social' | 'marketing'
export const CHANNEL_GROUPS: ChannelGroup[] = ['offline', 'bookNowLink', 'marketplace', 'social', 'marketing']

export function channelGroup(channel: BookingChannel | 'store'): ChannelGroup {
  switch (channel) {
    case 'marketplace':
    case 'google':
      return 'marketplace'
    case 'book_now_link':
    case 'store':
      return 'bookNowLink'
    case 'facebook':
    case 'instagram':
      return 'social'
    case 'automations':
    case 'blast':
      return 'marketing'
    default:
      return 'offline'
  }
}

interface Range {
  start: Date
  end: Date
  label: string
}

const toDay = (d: Date) => format(d, 'yyyy-MM-dd')

/** Current period, the same span one week/month earlier, and 7 points for the charts (oldest first). */
export function periodRanges(period: Period, n: Date): { current: Range; previous: Range; series: Range[] } {
  if (period === 'today' || period === 'yesterday') {
    const base = period === 'today' ? n : subDays(n, 1)
    const endOf = (d: Date, i: number) => (period === 'today' && i === 0 ? d : endOfDay(d))
    const series = [6, 5, 4, 3, 2, 1, 0].map((i) => {
      const d = subDays(base, 7 * i)
      return { start: startOfDay(d), end: endOf(d, i), label: format(d, 'd EEE') }
    })
    const prevDay = subDays(base, 7)
    return { current: series[6], previous: { start: startOfDay(prevDay), end: period === 'today' ? prevDay : endOfDay(prevDay), label: '' }, series }
  }
  if (period === 'week') {
    const ws = startOfWeek(n, { weekStartsOn: 1 })
    const series = [6, 5, 4, 3, 2, 1, 0].map((i) => {
      const s = subDays(ws, 7 * i)
      return { start: s, end: i === 0 ? n : new Date(addDays(s, 7).getTime() - 1), label: format(s, 'd MMM') }
    })
    return { current: series[6], previous: { start: subDays(ws, 7), end: subDays(n, 7), label: '' }, series }
  }
  const ms = startOfMonth(n)
  const series = [6, 5, 4, 3, 2, 1, 0].map((i) => {
    const s = subMonths(ms, i)
    return { start: s, end: i === 0 ? n : endOfMonth(s), label: format(s, 'MMM') }
  })
  const prevStart = subMonths(ms, 1)
  const sameTime = subMonths(n, 1)
  return { current: series[6], previous: { start: prevStart, end: isAfter(sameTime, endOfMonth(prevStart)) ? endOfMonth(prevStart) : sameTime, label: '' }, series }
}

export interface Metrics {
  sales: number
  salesCount: number
  avgSale: number
  byChannel: Record<ChannelGroup, number>
  appointments: number
  newClients: number
  returningClients: number
  served: number
  newBySource: Record<ChannelGroup, number>
  occupancy: number
}

type InsightData = Pick<DbData, 'sales' | 'appointments' | 'teamMembers' | 'shiftPatterns' | 'shiftOverrides' | 'closedPeriods' | 'timeOff'>

/** Pre-indexes the data once; `metrics(range)` is then cheap enough to run for every chart point. */
export function buildInsights(data: InsightData) {
  const sales = data.sales
    .filter((s) => s.kind === 'sale' && (s.status === 'completed' || s.status === 'part_paid'))
    .map((s) => ({ at: parseISO(s.completedAt ?? s.createdAt).getTime(), total: computeTotals(s).total, channel: channelGroup(s.channel) }))
  const byDate = new Map<string, Appointment[]>()
  const first = new Map<ID, { date: string; channel: ChannelGroup }>()
  const sorted = [...data.appointments].filter((a) => a.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date))
  for (const a of sorted) {
    const list = byDate.get(a.date) ?? []
    list.push(a)
    byDate.set(a.date, list)
    if (a.clientId && !first.has(a.clientId)) first.set(a.clientId, { date: a.date, channel: channelGroup(a.channel) })
  }
  const bookable = data.teamMembers.filter((m) => m.bookable && !m.archived)
  const bookableIds = new Set(bookable.map((m) => m.id))
  const workCache = new Map<string, number>()
  const workingMinutes = (date: string) => {
    let v = workCache.get(date)
    if (v === undefined) {
      v = bookable.reduce((sum, m) => sum + workingWindows(data, m.id, date).reduce((s, [a, b]) => s + (b - a), 0), 0)
      workCache.set(date, v)
    }
    return v
  }

  const emptyChannels = (): Record<ChannelGroup, number> => ({ offline: 0, bookNowLink: 0, marketplace: 0, social: 0, marketing: 0 })

  function metrics(range: Range): Metrics {
    const from = range.start.getTime()
    const to = range.end.getTime()
    const inRange = sales.filter((s) => s.at >= from && s.at <= to)
    const byChannel = emptyChannels()
    inRange.forEach((s) => (byChannel[s.channel] = round2(byChannel[s.channel] + s.total)))
    const total = round2(inRange.reduce((s, x) => s + x.total, 0))
    const days = eachDayOfInterval({ start: range.start, end: range.end }).map(toDay)
    const firstDay = days[0]
    const appts = days.flatMap((d) => byDate.get(d) ?? [])
    const clientIds = new Set(appts.map((a) => a.clientId).filter((x): x is ID => !!x))
    let newClients = 0
    let returning = 0
    const newBySource = emptyChannels()
    clientIds.forEach((id) => {
      const f = first.get(id)
      if (f && f.date >= firstDay) {
        newClients++
        newBySource[f.channel]++
      } else returning++
    })
    const served = new Set(appts.filter((a) => a.clientId && (a.status === 'completed' || a.status === 'arrived' || a.status === 'started')).map((a) => a.clientId)).size
    const booked = appts.reduce((s, a) => s + a.items.filter((i) => bookableIds.has(i.teamMemberId)).reduce((x, i) => x + i.durationMin, 0), 0)
    const working = days.reduce((s, d) => s + workingMinutes(d), 0)
    return {
      sales: total,
      salesCount: inRange.length,
      avgSale: inRange.length ? round2(total / inRange.length) : 0,
      byChannel,
      appointments: appts.length,
      newClients,
      returningClients: returning,
      served,
      newBySource,
      occupancy: working ? Math.min(100, Math.round((booked / working) * 100)) : 0,
    }
  }

  return { metrics }
}

/** Lifetime value of appointments from clients who found the business on the marketplace. */
export function marketplaceValue(data: Pick<DbData, 'appointments' | 'clients'>, today: string): { value: number; clients: number } {
  const marketplaceClients = new Set(data.clients.filter((c) => c.marketplace).map((c) => c.id))
  let value = 0
  const counted = new Set<ID>()
  for (const a of data.appointments) {
    if (a.status === 'cancelled' || a.date > today) continue
    if (a.channel === 'marketplace' || (a.clientId && marketplaceClients.has(a.clientId))) {
      value += a.items.reduce((s, i) => s + i.price, 0)
      if (a.clientId) counted.add(a.clientId)
    }
  }
  return { value: round2(value), clients: counted.size }
}

