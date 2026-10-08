import { addDays, differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import type { Client, ClientSegment, DbData, ID, SegmentRule } from '@/types'
import { now, toISODate } from './time'

type SegmentData = Pick<DbData, 'clients' | 'appointments' | 'sales' | 'clientPackages' | 'clientMemberships' | 'giftCards'>

interface ClientStats {
  pastAppointments: string[]
  futureAppointments: string[]
  appointmentChannels: Set<string>
  salesDates: string[]
  salesValue12m: number
  appointmentCount: number
  appointmentValue: number
}

/** Per-client aggregates used by segment rules (computed once per data snapshot). */
export function clientStats(data: SegmentData): Map<ID, ClientStats> {
  const today = toISODate(now())
  const yearAgo = toISODate(subDays(now(), 365))
  const map = new Map<ID, ClientStats>()
  const get = (id: ID) => {
    let s = map.get(id)
    if (!s) {
      s = { pastAppointments: [], futureAppointments: [], appointmentChannels: new Set(), salesDates: [], salesValue12m: 0, appointmentCount: 0, appointmentValue: 0 }
      map.set(id, s)
    }
    return s
  }
  for (const a of data.appointments) {
    if (!a.clientId || a.status === 'cancelled') continue
    const s = get(a.clientId)
    s.appointmentCount++
    s.appointmentValue += a.items.reduce((x, i) => x + i.price, 0)
    s.appointmentChannels.add(a.channel)
    if (a.date < today) s.pastAppointments.push(a.date)
    else s.futureAppointments.push(a.date)
  }
  for (const sale of data.sales) {
    if (!sale.clientId || sale.kind !== 'sale' || (sale.status !== 'completed' && sale.status !== 'part_paid')) continue
    const s = get(sale.clientId)
    const date = sale.createdAt.slice(0, 10)
    s.salesDates.push(date)
    if (date >= yearAgo) s.salesValue12m += sale.items.reduce((x, i) => x + i.unitPrice * i.quantity, 0)
  }
  return map
}

const within = (date: string, days: number) => differenceInCalendarDays(now(), parseISO(date)) <= days && date <= toISODate(now())

function birthdayWithin(client: Client, days: number): boolean {
  if (!client.birthday) return false
  const today = now()
  const b = parseISO(client.birthday)
  for (let i = 0; i <= days; i++) {
    const d = addDays(today, i)
    if (d.getMonth() === b.getMonth() && d.getDate() === b.getDate()) return true
  }
  return false
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : Number(v) || fallback)

function ruleMatches(rule: SegmentRule, client: Client, stats: ClientStats | undefined, data: SegmentData): boolean {
  const cond = (field: string) => rule.conditions.find((c) => c.field === field)
  const days = num(cond('period')?.value ?? cond('date')?.value, 30)
  const s = stats ?? { pastAppointments: [], futureAppointments: [], appointmentChannels: new Set<string>(), salesDates: [], salesValue12m: 0, appointmentCount: 0, appointmentValue: 0 }
  switch (rule.attribute) {
    case 'added_date':
      return within(client.createdAt.slice(0, 10), days)
    case 'any_appointment': {
      const channel = cond('channel')
      if (channel) return [...s.appointmentChannels].some((c) => c !== channel.value)
      if (cond('date')?.operator === 'future') return s.futureAppointments.length > 0
      return s.pastAppointments.some((d) => within(d, days)) || (!cond('date') && s.appointmentCount > 0)
    }
    case 'no_appointment':
      return s.appointmentCount === 0
    case 'number_of_appointments':
      return s.appointmentCount >= num(cond('count')?.value, 1)
    case 'total_value_of_appointments':
      return s.appointmentValue > num(cond('value')?.value, 0)
    case 'first_visit':
      return s.pastAppointments.length === 0 && s.futureAppointments.length > 0
    case 'number_of_sales':
      return s.salesDates.filter((d) => within(d, days)).length >= num(cond('count')?.value, 2)
    case 'any_sale':
      return s.salesDates.some((d) => within(d, days))
    case 'no_sale':
      return s.salesDates.length === 0
    case 'total_value_of_sales':
      return s.salesValue12m > num(cond('value')?.value, 500)
    case 'lapsed':
      return s.salesDates.filter((d) => within(d, 365)).length >= 3 && !s.salesDates.some((d) => within(d, 60))
    case 'birthday':
      return birthdayWithin(client, days)
    case 'client_source': {
      const v = cond('source')?.value
      return Array.isArray(v) ? v.includes(client.sourceId) : client.sourceId === v
    }
    case 'tags': {
      const v = cond('tags')?.value
      return Array.isArray(v) ? v.some((t) => client.tagIds.includes(t)) : client.tagIds.includes(String(v))
    }
    case 'gender':
      return client.gender === cond('gender')?.value
    case 'packages':
      return data.clientPackages.some((p) => p.clientId === client.id && p.status === 'active')
    case 'memberships':
      return data.clientMemberships.some((m) => m.clientId === client.id && m.status === 'active')
    case 'gift_cards':
      return data.giftCards.some((g) => g.ownerClientId === client.id && g.status === 'active')
    case 'rewards':
      return client.rewards.some((r) => !r.redeemedAt)
    default:
      return false
  }
}

/** Clients (not deleted) matching every rule of a segment. */
export function clientsInSegment(data: SegmentData, segment: ClientSegment, stats = clientStats(data)): Client[] {
  return data.clients.filter((c) => !c.deletedAt && segment.rules.every((rule) => ruleMatches(rule, c, stats.get(c.id), data)))
}

/** Segment ids a client belongs to (for badges like "First visit"). */
export function segmentsForClient(data: SegmentData, segments: ClientSegment[], clientId: ID, stats = clientStats(data)): ClientSegment[] {
  const client = data.clients.find((c) => c.id === clientId)
  if (!client) return []
  return segments.filter((seg) => seg.rules.every((rule) => ruleMatches(rule, client, stats.get(client.id), data)))
}
