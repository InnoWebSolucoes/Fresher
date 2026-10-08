import { findConflicts, getAvailableSlots, nextAvailableDates, type AvailabilityData } from './availability'
import type { Appointment, Service, TeamMember } from '@/types'
import { buildSeed } from '@/mock/seed'

const seed = buildSeed(new Date('2026-10-08T08:00:00'))

/** Small hand-built world: one location, two members, a few services. */
function world(): AvailabilityData {
  const base = (id: string, extra: Partial<TeamMember> = {}): TeamMember => ({ ...seed.teamMembers[0], id, firstName: id, locationIds: ['loc'], serviceIds: 'all', bookable: true, archived: false, excludeOnline: false, excludeAutoAssign: false, ...extra })
  const svc = (id: string, durationMin: number, extra: Partial<Service> = {}): Service => ({ ...seed.services[0], id, name: id, durationMin, extraTime: [], variants: [], locationIds: ['loc'], teamMemberIds: 'all', resourceTypeIds: [], onlineBooking: true, archived: false, limits: {}, ...extra })
  const morning = [{ start: '10:00', end: '13:00' }]
  const allWeek = { 0: morning, 1: morning, 2: morning, 3: morning, 4: morning }
  return {
    ...seed,
    locations: [{ ...seed.locations[0], id: 'loc', openingHours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: d < 5, ranges: d < 5 ? [{ start: '09:00', end: '19:00' }] : [] }])) as never }],
    teamMembers: [base('ana', { order: 0 }), base('bia', { order: 1 })],
    services: [svc('cut', 60), svc('colour', 60, { extraTime: [{ type: 'processing', durationMin: 30 }] }), svc('massage', 60, { resourceTypeIds: ['rt_room'] }), svc('offline', 30, { onlineBooking: false })],
    resources: [{ id: 'room', name: 'Room', typeId: 'rt_room', description: '', capacity: 1, color: 'teal', locationId: 'loc', availability: 'always' }],
    shiftPatterns: [
      { id: 'p1', teamMemberId: 'ana', locationId: 'loc', scheduleType: 1, startDate: '2026-01-05', weeks: [allWeek] },
      { id: 'p2', teamMemberId: 'bia', locationId: 'loc', scheduleType: 1, startDate: '2026-01-05', weeks: [{ 0: [{ start: '11:00', end: '13:00' }] }] },
    ],
    shiftOverrides: [],
    timeOff: [],
    blockedTimes: [],
    appointments: [],
    closedPeriods: [],
    settings: { ...seed.settings, availability: { ...seed.settings.availability, minNoticeMin: 60, advanceDays: 30 }, scheduleOptimization: { intervalMin: 15, mode: 'regular' } },
  }
}

const appt = (memberId: string, start: string, durationMin: number, date = '2026-10-12'): Appointment =>
  ({
    id: `a_${start}`,
    ref: 'X',
    clientId: null,
    locationId: 'loc',
    date,
    status: 'booked',
    source: 'phone',
    channel: 'offline',
    createdAt: '',
    createdBy: '',
    requested: false,
    activity: [],
    formResponseIds: [],
    items: [{ id: `i_${start}`, serviceId: 'cut', name: 'cut', teamMemberId: memberId, start, durationMin, extraTime: [], price: 10, addOns: [], preferred: false }],
  }) as Appointment

const MONDAY = '2026-10-12'
const now = new Date('2026-10-08T08:00:00')
const q = (extra: Partial<Parameters<typeof getAvailableSlots>[1]> = {}) => ({ locationId: 'loc', date: MONDAY, items: [{ serviceId: 'cut', teamMemberId: 'ana' as string | null }], online: true, now, ...extra })

describe('availability engine', () => {
  it('offers slots only inside scheduled shifts', () => {
    const slots = getAvailableSlots(world(), q())
    expect(slots[0].start).toBe('10:00')
    expect(slots[slots.length - 1].start).toBe('12:00')
    expect(slots).toHaveLength(9)
  })

  it('skips existing appointments', () => {
    const data = world()
    data.appointments = [appt('ana', '10:30', 60)]
    const starts = getAvailableSlots(data, q()).map((s) => s.start)
    expect(starts).not.toContain('10:00')
    expect(starts).not.toContain('11:00')
    expect(starts).toContain('11:30')
  })

  it('ignores cancelled appointments', () => {
    const data = world()
    data.appointments = [{ ...appt('ana', '10:00', 60), status: 'cancelled' }]
    expect(getAvailableSlots(data, q())[0].start).toBe('10:00')
  })

  it('respects time off, blocked time and closed periods', () => {
    const data = world()
    data.timeOff = [{ id: 't', teamMemberId: 'ana', typeId: 'x', startDate: MONDAY, startTime: '10:00', endTime: '11:00', description: '', approved: true }]
    data.blockedTimes = [{ id: 'b', teamMemberId: 'ana', locationId: 'loc', date: MONDAY, start: '12:00', end: '12:30', title: 'Lunch', description: '', onlineBookingAllowed: false }]
    expect(getAvailableSlots(data, q()).map((s) => s.start)).toEqual(['11:00'])
    data.blockedTimes[0].onlineBookingAllowed = true
    expect(getAvailableSlots(data, q()).map((s) => s.start)).toContain('12:00')
    data.closedPeriods = [{ id: 'c', startDate: MONDAY, endDate: MONDAY, description: 'Holiday', locationIds: [] }]
    expect(getAvailableSlots(data, q())).toEqual([])
  })

  it('applies minimum notice and the advance window online', () => {
    const data = world()
    const later = new Date('2026-10-08T10:50:00')
    expect(getAvailableSlots(data, q({ date: '2026-10-08', now: later }))[0].start).toBe('12:00')
    expect(getAvailableSlots(data, q({ date: '2026-12-31' }))).toEqual([])
    // Staff bookings ignore the minimum notice.
    expect(getAvailableSlots(data, q({ date: '2026-10-08', now: later, online: false }))[0].start).toBe('10:00')
  })

  it('assigns "any professional" to whoever is free, preferring the emptier calendar', () => {
    const data = world()
    data.appointments = [appt('ana', '11:00', 60)]
    const slots = getAvailableSlots(data, q({ items: [{ serviceId: 'cut', teamMemberId: null }] }))
    expect(slots.find((s) => s.start === '11:00')?.assignments[0].teamMemberId).toBe('bia')
    expect(slots.find((s) => s.start === '10:00')?.assignments[0].teamMemberId).toBe('ana')
  })

  it('frees the team member during processing time', () => {
    const data = world()
    const base = appt('ana', '10:00', 60)
    data.appointments = [{ ...base, items: [{ ...base.items[0], extraTime: [{ type: 'processing', durationMin: 60 }] }] }]
    expect(getAvailableSlots(data, q()).map((s) => s.start)).toContain('11:00')
  })

  it('books multiple services back to back', () => {
    const slots = getAvailableSlots(world(), q({ items: [{ serviceId: 'colour', teamMemberId: 'ana' }, { serviceId: 'cut', teamMemberId: 'ana' }] }))
    expect(slots.map((s) => s.start)).toEqual(['10:00', '10:15', '10:30'])
    expect(slots[0].assignments[1].start).toBe('11:30')
  })

  it('requires a free resource', () => {
    const data = world()
    const base = appt('bia', '10:00', 60)
    data.appointments = [{ ...base, items: [{ ...base.items[0], resourceId: 'room' }] }]
    const starts = getAvailableSlots(data, q({ items: [{ serviceId: 'massage', teamMemberId: 'ana' }] })).map((s) => s.start)
    expect(starts).not.toContain('10:00')
    expect(starts).toContain('11:00')
  })

  it('hides services that are not bookable online', () => {
    expect(getAvailableSlots(world(), q({ items: [{ serviceId: 'offline', teamMemberId: 'ana' }] }))).toEqual([])
    expect(getAvailableSlots(world(), q({ online: false, items: [{ serviceId: 'offline', teamMemberId: 'ana' }] })).length).toBeGreaterThan(0)
  })

  it('only offers gap-free times with "Eliminate calendar gaps"', () => {
    const data = world()
    data.settings = { ...data.settings, scheduleOptimization: { intervalMin: 15, mode: 'eliminate' } }
    data.appointments = [appt('ana', '11:00', 60)]
    // Shift 10:00–13:00, booked 11:00–12:00: only 10:00 (ends at 11:00) and 12:00 (starts at 12:00) touch an edge.
    expect(getAvailableSlots(data, q()).map((s) => s.start)).toEqual(['10:00', '12:00'])
  })

  it('avoids leaving short gaps with "Reduce calendar gaps"', () => {
    const data = world()
    data.settings = { ...data.settings, scheduleOptimization: { intervalMin: 15, mode: 'reduce' } }
    // The shortest online service here is 60 min, so any slot leaving a 15–45 min gap
    // against the 10:00–13:00 shift edges can never be filled and is hidden.
    expect(getAvailableSlots(data, q()).map((s) => s.start)).toEqual(['10:00', '11:00', '12:00'])
  })

  it('follows the dynamic assignment strategy for any professional', () => {
    const data = world()
    const anyCut = { items: [{ serviceId: 'cut', teamMemberId: null }] }
    data.settings = { ...data.settings, dynamicAssignment: { ...data.settings.dynamicAssignment, strategy: 'priority' } }
    data.teamMembers = data.teamMembers.map((m) => ({ ...m, order: m.id === 'bia' ? 0 : 1 }))
    expect(getAvailableSlots(data, q(anyCut)).find((s) => s.start === '11:00')?.assignments[0].teamMemberId).toBe('bia')
    data.settings = { ...data.settings, dynamicAssignment: { ...data.settings.dynamicAssignment, strategy: 'ratings' } }
    data.teamMembers = data.teamMembers.map((m) => ({ ...m, reviewCount: m.id === 'ana' ? 0 : 10 }))
    expect(getAvailableSlots(data, q(anyCut)).find((s) => s.start === '11:00')?.assignments[0].teamMemberId).toBe('ana')
  })

  it('keeps returning clients with their last team member when asked to', () => {
    const data = world()
    data.settings = { ...data.settings, dynamicAssignment: { ...data.settings.dynamicAssignment, strategy: 'fill', prioritizeLast: true } }
    data.appointments = [{ ...appt('bia', '11:00', 30, '2026-10-05'), clientId: 'client-1' }]
    const slot = getAvailableSlots(data, q({ items: [{ serviceId: 'cut', teamMemberId: null }], clientId: 'client-1' })).find((s) => s.start === '11:00')
    expect(slot?.assignments[0].teamMemberId).toBe('bia')
  })

  it('finds the next available dates', () => {
    const found = nextAvailableDates(world(), { locationId: 'loc', items: [{ serviceId: 'cut', teamMemberId: 'bia' }], online: true, now }, '2026-10-08', 14)
    expect(found[0].date).toBe(MONDAY)
  })

  it('reports conflicts for a dragged appointment', () => {
    const data = world()
    data.appointments = [appt('ana', '10:00', 60)]
    expect(findConflicts(data, { ...appt('ana', '10:30', 60), id: 'other' }).map((c) => c.kind)).toContain('overlap')
    expect(findConflicts(data, { ...appt('ana', '14:00', 60), id: 'other' }).map((c) => c.kind)).toContain('outside_shift')
  })
})
