import clsx from 'clsx'
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core'
import { CalendarDays, ChevronDown, Columns3, LayoutGrid, Rows3 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui'
import { useIsPhone } from '@/components/ui/responsive'
import { useDb } from '@/store/db'
import type { Appointment, AppointmentItem, BlockedTime, BlockedTimeType, ID, ISODate, TeamMember } from '@/types'
import { closedPeriodOn, timeOffOn, workingWindows } from '@/lib/schedule'
import { itemSegments, itemTotalMinutes } from '@/lib/availability'
import { fullName } from '@/lib/format'
import { todayISO, toClock, toMinutes } from '@/lib/time'
import { AppointmentHoverCard, BlockedHoverCard, StatusIcons, useHoverCard } from './blocks'
import { useClock, useScheduleData, type Lookups } from './hooks'
import { BLOCKED_TONE, layoutLanes, memberName, snap, toneFor, type BlockTone, type CalView } from './lib'
import { useCalendarUi, type BlockedPreview, type PreviewBlock } from './store'
import { DropMenu } from './ui'

export interface PendingMove {
  appointmentId: ID
  date: ISODate
  /** New start of the first item. */
  start: string
  /** Reassign every item to this member (drag between columns). */
  teamMemberId?: ID
  resize?: { itemId: ID; durationMin: number }
}

export type MemberAction = { kind: 'view'; view: CalView } | { kind: 'appointment' } | { kind: 'blocked' } | { kind: 'shift' } | { kind: 'timeoff' } | { kind: 'profile' }

export type GridMode = 'normal' | 'pick' | 'select'

export const HATCH = 'repeating-linear-gradient(135deg, rgb(var(--surface-sunken)) 0px, rgb(var(--surface-sunken)) 6px, rgb(var(--border) / 0.75) 6px, rgb(var(--border) / 0.75) 7px)'

/** Items of an appointment as they would be after a pending move/resize. */
export function movedItems(appt: Appointment, move: PendingMove | null | undefined): AppointmentItem[] {
  if (!move || move.appointmentId !== appt.id) return appt.items
  const delta = toMinutes(move.start) - toMinutes(appt.items[0].start)
  return appt.items.map((i) => ({
    ...i,
    start: toClock(toMinutes(i.start) + delta),
    teamMemberId: move.teamMemberId ?? i.teamMemberId,
    durationMin: move.resize?.itemId === i.id ? move.resize.durationMin : i.durationMin,
  }))
}

interface DayViewProps {
  date: ISODate
  locationId: ID
  members: TeamMember[]
  appointments: Appointment[]
  blocked: BlockedTime[]
  pxPerHour: number
  lookups: Lookups
  mode: GridMode
  /** Appointments drawn with the selection border (open drawer, open group, pick source). */
  selectedIds: Set<string>
  pending: PendingMove | null
  onSlot: (memberId: ID, time: string, point: { x: number; y: number }) => void
  onAppointment: (appt: Appointment) => void
  onBlocked: (block: BlockedTime) => void
  onMove: (move: PendingMove) => void
  onMemberAction: (member: TeamMember, action: MemberAction) => void
}

export function DayView(props: DayViewProps) {
  const { t } = useTranslation()
  const { date, locationId, members, appointments, blocked, pxPerHour, pending, onMove } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const clock = useClock()
  const today = todayISO()
  const schedule = useScheduleData()
  const focus = useCalendarUi((s) => s.focus)
  const preview = useCalendarUi((s) => s.preview)
  const blockedPreview = useCalendarUi((s) => s.blockedPreview)
  const pxPerMin = pxPerHour / 60
  const total = 24 * pxPerHour
  const nowMin = clock.getHours() * 60 + clock.getMinutes()
  const justDragged = useRef(false)
  const [dragLabel, setDragLabel] = useState<{ id: string; text: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Per-column schedule (working windows, time off, closed).
  const columns = useMemo(
    () =>
      members.map((m) => ({
        member: m,
        windows: workingWindows(schedule, m.id, date, locationId),
        timeOff: timeOffOn(schedule.timeOff, m.id, date),
      })),
    [members, schedule, date, locationId],
  )
  const closed = useMemo(() => closedPeriodOn(schedule.closedPeriods, date, locationId), [schedule.closedPeriods, date, locationId])

  // Auto-scroll: focus request, else now (today), else the first working hour.
  const scrollInfo = useRef({ columns, nowMin, today })
  scrollInfo.current = { columns, nowMin, today }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const info = scrollInfo.current
    let target: number
    if (focus && focus.date === date) target = toMinutes(focus.start) - 30
    else if (date === info.today) target = info.nowMin - 90
    else {
      const starts = info.columns.flatMap((c) => c.windows.map((w) => w[0]))
      target = (starts.length ? Math.min(...starts) : 9 * 60) - 30
    }
    el.scrollTop = Math.max(0, target * (pxPerHour / 60))
  }, [date, pxPerHour, focus])

  // Keep a new appointment or blocked time being drafted in view (e.g. right after a pick-mode slot).
  const draftStart = (preview && preview.date === date && preview.locationId === locationId ? preview.items[0]?.start : undefined) ?? (blockedPreview && blockedPreview.date === date && blockedPreview.locationId === locationId ? blockedPreview.start : undefined)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !draftStart) return
    const top = toMinutes(draftStart) * pxPerMin
    const header = 120
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - header - 48) el.scrollTop = Math.max(0, top - 90)
  }, [draftStart, pxPerMin])

  // Items per member.
  const byMember = useMemo(() => {
    const map = new Map<ID, { appt: Appointment; item: AppointmentItem }[]>()
    for (const appt of appointments) {
      for (const item of movedItems(appt, pending)) {
        const list = map.get(item.teamMemberId) ?? []
        list.push({ appt, item })
        map.set(item.teamMemberId, list)
      }
    }
    return map
  }, [appointments, pending])
  const blockedByMember = useMemo(() => {
    const map = new Map<ID, BlockedTime[]>()
    blocked.forEach((b) => map.set(b.teamMemberId, [...(map.get(b.teamMemberId) ?? []), b]))
    return map
  }, [blocked])
  const previewItems = preview && preview.date === date && preview.locationId === locationId ? preview : null
  const blockPreview = blockedPreview && blockedPreview.date === date && blockedPreview.locationId === locationId ? blockedPreview : null

  const onDragMove = (e: DragMoveEvent) => {
    const [kind, apptId, itemId] = String(e.active.id).split(':')
    const appt = appointments.find((a) => a.id === apptId)
    const item = appt?.items.find((i) => i.id === itemId)
    if (!appt || !item) return
    const delta = snap(e.delta.y / pxPerMin)
    if (kind === 'move') {
      const start = toMinutes(item.start) + delta
      setDragLabel({ id: String(e.active.id), text: `${toClock(start)} - ${toClock(start + itemTotalMinutes(item.durationMin, item.extraTime))}` })
    } else {
      const duration = Math.max(5, item.durationMin + delta)
      setDragLabel({ id: String(e.active.id), text: `${item.start} - ${toClock(toMinutes(item.start) + duration + item.extraTime.reduce((s, x) => s + x.durationMin, 0))}` })
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null)
    justDragged.current = true
    setTimeout(() => (justDragged.current = false), 50)
    const [kind, apptId, itemId] = String(e.active.id).split(':')
    const appt = appointments.find((a) => a.id === apptId)
    const item = appt?.items.find((i) => i.id === itemId)
    if (!appt || !item) return
    const delta = snap(e.delta.y / pxPerMin)
    const first = appt.items[0]
    if (kind === 'move') {
      const overMember = e.over ? String(e.over.id).replace('col:', '') : item.teamMemberId
      if (delta === 0 && overMember === item.teamMemberId) return
      const newFirst = toMinutes(first.start) + delta
      if (newFirst < 0 || newFirst + itemTotalMinutes(item.durationMin, item.extraTime) > 1440) return
      onMove({ appointmentId: appt.id, date, start: toClock(newFirst), teamMemberId: overMember !== item.teamMemberId ? overMember : undefined })
    } else {
      const duration = Math.max(5, item.durationMin + delta)
      if (duration === item.durationMin) return
      onMove({ appointmentId: appt.id, date, start: first.start, resize: { itemId: item.id, durationMin: duration } })
    }
  }

  if (!members.length) return null

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)}>
      <div ref={scrollRef} className="h-full overflow-auto" data-testid="calendar-day-view">
        <div
          className={clsx('grid min-w-full [--cal-col:156px] [--cal-gutter:48px] md:[--cal-gutter:60px]', members.length > 4 ? 'md:[--cal-col:180px]' : 'md:[--cal-col:220px]')}
          style={{ gridTemplateColumns: `var(--cal-gutter) repeat(${members.length}, minmax(var(--cal-col), 1fr))` }}
        >
          <div className="sticky left-0 top-0 z-30 border-b border-line bg-surface" style={{ gridColumn: 1, gridRow: 1 }} />
          {members.map((m, i) => (
            <MemberHeader key={m.id} member={m} column={i + 2} onAction={(a) => props.onMemberAction(m, a)} />
          ))}
          {/* Gutter */}
          <div className="sticky left-0 z-20 border-r border-line bg-surface" style={{ gridColumn: 1, gridRow: 2, height: total }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2 text-caption font-semibold text-ink tabular" style={{ top: h === 0 ? 4 : h * pxPerHour - 8 }}>
                {toClock(h * 60)}
              </span>
            ))}
            {date === today && (
              <span className="absolute left-1 right-1 z-10 rounded-full border border-danger bg-surface text-center text-caption font-semibold text-danger tabular" style={{ top: nowMin * pxPerMin - 9 }}>
                {toClock(nowMin)}
              </span>
            )}
          </div>
          {columns.map((col, i) => (
            <DayColumn
              key={col.member.id}
              gridColumn={i + 2}
              date={date}
              member={col.member}
              windows={col.windows}
              timeOffLabels={col.timeOff}
              closedLabel={closed?.description}
              items={byMember.get(col.member.id) ?? []}
              blocked={blockedByMember.get(col.member.id) ?? []}
              preview={previewItems}
              blockedPreview={blockPreview && blockPreview.teamMemberId === col.member.id ? blockPreview : null}
              replacedBlockId={blockPreview?.replaceId}
              pxPerHour={pxPerHour}
              lookups={props.lookups}
              mode={props.mode}
              selectedIds={props.selectedIds}
              dragLabel={dragLabel}
              justDragged={justDragged}
              onSlot={props.onSlot}
              onAppointment={props.onAppointment}
              onBlocked={props.onBlocked}
            />
          ))}
          {date === today && (
            <div className="pointer-events-none relative z-[15]" style={{ gridColumn: `2 / ${members.length + 2}`, gridRow: 2 }} aria-hidden>
              <div className="absolute inset-x-0 h-px bg-danger" style={{ top: nowMin * pxPerMin }} />
            </div>
          )}
        </div>
        {!members.length && <p className="p-8 text-muted">{t('calendar.grid.noMembers')}</p>}
      </div>
    </DndContext>
  )
}

function MemberHeader({ member, column, onAction }: { member: TeamMember; column: number; onAction: (a: MemberAction) => void }) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  return (
    <div className="group sticky top-0 z-20 flex flex-col items-center gap-1.5 border-b border-l border-line bg-surface px-2 pb-2 pt-2.5 md:gap-2 md:pb-3 md:pt-4" style={{ gridColumn: column, gridRow: 1 }}>
      <span className="rounded-full p-0.5 ring-2 ring-info-subtle">
        <Avatar name={memberName(member)} color={member.color} size={phone ? 40 : 56} />
      </span>
      <DropMenu
        width={240}
        trigger={({ open, toggle }) => (
          <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 text-body-strong text-ink hover:bg-sunken max-md:min-h-8">
            <span className="truncate">{memberName(member)}</span>
            <ChevronDown size={14} className={clsx('shrink-0 transition-opacity', open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-md:opacity-60')} aria-hidden />
          </button>
        )}
        groups={[
          {
            items: [
              { label: t('calendar.member.dayView'), icon: <Rows3 size={16} />, onSelect: () => onAction({ kind: 'view', view: 'day' }) },
              { label: t('calendar.member.threeDayView'), icon: <Columns3 size={16} />, onSelect: () => onAction({ kind: 'view', view: 'day_3' }) },
              { label: t('calendar.member.weekView'), icon: <LayoutGrid size={16} />, onSelect: () => onAction({ kind: 'view', view: 'week' }) },
              { label: t('calendar.member.monthView'), icon: <CalendarDays size={16} />, onSelect: () => onAction({ kind: 'view', view: 'month' }) },
            ],
          },
          {
            heading: t('calendar.member.actions'),
            items: [
              { label: t('calendar.member.addAppointment'), onSelect: () => onAction({ kind: 'appointment' }) },
              { label: t('calendar.member.addBlockedTime'), onSelect: () => onAction({ kind: 'blocked' }) },
              { label: t('calendar.member.editShift'), onSelect: () => onAction({ kind: 'shift' }) },
              { label: t('calendar.member.addTimeOff'), onSelect: () => onAction({ kind: 'timeoff' }) },
              { label: t('calendar.member.viewMember'), onSelect: () => onAction({ kind: 'profile' }) },
            ],
          },
        ]}
      />
    </div>
  )
}

interface ColumnProps {
  gridColumn: number
  date: ISODate
  member: TeamMember
  windows: [number, number][]
  timeOffLabels: { id: string; startTime: string; endTime: string; typeId: string; description: string }[]
  closedLabel?: string
  items: { appt: Appointment; item: AppointmentItem }[]
  blocked: BlockedTime[]
  preview: PreviewBlock | null
  blockedPreview: BlockedPreview | null
  replacedBlockId?: string
  pxPerHour: number
  lookups: Lookups
  mode: GridMode
  selectedIds: Set<string>
  dragLabel: { id: string; text: string } | null
  justDragged: MutableRefObject<boolean>
  onSlot: DayViewProps['onSlot']
  onAppointment: DayViewProps['onAppointment']
  onBlocked: DayViewProps['onBlocked']
}

const DayColumn = memo(function DayColumn(p: ColumnProps) {
  const { t } = useTranslation()
  const { setNodeRef } = useDroppable({ id: `col:${p.member.id}` })
  const timeOffTypes = useDb((s) => s.settings.timeOffTypes)
  const btTypes = useDb((s) => s.blockedTimeTypes)
  const [hover, setHover] = useState<number | null>(null)
  const pxPerMin = p.pxPerHour / 60
  const quarter = p.pxPerHour / 4

  const previewItems = useMemo(() => (p.preview ? p.preview.items.filter((i) => i.teamMemberId === p.member.id) : []), [p.preview, p.member.id])
  const blocked = useMemo(() => (p.replacedBlockId ? p.blocked.filter((b) => b.id !== p.replacedBlockId) : p.blocked), [p.blocked, p.replacedBlockId])

  const lanes = useMemo(
    () =>
      layoutLanes([
        ...p.items.map(({ appt, item }) => ({ key: `a:${appt.id}:${item.id}`, start: toMinutes(item.start), end: toMinutes(item.start) + Math.max(15, itemTotalMinutes(item.durationMin, item.extraTime)) })),
        ...blocked.map((b) => ({ key: `b:${b.id}`, start: toMinutes(b.start), end: Math.max(toMinutes(b.end), toMinutes(b.start) + 15) })),
        ...previewItems.map((i) => ({ key: `p:${i.key}`, start: toMinutes(i.start), end: toMinutes(i.start) + itemTotalMinutes(i.durationMin, i.extraTime) })),
        ...(p.blockedPreview ? [{ key: 'bp', start: toMinutes(p.blockedPreview.start), end: Math.max(toMinutes(p.blockedPreview.end), toMinutes(p.blockedPreview.start) + 15) }] : []),
      ]),
    [p.items, blocked, previewItems, p.blockedPreview],
  )

  const slotAt = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(95, Math.floor((e.clientY - rect.top) / quarter)))
  }
  const interactiveSlots = p.mode !== 'select'

  // Blocks are memoised so moving the mouse over the column (hover slot) doesn't re-render them.
  const { onAppointment, onBlocked, justDragged, lookups, mode, selectedIds, dragLabel, member } = p
  const blockedPreview = p.blockedPreview
  const previewLabel = p.preview?.label
  const content = useMemo(() => {
    const place = (key: string) => {
      const l = lanes.get(key) ?? { lane: 0, lanes: 1 }
      return { left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }
    }
    const typeOf = (id?: string) => (id ? btTypes.find((x) => x.id === id) : undefined)
    return (
      <>
        {blocked.map((b) => (
          <BlockedBlock
            key={b.id}
            block={b}
            type={typeOf(b.typeId)}
            top={toMinutes(b.start) * pxPerMin}
            height={Math.max(quarter, (toMinutes(b.end) - toMinutes(b.start)) * pxPerMin)}
            {...place(`b:${b.id}`)}
            faded={mode !== 'normal'}
            memberLabel={memberName(member)}
            onOpen={onBlocked}
            justDragged={justDragged}
          />
        ))}
        {blockedPreview && (
          <div
            data-block
            className="pointer-events-none absolute z-[6] overflow-hidden rounded-xs border-2 border-primary px-2 py-0.5 text-small"
            style={{ top: toMinutes(blockedPreview.start) * pxPerMin, height: Math.max(quarter, (toMinutes(blockedPreview.end) - toMinutes(blockedPreview.start)) * pxPerMin), background: BLOCKED_TONE.fill, color: BLOCKED_TONE.text, ...place('bp') }}
            data-testid="blocked-preview"
          >
            <span className="tabular">
              {blockedPreview.start} - {blockedPreview.end}
            </span>{' '}
            <b>{blockedPreview.label}</b>
          </div>
        )}
        {p.items.map(({ appt, item }) => {
          const key = `${appt.id}:${item.id}`
          return (
            <AppointmentBlock
              key={key}
              appt={appt}
              item={item}
              pxPerMin={pxPerMin}
              {...place(`a:${key}`)}
              lookups={lookups}
              mode={mode}
              selected={selectedIds.has(appt.id)}
              dragText={dragLabel && dragLabel.id.endsWith(key) ? dragLabel.text : null}
              onOpen={onAppointment}
              justDragged={justDragged}
            />
          )
        })}
        {previewItems.map((i) => {
          const tone = toneFor({ status: 'booked' }, { serviceId: i.serviceId, teamMemberId: i.teamMemberId }, lookups.tones)
          const minutes = itemTotalMinutes(i.durationMin, i.extraTime)
          return (
            <div
              key={i.key}
              data-block
              className="pointer-events-none absolute z-[6] overflow-hidden rounded-xs border-2 border-primary px-2 py-1 text-small shadow-md"
              style={{ top: toMinutes(i.start) * pxPerMin, height: Math.max(quarter, minutes * pxPerMin), background: tone.fill, color: tone.text, ...place(`p:${i.key}`) }}
              data-testid="appointment-preview"
            >
              <span className="tabular">
                {i.start} - {toClock(toMinutes(i.start) + minutes)}
              </span>{' '}
              <b>{previewLabel}</b>
              <div className="truncate">{i.name}</div>
            </div>
          )
        })}
      </>
    )
  }, [blocked, blockedPreview, p.items, previewItems, previewLabel, lanes, btTypes, pxPerMin, quarter, mode, member, onBlocked, onAppointment, justDragged, lookups, selectedIds, dragLabel])

  return (
    <div
      ref={setNodeRef}
      className="relative border-l border-line"
      style={{ gridColumn: p.gridColumn, gridRow: 2, height: 24 * p.pxPerHour, backgroundImage: HATCH }}
      onMouseMove={(e) => {
        if (!interactiveSlots || (e.target as HTMLElement).closest('[data-block]')) return setHover(null)
        const slot = slotAt(e)
        setHover((h) => (h === slot ? h : slot))
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        if (!interactiveSlots || p.justDragged.current || (e.target as HTMLElement).closest('[data-block]')) return
        p.onSlot(p.member.id, toClock(slotAt(e) * 15), { x: e.clientX, y: e.clientY })
      }}
      data-testid={`calendar-column-${p.member.id}`}
    >
      {!p.closedLabel &&
        p.windows.map(([s, e]) => <div key={s} className="absolute inset-x-0 bg-surface" style={{ top: s * pxPerMin, height: (e - s) * pxPerMin }} aria-hidden />)}
      {/* Grid lines */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(to bottom, rgb(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--border) / 0.45) 1px, transparent 1px)',
          backgroundSize: `100% ${p.pxPerHour}px, 100% ${quarter}px`,
        }}
        aria-hidden
      />
      {p.closedLabel && <span className="absolute left-2 top-2 rounded-xs bg-surface/90 px-2 py-0.5 text-caption text-muted">{t('calendar.grid.closed', { name: p.closedLabel })}</span>}
      {p.timeOffLabels.map((off) => (
        <span key={off.id} className="pointer-events-none absolute left-2 rounded-xs bg-surface/90 px-2 py-0.5 text-caption text-muted" style={{ top: Math.max(4, toMinutes(off.startTime) * pxPerMin + 4) }}>
          {timeOffTypes.find((x) => x.id === off.typeId)?.name ?? t('calendar.grid.timeOff')}
          {off.description ? ` · ${off.description}` : ''}
        </span>
      ))}
      {hover !== null && (
        // Touch screens have no hover: a tap would otherwise leave this highlight behind.
        <div className="pointer-events-none absolute inset-x-0.5 z-[4] rounded-xs bg-primary-subtle px-2 text-caption text-primary tabular [@media(hover:none)]:hidden" style={{ top: hover * quarter, height: quarter, lineHeight: `${quarter}px` }}>
          {quarter >= 12 ? toClock(hover * 15) : ''}
        </div>
      )}
      {content}
    </div>
  )
})

interface BlockedBlockProps {
  block: BlockedTime
  type?: BlockedTimeType
  top: number
  height: number
  left: string
  width: string
  faded: boolean
  memberLabel: string
  onOpen: (block: BlockedTime) => void
  justDragged: MutableRefObject<boolean>
}

const BlockedBlock = memo(function BlockedBlock({ block, type, top, height, left, width, faded, memberLabel, onOpen, justDragged }: BlockedBlockProps) {
  const hover = useHoverCard()
  return (
    <>
      <button
        type="button"
        data-block
        onClick={(e) => {
          e.stopPropagation()
          hover.hide()
          if (!justDragged.current) onOpen(block)
        }}
        {...hover.bind}
        className={clsx('absolute z-[5] overflow-hidden rounded-xs border-l-4 px-2 py-0.5 text-left text-small', faded && 'pointer-events-none opacity-40')}
        style={{ top, height, left, width, background: BLOCKED_TONE.fill, color: BLOCKED_TONE.text, borderColor: BLOCKED_TONE.edge }}
        data-testid="blocked-block"
      >
        <span className="tabular">
          {block.start} - {block.end}
        </span>{' '}
        <b>
          {block.title || type?.name} {type?.emoji}
        </b>
      </button>
      {hover.rect && <BlockedHoverCard block={block} type={type} rect={hover.rect} memberLabel={memberLabel} />}
    </>
  )
})

interface AppointmentBlockProps {
  appt: Appointment
  item: AppointmentItem
  pxPerMin: number
  left: string
  width: string
  lookups: Lookups
  mode: GridMode
  selected: boolean
  dragText: string | null
  onOpen: (appt: Appointment) => void
  justDragged: MutableRefObject<boolean>
}

const AppointmentBlock = memo(function AppointmentBlock({ appt, item, pxPerMin, left, width, lookups, mode, selected, dragText, onOpen, justDragged }: AppointmentBlockProps) {
  const { t } = useTranslation()
  const locked = mode !== 'normal' || appt.status === 'completed' || appt.status === 'no_show' || appt.status === 'cancelled'
  const move = useDraggable({ id: `move:${appt.id}:${item.id}`, disabled: locked })
  const resize = useDraggable({ id: `resize:${appt.id}:${item.id}`, disabled: locked })
  const hover = useHoverCard()
  const noteHtml = useDb((s) => (lookups.notedAppointments.has(appt.id) ? s.clientNotes.find((n) => n.appointmentId === appt.id)?.html : undefined))
  const client = appt.clientId ? lookups.clientsById.get(appt.clientId) : undefined
  const tone: BlockTone = toneFor(appt, item, lookups.tones)
  const start = toMinutes(item.start)
  const segments = itemSegments(start, item.durationMin, item.extraTime)
  const totalMin = itemTotalMinutes(item.durationMin, item.extraTime)
  const resizeDelta = resize.transform ? snap(resize.transform.y / pxPerMin) : 0
  const height = Math.max(14, (totalMin + (resize.isDragging ? Math.max(5 - item.durationMin, resizeDelta) : 0)) * pxPerMin - 1)
  const dragging = move.isDragging || resize.isDragging
  const transform = move.transform ? `translate3d(${move.transform.x}px, ${snap(move.transform.y / pxPerMin) * pxPerMin}px, 0)` : undefined
  const short = height < 36
  const note = useMemo(() => noteHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), [noteHtml])
  // In pick modes the appointment being moved or rebooked stays visible; the others fade.
  const faded = mode === 'pick' && !selected
  const open = () => {
    if (!justDragged.current) onOpen(appt)
  }

  return (
    <>
      <div
        ref={move.setNodeRef}
        data-block
        aria-label={`${item.start} ${fullName(client, t('calendar.walkIn'))} ${item.name}`}
        {...move.listeners}
        {...move.attributes}
        // Still clickable when it can't be dragged (pick modes, completed): not "disabled".
        aria-disabled={undefined}
        aria-roledescription={locked ? undefined : move.attributes['aria-roledescription']}
        onClick={(e) => {
          e.stopPropagation()
          hover.hide()
          open()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') open()
          else move.listeners?.onKeyDown?.(e)
        }}
        onMouseEnter={dragging || faded ? undefined : hover.bind.onMouseEnter}
        onMouseLeave={hover.bind.onMouseLeave}
        className={clsx(
          'group/block absolute overflow-hidden rounded-xs text-left text-small shadow-xs outline-none [touch-action:none] focus-visible:ring-2 focus-visible:ring-primary max-md:[touch-action:pan-x_pan-y]',
          dragging ? 'z-50 cursor-grabbing shadow-lg' : 'z-[5]',
          !locked && !dragging && 'cursor-pointer',
          faded && 'pointer-events-none opacity-40',
          mode === 'select' && 'cursor-pointer hover:ring-2 hover:ring-primary',
          selected && 'ring-2 ring-primary',
        )}
        style={{ left, width, top: start * pxPerMin, height, background: tone.fill, color: tone.text, transform }}
        data-testid="appointment-block"
        data-appointment-id={appt.id}
        data-selected={selected || undefined}
      >
        {/* Faded processing segments */}
        {segments
          .filter((s) => !s.busy)
          .map((s) => (
            <span
              key={s.start}
              className="pointer-events-none absolute inset-x-0"
              style={{ top: (s.start - start) * pxPerMin, height: (s.end - s.start) * pxPerMin, background: 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 5px, rgb(255 255 255 / 0.25) 5px 10px)' }}
              aria-hidden
            />
          ))}
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: tone.edge }} aria-hidden />
        <div className={clsx('relative flex gap-1 pl-2.5 pr-1.5', short ? 'items-center py-0' : 'items-start pt-1')}>
          <span className="min-w-0 flex-1 truncate">
            {/* Phones: narrower columns, so the end time gives way to the client's name. */}
            <span className="tabular">
              {dragText ?? (
                <>
                  {item.start}
                  <span className="max-md:hidden"> - {toClock(start + totalMin)}</span>
                </>
              )}
            </span>{' '}
            <b>{fullName(client, t('calendar.walkIn'))}</b>
          </span>
          <StatusIcons appt={appt} lookups={lookups} />
        </div>
        {!short && <div className="relative truncate pl-2.5 pr-1.5">{item.name}</div>}
        {!locked && (
          <span
            ref={resize.setNodeRef}
            {...resize.listeners}
            {...resize.attributes}
            role="separator"
            aria-label={t('calendar.grid.resize')}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-center justify-center"
          >
            <span className={clsx('h-0.5 w-6 rounded-full bg-current transition-opacity', selected ? 'opacity-60' : 'opacity-0 group-hover/block:opacity-40')} />
          </span>
        )}
      </div>
      {hover.rect && !dragging && <AppointmentHoverCard appt={appt} rect={hover.rect} lookups={lookups} client={client} note={note} />}
    </>
  )
})

/** Faded lunch/blocked style used by week and month cells. */
export const hatchStyle = { backgroundImage: HATCH }
