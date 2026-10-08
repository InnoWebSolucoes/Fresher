import { addDays, differenceInYears, parseISO, subDays } from 'date-fns'
import type { Appointment, Client, ClientSegment, DbData, ID, Sale, SegmentCondition, SegmentRule } from '@/types'
import { clientsInSegment, clientStats } from '@/lib/segments'
import { now, toISODate } from '@/lib/time'
import { appointmentValue, isPaidSale, saleItemsTotal } from './helpers'

/**
 * Segment evaluation for the Clients section. Standard and pre-made
 * segments (those with a `key`) use the shared engine in @/lib/segments so
 * counts match the calendar filters; custom segments built in the segment
 * builder are evaluated here, including the extra conditions (location,
 * team member, service…) the shared engine ignores.
 */
export type EvalData = Pick<DbData, 'clients' | 'appointments' | 'sales' | 'clientPackages' | 'clientMemberships' | 'giftCards'>

export const ATTRIBUTE_GROUPS: { group: 'appointments' | 'sales' | 'details' | 'items'; items: string[] }[] = [
  { group: 'appointments', items: ['any_appointment', 'no_appointment', 'number_of_appointments', 'total_value_of_appointments'] },
  { group: 'sales', items: ['any_sale', 'no_sale', 'number_of_sales', 'total_value_of_sales'] },
  {
    group: 'details',
    items: ['added_date', 'phone_number', 'email_address', 'birthday', 'age', 'gender', 'pronouns', 'client_source', 'preferred_language', 'country', 'tags', 'referred_by', 'loyalty_points', 'loyalty_tier', 'loyalty_status'],
  },
  { group: 'items', items: ['rewards', 'memberships', 'packages', 'gift_cards'] },
]

export const APPOINTMENT_CONDITIONS = ['date', 'location', 'team_member', 'service', 'channel', 'status']
export const SALE_CONDITIONS = ['sale_value', 'date', 'location', 'team_member', 'item_type', 'service', 'product', 'membership', 'sale_status']

const APPOINTMENT_ATTRS = ATTRIBUTE_GROUPS[0].items
const SALE_ATTRS = ATTRIBUTE_GROUPS[1].items

export const groupOf = (attribute: string) => ATTRIBUTE_GROUPS.find((g) => g.items.includes(attribute))?.group

/** "where …" conditions offered for an attribute (only appointment and sale rules have them). */
export function conditionsFor(attribute: string): string[] {
  if (APPOINTMENT_ATTRS.includes(attribute)) return APPOINTMENT_CONDITIONS
  if (SALE_ATTRS.includes(attribute)) return SALE_CONDITIONS
  return []
}

export type PrimaryKind = 'count' | 'money' | 'period_past' | 'period_next' | 'exists' | 'age' | 'gender' | 'pronouns' | 'source' | 'language' | 'country' | 'tags' | 'tier' | 'loyalty_status'

/** The value an attribute needs inline ("Clients with [Number of sales] [at least 2]"). */
export const PRIMARY: Record<string, { field: string; kind: PrimaryKind; initial: SegmentCondition['value']; operator: string } | undefined> = {
  number_of_appointments: { field: 'count', kind: 'count', initial: 1, operator: 'gte' },
  total_value_of_appointments: { field: 'value', kind: 'money', initial: 100, operator: 'gt' },
  number_of_sales: { field: 'count', kind: 'count', initial: 2, operator: 'gte' },
  total_value_of_sales: { field: 'value', kind: 'money', initial: 100, operator: 'gt' },
  added_date: { field: 'period', kind: 'period_past', initial: 30, operator: 'last_days' },
  phone_number: { field: 'phone', kind: 'exists', initial: 'exists', operator: 'is' },
  email_address: { field: 'email', kind: 'exists', initial: 'exists', operator: 'is' },
  birthday: { field: 'period', kind: 'period_next', initial: 30, operator: 'next_days' },
  age: { field: 'age', kind: 'age', initial: ['18', '65'], operator: 'between' },
  gender: { field: 'gender', kind: 'gender', initial: '', operator: 'is' },
  pronouns: { field: 'pronouns', kind: 'pronouns', initial: '', operator: 'is' },
  client_source: { field: 'source', kind: 'source', initial: [], operator: 'in' },
  preferred_language: { field: 'language', kind: 'language', initial: '', operator: 'is' },
  country: { field: 'country', kind: 'country', initial: '', operator: 'is' },
  tags: { field: 'tags', kind: 'tags', initial: [], operator: 'in' },
  referred_by: { field: 'referred', kind: 'exists', initial: 'exists', operator: 'is' },
  loyalty_points: { field: 'points', kind: 'count', initial: 100, operator: 'gte' },
  loyalty_tier: { field: 'tier', kind: 'tier', initial: '', operator: 'is' },
  loyalty_status: { field: 'loyalty', kind: 'loyalty_status', initial: '', operator: 'is' },
}

/** Default operator for a "where" condition field. */
export const CONDITION_OPERATOR: Record<string, string> = {
  date: 'last_days',
  location: 'is',
  team_member: 'is',
  service: 'is',
  channel: 'not',
  status: 'is',
  sale_value: 'gt',
  item_type: 'is',
  product: 'is',
  membership: 'is',
  sale_status: 'is',
}

export const isEmptyValue = (v: SegmentCondition['value']) => v === '' || v === undefined || v === null || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v))

const LOCAL_ATTRS = new Set([...APPOINTMENT_ATTRS, ...SALE_ATTRS, ...ATTRIBUTE_GROUPS[2].items, ...ATTRIBUTE_GROUPS[3].items])

const asList = (v: SegmentCondition['value']) => (Array.isArray(v) ? v.map(String) : v === '' ? [] : [String(v)])

export interface Evaluator {
  ids: (segment: Pick<ClientSegment, 'key' | 'rules'>) => Set<ID>
  count: (segment: Pick<ClientSegment, 'key' | 'rules'>) => number
  has: (segment: Pick<ClientSegment, 'key' | 'rules'>, clientId: ID) => boolean
}

export function makeEvaluator(data: EvalData): Evaluator {
  const today = toISODate(now())
  const live = data.clients.filter((c) => !c.deletedAt)
  const stats = clientStats(data)
  const appts = new Map<ID, Appointment[]>()
  for (const a of data.appointments) if (a.clientId) appts.set(a.clientId, [...(appts.get(a.clientId) ?? []), a])
  const sales = new Map<ID, Sale[]>()
  for (const s of data.sales) if (s.clientId) sales.set(s.clientId, [...(sales.get(s.clientId) ?? []), s])

  const inRange = (date: string, c: SegmentCondition) => {
    const days = Number(c.value) || 0
    if (c.operator === 'future') return date >= today
    if (c.operator === 'next_days') return date >= today && date <= toISODate(addDays(now(), days))
    return date <= today && date >= toISODate(subDays(now(), days))
  }

  const apptOk = (a: Appointment, conds: SegmentCondition[]) => {
    if (!conds.some((c) => c.field === 'status') && a.status === 'cancelled') return false
    return conds.every((c) => {
      switch (c.field) {
        case 'date':
          return inRange(a.date, c)
        case 'location':
          return a.locationId === c.value
        case 'team_member':
          return a.items.some((i) => i.teamMemberId === c.value)
        case 'service':
          return a.items.some((i) => i.serviceId === c.value)
        case 'channel':
          return c.operator === 'not' ? a.channel !== c.value : a.channel === c.value
        case 'status':
          return a.status === c.value
        default:
          return true
      }
    })
  }

  const saleOk = (s: Sale, conds: SegmentCondition[]) => {
    if (s.kind !== 'sale') return false
    if (!conds.some((c) => c.field === 'sale_status') && !isPaidSale(s)) return false
    return conds.every((c) => {
      switch (c.field) {
        case 'date':
          return inRange(s.createdAt.slice(0, 10), c)
        case 'location':
          return s.locationId === c.value
        case 'team_member':
          return s.items.some((i) => i.teamMemberId === c.value)
        case 'item_type':
          return s.items.some((i) => i.type === c.value)
        case 'service':
          return s.items.some((i) => i.type === 'service' && i.refId === c.value)
        case 'product':
          return s.items.some((i) => i.type === 'product' && i.refId === c.value)
        case 'membership':
          return s.items.some((i) => i.type === 'membership' && i.refId === c.value)
        case 'sale_status':
          return s.status === c.value
        case 'sale_value':
          return saleItemsTotal(s) > Number(c.value || 0)
        default:
          return true
      }
    })
  }

  const birthdayWithin = (client: Client, days: number) => {
    if (!client.birthday) return false
    const b = parseISO(client.birthday)
    for (let i = 0; i <= days; i++) {
      const d = addDays(now(), i)
      if (d.getMonth() === b.getMonth() && d.getDate() === b.getDate()) return true
    }
    return false
  }

  const localRule = (rule: SegmentRule, client: Client): boolean => {
    const primary = PRIMARY[rule.attribute]
    const main = primary ? rule.conditions.find((c) => c.field === primary.field) : undefined
    const where = rule.conditions.filter((c) => c.field && c.field !== primary?.field && !isEmptyValue(c.value))
    const v = main?.value
    switch (rule.attribute) {
      case 'any_appointment':
      case 'no_appointment':
      case 'number_of_appointments':
      case 'total_value_of_appointments': {
        const list = (appts.get(client.id) ?? []).filter((a) => apptOk(a, where))
        if (rule.attribute === 'any_appointment') return list.length > 0
        if (rule.attribute === 'no_appointment') return list.length === 0
        if (rule.attribute === 'number_of_appointments') return list.length >= Number(v ?? 1)
        return list.reduce((s, a) => s + appointmentValue(a), 0) > Number(v ?? 0)
      }
      case 'any_sale':
      case 'no_sale':
      case 'number_of_sales':
      case 'total_value_of_sales': {
        const list = (sales.get(client.id) ?? []).filter((s) => saleOk(s, where))
        if (rule.attribute === 'any_sale') return list.length > 0
        if (rule.attribute === 'no_sale') return list.length === 0
        if (rule.attribute === 'number_of_sales') return list.length >= Number(v ?? 1)
        return list.reduce((s, x) => s + saleItemsTotal(x), 0) > Number(v ?? 0)
      }
      case 'added_date':
        return inRange(client.createdAt.slice(0, 10), { field: 'period', operator: 'last_days', value: Number(v ?? 30) })
      case 'phone_number':
        return v === 'not_exists' ? !client.phone : Boolean(client.phone)
      case 'email_address':
        return v === 'not_exists' ? !client.email : Boolean(client.email)
      case 'referred_by':
        return v === 'not_exists' ? !client.referredById : Boolean(client.referredById)
      case 'birthday':
        return birthdayWithin(client, Number(v ?? 30))
      case 'age': {
        if (!client.birthday) return false
        const [min, max] = asList(v ?? []).map(Number)
        const age = differenceInYears(now(), parseISO(client.birthday))
        return age >= (min || 0) && age <= (max || 200)
      }
      case 'gender':
        return client.gender === v
      case 'pronouns':
        return client.pronouns === v
      case 'client_source':
        return asList(v ?? []).includes(client.sourceId)
      case 'preferred_language':
        return client.language === v
      case 'country':
        return client.country === v
      case 'tags':
        return asList(v ?? []).some((t) => client.tagIds.includes(t))
      case 'loyalty_points':
      case 'loyalty_tier':
      case 'loyalty_status':
        // No loyalty programme data until the Client Loyalty add-on runs.
        return false
      case 'rewards':
        return client.rewards.some((r) => !r.redeemedAt)
      case 'memberships':
        return data.clientMemberships.some((m) => m.clientId === client.id && m.status === 'active')
      case 'packages':
        return data.clientPackages.some((p) => p.clientId === client.id && p.status === 'active')
      case 'gift_cards':
        return data.giftCards.some((g) => g.ownerClientId === client.id && g.status === 'active')
      default:
        return false
    }
  }

  const ids = (segment: Pick<ClientSegment, 'key' | 'rules'>): Set<ID> => {
    if (segment.key || segment.rules.length === 0) {
      if (segment.rules.length === 0) return new Set()
      return new Set(clientsInSegment(data, segment as ClientSegment, stats).map((c) => c.id))
    }
    let result = null as Set<ID> | null
    for (const rule of segment.rules) {
      if (!rule.attribute) continue
      const matched = LOCAL_ATTRS.has(rule.attribute)
        ? new Set(live.filter((c) => localRule(rule, c)).map((c) => c.id))
        : new Set(clientsInSegment(data, { id: '', name: '', description: '', standard: false, rules: [rule] }, stats).map((c) => c.id))
      const prev = result as Set<ID> | null
      result = prev ? new Set<ID>(Array.from(prev).filter((id: ID) => matched.has(id))) : matched
    }
    return result ?? new Set()
  }

  const cache = new WeakMap<object, Set<ID>>()
  const cached = (segment: Pick<ClientSegment, 'key' | 'rules'>) => {
    let set = cache.get(segment)
    if (!set) {
      set = ids(segment)
      cache.set(segment, set)
    }
    return set
  }

  return { ids: cached, count: (s) => cached(s).size, has: (s, id) => cached(s).has(id) }
}
