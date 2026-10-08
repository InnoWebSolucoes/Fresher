import clsx from 'clsx'
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from '@dnd-kit/core'
import { CalendarDays, ChevronDown, Columns3, LayoutGrid, Rows3 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui'
import { useDb } from '@/store/db'
import type { Appointment, AppointmentItem, BlockedTime, ID, ISODate, TeamMember } from '@/types'
import { closedPeriodOn, timeOffOn, workingWindows } from '@/lib/schedule'
import { itemSegments, itemTotalMinutes } from '@/lib/availability'
import { fullName } from '@/lib/format'
import { todayISO, toClock, toMinutes } from '@/lib/time'
import { AppointmentHoverCard, BlockedHoverCard, StatusIcons, useHoverCard } from './blocks'
import { useClock, useScheduleData, type Lookups } from './hooks'
import { BLOCKED_TONE, layoutLanes, memberName, snap, toneFor, type BlockTone, type CalView } from './lib'
import { useCalendarUi, type PreviewBlock } from './store'
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
  selectedId: string | null
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
        <div className="grid min-w-full" style={{ gridTemplateColumns: `60px repeat(${members.length}, minmax(${members.length > 4 ? 180 : 220}px, 1fr))` }}>
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
              pxPerHour={pxPerHour}
              lookups={props.lookups}
              mode={props.mode}
              selectedId={props.selectedId}
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
  return (
    <div className="group sticky top-0 z-20 flex flex-col items-center gap-2 border-b border-l border-line bg-surface px-2 pb-3 pt-4" style={{ gridColumn: column, gridRow: 1 }}>
      <span className="rounded-full p-0.5 ring-2 ring-info-subtle">
        <Avatar name={memberName(member)} color={member.color} size={56} />
      </span>
      <DropMenu
        width={240}
        trigger={({ open, toggle }) => (
          <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 text-body-strong text-ink hover:bg-sunken">
            <span className="truncate">{memberName(member)}</span>
            <ChevronDown size={14} className={clsx('shrink-0 transition-opacity', open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')} aria-hidden />
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
  pxPerHour: number
  lookups: Lookups
  mode: GridMode
  selectedId: string | null
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

  const lanes = useMemo(
    () =>
      layoutLanes([
        ...p.items.map(({ appt, item }) => ({ key: `a:${appt.id}:${item.id}`, start: toMinutes(item.start), end: toMinutes(item.start) + Math.max(15, itemTotalMinutes(item.durationMin, item.extraTime)) })),
        ...p.blocked.map((b) => ({ key: `b:${b.id}`, start: toMinutes(b.start), end: Math.max(toMinutes(b.end), toMinutes(b.start) + 15) })),
        ...previewItems.map((i) => ({ key: `p:${i.key}`, start: toMinutes(i.start), end: toMinutes(i.start) + itemTotalMinutes(i.durationMin, i.extraTime) })),
      ]),
    [p.items, p.blocked, previewItems],
  )
  const place = (key: string) => {
    const l = lanes.get(key) ?? { lane: 0, lanes: 1 }
    return { left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }
  }

  const slotAt = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(95, Math.floor((e.clientY - rect.top) / quarter)))
  }
  const interactiveSlots = p.mode !== 'select'

  return (
    <div
      ref={setNodeRef}
      className="relative border-l border-line"
      style={{ gridColumn: p.gridColumn, gridRow: 2, height: 24 * p.pxPerHour, backgroundImage: HATCH }}
      onMouseMove={(e) => {
        if (!interactiveSlots || (e.target as HTMLElement).closest('[data-block]')) return setHover(null)
        setHover(slotAt(e))
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
        <div className="pointer-events-none absolute inset-x-0.5 z-[4] rounded-xs bg-primary-subtle px-2 text-caption text-primary tabular" style={{ top: hover * quarter, height: quarter, lineHeight: `${quarter}px` }}>
          {quarter >= 12 ? toClock(hover * 15) : ''}
        </div>
      )}
      {p.blocked.map((b) => (
        <BlockedBlock
          key={b.id}
          block={b}
          typeEmoji={btTypes.find((x) => x.id === b.typeId)?.emoji}
          typeName={btTypes.find((x) => x.id === b.typeId)?.name}
          style={{ top: toMinutes(b.start) * pxPerMin, height: Math.max(quarter, (toMinutes(b.end) - toMinutes(b.start)) * pxPerMin), ...place(`b:${b.id}`) }}
          faded={p.mode !== 'normal'}
          memberLabel={memberName(p.member)}
          onClick={() => !p.justDragged.current && p.onBlocked(b)}
        />
      ))}
      {p.items.map(({ appt, item }) => (
        <AppointmentBlock
          key={`${appt.id}:${item.id}`}
          appt={appt}
          item={item}
          pxPerMin={pxPerMin}
          style={place(`a:${appt.id}:${item.id}`)}
          lookups={p.lookups}
          mode={p.mode}
          selected={p.selectedId === appt.id}
          dragText={p.dragLabel && p.dragLabel.id.endsWith(`${appt.id}:${item.id}`) ? p.dragLabel.text : null}
          onClick={() => !p.justDragged.current && p.onAppointment(appt)}
        />
      ))}
      {previewItems.map((i) => {
        const tone = toneFor({ status: 'booked' }, { serviceId: i.serviceId, teamMemberId: i.teamMemberId }, p.lookups.tones)
        const minutes = itemTotalMinutes(i.durationMin, i.extraTime)
        return (
          <div
            key={i.key}
            data-block
            className="pointer-events-none absolute z-[6] overflow-hidden rounded-xs border-2 border-dashed px-2 py-1 text-small"
            style={{ top: toMinutes(i.start) * pxPerMin, height: Math.max(quarter, minutes * pxPerMin), background: tone.fill, color: tone.text, borderColor: tone.edge, ...place(`p:${i.key}`) }}
          >
            <span className="tabular">
              {i.start} - {toClock(toMinutes(i.start) + minutes)}
            </span>{' '}
            <b>{p.preview?.label}</b>
            <div className="truncate">{i.name}</div>
          </div>
        )
      })}
    </div>
  )
})

function BlockedBlock({ block, typeEmoji, typeName, style, faded, memberLabel, onClick }: { block: BlockedTime; typeEmoji?: string; typeName?: string; style: CSSProperties; faded: boolean; memberLabel: string; onClick: () => void }) {
  const hover = useHoverCard()
  const types = useDb((s) => s.blockedTimeTypes)
  return (
    <>
      <button
        type="button"
        data-block
        onClick={(e) => {
          e.stopPropagation()
          hover.hide()
          onClick()
        }}
        {...hover.bind}
        className={clsx('absolute z-[5] overflow-hidden rounded-xs border-l-4 px-2 py-0.5 text-left text-small', faded && 'pointer-events-none opacity-40')}
        style={{ ...style, background: BLOCKED_TONE.fill, color: BLOCKED_TONE.text, borderColor: BLOCKED_TONE.edge }}
      >
        <span className="tabular">
          {block.start} - {block.end}
        </span>{' '}
        <b>
          {block.title || typeName} {typeEmoji}
        </b>
      </button>
      {hover.rect && <BlockedHoverCard block={block} type={types.find((x) => x.id === block.typeId)} rect={hover.rect} memberLabel={memberLabel} />}
    </>
  )
}

function AppointmentBlock({ appt, item, pxPerMin, style, lookups, mode, selected, dragText, onClick }: { appt: Appointment; item: AppointmentItem; pxPerMin: number; style: CSSProperties; lookups: Lookups; mode: GridMode; selected: boolean; dragText: string | null; onClick: () => void }) {
  const { t } = useTranslation()
  const locked = mode !== 'normal' || appt.status === 'completed' || appt.status === 'no_show' || appt.status === 'cancelled'
  const move = useDraggable({ id: `move:${appt.id}:${item.id}`, disabled: locked })
  const resize = useDraggable({ id: `resize:${appt.id}:${item.id}`, disabled: locked })
  const hover = useHoverCard()
  const notes = useDb((s) => s.clientNotes)
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
  const note = useMemo(() => notes.find((n) => n.appointmentId === appt.id)?.html.replace(/<[^>]+>/g, ' ').trim(), [notes, appt.id])

  return (
    <>
      <div
        ref={move.setNodeRef}
        data-block
        role="button"
        tabIndex={0}
        aria-label={`${item.start} ${fullName(client, t('calendar.walkIn'))} ${item.name}`}
        {...move.listeners}
        {...move.attributes}
        onClick={(e) => {
          e.stopPropagation()
          hover.hide()
          onClick()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClick()
          else move.listeners?.onKeyDown?.(e)
        }}
        onMouseEnter={dragging ? undefined : hover.bind.onMouseEnter}
        onMouseLeave={hover.bind.onMouseLeave}
        className={clsx(
          'group/block absolute overflow-hidden rounded-xs text-left text-small shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-primary',
          dragging ? 'z-50 cursor-grabbing shadow-lg' : 'z-[5]',
          !locked && !dragging && 'cursor-pointer',
          mode === 'pick' && 'pointer-events-none opacity-40',
          mode === 'select' && 'cursor-pointer hover:ring-2 hover:ring-primary',
          selected && 'ring-2 ring-primary',
        )}
        style={{ ...style, top: start * pxPerMin, height, background: tone.fill, color: tone.text, transform, touchAction: 'none' }}
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
            <span className="tabular">{dragText ?? `${item.start} - ${toClock(start + totalMin)}`}</span> <b>{fullName(client, t('calendar.walkIn'))}</b>
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
}

/** Faded lunch/blocked style used by week and month cells. */
export const hatchStyle = { backgroundImage: HATCH }
