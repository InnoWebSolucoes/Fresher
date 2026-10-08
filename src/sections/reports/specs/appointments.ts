import { addMinutes, differenceInYears, parseISO } from 'date-fns'
import { round2 } from '@/lib/format'
import { toClock, toMinutes } from '@/lib/time'
import type { ID } from '@/types'
import type { Ctx } from '../engine/context'
import { apptFacts, apptItemFacts, channelLabel, clientAttrs, lineFacts, type ApptFact, type LineFact } from '../engine/facts'
import { applyFilters, avg, listResult, pct, sum, summarize, timeBucket, type Dim, type DimVal, type Measure } from '../engine/helpers'
import { L } from '../engine/labels'
import type { Params, Spec } from '../engine/types'
import { apptLink, clientLink, inR } from './common'

const one = (k: string, l: string, s?: string | number): DimVal => ({ k, l, s })

const af = (ctx: Ctx, p: Params) => applyFilters(apptFacts(ctx).filter((f) => inR(f.date, p.range)), p.filters, p.ranges)

/** Grouping options for appointment facts. */
function apptDims(ctx: Ctx): Record<string, Dim<ApptFact>> {
  return {
    location: { key: 'location', filterKey: 'location', next: 'teamMember', get: (f) => one(f.appt.locationId, ctx.locationName(f.appt.locationId)) },
    teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'service', get: (f) => (f.a.teamMember as string[]).map((m) => one(m, ctx.memberName(m))) },
    service: { key: 'service', filterKey: 'service', next: 'teamMember', get: (f) => f.appt.items.map((i) => one(i.serviceId, ctx.byId.service.get(i.serviceId)?.name ?? i.name)) },
    category: { key: 'category', filterKey: 'category', next: 'service', get: (f) => (f.a.category as string[]).map((c) => one(c, ctx.byId.category.get(c)?.name ?? '-')) },
    serviceCategory: { key: 'serviceCategory', filterKey: 'serviceCategory', next: 'service', get: (f) => (f.a.category as string[]).map((c) => one(c, ctx.byId.category.get(c)?.name ?? '-')) },
    channel: { key: 'channel', filterKey: 'channel', next: 'location', get: (f) => one(f.appt.channel, channelLabel(f.appt.channel)) },
    appointmentStatus: { key: 'appointmentStatus', filterKey: 'appointmentStatus', next: 'location', get: (f) => one(f.appt.status, L(`opt.appointmentStatus.${f.appt.status}`)) },
    day: { key: 'day', time: 'day', get: (f) => timeBucket('day', f.date) },
    week: { key: 'week', time: 'week', get: (f) => timeBucket('week', f.date) },
    month: { key: 'month', time: 'month', get: (f) => timeBucket('month', f.date) },
  }
}

const notCancelled = (fs: ApptFact[]) => fs.filter((f) => !f.cancelled)
const clientsOf = (fs: ApptFact[]) => new Set(fs.map((f) => f.appt.clientId).filter(Boolean) as string[])

const APPT_MEASURES: Measure<ApptFact>[] = [
  { key: 'appointments', type: 'int', calc: (fs) => fs.length },
  { key: 'services', type: 'int', calc: (fs) => fs.reduce((s, f) => s + f.services, 0) },
  { key: 'pctRequested', type: 'pct', calc: (fs) => pct(fs.filter((f) => f.appt.requested).length, fs.length) },
  { key: 'totalApptValue', type: 'money', calc: (fs) => sum(notCancelled(fs), (f) => f.value) },
  { key: 'averageApptValue', type: 'money', calc: (fs) => avg(sum(notCancelled(fs), (f) => f.value), notCancelled(fs).length) },
  { key: 'pctOnline', type: 'pct', calc: (fs) => pct(fs.filter((f) => f.online).length, fs.length) },
  { key: 'pctCancelled', type: 'pct', calc: (fs) => pct(fs.filter((f) => f.cancelled).length, fs.length) },
  { key: 'pctNoShow', type: 'pct', calc: (fs) => pct(fs.filter((f) => f.noShow).length, fs.length) },
  { key: 'totalClients', type: 'int', calc: (fs) => clientsOf(fs).size },
  { key: 'newClients', type: 'int', calc: (fs) => clientsOf(fs.filter((f) => f.isNew)).size },
  { key: 'pctNewClients', type: 'pct', calc: (fs) => pct(clientsOf(fs.filter((f) => f.isNew)).size, clientsOf(fs).size) },
  { key: 'pctReturningClients', type: 'pct', calc: (fs) => pct(clientsOf(fs).size - clientsOf(fs.filter((f) => f.isNew)).size, clientsOf(fs).size) },
  { key: 'noShowAppts', type: 'int', hidden: true, calc: (fs) => fs.filter((f) => f.noShow).length },
  { key: 'cancelledAppts', type: 'int', hidden: true, calc: (fs) => fs.filter((f) => f.cancelled).length },
  { key: 'onlineAppts', type: 'int', hidden: true, calc: (fs) => fs.filter((f) => f.online).length },
]

const appointmentSummary: Spec = {
  slug: 'appointment-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'location' }, { key: 'teamMember' }, { key: 'service' }, { key: 'category' }, { key: 'channel' }, { key: 'appointmentStatus' }, { key: 'day' }, { key: 'week' }, { key: 'month' }],
  filters: ['location', 'teamMember', 'category', 'channel', 'appointmentType', 'service', 'appointmentStatus', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const dims = apptDims(ctx)
    return summarize(af(ctx, p), dims[p.groupBy] ?? dims.location, APPT_MEASURES)
  },
}

const lineByApptItem = (ctx: Ctx) => {
  const map = new Map<ID, LineFact>()
  for (const f of lineFacts(ctx)) if (f.item.appointmentItemId && !f.refund) map.set(f.item.appointmentItemId, f)
  return map
}

const appointmentList: Spec = {
  slug: 'appointment-list',
  range: 'last_30_days',
  filters: ['location', 'teamMember', 'category', 'service', 'channel', 'appointmentType', 'cancellationReason', 'appointmentStatus', 'clientTags', 'clientSegments'],
  premiumFilters: ['cancellationReason'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const lines = lineByApptItem(ctx)
    const reason = (id?: string) => ctx.d.settings.cancellationReasons.find((r) => r.id === id)?.name ?? '-'
    const facts = applyFilters(apptItemFacts(ctx).filter((f) => inR(f.date, p.range)), p.filters).sort((a, b) => `${b.date}${b.item.start}`.localeCompare(`${a.date}${a.item.start}`))
    const first = (f: (typeof facts)[number]) => f.appt.items[0]?.id === f.item.id
    return listResult(
      facts,
      [
        { key: 'apptRef', type: 'text', get: (f) => f.appt.ref, link: (f) => apptLink(f.appt.id) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.appt.clientId), link: (f) => clientLink(f.appt.clientId) },
        { key: 'teamMember', type: 'text', get: (f) => ctx.memberName(f.item.teamMemberId) },
        { key: 'resource', type: 'text', get: (f) => (f.item.resourceId ? (ctx.byId.resource.get(f.item.resourceId)?.name ?? '-') : '-') },
        { key: 'status', type: 'text', get: (f) => L(`opt.appointmentStatus.${f.appt.status}`) },
        { key: 'createdDate', type: 'datetime', get: (f) => f.appt.createdAt },
        { key: 'scheduledDate', type: 'datetime', get: (f) => addMinutes(parseISO(f.appt.date), toMinutes(f.item.start)).toISOString() },
        { key: 'cancelledDate', type: 'datetime', get: (f) => f.appt.cancellation?.at ?? '-' },
        { key: 'category', type: 'text', get: (f) => ctx.byId.category.get(ctx.byId.service.get(f.item.serviceId)?.categoryId ?? '')?.name ?? '-' },
        { key: 'service', type: 'text', get: (f) => f.item.name },
        { key: 'durationMins', type: 'mins', total: true, get: (f) => f.item.durationMin },
        { key: 'apptSlot', type: 'text', get: (f) => `${f.item.start} - ${toClock(toMinutes(f.item.start) + f.item.durationMin)}` },
        { key: 'createdBy', type: 'text', get: (f) => f.appt.createdBy },
        { key: 'cancelledBy', type: 'text', get: (f) => f.appt.cancellation?.by ?? '-' },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.appt.locationId) },
        { key: 'netSales', type: 'money', get: (f) => lines.get(f.item.id)?.net ?? 0 },
        { key: 'cancellationReason', type: 'text', get: (f) => (f.appt.cancellation ? reason(f.appt.cancellation.reasonId) : '-') },
        { key: 'feesCharged', type: 'money', get: (f) => (first(f) ? (f.appt.cancellation?.fee ?? f.appt.noShowFee ?? 0) : 0) },
        { key: 'prepayments', type: 'money', get: (f) => (first(f) ? (f.appt.deposit?.amount ?? 0) : 0) },
        { key: 'channel', type: 'text', hidden: true, get: (f) => channelLabel(f.appt.channel) },
        { key: 'price', type: 'money', hidden: true, get: (f) => f.item.price },
      ],
      (f) => f.item.id,
      { total: true },
    )
  },
}

const cancellationsSummary: Spec = {
  slug: 'appointment-cns-ns-summary',
  range: 'last_30_days',
  filters: ['teamMember', 'location', 'channel', 'appointmentType', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const facts = af(ctx, p).filter((f) => f.cancelled || f.noShow)
    const dim: Dim<ApptFact> = {
      key: 'reason',
      get: (f) => (f.noShow ? one('no_show', L('noShow')) : one(f.appt.cancellation?.reasonId ?? 'none', ctx.d.settings.cancellationReasons.find((r) => r.id === f.appt.cancellation?.reasonId)?.name ?? L('noReason'))),
    }
    return summarize(facts, dim, [
      { key: 'noOfAppointments', type: 'int', calc: (fs) => fs.length },
      { key: 'value', type: 'money', calc: (fs) => sum(fs, (f) => f.value) },
      { key: 'feesCharged', type: 'money', calc: (fs) => sum(fs, (f) => f.appt.cancellation?.fee ?? f.appt.noShowFee ?? 0) },
      { key: 'lateCancellations', type: 'int', hidden: true, calc: (fs) => fs.filter((f) => f.appt.cancellation?.late).length },
    ])
  },
}

// ─── Waitlist ──────────────────────────────────────────────────────────────

const hexRef = (id: string) => {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0')
}

const waitlistFacts = (ctx: Ctx, p: Params) =>
  applyFilters(
    (ctx.d.waitlist ?? [])
      .filter((w) => inR(ctx.day(w.createdAt), p.range))
      .map((w) => {
        const services = w.items.map((i) => ctx.byId.service.get(i.serviceId))
        const value = round2(services.reduce((s, x) => s + (x?.price ?? 0), 0))
        const locationId = services[0]?.locationIds[0] ?? ctx.d.locations[0]?.id ?? ''
        const appt = w.appointmentId ? ctx.byId.appointment.get(w.appointmentId) : undefined
        return {
          w,
          services,
          value,
          locationId,
          appt,
          a: {
            ...clientAttrs(ctx, w.clientId, ctx.day(w.createdAt)),
            location: locationId,
            teamMember: w.items.map((i) => i.teamMemberId ?? 'none'),
            channel: w.source === 'online' ? ['marketplace', 'online'] : ['offline'],
            service: w.items.map((i) => i.serviceId),
            serviceCategory: services.map((s) => s?.categoryId ?? 'none'),
            waitlistStatus: w.status,
          },
        }
      })
      .sort((a, b) => b.w.createdAt.localeCompare(a.w.createdAt)),
    p.filters,
  )

const waitlistDetail: Spec = {
  slug: 'waitlist-detail',
  range: 'month_to_date',
  filters: ['location', 'teamMember', 'channel', 'service', 'serviceCategory', 'waitlistStatus', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) =>
    listResult(
      waitlistFacts(ctx, p),
      [
        { key: 'waitlistRef', type: 'text', get: (f) => hexRef(f.w.id) },
        { key: 'location', type: 'text', get: (f) => ctx.locationName(f.locationId) },
        { key: 'client', type: 'text', get: (f) => ctx.clientName(f.w.clientId), link: (f) => clientLink(f.w.clientId) },
        { key: 'mobileNumber', type: 'text', get: (f) => (f.w.clientId ? (ctx.byId.client.get(f.w.clientId)?.phone ?? '-') : '-') },
        { key: 'fromDate', type: 'date', get: (f) => f.w.preferences[0]?.date ?? '-' },
        { key: 'toDate', type: 'date', get: (f) => f.w.preferences[f.w.preferences.length - 1]?.date ?? '-' },
        { key: 'fromTime', type: 'time', get: (f) => f.w.preferences[0]?.from ?? L('anyTime') },
        { key: 'toTime', type: 'time', get: (f) => f.w.preferences[0]?.to ?? L('anyTime') },
        { key: 'teamMember', type: 'text', get: (f) => (f.w.items[0]?.teamMemberId ? ctx.memberName(f.w.items[0].teamMemberId) : L('anyProfessional')) },
        { key: 'service', type: 'text', get: (f) => f.services.map((s) => s?.name ?? '-').join(', ') },
        { key: 'serviceDuration', type: 'mins', total: false, get: (f) => f.services.reduce((s, x) => s + (x?.durationMin ?? 0), 0) },
        { key: 'price', type: 'money', get: (f) => f.value },
        { key: 'status', type: 'text', get: (f) => L(`opt.waitlistStatus.${f.w.status}`) },
        { key: 'apptRef', type: 'text', get: (f) => f.appt?.ref ?? '-', link: (f) => apptLink(f.appt?.id) },
        { key: 'createdDate', type: 'datetime', get: (f) => f.w.createdAt },
        { key: 'createdBy', type: 'text', get: (f) => (f.w.source === 'online' ? ctx.clientName(f.w.clientId) : 'Marta Ribeiro') },
        { key: 'notes', type: 'text', get: (f) => f.w.notes || '-' },
      ],
      (f) => f.w.id,
    ),
}

const waitlistSummary: Spec = {
  slug: 'waitlist-summary',
  range: 'month_to_date',
  groupBy: true,
  groupings: [{ key: 'location' }, { key: 'teamMember' }, { key: 'service' }, { key: 'serviceCategory' }],
  filters: ['location', 'teamMember', 'serviceCategory', 'channel', 'service', 'waitlistStatus', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    type F = ReturnType<typeof waitlistFacts>[number]
    const dims: Record<string, Dim<F>> = {
      location: { key: 'location', filterKey: 'location', next: 'service', get: (f) => one(f.locationId, ctx.locationName(f.locationId)) },
      teamMember: { key: 'teamMember', filterKey: 'teamMember', next: 'service', get: (f) => (f.a.teamMember as string[]).map((m) => one(m, m === 'none' ? L('anyProfessional') : ctx.memberName(m))) },
      service: { key: 'service', filterKey: 'service', next: 'teamMember', get: (f) => f.w.items.map((i) => one(i.serviceId, ctx.byId.service.get(i.serviceId)?.name ?? '-')) },
      serviceCategory: { key: 'serviceCategory', filterKey: 'serviceCategory', next: 'service', get: (f) => (f.a.serviceCategory as string[]).map((c) => one(c, ctx.byId.category.get(c)?.name ?? '-')) },
    }
    const ms: Measure<F>[] = [
      { key: 'totalWaitlistEntries', type: 'int', calc: (fs) => fs.length },
      { key: 'totalClients', type: 'int', calc: (fs) => new Set(fs.map((f) => f.w.clientId ?? f.w.id)).size },
      { key: 'appointmentsBooked', type: 'int', calc: (fs) => fs.filter((f) => f.w.status === 'booked').length },
      { key: 'waitingEntries', type: 'int', calc: (fs) => fs.filter((f) => f.w.status === 'waiting').length },
      { key: 'expiredEntries', type: 'int', calc: (fs) => fs.filter((f) => f.w.status === 'expired').length },
      { key: 'pctAppointmentsBooked', type: 'pct', calc: (fs) => pct(fs.filter((f) => f.w.status === 'booked').length, fs.length) },
      { key: 'pctEntriesExpired', type: 'pct', calc: (fs) => pct(fs.filter((f) => f.w.status === 'expired').length, fs.length) },
      { key: 'totalWaitlistValue', type: 'money', calc: (fs) => sum(fs, (f) => f.value) },
      { key: 'totalAppointmentValue', type: 'money', calc: (fs) => sum(fs.filter((f) => f.appt), (f) => f.appt!.items.reduce((s, i) => s + i.price, 0)) },
      { key: 'totalExpiredValue', type: 'money', calc: (fs) => sum(fs.filter((f) => f.w.status === 'expired'), (f) => f.value) },
    ]
    return summarize(waitlistFacts(ctx, p), dims[p.groupBy] ?? dims.location, ms)
  },
}

// ─── Clients ───────────────────────────────────────────────────────────────

interface ClientStat {
  first?: string
  last?: string
  count: number
  value: number
  locations: Set<string>
  future: boolean
  firstAt: Map<string, string>
}

const statStore = new WeakMap<Ctx, Map<ID, ClientStat>>()

function clientApptStats(ctx: Ctx): Map<ID, ClientStat> {
  let map = statStore.get(ctx)
  if (map) return map
  map = new Map()
  for (const a of ctx.d.appointments ?? []) {
    if (!a.clientId || a.status === 'cancelled') continue
    let s = map.get(a.clientId)
    if (!s) {
      s = { count: 0, value: 0, locations: new Set(), future: false, firstAt: new Map() }
      map.set(a.clientId, s)
    }
    s.locations.add(a.locationId)
    const prevAt = s.firstAt.get(a.locationId)
    if (!prevAt || a.date < prevAt) s.firstAt.set(a.locationId, a.date)
    if (a.date > ctx.today) {
      s.future = true
      continue
    }
    s.count++
    s.value += a.items.reduce((x, i) => x + i.price, 0)
    if (!s.first || a.date < s.first) s.first = a.date
    if (!s.last || a.date > s.last) s.last = a.date
  }
  statStore.set(ctx, map)
  return map
}

const clientSummary: Spec = {
  slug: 'client-summary',
  range: 'last_30_days',
  groupBy: true,
  groupings: [{ key: 'location' }, { key: 'teamMember' }, { key: 'channel' }, { key: 'month' }],
  filters: ['clientGender', 'location', 'channel', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const stats = clientApptStats(ctx)
    const facts = af(ctx, p).filter((f) => !f.cancelled)
    const dims = apptDims(ctx)
    const later = (f: ApptFact, sameLoc: boolean) =>
      Boolean(f.appt.clientId) && (ctx.d.appointments ?? []).some((x) => x.clientId === f.appt.clientId && x.date > f.appt.date && x.status !== 'cancelled' && (!sameLoc || x.locationId === f.appt.locationId))
    const clients = (fs: ApptFact[]) => new Set(fs.map((f) => f.appt.clientId).filter(Boolean) as string[])
    const walkIns = (fs: ApptFact[]) => fs.filter((f) => !f.appt.clientId).length
    const total = (fs: ApptFact[]) => clients(fs).size + walkIns(fs)
    const newC = (fs: ApptFact[]) => clients(fs.filter((f) => f.isNew)).size
    const newAt = (fs: ApptFact[]) => clients(fs.filter((f) => f.appt.clientId && stats.get(f.appt.clientId)?.firstAt.get(f.appt.locationId) === f.appt.date)).size
    const rebooked = (fs: ApptFact[], same: boolean) => clients(fs.filter((f) => later(f, same))).size
    const ms: Measure<ApptFact>[] = [
      { key: 'totalClients', type: 'int', calc: total },
      { key: 'newClients', type: 'int', calc: newC },
      { key: 'pctNew', type: 'pct', calc: (fs) => pct(newC(fs), total(fs)) },
      { key: 'newClientsAtLocation', type: 'int', calc: newAt },
      { key: 'pctNewClientsAtLocation', type: 'pct', calc: (fs) => pct(newAt(fs), total(fs)) },
      { key: 'returningClients', type: 'int', calc: (fs) => clients(fs).size - newC(fs) },
      { key: 'pctReturning', type: 'pct', calc: (fs) => pct(clients(fs).size - newC(fs), total(fs)) },
      { key: 'returningClientsAtLocation', type: 'int', calc: (fs) => clients(fs).size - newAt(fs) },
      { key: 'pctReturningAtLocation', type: 'pct', calc: (fs) => pct(clients(fs).size - newAt(fs), total(fs)) },
      { key: 'walkInClients', type: 'int', calc: walkIns },
      { key: 'pctWalkIns', type: 'pct', calc: (fs) => pct(walkIns(fs), total(fs)) },
      { key: 'rebooked', type: 'int', calc: (fs) => rebooked(fs, false) },
      { key: 'pctRebooked', type: 'pct', calc: (fs) => pct(rebooked(fs, false), clients(fs).size) },
      { key: 'rebookedClientsAtLocation', type: 'int', calc: (fs) => rebooked(fs, true) },
      { key: 'pctRebookedAtLocation', type: 'pct', calc: (fs) => pct(rebooked(fs, true), clients(fs).size) },
    ]
    return summarize(facts, dims[p.groupBy] ?? dims.location, ms)
  },
}

function clientFacts(ctx: Ctx, p: Params) {
  const stats = clientApptStats(ctx)
  const inRangeIds = new Set((ctx.d.appointments ?? []).filter((a) => a.clientId && a.status !== 'cancelled' && inR(a.date, p.range)).map((a) => a.clientId as string))
  const reviews = new Map<string, number>()
  for (const r of ctx.d.reviews ?? []) reviews.set(r.clientId, (reviews.get(r.clientId) ?? 0) + 1)
  return applyFilters(
    (ctx.d.clients ?? [])
      .filter((c) => !c.deletedAt && (inRangeIds.has(c.id) || inR(ctx.day(c.createdAt), p.range)))
      .map((c) => {
        const s = stats.get(c.id)
        return { c, s, reviews: reviews.get(c.id) ?? 0, a: { ...clientAttrs(ctx, c.id, ctx.today), location: s ? [...s.locations] : ['none'], rebooked: s?.future ? 'yes' : 'no' } }
      })
      .sort((a, b) => `${a.c.firstName} ${a.c.lastName}`.localeCompare(`${b.c.firstName} ${b.c.lastName}`)),
    p.filters,
  )
}

type CF = ReturnType<typeof clientFacts>[number]

const clientCols = (ctx: Ctx) => ({
  client: { key: 'client', type: 'text' as const, get: (f: CF) => `${f.c.firstName} ${f.c.lastName}`, link: (f: CF) => clientLink(f.c.id) },
  gender: { key: 'gender', type: 'text' as const, get: (f: CF) => L(`opt.gender.${f.c.gender ?? 'undisclosed'}`) },
  age: { key: 'age', type: 'text' as const, get: (f: CF) => (f.c.birthday ? String(differenceInYears(parseISO(ctx.today), parseISO(f.c.birthday))) : '-') },
  mobileNumber: { key: 'mobileNumber', type: 'text' as const, get: (f: CF) => f.c.phone || '-' },
  email: { key: 'email', type: 'text' as const, get: (f: CF) => f.c.email || '-' },
  addedOn: { key: 'addedOn', type: 'date' as const, get: (f: CF) => ctx.day(f.c.createdAt) },
  firstAppt: { key: 'firstAppt', type: 'date' as const, get: (f: CF) => f.s?.first ?? '-' },
  lastAppt: { key: 'lastAppt', type: 'date' as const, get: (f: CF) => f.s?.last ?? '-' },
  clientSource: { key: 'clientSource', type: 'text' as const, get: (f: CF) => ctx.byId.source.get(f.c.sourceId)?.name ?? '-' },
  referredBy: { key: 'referredBy', type: 'text' as const, get: (f: CF) => (f.c.referredById ? ctx.clientName(f.c.referredById) : '-') },
})

const clientList: Spec = {
  slug: 'client-list',
  range: 'last_30_days',
  filters: ['clientGender', 'location', 'blockedClients', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const c = clientCols(ctx)
    return listResult(clientFacts(ctx, p), [
      c.client,
      c.gender,
      c.age,
      c.mobileNumber,
      c.email,
      c.addedOn,
      c.firstAppt,
      c.lastAppt,
      { key: 'loyaltyPointsBalance', type: 'int', get: () => 0 },
      { key: 'loyaltyTier', type: 'text', get: () => '-' },
      c.clientSource,
      c.referredBy,
      { key: 'blocked', type: 'text', hidden: true, get: (f) => (f.c.blocked ? L('yes') : L('no')) },
    ], (f) => f.c.id)
  },
}

const clientInsights: Spec = {
  slug: 'client-insights',
  range: 'last_30_days',
  filters: ['rebooked', 'clientGender', 'location', 'blockedClients', 'clientTags', 'clientSegments'],
  advanced: true,
  customize: true,
  build: (ctx, p) => {
    const c = clientCols(ctx)
    return listResult(
      clientFacts(ctx, p),
      [
        c.client,
        c.gender,
        c.age,
        c.mobileNumber,
        c.email,
        c.addedOn,
        c.firstAppt,
        c.lastAppt,
        { key: 'rebooked', type: 'text', get: (f) => (f.s?.future ? L('yes') : L('no')) },
        c.clientSource,
        c.referredBy,
        { key: 'totalAppts', type: 'int', total: true, get: (f) => f.s?.count ?? 0 },
        { key: 'totalApptValue', type: 'money', get: (f) => round2(f.s?.value ?? 0) },
        { key: 'reviews', type: 'int', total: true, get: (f) => f.reviews },
      ],
      (f) => f.c.id,
      { total: true },
    )
  },
}

export const APPOINTMENT_SPECS: Spec[] = [appointmentSummary, appointmentList, cancellationsSummary, waitlistDetail, waitlistSummary, clientSummary, clientList, clientInsights]

