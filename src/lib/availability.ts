import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import i18n from 'i18next'
import type { Appointment, AppointmentItem, DbData, ExtraTime, ID, ISODate, Service, TeamMember } from '@/types'
import { closedPeriodOn, workingWindows } from './schedule'
import { toClock, toISODate, toMinutes, weekdayOf } from './time'

/**
 * Availability engine (SPEC §4). Computes bookable slots from opening hours,
 * closed periods, scheduled shifts, time off, blocked time, existing
 * appointments, service duration with extra time, resources, online limits,
 * minimum notice, the advance window and "any professional" assignment.
 * Used by the calendar, the add-appointment flow and simulated online bookings.
 */

export type AvailabilityData = Pick<
  DbData,
  | 'shiftPatterns'
  | 'shiftOverrides'
  | 'closedPeriods'
  | 'timeOff'
  | 'blockedTimes'
  | 'appointments'
  | 'services'
  | 'teamMembers'
  | 'resources'
  | 'locations'
  | 'settings'
> &
  Partial<Pick<DbData, 'serviceCategories'>>

export interface SlotRequestItem {
  serviceId: ID
  variantId?: ID
  /** null = any professional */
  teamMemberId: ID | null
  /** Overrides the service duration (e.g. edited in the appointment). */
  durationMin?: number
  extraTime?: ExtraTime[]
}

export interface AvailabilityQuery {
  locationId: ID
  date: ISODate
  items: SlotRequestItem[]
  /** Online bookings: shifts only, minimum notice, advance window, online limits. */
  online: boolean
  now: Date
  excludeAppointmentId?: ID
  intervalMin?: number
  /** Client booking (for "Prioritize last booked team member"). */
  clientId?: ID | null
}

export interface SlotAssignment {
  itemIndex: number
  teamMemberId: ID
  start: string
  end: string
  resourceId?: ID
}

export interface Slot {
  start: string
  end: string
  assignments: SlotAssignment[]
}

interface Segment {
  start: number
  end: number
  busy: boolean
}

/** Duration and extra time for a service or variant. */
export function serviceTiming(service: Service, variantId?: ID): { durationMin: number; extraTime: ExtraTime[] } {
  const variant = service.variants.find((v) => v.id === variantId)
  return { durationMin: variant?.durationMin ?? service.durationMin, extraTime: service.extraTime }
}

/**
 * Busy and free segments of one item starting at `start` (minutes). Processing
 * time frees the team member; blocked and extra servicing time keep them busy.
 */
export function itemSegments(start: number, durationMin: number, extraTime: ExtraTime[]): Segment[] {
  const segments: Segment[] = [{ start, end: start + durationMin, busy: true }]
  let cursor = start + durationMin
  for (const extra of extraTime) {
    segments.push({ start: cursor, end: cursor + extra.durationMin, busy: extra.type !== 'processing' })
    cursor += extra.durationMin
  }
  return segments
}

export const itemTotalMinutes = (durationMin: number, extraTime: ExtraTime[]) => durationMin + extraTime.reduce((s, e) => s + e.durationMin, 0)

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1]

/** Busy intervals (minutes) of every member on a date, from appointments and blocked time. */
function busyByMember(data: AvailabilityData, date: ISODate, online: boolean, excludeAppointmentId?: ID): Map<ID, [number, number][]> {
  const map = new Map<ID, [number, number][]>()
  const add = (id: ID, range: [number, number]) => {
    const list = map.get(id) ?? []
    list.push(range)
    map.set(id, list)
  }
  for (const appt of data.appointments) {
    if (appt.date !== date || appt.id === excludeAppointmentId || appt.status === 'cancelled') continue
    for (const item of appt.items) {
      for (const seg of itemSegments(toMinutes(item.start), item.durationMin, item.extraTime)) if (seg.busy) add(item.teamMemberId, [seg.start, seg.end])
    }
  }
  for (const block of data.blockedTimes) {
    if (block.date !== date) continue
    if (online && block.onlineBookingAllowed) continue
    add(block.teamMemberId, [toMinutes(block.start), toMinutes(block.end)])
  }
  return map
}

/** Resource bookings (minutes) on a date. */
function resourceUse(data: AvailabilityData, date: ISODate, excludeAppointmentId?: ID): Map<ID, [number, number][]> {
  const map = new Map<ID, [number, number][]>()
  for (const appt of data.appointments) {
    if (appt.date !== date || appt.id === excludeAppointmentId || appt.status === 'cancelled') continue
    for (const item of appt.items) {
      if (!item.resourceId) continue
      const start = toMinutes(item.start)
      const list = map.get(item.resourceId) ?? []
      list.push([start, start + itemTotalMinutes(item.durationMin, item.extraTime)])
      map.set(item.resourceId, list)
    }
  }
  return map
}

/** Team members who can perform a service at a location. */
export function eligibleMembers(data: Pick<AvailabilityData, 'teamMembers'>, service: Service, locationId: ID, online: boolean): TeamMember[] {
  return data.teamMembers
    .filter(
      (m) =>
        !m.archived &&
        m.bookable &&
        m.locationIds.includes(locationId) &&
        (m.serviceIds === 'all' || m.serviceIds.includes(service.id)) &&
        (service.teamMemberIds === 'all' || service.teamMemberIds.includes(m.id)) &&
        (!online || !m.excludeOnline),
    )
    .sort((a, b) => a.order - b.order)
}

function serviceAllowedOnline(service: Service, date: ISODate, start: number, end: number, categoryArchived = false): boolean {
  if (!service.onlineBooking || service.archived || categoryArchived) return false
  const range = service.limits.dateRange
  if (range && (date < range.from || date > range.to)) return false
  const weekly = service.limits.weekly
  if (weekly) {
    const ranges = weekly[weekdayOf(date)]
    if (!ranges?.some((r) => toMinutes(r.start) <= start && end <= toMinutes(r.end))) return false
  }
  return true
}

/**
 * Orders candidates for "any professional" by the strategy in Settings ›
 * Scheduling › Dynamic assignment:
 * - fill: most availability (fewest booked minutes on the day, or over the
 *   prior 7 / 14 days)
 * - turns: longest since their last automatic assignment
 * - ratings: fewest client reviews
 * - priority: the team member list order
 * "Prioritize last booked team member" puts the client's previous team member first.
 */
function anyProfessionalRanking(data: AvailabilityData, query: AvailabilityQuery, busyToday: Map<ID, [number, number][]>) {
  const settings = data.settings.dynamicAssignment
  const strategy = settings?.strategy ?? 'fill'
  const minutes = (ranges: [number, number][] | undefined) => (ranges ?? []).reduce((s, [a, b]) => s + (b - a), 0)

  let score: (memberId: ID) => number
  if (strategy === 'fill' && settings?.period && settings.period !== 'day') {
    const days = settings.period === '7d' ? 7 : 14
    const from = toISODate(addDays(parseISO(query.date), -days))
    const booked = new Map<ID, number>()
    for (const a of data.appointments) {
      if (a.status === 'cancelled' || a.date < from || a.date > query.date) continue
      for (const item of a.items) booked.set(item.teamMemberId, (booked.get(item.teamMemberId) ?? 0) + item.durationMin)
    }
    score = (id) => booked.get(id) ?? 0
  } else if (strategy === 'turns') {
    const lastAuto = new Map<ID, string>()
    for (const a of data.appointments) {
      if (a.requested || a.channel === 'offline') continue
      for (const item of a.items) if ((lastAuto.get(item.teamMemberId) ?? '') < a.createdAt) lastAuto.set(item.teamMemberId, a.createdAt)
    }
    // Earliest last assignment first; never assigned sorts first.
    score = (id) => (lastAuto.has(id) ? Date.parse(lastAuto.get(id)!) : 0)
  } else if (strategy === 'ratings') {
    score = (id) => data.teamMembers.find((m) => m.id === id)?.reviewCount ?? 0
  } else if (strategy === 'priority') {
    score = (id) => data.teamMembers.find((m) => m.id === id)?.order ?? 0
  } else {
    score = (id) => minutes(busyToday.get(id))
  }

  let preferred: ID | undefined
  if (settings?.prioritizeLast && query.clientId) {
    preferred = data.appointments
      .filter((a) => a.clientId === query.clientId && a.status !== 'cancelled' && a.date <= query.date)
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.items[0]?.teamMemberId
  }

  return (pool: TeamMember[]) => [...pool].sort((a, b) => (b.id === preferred ? 1 : 0) - (a.id === preferred ? 1 : 0) || score(a.id) - score(b.id) || a.order - b.order)
}

/**
 * Settings › Scheduling › Availability › Schedule optimization (online only):
 * - regular: every free time
 * - reduce: no slot that leaves a gap shorter than the shortest online service
 * - eliminate: only slots that start or end against an existing booking,
 *   blocked time or the edge of the shift
 */
function fitsOptimization(
  data: AvailabilityData,
  busy: Map<ID, [number, number][]>,
  windowsFor: (memberId: ID) => [number, number][],
  assignments: SlotAssignment[],
  start: number,
  end: number,
): boolean {
  const mode = data.settings.scheduleOptimization?.mode ?? 'regular'
  if (mode === 'regular' || !assignments.length) return true
  const gapAround = (memberId: ID, from: number, to: number) => {
    const edges = [...(busy.get(memberId) ?? []), ...windowsFor(memberId).flatMap(([ws, we]): [number, number][] => [[-Infinity, ws], [we, Infinity]])]
    const before = Math.max(...edges.filter(([, b]) => b <= from).map(([, b]) => b), -Infinity)
    const after = Math.min(...edges.filter(([a]) => a >= to).map(([a]) => a), Infinity)
    return { before: from - before, after: after - to }
  }
  const head = gapAround(assignments[0].teamMemberId, start, toMinutes(assignments[0].end))
  const tail = gapAround(assignments[assignments.length - 1].teamMemberId, toMinutes(assignments[assignments.length - 1].start), end)
  if (mode === 'eliminate') return head.before === 0 || tail.after === 0
  const online = data.services.filter((s) => s.onlineBooking && !s.archived).map((s) => s.durationMin)
  const minGap = Math.max(15, online.length ? Math.min(...online) : 30)
  const awkward = (gap: number) => gap > 0 && gap < minGap
  return !awkward(head.before) && !awkward(tail.after)
}

/** Bookable slots for the requested services on one date. */
export function getAvailableSlots(data: AvailabilityData, query: AvailabilityQuery): Slot[] {
  const { locationId, date, items, online, now } = query
  const interval = query.intervalMin ?? data.settings.scheduleOptimization.intervalMin ?? 15
  if (!items.length) return []
  const location = data.locations.find((l) => l.id === locationId)
  if (!location) return []
  if (closedPeriodOn(data.closedPeriods, date, locationId)) return []

  const today = toISODate(now)
  if (date < today) return []
  const nowMin = now.getHours() * 60 + now.getMinutes()
  let earliest = 0
  if (online) {
    const daysAhead = differenceInCalendarDays(parseISO(date), parseISO(today))
    if (daysAhead > data.settings.availability.advanceDays) return []
    const notice = data.settings.availability.minNoticeMin
    if (date === today) earliest = nowMin + notice
    else if (daysAhead === 1 && nowMin + notice > 1440) earliest = nowMin + notice - 1440
  } else if (date === today) {
    earliest = 0
  }

  const services = items.map((i) => data.services.find((s) => s.id === i.serviceId))
  if (services.some((s) => !s)) return []
  const timings = items.map((item, idx) => {
    const base = serviceTiming(services[idx]!, item.variantId)
    return { durationMin: item.durationMin ?? base.durationMin, extraTime: item.extraTime ?? base.extraTime }
  })
  const totals = timings.map((t) => itemTotalMinutes(t.durationMin, t.extraTime))

  const busy = busyByMember(data, date, online, query.excludeAppointmentId)
  const resourceBusy = resourceUse(data, date, query.excludeAppointmentId)
  const windowsCache = new Map<ID, [number, number][]>()
  const windowsFor = (memberId: ID) => {
    if (!windowsCache.has(memberId)) windowsCache.set(memberId, workingWindows(data, memberId, date, locationId))
    return windowsCache.get(memberId)!
  }
  const rankAny = anyProfessionalRanking(data, query, busy)

  const openRanges = location.openingHours[weekdayOf(date)]
  const openWindows: [number, number][] = openRanges?.open ? openRanges.ranges.map((r) => [toMinutes(r.start), toMinutes(r.end)]) : []

  const memberFree = (memberId: ID, segments: Segment[], taken: [number, number][]) => {
    const windows = windowsFor(memberId)
    const own = busy.get(memberId) ?? []
    return segments.every((seg) => {
      if (!seg.busy) return true
      const range: [number, number] = [seg.start, seg.end]
      const inShift = windows.some(([ws, we]) => ws <= seg.start && seg.end <= we)
      return inShift && !own.some((b) => overlaps(b, range)) && !taken.some((b) => overlaps(b, range))
    })
  }

  const freeResource = (service: Service, start: number, end: number, claimed: Map<ID, [number, number][]>): ID | undefined | null => {
    if (!service.resourceTypeIds.length) return undefined
    const candidates = data.resources.filter((r) => r.locationId === locationId && service.resourceTypeIds.includes(r.typeId))
    for (const res of candidates) {
      const uses = [...(resourceBusy.get(res.id) ?? []), ...(claimed.get(res.id) ?? [])].filter((u) => overlaps(u, [start, end]))
      if (uses.length < res.capacity) return res.id
    }
    return null
  }

  const allMemberWindows = data.teamMembers.filter((m) => m.bookable && !m.archived).flatMap((m) => windowsFor(m.id))
  if (!allMemberWindows.length) return []
  const dayStart = Math.min(...allMemberWindows.map((w) => w[0]))
  const dayEnd = Math.max(...allMemberWindows.map((w) => w[1]))
  const totalLength = totals.reduce((s, t) => s + t, 0)

  const slots: Slot[] = []
  const first = Math.ceil(Math.max(dayStart, earliest) / interval) * interval
  for (let start = first; start + totalLength <= dayEnd; start += interval) {
    if (online && !openWindows.some(([os, oe]) => os <= start && start + totalLength <= oe)) continue
    const assignments: SlotAssignment[] = []
    const takenByMember = new Map<ID, [number, number][]>()
    const claimedResources = new Map<ID, [number, number][]>()
    let cursor = start
    let ok = true
    for (let i = 0; i < items.length; i++) {
      const service = services[i]!
      const { durationMin, extraTime } = timings[i]
      const end = cursor + totals[i]
      const categoryArchived = Boolean(data.serviceCategories?.find((c) => c.id === service.categoryId)?.archived)
      if (online && !serviceAllowedOnline(service, date, cursor, end, categoryArchived)) {
        ok = false
        break
      }
      const segments = itemSegments(cursor, durationMin, extraTime)
      const requested = items[i].teamMemberId
      const excluded = data.settings.dynamicAssignment?.excluded ?? []
      const pool = requested ? data.teamMembers.filter((m) => m.id === requested) : eligibleMembers(data, service, locationId, online).filter((m) => !(online && (m.excludeAutoAssign || excluded.includes(m.id))))
      const ranked = requested ? pool : rankAny(pool)
      const chosen = ranked.find((m) => memberFree(m.id, segments, takenByMember.get(m.id) ?? []))
      if (!chosen) {
        ok = false
        break
      }
      const resourceId = freeResource(service, cursor, end, claimedResources)
      if (resourceId === null) {
        ok = false
        break
      }
      if (resourceId) claimedResources.set(resourceId, [...(claimedResources.get(resourceId) ?? []), [cursor, end]])
      takenByMember.set(chosen.id, [...(takenByMember.get(chosen.id) ?? []), ...segments.filter((s) => s.busy).map((s): [number, number] => [s.start, s.end])])
      assignments.push({ itemIndex: i, teamMemberId: chosen.id, start: toClock(cursor), end: toClock(end), resourceId })
      cursor = end
    }
    if (ok && online && !fitsOptimization(data, busy, windowsFor, assignments, start, cursor)) ok = false
    if (ok) slots.push({ start: toClock(start), end: toClock(cursor), assignments })
  }
  return slots
}

/** First dates (from `from`, up to `days` ahead) that have at least one slot. */
export function nextAvailableDates(data: AvailabilityData, query: Omit<AvailabilityQuery, 'date'>, from: ISODate, days = 30, limit = 7): { date: ISODate; slots: Slot[] }[] {
  const found: { date: ISODate; slots: Slot[] }[] = []
  for (let i = 0; i < days && found.length < limit; i++) {
    const date = toISODate(addDays(parseISO(from), i))
    const slots = getAvailableSlots(data, { ...query, date })
    if (slots.length) found.push({ date, slots })
  }
  return found
}

export type ConflictKind = 'overlap' | 'outside_shift' | 'blocked_time' | 'closed' | 'resource'

export interface Conflict {
  itemId: ID
  kind: ConflictKind
  message: string
}

/**
 * Conflicts for an appointment as placed (calendar drag/drop, manual edits).
 * Staff may still save; the UI shows these as warnings.
 */
export function findConflicts(data: AvailabilityData, appointment: Pick<Appointment, 'id' | 'date' | 'locationId'> & { items: Pick<AppointmentItem, 'id' | 'teamMemberId' | 'start' | 'durationMin' | 'extraTime' | 'resourceId'>[] }): Conflict[] {
  const conflicts: Conflict[] = []
  const closed = closedPeriodOn(data.closedPeriods, appointment.date, appointment.locationId)
  const busy = busyByMember(data, appointment.date, false, appointment.id)
  const resources = resourceUse(data, appointment.date, appointment.id)
  for (const item of appointment.items) {
    const member = data.teamMembers.find((m) => m.id === item.teamMemberId)
    const name = member?.firstName ?? i18n.t('common.conflicts.thisMember')
    if (closed) conflicts.push({ itemId: item.id, kind: 'closed', message: i18n.t('common.conflicts.closed', { description: closed.description }) })
    const segments = itemSegments(toMinutes(item.start), item.durationMin, item.extraTime).filter((s) => s.busy)
    const windows = workingWindows(data, item.teamMemberId, appointment.date, appointment.locationId)
    if (segments.some((s) => !windows.some(([ws, we]) => ws <= s.start && s.end <= we))) {
      conflicts.push({ itemId: item.id, kind: 'outside_shift', message: i18n.t('common.conflicts.outsideShift', { name }) })
    }
    const theirs = busy.get(item.teamMemberId) ?? []
    if (segments.some((s) => theirs.some((b) => overlaps(b, [s.start, s.end])))) {
      const blocked = data.blockedTimes.some((b) => b.date === appointment.date && b.teamMemberId === item.teamMemberId && segments.some((s) => overlaps([toMinutes(b.start), toMinutes(b.end)], [s.start, s.end])))
      conflicts.push({ itemId: item.id, kind: blocked ? 'blocked_time' : 'overlap', message: blocked ? i18n.t('common.conflicts.blockedTime', { name }) : i18n.t('common.conflicts.overlap', { name }) })
    }
    if (item.resourceId) {
      const res = data.resources.find((r) => r.id === item.resourceId)
      const start = toMinutes(item.start)
      const range: [number, number] = [start, start + itemTotalMinutes(item.durationMin, item.extraTime)]
      if (res && (resources.get(res.id) ?? []).filter((u) => overlaps(u, range)).length >= res.capacity) {
        conflicts.push({ itemId: item.id, kind: 'resource', message: i18n.t('common.conflicts.resource', { name: res.name }) })
      }
    }
  }
  return conflicts
}
