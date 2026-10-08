import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ChevronLeft, ChevronRight, Lightbulb, Pencil, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { ClosedPeriod, ID, TeamMember, TimeOff, TimeRange } from '@/types'
import { useDb } from '@/store/db'
import { useDrawer } from '@/lib/drawer'
import { todayISO } from '@/lib/time'
import { Button, Checkbox, Field, Menu, MenuButton, Modal, Page, PageHeader, PageSkeleton, SearchInput, Select, Toolbar, confirm, toast, usePageLoading, type MenuGroup } from '@/components/ui'
import { assignLocationMembers, deleteAllShifts, deleteTimeOff, saveDayShifts, unassignFromLocation } from '@/api/team'
import { MemberAvatar, MiniCalendar, Popover, PortalMenu, SortMenu } from '../components/common'
import { ClosedPeriodModal } from '../components/ClosedPeriodModal'
import { EditDayModal, type EditDayTarget } from '../components/EditDayModal'
import { TimeOffModal } from '../components/TimeOffModal'
import { memberName, sortMembers } from '../lib/members'
import { dayCell, fmtDayUS, hoursLabel, rangeLabel, shiftDate, weekDays, weekStart, type DayCell } from '../lib/shifts'

const SHIFT_SORTS = ['custom', 'shiftsDesc', 'shiftsAsc', 'hoursDesc', 'hoursAsc', 'nameAsc', 'nameDesc', 'surnameAsc', 'surnameDesc'] as const
type ShiftSort = (typeof SHIFT_SORTS)[number]

interface Row {
  member: TeamMember
  cells: DayCell[]
  minutes: number
  shifts: number
}

/** Scheduled shifts roster (team.md §4). */
export function ScheduledShiftsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const loading = usePageLoading()
  const [params, setParams] = useSearchParams()
  const data = useDb(useShallow((s) => ({ teamMembers: s.teamMembers, locations: s.locations, shiftPatterns: s.shiftPatterns, shiftOverrides: s.shiftOverrides, closedPeriods: s.closedPeriods, timeOff: s.timeOff, timeOffTypes: s.settings.timeOffTypes })))
  const locationId = params.get('locationId') ?? data.locations[0]?.id ?? ''
  const location = data.locations.find((l) => l.id === locationId)
  const date = params.get('date') ?? todayISO()
  const start = weekStart(date)
  const days = weekDays(start)
  const singleId = params.get('variant') === 'team_member' ? params.get('teamMemberId') : null
  const [sort, setSort] = useState<ShiftSort>('custom')

  const [timeOffModal, setTimeOffModal] = useState<{ memberId?: ID | null; date?: string; timeOff?: TimeOff | null } | null>(null)
  const [editDay, setEditDay] = useState<EditDayTarget | null>(null)
  const [closed, setClosed] = useState<{ date?: string; period?: ClosedPeriod | null } | null>(null)
  const [changeOpen, setChangeOpen] = useState(false)
  const [deleteAllFor, setDeleteAllFor] = useState<TeamMember | null>(null)

  const timeOffParam = params.get('d_timeoff')
  const setParam = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
      return next
    })

  const rows: Row[] = useMemo(() => {
    const members = data.teamMembers.filter((m) => !m.archived && m.locationIds.includes(locationId) && (!singleId || m.id === singleId))
    const list = members.map((member) => {
      const cells = days.map((d) => dayCell(data, member.id, locationId, d))
      return { member, cells, minutes: cells.reduce((s, c) => s + c.minutes, 0), shifts: cells.filter((c) => c.minutes > 0).length }
    })
    const base = sortMembers(
      list.map((r) => r.member),
      sort === 'nameAsc' || sort === 'nameDesc' || sort === 'surnameAsc' || sort === 'surnameDesc' ? sort : 'custom',
    )
    const ordered = base.map((m) => list.find((r) => r.member.id === m.id)!)
    if (sort === 'shiftsDesc') return [...ordered].sort((a, b) => b.shifts - a.shifts)
    if (sort === 'shiftsAsc') return [...ordered].sort((a, b) => a.shifts - b.shifts)
    if (sort === 'hoursDesc') return [...ordered].sort((a, b) => b.minutes - a.minutes)
    if (sort === 'hoursAsc') return [...ordered].sort((a, b) => a.minutes - b.minutes)
    return ordered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, locationId, start, singleId, sort])

  const dayTotals = days.map((_, i) => rows.reduce((s, r) => s + r.cells[i].minutes, 0))
  const singleMember = singleId ? data.teamMembers.find((m) => m.id === singleId) : undefined
  const repeatLink = (memberId: ID, d: string) => `/team/scheduled-shifts/working-hours-setup/${locationId}/${memberId}/${d}`

  const typeName = (id: ID) => data.timeOffTypes.find((x) => x.id === id)?.name ?? t('team.timeOff.title')

  const removeTimeOff = async (off: TimeOff) => {
    const ok = await confirm({ title: t('team.timeOff.deleteTitle'), body: t('team.timeOff.deleteBody', { date: fmtDayUS(off.startDate), start: off.startTime, end: off.endTime }), confirmLabel: t('team.common.delete'), tone: 'danger' })
    if (!ok) return
    await deleteTimeOff(off.id)
    toast(t('team.timeOff.toastDeleted'))
  }
  const deleteShift = async (member: TeamMember, d: string) => {
    const ok = await confirm({ title: t('team.shifts.deleteShiftTitle'), body: t('team.shifts.deleteShiftBody', { date: format(parseISO(d), 'EEE, MMM d') }), confirmLabel: t('team.common.delete'), tone: 'danger' })
    if (!ok) return
    await saveDayShifts(member.id, locationId, d, [])
    toast(t('team.shifts.toastShiftDeleted'))
  }

  const memberMenu = (m: TeamMember): MenuGroup[] => [
    {
      heading: t('team.shifts.menu.schedule'),
      items: [
        { label: t('team.shifts.menu.repeating'), onSelect: () => navigate(repeatLink(m.id, start)) },
        {
          label: t('team.shifts.menu.unassign'),
          onSelect: async () => {
            await unassignFromLocation(m.id, locationId)
            toast(t('team.shifts.toastAssignment'))
          },
        },
        { label: t('team.shifts.menu.deleteAll'), danger: true, onSelect: () => setDeleteAllFor(m) },
      ],
    },
    {
      heading: t('team.shifts.menu.member'),
      items: [
        { label: t('team.shifts.menu.view'), onSelect: () => drawer.open('team-member', { id: m.id, tab: 'overview' }) },
        { label: t('team.shifts.menu.edit'), onSelect: () => navigate(`/team/team-members/edit/${m.id}`) },
      ],
    },
  ]
  const emptyMenu = (m: TeamMember, d: string): MenuGroup[] => [
    {
      items: [
        { label: t('team.shifts.menu.addShift'), onSelect: () => setEditDay({ memberId: m.id, locationId, date: d, ranges: [] }) },
        { label: t('team.shifts.menu.repeating'), onSelect: () => navigate(repeatLink(m.id, d)) },
        { label: t('team.shifts.menu.addTimeOff'), onSelect: () => setTimeOffModal({ memberId: m.id, date: d }) },
      ],
    },
  ]
  const shiftMenu = (m: TeamMember, cell: DayCell): MenuGroup[] => [
    {
      items: [
        { label: t('team.shifts.menu.editDay'), onSelect: () => setEditDay({ memberId: m.id, locationId, date: cell.date, ranges: cell.shifts }) },
        { label: t('team.shifts.menu.repeating'), onSelect: () => navigate(repeatLink(m.id, cell.date)) },
        { label: t('team.shifts.menu.addTimeOff'), onSelect: () => setTimeOffModal({ memberId: m.id, date: cell.date }) },
        { label: t('team.shifts.menu.deleteShift'), danger: true, onSelect: () => void deleteShift(m, cell.date) },
      ],
    },
  ]
  const offMenu = (off: TimeOff): MenuGroup[] => [
    {
      items: [
        { label: t('team.shifts.menu.editTimeOff'), onSelect: () => setTimeOffModal({ timeOff: off }) },
        { label: t('team.shifts.menu.deleteTimeOff'), danger: true, onSelect: () => void removeTimeOff(off) },
      ],
    },
  ]

  if (loading) return <Page wide><PageSkeleton /></Page>

  const pill = (range: TimeRange) => `${range.start} - ${range.end}`

  return (
    <Page wide>
      <PageHeader
        title={t('team.shifts.title')}
        actions={
          <>
            <Menu
              align="right"
              groups={[{ items: [{ label: t('team.shifts.options.settings'), onSelect: () => navigate('/setup/team/shifts') }] }]}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle}>
                  {t('team.common.options')}
                </MenuButton>
              )}
            />
            <Menu
              align="right"
              groups={[
                {
                  items: [
                    { label: t('team.shifts.add.timeOff'), onSelect: () => setTimeOffModal({ memberId: singleId ?? rows[0]?.member.id, date: todayISO() >= start && todayISO() <= days[6] ? todayISO() : start }) },
                    { label: t('team.shifts.add.member'), onSelect: () => navigate('/team/team-members/add') },
                    { label: t('team.shifts.add.closed'), onSelect: () => navigate('/setup/scheduling/closed-periods') },
                  ],
                },
              ]}
              trigger={({ open, toggle }) => (
                <MenuButton open={open} toggle={toggle} primary>
                  {t('team.common.add')}
                </MenuButton>
              )}
            />
          </>
        }
      />

      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SortMenu value={sort} onChange={setSort} options={SHIFT_SORTS.map((s) => ({ value: s, label: t(`team.shifts.sort.${s}`) }))} />
          {data.locations.length > 1 && (
            <Select aria-label={t('team.shifts.location')} value={locationId} onChange={(e) => setParam({ locationId: e.target.value })} options={data.locations.map((l) => ({ value: l.id, label: l.name }))} className="h-10 w-auto rounded-full" />
          )}
          {singleMember && (
            <span className="chip h-10 gap-2 bg-primary-subtle px-4 text-body-strong text-primary">
              {memberName(singleMember)}
              <button type="button" aria-label={t('team.shifts.showAll')} title={t('team.shifts.showAll')} onClick={() => setParam({ variant: null, teamMemberId: null })} className="rounded-full p-0.5 hover:bg-primary/10">
                <X size={14} />
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button className="rounded-full" onClick={() => setParam({ date: todayISO() })}>
            {t('team.shifts.thisWeek')}
          </Button>
          <div className="flex items-center rounded-full border border-line-strong bg-surface">
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-l-full hover:bg-sunken" aria-label={t('team.shifts.prevWeek')} onClick={() => setParam({ date: shiftDate(start, -7) })}>
              <ChevronLeft size={18} />
            </button>
            <Popover
              align="right"
              trigger={({ open, toggle }) => (
                <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={toggle} className="h-10 border-x border-line-strong px-4 text-body-strong text-ink hover:bg-sunken">
                  {rangeLabel(start, days[6])}
                </button>
              )}
            >
              {(close) => (
                <MiniCalendar
                  value={date}
                  highlightWeek
                  onPick={(d) => {
                    setParam({ date: d })
                    close()
                  }}
                />
              )}
            </Popover>
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-r-full hover:bg-sunken" aria-label={t('team.shifts.nextWeek')} onClick={() => setParam({ date: shiftDate(start, 7) })}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Toolbar>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[1040px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="w-[250px] px-4 py-3 text-left text-body-strong text-ink">
                {t('team.shifts.memberCol')}{' '}
                <button type="button" className="text-primary hover:underline" onClick={() => setChangeOpen(true)}>
                  {t('team.common.change')}
                </button>
              </th>
              {days.map((d, i) => {
                const closedDay = data.closedPeriods.find((p) => p.startDate <= d && d <= p.endDate && (p.locationIds.length === 0 || p.locationIds.includes(locationId)))
                return (
                  <th key={d} className="px-1 py-2">
                    <button
                      type="button"
                      onClick={() => setClosed({ date: d, period: closedDay ?? null })}
                      title={closedDay ? t('team.closed.editTitle', { location: location?.name ?? '' }) : t('team.closed.addTitle', { location: location?.name ?? '' })}
                      className={clsx('w-full rounded-md px-2 py-1.5 text-center hover:bg-sunken', d === todayISO() && 'bg-primary-subtle/60')}
                    >
                      <span className="block text-body-strong text-ink">{format(parseISO(d), 'EEE, MMM d')}</span>
                      <span className="block text-small font-normal text-muted">{hoursLabel(dayTotals[i])}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, cells, minutes }) => (
              <tr key={member.id} className="border-b border-line align-top last:border-0">
                <td className="border-r border-line p-2">
                  <PortalMenu
                    align="left"
                    width={260}
                    groups={memberMenu(member)}
                    trigger={({ toggle, open }) => (
                      <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="group flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-sunken">
                        <MemberAvatar member={member} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-strong text-ink">{memberName(member)}</span>
                          <span className="block text-small text-muted">{hoursLabel(minutes)}</span>
                        </span>
                        <Pencil size={16} className="text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                      </button>
                    )}
                  />
                </td>
                {cells.map((cell) => (
                  <td key={cell.date} className="border-r border-line p-1.5 last:border-r-0">
                    <div className="flex min-h-[64px] flex-col gap-1.5">
                      {cell.closed ? (
                        <button type="button" onClick={() => setClosed({ date: cell.date, period: cell.closed })} className="rounded-md bg-sunken px-2 py-2 text-center text-small text-muted hover:ring-1 hover:ring-line-strong">
                          {cell.closed.description}
                        </button>
                      ) : (
                        <>
                          {cell.timeOff.map((off) => (
                            <PortalMenu
                              key={off.id}
                              width={200}
                              align="left"
                              groups={offMenu(off)}
                              trigger={({ toggle, open }) => (
                                <button
                                  type="button"
                                  onClick={toggle}
                                  aria-haspopup="menu"
                                  aria-expanded={open}
                                  className="w-full rounded-md px-2 py-1.5 text-center text-small text-ink hover:ring-1 hover:ring-line-strong"
                                  style={{ background: 'repeating-linear-gradient(135deg, rgb(var(--surface-sunken)) 0 6px, rgb(var(--border)) 6px 8px)' }}
                                >
                                  <span className="block font-semibold">{typeName(off.typeId)}</span>
                                  <span className="block">
                                    {off.startTime} - {off.endTime}
                                  </span>
                                </button>
                              )}
                            />
                          ))}
                          {(cell.timeOff.length ? cell.remaining : cell.shifts).map((r) => (
                            <PortalMenu
                              key={`${r.start}-${r.end}`}
                              width={220}
                              align="left"
                              groups={shiftMenu(member, cell)}
                              trigger={({ toggle, open }) => (
                                <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="w-full rounded-md bg-primary-subtle px-2 py-2 text-center text-small font-medium text-primary hover:ring-1 hover:ring-primary">
                                  {pill(r)}
                                </button>
                              )}
                            />
                          ))}
                          {!cell.shifts.length && !cell.timeOff.length && (
                            <PortalMenu
                              width={220}
                              align="left"
                              groups={emptyMenu(member, cell.date)}
                              trigger={({ toggle, open }) => (
                                <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={t('team.shifts.addFor', { name: memberName(member), date: fmtDayUS(cell.date) })} className="group flex min-h-[40px] w-full items-center justify-center rounded-md text-small text-subtle hover:bg-sunken">
                                  <span className="group-hover:hidden">{t('team.shifts.notWorking')}</span>
                                  <Plus size={18} className="hidden text-primary group-hover:block" aria-hidden />
                                </button>
                              )}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="font-display text-title-3 text-ink">{t('team.shifts.emptyTitle')}</p>
            <p className="mt-1 text-body text-muted">{t('team.shifts.emptyBody', { location: location?.name ?? '' })}</p>
            <Button className="mt-4" variant="primary" onClick={() => setChangeOpen(true)}>
              {t('team.shifts.assign')}
            </Button>
          </div>
        )}
      </div>

      <p className="mt-6 flex items-center gap-3 rounded-lg border border-line bg-surface px-5 py-4 text-body text-ink">
        <Lightbulb size={18} className="shrink-0 text-warning" aria-hidden />
        <span>
          {t('team.shifts.tip')}{' '}
          <button type="button" className="text-primary hover:underline" onClick={() => navigate('/setup/business-setup/location-details')}>
            {t('team.shifts.clickHere')}
          </button>
        </span>
      </p>

      <TimeOffModal open={timeOffModal !== null || Boolean(timeOffParam)} memberId={timeOffModal?.memberId ?? timeOffParam} date={timeOffModal?.date} timeOff={timeOffModal?.timeOff} onClose={() => (timeOffModal ? setTimeOffModal(null) : setParam({ d_timeoff: null }))} />
      <EditDayModal target={editDay} onClose={() => setEditDay(null)} />
      <ClosedPeriodModal open={closed !== null} locationId={locationId} date={closed?.date} period={closed?.period} onClose={() => setClosed(null)} />
      <AssignModal open={changeOpen} onClose={() => setChangeOpen(false)} locationId={locationId} />
      <DeleteAllModal member={deleteAllFor} locationId={locationId} defaultFrom={start} onClose={() => setDeleteAllFor(null)} />
    </Page>
  )
}

/** "Team members at <location>" (team.md §4.1, team-35). */
function AssignModal({ open, onClose, locationId }: { open: boolean; onClose: () => void; locationId: ID }) {
  if (!open) return null
  return <AssignForm onClose={onClose} locationId={locationId} />
}

function AssignForm({ onClose, locationId }: { onClose: () => void; locationId: ID }) {
  const { t } = useTranslation()
  const { teamMembers, location } = useDb(useShallow((s) => ({ teamMembers: s.teamMembers, location: s.locations.find((l) => l.id === locationId) })))
  const members = useMemo(() => sortMembers(teamMembers.filter((m) => !m.archived), 'custom'), [teamMembers])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(members.filter((m) => m.locationIds.includes(locationId)).map((m) => m.id)))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const visible = members.filter((m) => `${memberName(m)} ${m.jobTitle}`.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const apply = async () => {
    setBusy(true)
    await assignLocationMembers(locationId, [...selected])
    setBusy(false)
    toast(t('team.shifts.toastAssignment'))
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('team.shifts.assignTitle', { location: location?.name ?? '' })}
      subtitle={t('team.shifts.assignBody')}
      footer={
        <>
          <span className="mr-auto text-body text-muted">{t('team.shifts.selected', { count: selected.size })}</span>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={apply}>
            {t('team.common.apply')}
          </Button>
        </>
      }
    >
      <SearchInput value={q} onChange={setQ} placeholder={t('team.list.search')} className="mb-3" />
      <div className="flex items-center justify-between border-b border-line py-3">
        <Checkbox label={<span className="font-semibold">{t('team.shifts.allMembers')}</span>} checked={members.length > 0 && members.every((m) => selected.has(m.id))} onChange={(v) => setSelected(new Set(v ? members.map((m) => m.id) : []))} />
        <span className="chip bg-sunken text-muted">{members.length}</span>
      </div>
      <ul className="flex flex-col pb-2">
        {visible.map((m) => (
          <li key={m.id} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
            <input type="checkbox" aria-label={memberName(m)} checked={selected.has(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} className="h-5 w-5 accent-[rgb(var(--primary))]" />
            <MemberAvatar member={m} size={36} />
            <span className="min-w-0">
              <span className="block text-body-strong text-ink">{memberName(m)}</span>
              <span className="block text-small text-muted">{m.jobTitle}</span>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** "Delete all shifts" with a From date (team.md §4.4, team-57). */
function DeleteAllModal({ member, locationId, defaultFrom, onClose }: { member: TeamMember | null; locationId: ID; defaultFrom: string; onClose: () => void }) {
  if (!member) return null
  return <DeleteAllForm member={member} locationId={locationId} defaultFrom={defaultFrom} onClose={onClose} />
}

function DeleteAllForm({ member, locationId, defaultFrom, onClose }: { member: TeamMember; locationId: ID; defaultFrom: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(defaultFrom)
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={t('team.shifts.deleteAllTitle')}
      subtitle={t('team.shifts.deleteAllBody', { name: memberName(member) })}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!from}
            onClick={async () => {
              setBusy(true)
              await deleteAllShifts(member.id, locationId, from)
              setBusy(false)
              toast(t('team.shifts.toastDeletedAll'))
              onClose()
            }}
          >
            {t('team.common.delete')}
          </Button>
        </>
      }
    >
      <Field label={t('team.shifts.from')}>{(id) => <input id={id} type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
    </Modal>
  )
}
