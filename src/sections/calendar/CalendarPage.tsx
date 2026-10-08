import clsx from 'clsx'
import { CalendarPlus, CalendarX2, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Skeleton, toast, usePageLoading } from '@/components/ui'
import { addToGroup, removeFromGroup } from '@/api/appointments'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { useDismiss } from '@/lib/useDismiss'
import { clientStats, clientsInSegment } from '@/lib/segments'
import { workingWindows } from '@/lib/schedule'
import { now, todayISO } from '@/lib/time'
import type { Appointment, BlockedTime, ID, ISODate, TeamMember } from '@/types'
import { DayView, type MemberAction, type PendingMove } from './DayView'
import { MonthView, MultiDayView } from './RangeViews'
import { CalendarToolbar, type AddAction } from './Toolbar'
import { UpdateAppointmentModal } from './UpdateAppointmentModal'
import { TEAM_PARAM, useCalendarParams, useLocationMembers, useLookups, useScheduleData, useStableCallback } from './hooks'
import { EMPTY_FILTERS, activeFilterCount, appointmentMatches, blockedTimeVisible, isCalView, parseTeam, teamValue, viewDays } from './lib'
import { useCalendarUi, type MinimizedDrawer } from './store'
import { ClientAvatar, CountBadge } from './ui'

export type PickMode =
  | { kind: 'book' }
  | { kind: 'waitlist'; entryId: ID }
  | { kind: 'reschedule'; appointmentId: ID }
  | { kind: 'rebook'; appointmentId: ID }
  | { kind: 'group'; groupId: ID | 'new' }
  | { kind: 'add-to-group'; groupId: ID | 'new'; sourceId?: ID }
  | { kind: 'blocked' }

const PICK_ONLY_PARAMS = ['group_id', 'source']

/** Reopen a drawer kept by minimise or by the client drawer stacked on top. */
export function restoreDrawer(open: ReturnType<typeof useDrawer>['open'], entry: MinimizedDrawer) {
  if (entry.kind === 'appointment') open('appointment', { id: entry.id, d_resume: useCalendarUi.getState().draft?.editingId === entry.id ? '1' : undefined })
  else open('new-appointment', { d_resume: '1' })
}

/** The calendar (calendar.md §1–6) and its pick modes (§7, §5.1, §9, §11, §12, §13). */
export function CalendarPage({ pick }: { pick?: PickMode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const { params, date, view, locationId, team, patch } = useCalendarParams()
  const lookups = useLookups()
  const schedule = useScheduleData()
  const appointments = useDb((s) => s.appointments)
  const blockedTimes = useDb((s) => s.blockedTimes)
  const waitlist = useDb((s) => s.waitlist)
  const groups = useDb((s) => s.groups)
  const clients = useDb((s) => s.clients)
  const sales = useDb((s) => s.sales)
  const clientPackages = useDb((s) => s.clientPackages)
  const clientMemberships = useDb((s) => s.clientMemberships)
  const giftCards = useDb((s) => s.giftCards)
  const segments = useDb((s) => s.segments)
  const zoom = useDb((s) => s.settings.calendarZoom)
  const quickActions = useDb((s) => s.settings.quickActions)
  const filters = useCalendarUi((s) => s.filters)
  const setFilters = useCalendarUi((s) => s.setFilters)
  const minimized = useCalendarUi((s) => s.minimized)
  const focus = useCalendarUi((s) => s.focus)
  const locationMembers = useLocationMembers(locationId)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const [quick, setQuick] = useState<{ memberId: ID; date: ISODate; time: string; x: number; y: number } | null>(null)

  // Fill in missing URL state (and the location of an appointment opened from a link).
  useEffect(() => {
    const values: Record<string, string> = {}
    if (!params.get('date')) values.date = date
    if (!isCalView(params.get('view'))) values.view = view
    if (!params.get('location_id')) {
      const linked = params.get('drawer') === 'appointment' ? appointments.find((a) => a.id === params.get('id')) : undefined
      values.location_id = linked?.locationId ?? locationId
      if (linked && !params.get('date')) values.date = linked.date
    }
    if (!params.get(TEAM_PARAM)) values[TEAM_PARAM] = pick && pick.kind !== 'group' && pick.kind !== 'add-to-group' ? 'e-working' : 'e-all'
    if (Object.keys(values).length) patch(values)
  }, [params, date, view, locationId, appointments, pick, patch])

  // "Focus appointment" from a drawer jumps to its day.
  useEffect(() => {
    if (focus && focus.date !== params.get('date')) patch({ date: focus.date, view: 'day' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  // The client drawer opens on top of an appointment drawer: closing it brings that one back.
  const previousDrawer = useRef(drawer.name)
  useEffect(() => {
    const previous = previousDrawer.current
    previousDrawer.current = drawer.name
    const ui = useCalendarUi.getState()
    const stacked = ui.stacked
    if (!stacked || drawer.name === 'client') return
    ui.setStacked(null)
    if (previous === 'client' && !drawer.name) restoreDrawer(drawer.open, stacked)
    else if (stacked.kind === 'new-appointment' || ui.draft?.editingId) ui.setDraft(null)
  }, [drawer.name, drawer.open])

  const days = useMemo(() => viewDays(view, date), [view, date])
  const dayKey = days.join(',')

  const visible = useMemo(() => {
    const set = new Set(dayKey.split(','))
    return appointments.filter((a) => a.locationId === locationId && set.has(a.date) && a.status !== 'cancelled')
  }, [appointments, locationId, dayKey])

  const segmentClients = useMemo(() => {
    if (!filters.segments.length) return null
    const data = { clients, appointments, sales, clientPackages, clientMemberships, giftCards }
    const stats = clientStats(data)
    const ids = new Set<ID>()
    segments.filter((s) => filters.segments.includes(s.id)).forEach((s) => clientsInSegment(data, s, stats).forEach((c) => ids.add(c.id)))
    return ids
  }, [filters.segments, segments, clients, appointments, sales, clientPackages, clientMemberships, giftCards])

  const filtered = useMemo(() => {
    const ctx = { now: now(), salesById: lookups.salesById, segmentClients }
    const onlyBlocked = filters.type.length > 0 && filters.type.every((x) => x === 'blocked')
    return onlyBlocked ? [] : visible.filter((a) => appointmentMatches(a, filters, ctx))
  }, [visible, filters, lookups.salesById, segmentClients])

  const byDate = useMemo(() => {
    const map = new Map<ISODate, Appointment[]>()
    filtered.forEach((a) => {
      const list = map.get(a.date)
      if (list) list.push(a)
      else map.set(a.date, [a])
    })
    return map
  }, [filtered])

  const blockedByDate = useMemo(() => {
    const map = new Map<ISODate, BlockedTime[]>()
    if (!blockedTimeVisible(filters)) return map
    const set = new Set(dayKey.split(','))
    blockedTimes.forEach((b) => {
      if (b.locationId !== locationId || !set.has(b.date)) return
      const list = map.get(b.date)
      if (list) list.push(b)
      else map.set(b.date, [b])
    })
    return map
  }, [blockedTimes, locationId, dayKey, filters])

  // Columns / rows for the team selection.
  const parsedTeam = parseTeam(team)
  const members: TeamMember[] = useMemo(() => {
    if (parsedTeam.mode === 'working') {
      return locationMembers.filter((m) => days.some((d) => workingWindows(schedule, m.id, d, locationId).length > 0 || (byDate.get(d) ?? []).some((a) => a.items.some((i) => i.teamMemberId === m.id))))
    }
    if (parsedTeam.mode === 'custom') {
      const chosen = locationMembers.filter((m) => parsedTeam.ids.includes(m.id))
      return chosen.length ? chosen : locationMembers
    }
    return locationMembers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, locationMembers, dayKey, schedule, locationId, byDate])

  const waitlistCount = useMemo(() => waitlist.filter((w) => w.status === 'waiting' && w.preferences.some((p) => p.date >= todayISO())).length, [waitlist])
  const filterCount = activeFilterCount(filters)
  const mode = pick ? (pick.kind === 'add-to-group' ? 'select' : 'pick') : 'normal'

  // Blocks drawn with the purple selection border: the open appointment, the open group, or the source of a pick.
  const selectedKey = (() => {
    if (pick?.kind === 'reschedule' || pick?.kind === 'rebook') return pick.appointmentId
    const groupId = pick?.kind === 'add-to-group' ? pick.groupId : drawer.name === 'appointment-group' ? drawer.id : null
    if (groupId) return groups.find((g) => g.id === groupId)?.appointmentIds.join(',') ?? (pick?.kind === 'add-to-group' ? (pick.sourceId ?? '') : '')
    if (pick?.kind === 'add-to-group' && pick.sourceId) return pick.sourceId
    return drawer.name === 'appointment' ? (drawer.id ?? '') : ''
  })()
  const selectedIds = useMemo(() => new Set(selectedKey.split(',').filter(Boolean)), [selectedKey])

  /** Leave pick mode back to /calendar, optionally opening a drawer. */
  const exitTo = (extra: Record<string, string | undefined> = {}) => {
    const next = new URLSearchParams(params)
    ;[...next.keys()].filter((k) => PICK_ONLY_PARAMS.includes(k) || k === 'drawer' || k === 'id' || k === 'tab' || k.startsWith('d_')).forEach((k) => next.delete(k))
    Object.entries(extra).forEach(([k, v]) => v !== undefined && next.set(k, v))
    navigate(`/calendar?${next.toString()}`)
  }

  const pickQuery = (extra: Record<string, string> = {}) => {
    const next = new URLSearchParams({ date, view: view === 'month' ? 'day' : view, location_id: locationId, [TEAM_PARAM]: 'e-working', ...extra })
    return `?${next.toString()}`
  }

  const pickSlot = (memberId: ID, slotDate: ISODate, time: string) => {
    if (!pick) return
    const slot = { d_date: slotDate, d_time: time, d_member: memberId }
    switch (pick.kind) {
      case 'book':
        exitTo({ drawer: 'new-appointment', ...slot, d_resume: useCalendarUi.getState().draft ? '1' : undefined })
        break
      case 'waitlist': {
        const entry = waitlist.find((w) => w.id === pick.entryId)
        exitTo({ drawer: 'new-appointment', ...slot, d_client: entry?.clientId ?? undefined, d_waitlist: pick.entryId })
        break
      }
      case 'rebook': {
        const source = appointments.find((a) => a.id === pick.appointmentId)
        exitTo({ drawer: 'new-appointment', ...slot, d_client: source?.clientId ?? undefined, d_services: source?.items.map((i) => i.serviceId).join(',') })
        break
      }
      case 'group':
        exitTo({ drawer: 'new-appointment', ...slot, d_group: pick.groupId })
        break
      case 'blocked':
        exitTo({ drawer: 'blocked-time', ...slot })
        break
      case 'reschedule':
        setPending({ appointmentId: pick.appointmentId, date: slotDate, start: time, teamMemberId: memberId })
        break
      default:
        break
    }
  }

  const onSlot = useStableCallback((memberId: ID, time: string, point: { x: number; y: number }) => {
    if (pick) return pickSlot(memberId, date, time)
    if (!quickActions) return drawer.open('new-appointment', { d_date: date, d_time: time, d_member: memberId })
    setQuick({ memberId, date, time, ...point })
  })

  const addSelectedToGroup = async (appt: Appointment) => {
    if (!pick || pick.kind !== 'add-to-group') return
    if (appt.groupId && appt.groupId === pick.groupId) return toast(t('calendar.group.alreadyIn'))
    if (appt.id === pick.sourceId) return toast(t('calendar.group.alreadyIn'))
    try {
      if (appt.groupId) await removeFromGroup(appt.id)
      let groupId = pick.groupId
      if (groupId === 'new' && pick.sourceId) groupId = await addToGroup('new', pick.sourceId)
      const id = await addToGroup(groupId, appt.id)
      toast(t('calendar.toasts.addedToGroup'))
      exitTo({ drawer: 'appointment-group', id })
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    }
  }

  const onAppointment = useStableCallback((appt: Appointment) => {
    if (pick?.kind === 'add-to-group') return void addSelectedToGroup(appt)
    if (pick) return
    if (appt.groupId && groups.some((g) => g.id === appt.groupId)) drawer.open('appointment-group', { id: appt.groupId })
    else drawer.open('appointment', { id: appt.id })
  })

  const onBlocked = useStableCallback((block: BlockedTime) => {
    if (!pick) drawer.open('blocked-time', { id: block.id })
  })

  const onMove = useStableCallback((move: PendingMove) => setPending(move))

  const onMemberAction = useStableCallback((m: TeamMember, action: MemberAction) => {
    switch (action.kind) {
      case 'view':
        patch({ view: action.view, [TEAM_PARAM]: teamValue([m.id]) })
        break
      case 'appointment':
        drawer.open('new-appointment', { d_date: date, d_member: m.id })
        break
      case 'blocked': {
        const windows = workingWindows(schedule, m.id, date, locationId)
        const start = windows[0]?.[0] ?? 9 * 60
        drawer.open('blocked-time', { d_date: date, d_member: m.id, d_time: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}` })
        break
      }
      case 'shift':
        navigate('/team/scheduled-shifts')
        break
      case 'timeoff':
        navigate(`/team/scheduled-shifts?d_timeoff=${m.id}`)
        break
      case 'profile':
        drawer.open('team-member', { id: m.id })
        break
    }
  })

  const onAdd = (action: AddAction) => {
    switch (action) {
      case 'appointment':
        useCalendarUi.getState().setDraft(null)
        navigate(`/calendar/pick-from-calendar${pickQuery()}`)
        break
      case 'group':
        drawer.open('appointment-group')
        break
      case 'blocked':
        navigate(`/calendar/blocked-time${pickQuery()}`)
        break
      case 'sale':
        drawer.open('checkout', {})
        break
      case 'quick-payment':
        drawer.open('checkout', { d_mode: 'quick-payment' })
        break
    }
  }

  const onCell = (memberId: ID, cellDate: ISODate) => {
    if (pick) return patch({ date: cellDate, view: 'day' })
    drawer.open('new-appointment', { d_date: cellDate, d_member: memberId })
  }

  const closePick = () => {
    if (pick?.kind === 'book') useCalendarUi.getState().setDraft(null)
    exitTo()
  }

  const banner = pick ? (pick.kind === 'blocked' ? t('calendar.pick.block') : pick.kind === 'add-to-group' ? t('calendar.pick.selectAppointment') : t('calendar.pick.book')) : null
  // A group lives on one day, so the date can't change while picking for it.
  const lockDate = pick?.kind === 'group' || pick?.kind === 'add-to-group'

  return (
    <div className={clsx('flex flex-col bg-surface', pick ? 'fixed inset-0 z-40' : 'h-full min-h-0')} data-testid={pick ? 'calendar-pick-mode' : 'calendar-page'}>
      {pick && (
        <div className="flex h-16 shrink-0 items-center gap-4 bg-primary px-6 text-on-primary" data-testid="pick-banner">
          <span className="hidden flex-1 md:block" />
          <h1 className="font-display text-title-3">{banner}</h1>
          <div className="flex flex-1 justify-end gap-2">
            {pick.kind === 'book' ? (
              <>
                <button type="button" onClick={() => exitTo({ drawer: 'new-appointment', d_date: date, d_resume: useCalendarUi.getState().draft ? '1' : undefined })} className="h-10 rounded-full border border-white px-4 text-body-strong hover:bg-white/10">
                  {t('calendar.pick.viewTimes')}
                </button>
                <button type="button" onClick={closePick} className="h-10 rounded-full bg-white px-4 text-body-strong text-ink hover:bg-white/90">
                  {t('calendar.common.close')}
                </button>
              </>
            ) : (
              <button type="button" onClick={closePick} aria-label={t('calendar.common.close')} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15" data-testid="pick-close">
                <X size={22} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
      <CalendarToolbar
        date={date}
        view={view}
        locationId={locationId}
        team={team}
        members={locationMembers}
        filterCount={filterCount}
        waitlistCount={waitlistCount}
        pickMode={Boolean(pick)}
        lockDate={lockDate}
        onPatch={patch}
        onFilters={() => drawer.open('visibility-filters')}
        onSettings={() => drawer.open('calendar-settings')}
        onWaitlist={() => drawer.open('waitlist')}
        onAdd={onAdd}
      />
      <div className="relative min-h-0 flex-1">
        {filterCount > 0 && (
          <div className="absolute left-1/2 z-40 flex h-10 -translate-x-1/2 items-stretch overflow-hidden rounded-full border-2 border-primary bg-surface shadow-md" style={{ top: PILL_TOP[view] }} data-testid="filters-pill">
            <button type="button" onClick={() => drawer.open('visibility-filters')} className="flex items-center gap-2 pl-3 pr-4 text-body-strong text-ink hover:bg-sunken">
              <CountBadge value={filterCount} />
              {t('calendar.filters.pill')}
            </button>
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} aria-label={t('calendar.filters.clear')} title={t('calendar.filters.clear')} className="flex w-10 items-center justify-center border-l border-line hover:bg-sunken">
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
        {loading ? (
          <GridSkeleton />
        ) : view === 'day' ? (
          members.length ? (
            <DayView
              date={date}
              locationId={locationId}
              members={members}
              appointments={byDate.get(date) ?? EMPTY_APPTS}
              blocked={blockedByDate.get(date) ?? EMPTY_BLOCKS}
              pxPerHour={zoom}
              lookups={lookups}
              mode={mode}
              selectedIds={selectedIds}
              pending={pending}
              onSlot={onSlot}
              onAppointment={onAppointment}
              onBlocked={onBlocked}
              onMove={onMove}
              onMemberAction={onMemberAction}
            />
          ) : (
            <EmptyState
              icon={<UsersRound size={24} />}
              title={t('calendar.grid.nobodyTitle')}
              body={t('calendar.grid.nobodyBody')}
              action={
                <Button variant="primary" onClick={() => patch({ [TEAM_PARAM]: 'e-all' })}>
                  {t('calendar.grid.showAll')}
                </Button>
              }
            />
          )
        ) : view === 'month' ? (
          <MonthView date={date} days={days} memberIds={new Set(members.map((m) => m.id))} locationId={locationId} byDate={byDate} lookups={lookups} mode={mode} selectedIds={selectedIds} onAppointment={onAppointment} onDay={(d) => patch({ date: d, view: 'day' })} />
        ) : (
          <MultiDayView
            days={days}
            members={members}
            locationId={locationId}
            byDate={byDate}
            blockedByDate={blockedByDate}
            lookups={lookups}
            mode={mode}
            selectedIds={selectedIds}
            showRange={view === 'day_3'}
            onAppointment={onAppointment}
            onBlocked={onBlocked}
            onCell={onCell}
            onDay={(d) => patch({ date: d, view: 'day' })}
          />
        )}
      </div>
      {quick && (
        <QuickActions
          {...quick}
          onClose={() => setQuick(null)}
          onAppointment={() => drawer.open('new-appointment', { d_date: quick.date, d_time: quick.time, d_member: quick.memberId })}
          onGroup={() => drawer.open('new-appointment', { d_date: quick.date, d_time: quick.time, d_member: quick.memberId, d_group: 'new' })}
          onBlocked={() => drawer.open('blocked-time', { d_date: quick.date, d_time: quick.time, d_member: quick.memberId })}
          onSettings={() => drawer.open('calendar-settings')}
        />
      )}
      {minimized && !drawer.name && !pick && <MinimizedPill />}
      <UpdateAppointmentModal
        key={pending ? `${pending.appointmentId}-${pending.date}-${pending.start}-${pending.teamMemberId ?? ''}-${pending.resize?.durationMin ?? ''}` : 'none'}
        move={pending}
        onCancel={() => setPending(null)}
        onDone={(move) => {
          setPending(null)
          if (pick?.kind === 'reschedule') exitTo({ date: move.date })
        }}
      />
    </div>
  )
}

/** The filters pill floats at the top of the grid, just under the column headers of each view. */
const PILL_TOP: Record<string, number> = { day: 132, day_3: 84, week: 84, month: 56 }

const EMPTY_APPTS: Appointment[] = []
const EMPTY_BLOCKS: BlockedTime[] = []

function GridSkeleton() {
  return (
    <div className="flex h-full gap-3 p-4" aria-busy="true">
      <Skeleton className="h-full w-14" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-1 flex-col gap-3">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  )
}

function QuickActions({ time, x, y, onClose, onAppointment, onGroup, onBlocked, onSettings }: { time: string; x: number; y: number; onClose: () => void; onAppointment: () => void; onGroup: () => void; onBlocked: () => void; onSettings: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  useDismiss(refs, true, onClose)
  const left = Math.min(x + 8, window.innerWidth - 296)
  const top = Math.min(y + 8, window.innerHeight - 250)
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  return (
    <div ref={ref} role="dialog" aria-label={t('calendar.quick.title', { time })} className="fixed z-[60] w-[280px] overflow-hidden rounded-lg border border-line bg-raised shadow-lg" style={{ left, top }} data-testid="quick-actions">
      <div className="flex items-center justify-between bg-sunken px-4 py-2.5">
        <span className="text-body-strong text-ink tabular">{time}</span>
        <button type="button" onClick={onClose} aria-label={t('calendar.common.close')} className="icon-btn h-8 w-8">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="p-1.5">
        {[
          { label: t('calendar.quick.appointment'), icon: <CalendarPlus size={18} />, fn: onAppointment },
          { label: t('calendar.quick.group'), icon: <UsersRound size={18} />, fn: onGroup },
          { label: t('calendar.quick.blocked'), icon: <CalendarX2 size={18} />, fn: onBlocked },
        ].map((row) => (
          <button key={row.label} type="button" onClick={run(row.fn)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-body text-ink hover:bg-sunken">
            <span className="text-muted">{row.icon}</span>
            {row.label}
          </button>
        ))}
        <button type="button" onClick={run(onSettings)} className="w-full px-3 py-2.5 text-left text-body-strong text-primary hover:underline">
          {t('calendar.quick.settings')}
        </button>
      </div>
    </div>
  )
}

function MinimizedPill() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const minimized = useCalendarUi((s) => s.minimized)
  const setMinimized = useCalendarUi((s) => s.setMinimized)
  const setDraft = useCalendarUi((s) => s.setDraft)
  if (!minimized) return null
  const restore = () => {
    setMinimized(null)
    restoreDrawer(drawer.open, minimized)
  }
  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-14 w-[320px] items-center gap-3 rounded-lg bg-ink pl-3 pr-2 text-canvas shadow-lg" data-testid="minimized-drawer">
      <button type="button" onClick={restore} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t('calendar.minimized.restore', { name: minimized.label })}>
        <ClientAvatar name={minimized.label} photo={minimized.photo} size={32} />
        <span className="truncate text-body-strong">{minimized.label}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setMinimized(null)
          setDraft(null)
        }}
        aria-label={t('calendar.minimized.dismiss')}
        title={t('calendar.minimized.dismiss')}
        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}
