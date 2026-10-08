import clsx from 'clsx'
import { format, isSameMonth, parseISO } from 'date-fns'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui'
import { useDb } from '@/store/db'
import type { Appointment, BlockedTime, ID, ISODate, TeamMember } from '@/types'
import { closedPeriodOn, workingWindows } from '@/lib/schedule'
import { fullName } from '@/lib/format'
import { todayISO, weekdayOf } from '@/lib/time'
import { AppointmentChip, apptEnd, apptStart } from './blocks'
import { HATCH, type GridMode } from './DayView'
import { useScheduleData, type Lookups } from './hooks'
import { BLOCKED_TONE, memberName, toneFor } from './lib'

interface MultiDayProps {
  days: ISODate[]
  members: TeamMember[]
  locationId: ID
  byDate: Map<ISODate, Appointment[]>
  blockedByDate: Map<ISODate, BlockedTime[]>
  lookups: Lookups
  mode: GridMode
  selectedIds: Set<string>
  showRange: boolean
  onAppointment: (appt: Appointment) => void
  onBlocked: (block: BlockedTime) => void
  onCell: (memberId: ID, date: ISODate) => void
  onDay: (date: ISODate) => void
}

type CellEntry = { kind: 'appt'; start: string; appt: Appointment } | { kind: 'block'; start: string; block: BlockedTime }

/** 3 day and Week views: rows = team members, columns = days, compact chips. */
export function MultiDayView(p: MultiDayProps) {
  const { t } = useTranslation()
  const schedule = useScheduleData()
  const btTypes = useDb((s) => s.blockedTimeTypes)
  const today = todayISO()

  const rows = useMemo(
    () =>
      p.members.map((m) => {
        const cells = p.days.map((date) => {
          const appts = (p.byDate.get(date) ?? []).filter((a) => a.items.some((i) => i.teamMemberId === m.id))
          const blocks = (p.blockedByDate.get(date) ?? []).filter((b) => b.teamMemberId === m.id)
          const entries: CellEntry[] = [
            ...appts.map((appt) => ({ kind: 'appt' as const, start: (appt.items.find((i) => i.teamMemberId === m.id) ?? appt.items[0]).start, appt })),
            ...blocks.map((block) => ({ kind: 'block' as const, start: block.start, block })),
          ].sort((a, b) => a.start.localeCompare(b.start))
          const working = workingWindows(schedule, m.id, date, p.locationId).length > 0
          return { date, entries, working }
        })
        const most = Math.max(0, ...cells.map((c) => c.entries.length))
        return { member: m, cells, height: Math.max(150, most * 32 + 20) }
      }),
    [p.members, p.days, p.byDate, p.blockedByDate, schedule, p.locationId],
  )

  return (
    <div className="h-full overflow-auto" data-testid="calendar-range-view">
      <div className="grid min-w-full" style={{ gridTemplateColumns: `110px repeat(${p.days.length}, minmax(${p.days.length > 3 ? 150 : 220}px, 1fr))` }}>
        <div className="sticky left-0 top-0 z-30 border-b border-line bg-surface" />
        {p.days.map((date) => {
          const d = parseISO(date)
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              onClick={() => p.onDay(date)}
              className={clsx('sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface px-4 py-5 text-left text-body-lg hover:bg-sunken', date < today ? 'text-subtle' : 'text-ink')}
            >
              <span className={clsx('flex h-9 min-w-9 items-center justify-center rounded-full px-1 tabular', isToday && 'bg-primary font-semibold text-on-primary')}>{d.getDate()}</span>
              <span className={clsx(isToday && 'font-semibold text-primary')}>{format(d, 'EEEE')}</span>
            </button>
          )
        })}
        {rows.map((row) => (
          <Row key={row.member.id}>
            <div className="sticky left-0 z-10 flex flex-col items-center justify-center gap-1.5 border-b border-r border-line bg-surface px-2 text-center" style={{ minHeight: row.height }}>
              <span className="rounded-full p-0.5 ring-2 ring-info-subtle">
                <Avatar name={memberName(row.member)} color={row.member.color} size={48} />
              </span>
              <span className="line-clamp-2 text-small font-semibold text-ink">{memberName(row.member)}</span>
            </div>
            {row.cells.map((cell) => (
              <div
                key={cell.date}
                role="button"
                tabIndex={-1}
                onClick={() => p.onCell(row.member.id, cell.date)}
                className="flex cursor-pointer flex-col gap-1 border-b border-l border-line p-1.5 hover:bg-primary-subtle/40"
                style={{ minHeight: row.height, ...(cell.working ? {} : { backgroundImage: HATCH }) }}
                aria-label={t('calendar.grid.cellLabel', { name: memberName(row.member), date: format(parseISO(cell.date), 'EEE d MMM') })}
              >
                {cell.entries.map((entry) => {
                  if (entry.kind === 'block') {
                    const b = entry.block
                    const type = btTypes.find((x) => x.id === b.typeId)
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          p.onBlocked(b)
                        }}
                        className={clsx('flex h-7 w-full shrink-0 items-center truncate rounded-xs px-1.5 text-left text-small', p.mode !== 'normal' && 'pointer-events-none opacity-40')}
                        style={{ background: BLOCKED_TONE.fill, color: BLOCKED_TONE.text }}
                      >
                        <span className="truncate tabular">
                          {p.showRange ? `${b.start} - ${b.end}` : b.start} <b>{b.title || type?.name}</b> {type?.emoji}
                        </span>
                      </button>
                    )
                  }
                  const appt = entry.appt
                  const item = appt.items.find((i) => i.teamMemberId === row.member.id) ?? appt.items[0]
                  const name = fullName(appt.clientId ? p.lookups.clientsById.get(appt.clientId) : undefined, t('calendar.walkIn'))
                  return (
                    <AppointmentChip
                      key={appt.id}
                      appt={appt}
                      lookups={p.lookups}
                      tone={toneFor(appt, item, p.lookups.tones)}
                      faded={p.mode === 'pick' && !p.selectedIds.has(appt.id)}
                      selected={p.selectedIds.has(appt.id)}
                      onClick={() => p.onAppointment(appt)}
                      label={
                        <>
                          {p.showRange ? `${item.start} - ${apptEnd(appt)}` : item.start} <b>{name}</b>
                        </>
                      }
                    />
                  )
                })}
              </div>
            ))}
          </Row>
        ))}
      </div>
    </div>
  )
}

function Row({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>
}

interface MonthProps {
  date: ISODate
  days: ISODate[]
  memberIds: Set<ID>
  locationId: ID
  byDate: Map<ISODate, Appointment[]>
  lookups: Lookups
  mode: GridMode
  selectedIds: Set<string>
  onAppointment: (appt: Appointment) => void
  onDay: (date: ISODate) => void
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MAX_CHIPS = 3

/** Month view: Monday-first grid, closed days hatched, chips per appointment. */
export function MonthView(p: MonthProps) {
  const { t } = useTranslation()
  const location = useDb((s) => s.locations.find((l) => l.id === p.locationId))
  const closedPeriods = useDb((s) => s.closedPeriods)
  const today = todayISO()
  const month = parseISO(p.date)
  const weeks = Math.ceil(p.days.length / 7)

  return (
    <div className="flex h-full flex-col overflow-auto" data-testid="calendar-month-view">
      <div className="grid shrink-0 grid-cols-7 border-b border-line bg-surface">
        {WEEKDAY_NAMES.map((d) => (
          <span key={d} className="px-3 py-3 text-body text-ink">
            {t(`calendar.weekdays.${d.toLowerCase()}`)}
          </span>
        ))}
      </div>
      <div className="grid shrink-0 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(150px, auto))` }}>
        {p.days.map((date) => {
          const d = parseISO(date)
          const inMonth = isSameMonth(d, month)
          const openDay = location?.openingHours[weekdayOf(date)]?.open && !closedPeriodOn(closedPeriods, date, p.locationId)
          const appts = (p.byDate.get(date) ?? []).filter((a) => a.items.some((i) => p.memberIds.has(i.teamMemberId))).sort((a, b) => apptStart(a).localeCompare(apptStart(b)))
          const shown = appts.slice(0, MAX_CHIPS)
          return (
            <div
              key={date}
              role="button"
              tabIndex={-1}
              onClick={() => p.onDay(date)}
              className="flex min-w-0 cursor-pointer flex-col gap-1 border-b border-l border-line p-1.5 hover:bg-primary-subtle/30"
              style={!inMonth || !openDay ? { backgroundImage: HATCH } : undefined}
            >
              <span className={clsx('flex h-6 min-w-6 items-center self-start rounded-full px-1.5 text-small font-semibold tabular', date === today ? 'bg-primary text-on-primary' : inMonth ? 'text-ink' : 'text-subtle')}>
                {d.getDate() === 1 ? format(d, 'd MMMM') : d.getDate()}
              </span>
              {shown.map((appt) => {
                const item = appt.items[0]
                return (
                  <AppointmentChip
                    key={appt.id}
                    appt={appt}
                    lookups={p.lookups}
                    tone={toneFor(appt, item, p.lookups.tones)}
                    faded={p.mode === 'pick' && !p.selectedIds.has(appt.id)}
                    selected={p.selectedIds.has(appt.id)}
                    onClick={() => p.onAppointment(appt)}
                    label={
                      <>
                        {item.start} <b>{fullName(appt.clientId ? p.lookups.clientsById.get(appt.clientId) : undefined, t('calendar.walkIn'))}</b>
                      </>
                    }
                  />
                )
              })}
              {appts.length > MAX_CHIPS && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    p.onDay(date)
                  }}
                  className="self-start rounded-xs px-1.5 text-small font-semibold text-primary hover:underline"
                >
                  {t('calendar.grid.more', { count: appts.length - MAX_CHIPS })}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
