import clsx from 'clsx'
import { Ban, EyeOff, Heart, NotebookText, Play, Tag, Users } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Appointment, BlockedTime, BlockedTimeType, Client } from '@/types'
import { STATUS_STYLES } from '@/styles/palette'
import { fullName, money } from '@/lib/format'
import { durationLabel, toClock, toMinutes } from '@/lib/time'
import { itemTotalMinutes } from '@/lib/availability'
import type { Lookups } from './hooks'
import { memberName } from './lib'
import { ClientAvatar } from './ui'

export const apptStart = (a: Appointment) => a.items[0]?.start ?? '00:00'
export const apptEnd = (a: Appointment) =>
  toClock(Math.max(...a.items.map((i) => toMinutes(i.start) + itemTotalMinutes(i.durationMin, i.extraTime))))
export const apptTotal = (a: Pick<Appointment, 'items'>) => a.items.reduce((s, i) => s + i.price + i.addOns.reduce((x, o) => x + o.price, 0), 0)

/** Status icons at the top right of a block: requested, started, paid, note, group, no-show. */
export function StatusIcons({ appt, lookups, size = 13 }: { appt: Appointment; lookups: Lookups; size?: number }) {
  const { t } = useTranslation()
  const icons: { key: string; node: ReactNode; label: string }[] = []
  if (appt.items.some((i) => i.preferred)) icons.push({ key: 'req', node: <Heart size={size} className="fill-danger text-danger" />, label: t('calendar.icons.requested') })
  if (appt.status === 'started') icons.push({ key: 'start', node: <Play size={size} />, label: t('calendar.icons.started') })
  const sale = appt.saleId ? lookups.salesById.get(appt.saleId) : undefined
  if (sale && sale.status !== 'voided') icons.push({ key: 'paid', node: <Tag size={size} className="fill-current" />, label: t('calendar.icons.paid') })
  if (lookups.notedAppointments.has(appt.id)) icons.push({ key: 'note', node: <NotebookText size={size} />, label: t('calendar.icons.note') })
  if (appt.groupId) icons.push({ key: 'group', node: <Users size={size} />, label: t('calendar.icons.group') })
  if (appt.status === 'no_show') icons.push({ key: 'ns', node: <EyeOff size={size} />, label: t('calendar.icons.noShow') })
  if (!icons.length) return null
  return (
    <span className="flex shrink-0 items-center gap-1">
      {icons.map((i) => (
        <span key={i.key} title={i.label} aria-label={i.label} role="img">
          {i.node}
        </span>
      ))}
    </span>
  )
}

/** Delayed hover card shown next to a block. */
export function useHoverCard(delay = 450) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    rect,
    bind: {
      onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
        const target = e.currentTarget
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setRect(target.getBoundingClientRect()), delay)
      },
      onMouseLeave: () => {
        clearTimeout(timer.current)
        setRect(null)
      },
    },
    hide: () => {
      clearTimeout(timer.current)
      setRect(null)
    },
  }
}

function placeCard(rect: DOMRect, width = 340, height = 260) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = rect.right + 8
  if (left + width > vw - 8) left = Math.max(8, rect.left - width - 8)
  let top = rect.top
  if (top + height > vh - 8) top = Math.max(8, vh - height - 8)
  return { left, top, width }
}

export function AppointmentHoverCard({ appt, rect, lookups, client, note }: { appt: Appointment; rect: DOMRect; lookups: Lookups; client?: Client; note?: string }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[appt.status]
  const pos = placeCard(rect)
  return createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-[70] overflow-hidden rounded-lg border border-line bg-raised shadow-lg" style={pos}>
      <div className="flex items-center justify-between px-5 py-3 text-body-strong text-white" style={{ background: status.header }}>
        <span className="tabular">
          {apptStart(appt)} - {apptEnd(appt)}
        </span>
        <span>{status.label}</span>
      </div>
      <div className="flex items-center gap-3 px-5 pt-4">
        <ClientAvatar name={client ? client.firstName : null} photo={client?.photo} walkIn={!client} size={44} />
        <div className="min-w-0">
          <p className="truncate text-body-lg text-ink">{fullName(client, t('calendar.walkIn'))}</p>
          {client && <p className="truncate text-small text-muted">{client.email}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        {appt.items.map((item) => (
          <div key={item.id}>
            <div className="flex justify-between gap-3 text-body text-ink">
              <span className="truncate">{item.name}</span>
              <span>{money(item.price + item.addOns.reduce((s, o) => s + o.price, 0))}</span>
            </div>
            <p className="flex items-center gap-1 text-small text-muted">
              {item.preferred && <Heart size={12} className="fill-danger text-danger" aria-hidden />}
              {memberName(lookups.membersById.get(item.teamMemberId))} • {durationLabel(itemTotalMinutes(item.durationMin, item.extraTime))}
            </p>
          </div>
        ))}
      </div>
      {note && (
        <div className="flex items-start gap-2 bg-sunken px-5 py-3 text-small text-ink">
          <NotebookText size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <span className="line-clamp-2">
            <b>{t('calendar.hover.note')}</b> {note}
          </span>
        </div>
      )}
    </div>,
    document.body,
  )
}

export function BlockedHoverCard({ block, type, rect, memberLabel }: { block: BlockedTime; type?: BlockedTimeType; rect: DOMRect; memberLabel: string }) {
  const { t } = useTranslation()
  const pos = placeCard(rect, 300, 160)
  return createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-[70] overflow-hidden rounded-lg border border-line bg-raised shadow-lg" style={pos}>
      <div className="flex items-center justify-between bg-[#4E5E5C] px-5 py-3 text-body-strong text-white">
        <span className="tabular">
          {block.start} - {block.end}
        </span>
        <span className="flex items-center gap-1.5">
          {t('calendar.blocked.unavailable')}
          <Ban size={16} aria-hidden />
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-body-lg text-ink">
          {block.title || type?.name || t('calendar.blocked.title')} {type?.emoji}
        </p>
        <p className="text-small text-muted">
          {durationLabel(toMinutes(block.end) - toMinutes(block.start))} • {memberLabel}
        </p>
        {block.description && <p className="mt-2 text-small text-muted">{block.description}</p>}
      </div>
    </div>,
    document.body,
  )
}

/** Small chip used by the 3 day, week and month views. */
export function AppointmentChip({ appt, lookups, label, onClick, faded, selected, tone }: { appt: Appointment; lookups: Lookups; label: ReactNode; onClick?: () => void; faded?: boolean; selected?: boolean; tone: { fill: string; text: string } }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={clsx('flex h-7 w-full shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-left text-small transition-opacity hover:brightness-95', faded && 'pointer-events-none opacity-40', selected && 'ring-2 ring-inset ring-primary')}
      data-testid="appointment-chip"
      style={{ background: tone.fill, color: tone.text }}
    >
      <span className="min-w-0 flex-1 truncate tabular">{label}</span>
      <StatusIcons appt={appt} lookups={lookups} size={12} />
    </button>
  )
}
