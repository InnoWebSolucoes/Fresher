import { format, parseISO } from 'date-fns'
import { useMemo } from 'react'
import { useDb, type DbState } from '@/store/db'
import type { Appointment, AppointmentItem, Client, ID, Payment, Sale } from '@/types'
import { clientsInSegment, clientStats } from '@/lib/segments'
import { now } from '@/lib/time'
import { L } from './labels'

/**
 * Lookup tables built once per data snapshot. Every report and dashboard
 * reads through this so building a report is a single pass over the facts.
 */
export interface Ctx {
  d: DbState
  today: string
  nowIso: string
  byId: {
    location: Map<ID, DbState['locations'][number]>
    member: Map<ID, DbState['teamMembers'][number]>
    client: Map<ID, Client>
    service: Map<ID, DbState['services'][number]>
    category: Map<ID, DbState['serviceCategories'][number]>
    product: Map<ID, DbState['products'][number]>
    brand: Map<ID, DbState['brands'][number]>
    productCategory: Map<ID, DbState['productCategories'][number]>
    supplier: Map<ID, DbState['suppliers'][number]>
    resource: Map<ID, DbState['resources'][number]>
    register: Map<ID, DbState['registers'][number]>
    packageDef: Map<ID, DbState['packages'][number]>
    membership: Map<ID, DbState['memberships'][number]>
    tag: Map<ID, DbState['clientTags'][number]>
    source: Map<ID, DbState['clientSources'][number]>
    sale: Map<ID, Sale>
    appointment: Map<ID, Appointment>
    payment: Map<ID, Payment>
    session: Map<ID, DbState['registerSessions'][number]>
  }
  apptItem: Map<ID, { appt: Appointment; item: AppointmentItem }>
  /** Local yyyy-MM-dd of an ISO timestamp (cached). */
  day: (iso: string) => string
  /** Payments of a sale. */
  salePayments: Map<ID, Payment[]>
  /** Sequential payment number (oldest = 1). */
  paymentNo: Map<ID, number>
  /** First visit date per client (first non-cancelled appointment or sale). */
  firstVisit: Map<ID, string>
  /** Segment ids a client belongs to (computed on first use). */
  segmentsOf: (clientId: ID | null) => string[]
  memberName: (id: ID | null | undefined) => string
  clientName: (id: ID | null | undefined) => string
  locationName: (id: ID | null | undefined) => string
}

const mapOf = <T extends { id: ID }>(list: T[] | undefined) => new Map((list ?? []).map((x) => [x.id, x]))

export function buildCtx(d: DbState): Ctx {
  const dayCache = new Map<string, string>()
  const day = (iso: string) => {
    let v = dayCache.get(iso)
    if (!v) {
      v = iso.length === 10 ? iso : format(parseISO(iso), 'yyyy-MM-dd')
      dayCache.set(iso, v)
    }
    return v
  }
  const byId: Ctx['byId'] = {
    location: mapOf(d.locations),
    member: mapOf(d.teamMembers),
    client: mapOf(d.clients),
    service: mapOf(d.services),
    category: mapOf(d.serviceCategories),
    product: mapOf(d.products),
    brand: mapOf(d.brands),
    productCategory: mapOf(d.productCategories),
    supplier: mapOf(d.suppliers),
    resource: mapOf(d.resources),
    register: mapOf(d.registers),
    packageDef: mapOf(d.packages),
    membership: mapOf(d.memberships),
    tag: mapOf(d.clientTags),
    source: mapOf(d.clientSources),
    sale: mapOf(d.sales),
    appointment: mapOf(d.appointments),
    payment: mapOf(d.payments),
    session: mapOf(d.registerSessions),
  }
  const apptItem = new Map<ID, { appt: Appointment; item: AppointmentItem }>()
  for (const appt of d.appointments ?? []) for (const item of appt.items) apptItem.set(item.id, { appt, item })

  const salePayments = new Map<ID, Payment[]>()
  for (const p of d.payments ?? []) {
    if (!p.saleId) continue
    const list = salePayments.get(p.saleId)
    if (list) list.push(p)
    else salePayments.set(p.saleId, [p])
  }
  const paymentNo = new Map<ID, number>()
  ;[...(d.payments ?? [])].sort((a, b) => a.at.localeCompare(b.at)).forEach((p, i) => paymentNo.set(p.id, i + 1))

  const firstVisit = new Map<ID, string>()
  const consider = (clientId: ID | null, date: string) => {
    if (!clientId) return
    const prev = firstVisit.get(clientId)
    if (!prev || date < prev) firstVisit.set(clientId, date)
  }
  for (const a of d.appointments ?? []) if (a.status !== 'cancelled') consider(a.clientId, a.date)
  for (const s of d.sales ?? []) if (s.kind === 'sale' && s.status !== 'draft' && s.status !== 'voided') consider(s.clientId, day(s.createdAt))

  let segmentMap: Map<ID, string[]> | null = null
  const segmentsOf = (clientId: ID | null) => {
    if (!clientId) return []
    if (!segmentMap) {
      segmentMap = new Map()
      const stats = clientStats(d)
      for (const seg of d.segments ?? []) {
        for (const c of clientsInSegment(d, seg, stats)) {
          const list = segmentMap.get(c.id)
          if (list) list.push(seg.id)
          else segmentMap.set(c.id, [seg.id])
        }
      }
    }
    return segmentMap.get(clientId) ?? []
  }

  const memberName = (id: ID | null | undefined) => {
    const m = id ? byId.member.get(id) : undefined
    return m ? `${m.firstName} ${m.lastName}` : L('noTeamMember')
  }
  const clientName = (id: ID | null | undefined) => {
    const c = id ? byId.client.get(id) : undefined
    return c ? `${c.firstName} ${c.lastName}` : L('walkIn')
  }
  const locationName = (id: ID | null | undefined) => (id ? (byId.location.get(id)?.name ?? '-') : '-')
  const n = now()
  return { d, today: format(n, 'yyyy-MM-dd'), nowIso: n.toISOString(), byId, apptItem, day, salePayments, paymentNo, firstVisit, segmentsOf, memberName, clientName, locationName }
}

/** Context for the current data snapshot (rebuilt when the store changes). */
export function useCtx(): Ctx {
  const state = useDb((s) => s)
  return useMemo(() => buildCtx(state), [state])
}
