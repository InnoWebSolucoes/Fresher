import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { now, todayISO, useNow } from '@/lib/time'
import type { AvailabilityData } from '@/lib/availability'
import type { ID, PaletteColor } from '@/types'
import { isCalView, isISODate, type CalView, type ToneLookups } from './lib'

export const TEAM_PARAM = 'calendar_selected_resources'

/** Calendar URL state: date, view, location_id and the team selection. */
export function useCalendarParams() {
  const [params, setParams] = useSearchParams()
  const locations = useDb((s) => s.locations)
  const members = useDb((s) => s.teamMembers)
  const user = useCurrentUser()

  const rawDate = params.get('date')
  const date = isISODate(rawDate) ? rawDate : todayISO()
  const rawView = params.get('view')
  const view: CalView = isCalView(rawView) ? rawView : 'day'
  const defaultLocation = useMemo(() => {
    const own = members.find((m) => m.id === user?.teamMemberId)
    return own?.locationIds[0] ?? locations[0]?.id ?? ''
  }, [members, locations, user?.teamMemberId])
  const rawLocation = params.get('location_id')
  const locationId = rawLocation && locations.some((l) => l.id === rawLocation) ? rawLocation : defaultLocation
  const team = params.get(TEAM_PARAM) ?? 'e-all'

  const patch = useCallback(
    (values: Record<string, string | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          Object.entries(values).forEach(([key, value]) => (value === undefined ? next.delete(key) : next.set(key, value)))
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return { params, date, view, locationId, team, patch }
}

/** "Now" that re-renders every minute (current-time line, pick lists). */
export function useClock(intervalMs = 60_000): Date {
  useNow()
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now()
}

/** Bookable, active team members of a location in calendar order. */
export function useLocationMembers(locationId: ID) {
  const members = useDb((s) => s.teamMembers)
  return useMemo(() => members.filter((m) => !m.archived && m.bookable && m.locationIds.includes(locationId)).sort((a, b) => a.order - b.order), [members, locationId])
}

export function useScheduleData() {
  const shiftPatterns = useDb((s) => s.shiftPatterns)
  const shiftOverrides = useDb((s) => s.shiftOverrides)
  const closedPeriods = useDb((s) => s.closedPeriods)
  const timeOff = useDb((s) => s.timeOff)
  return useMemo(() => ({ shiftPatterns, shiftOverrides, closedPeriods, timeOff }), [shiftPatterns, shiftOverrides, closedPeriods, timeOff])
}

/** Everything the availability engine reads (getAvailableSlots, findConflicts). */
export function useAvailabilityData(): AvailabilityData {
  const schedule = useScheduleData()
  const blockedTimes = useDb((s) => s.blockedTimes)
  const appointments = useDb((s) => s.appointments)
  const services = useDb((s) => s.services)
  const teamMembers = useDb((s) => s.teamMembers)
  const resources = useDb((s) => s.resources)
  const locations = useDb((s) => s.locations)
  const settings = useDb((s) => s.settings)
  return useMemo(
    () => ({ ...schedule, blockedTimes, appointments, services, teamMembers, resources, locations, settings }),
    [schedule, blockedTimes, appointments, services, teamMembers, resources, locations, settings],
  )
}

/** Id lookups and colour sources shared by the grid and drawers. */
export function useLookups() {
  const clients = useDb((s) => s.clients)
  const services = useDb((s) => s.services)
  const categories = useDb((s) => s.serviceCategories)
  const members = useDb((s) => s.teamMembers)
  const sales = useDb((s) => s.sales)
  const notes = useDb((s) => s.clientNotes)
  const resources = useDb((s) => s.resources)
  const calendarSettings = useDb((s) => s.settings.calendar)
  const statuses = useDb((s) => s.settings.appointmentStatuses)

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const servicesById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const salesById = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales])
  const notedAppointments = useMemo(() => new Set(notes.filter((n) => n.appointmentId).map((n) => n.appointmentId!)), [notes])
  const tones = useMemo<ToneLookups>(() => {
    const categoryColor = new Map(categories.map((c) => [c.id, c.color]))
    return {
      colorSource: calendarSettings.colorSource,
      statusColors: new Map(statuses.map((s) => [s.id, s.color] as [string, PaletteColor])),
      categoryColorOfService: new Map(services.map((s) => [s.id, categoryColor.get(s.categoryId) ?? 'blue'])),
      memberColor: new Map(members.map((m) => [m.id, m.color])),
      resourceColor: new Map(resources.map((r) => [r.id, r.color])),
    }
  }, [categories, calendarSettings.colorSource, statuses, services, members, resources])

  // One object per data change, so memoised grid columns don't re-render on every page render.
  return useMemo(() => ({ clientsById, servicesById, membersById, salesById, notedAppointments, tones }), [clientsById, servicesById, membersById, salesById, notedAppointments, tones])
}

export type Lookups = ReturnType<typeof useLookups>

export function usePaymentsActive(): boolean {
  return useDb((s) => s.addOns.find((a) => a.slug === 'payments')?.status === 'active')
}

/** A callback with a stable identity that always runs the latest closure (keeps memoised children stable). */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}
