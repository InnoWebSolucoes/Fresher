import clsx from 'clsx'
import { addMonths, format, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, PersonStanding, X } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button, Modal, type MenuGroup } from '@/components/ui'
import { useDismiss } from '@/lib/useDismiss'
import { todayISO, toISODate } from '@/lib/time'
import type { ISODate } from '@/types'
import { viewDays } from './lib'

// ─── Dropdowns ─────────────────────────────────────────────────────────

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
  width?: number
  className?: string
  panelClassName?: string
}

/** Anchored popover with outside-click / Escape dismissal. */
export function Dropdown({ trigger, children, align = 'left', placement = 'bottom', width, className, panelClassName }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  const close = () => setOpen(false)
  return (
    <div ref={ref} className={clsx('relative inline-flex', className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          style={width ? { width } : undefined}
          className={clsx(
            'absolute z-[60] rounded-lg border border-line bg-raised shadow-md',
            placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

/** Menu with groups that can open upwards (drawer footers). */
export function DropMenu({ trigger, groups, align = 'left', placement = 'bottom', width = 260 }: { trigger: DropdownProps['trigger']; groups: MenuGroup[]; align?: 'left' | 'right'; placement?: 'bottom' | 'top'; width?: number }) {
  return (
    <Dropdown trigger={trigger} align={align} placement={placement} width={width} panelClassName="max-h-[70vh] overflow-y-auto p-1.5">
      {(close) =>
        groups.map((group, gi) => (
          <div key={gi} role="menu" className={clsx(gi > 0 && 'mt-1 border-t border-line pt-1')}>
            {group.heading && <p className="px-3 pb-1 pt-2 text-body-strong text-ink">{group.heading}</p>}
            {group.items.map((item, ii) => (
              <button
                key={ii}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close()
                  item.onSelect?.()
                }}
                className={clsx(
                  'flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-body disabled:cursor-not-allowed disabled:opacity-50',
                  item.danger ? 'text-danger hover:bg-danger-subtle' : 'text-ink hover:bg-sunken',
                )}
              >
                {item.icon && <span className="mt-0.5 shrink-0 text-muted">{item.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block">{item.label}</span>
                  {item.hint && <span className="block text-small text-muted">{item.hint}</span>}
                </span>
                {item.checked && <span className="text-primary">✓</span>}
              </button>
            ))}
          </div>
        ))
      }
    </Dropdown>
  )
}

/** 36px toolbar pill (Today, date group, team, filters…). */
export function Pill({ children, active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={clsx(
        'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border bg-surface px-4 text-body text-ink transition-colors hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-primary ring-2 ring-primary' : 'border-line-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

// ─── Calendars ─────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** One Monday-first month. */
export function MonthGrid({ month, selected, onSelect, isDisabled }: { month: Date; selected?: ISODate; onSelect: (date: ISODate) => void; isDisabled?: (date: ISODate) => boolean }) {
  const today = todayISO()
  const days = viewDays('month', toISODate(month))
  return (
    <div className="w-[252px]">
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-2 text-caption text-muted">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = isSameMonth(parseISO(day), month)
          if (!inMonth) return <span key={day} />
          const disabled = isDisabled?.(day)
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(day)}
              aria-pressed={day === selected}
              aria-label={format(parseISO(day), 'EEEE, d MMMM yyyy')}
              className={clsx(
                'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-body transition-colors disabled:cursor-not-allowed disabled:text-subtle disabled:line-through',
                day === selected ? 'bg-primary font-semibold text-on-primary' : day === today ? 'font-semibold text-primary ring-1 ring-primary' : 'text-ink hover:bg-sunken',
              )}
            >
              {parseISO(day).getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Months side by side with ‹ › paging. */
export function MonthsPicker({ value, onSelect, months = 2, isDisabled }: { value: ISODate; onSelect: (date: ISODate) => void; months?: number; isDisabled?: (date: ISODate) => boolean }) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState(() => startOfMonth(parseISO(value)))
  return (
    <div className="flex gap-8">
      {Array.from({ length: months }, (_, i) => {
        const month = addMonths(anchor, i)
        return (
          <div key={i}>
            <div className="mb-3 flex h-9 items-center justify-between">
              {i === 0 ? (
                <button type="button" className="icon-btn h-8 w-8" aria-label={t('calendar.toolbar.prevMonth')} onClick={() => setAnchor((a) => addMonths(a, -1))}>
                  <ChevronLeft size={18} aria-hidden />
                </button>
              ) : (
                <span className="w-8" />
              )}
              <span className="text-body-strong text-ink">{format(month, 'MMMM yyyy')}</span>
              {i === months - 1 ? (
                <button type="button" className="icon-btn h-8 w-8" aria-label={t('calendar.toolbar.nextMonth')} onClick={() => setAnchor((a) => addMonths(a, 1))}>
                  <ChevronRight size={18} aria-hidden />
                </button>
              ) : (
                <span className="w-8" />
              )}
            </div>
            <MonthGrid month={month} selected={value} onSelect={onSelect} isDisabled={isDisabled} />
          </div>
        )
      })}
    </div>
  )
}

/** Scrolling list of clock times; scrolls the selected one into view. */
export function TimeList({ options, value, onSelect, className }: { options: string[]; value?: string | null; onSelect: (time: string) => void; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el && listRef.current) listRef.current.scrollTop = el.offsetTop - 80
  }, [])
  return (
    <div ref={listRef} role="listbox" className={clsx('max-h-72 overflow-y-auto p-1.5', className)}>
      {options.map((time) => (
        <button
          key={time}
          type="button"
          role="option"
          aria-selected={time === value}
          onClick={() => onSelect(time)}
          className={clsx('flex w-full rounded-md px-3 py-2 text-left text-body tabular', time === value ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}
        >
          {time}
        </button>
      ))}
    </div>
  )
}

// ─── People ────────────────────────────────────────────────────────────

/** Lavender initial circle (clients) or a walking figure for walk-ins. */
export function ClientAvatar({ name, size = 40, walkIn }: { name?: string | null; size?: number; walkIn?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary"
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.38) }}
    >
      {walkIn || !name ? <PersonStanding size={Math.max(16, size * 0.45)} /> : name.trim()[0]?.toUpperCase()}
    </span>
  )
}

// ─── Overlays ──────────────────────────────────────────────────────────

/** Full-screen white step (no-show / cancel confirmations, add blocked time type). */
export function FullScreen({ open, onClose, children, actions, closeLabel }: { open: boolean; onClose: () => void; children: ReactNode; actions?: ReactNode; closeLabel: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[85] overflow-y-auto bg-surface">
      <div className="sticky top-0 flex justify-end gap-2 bg-surface/90 px-8 py-4 backdrop-blur">
        <Button onClick={onClose}>{closeLabel}</Button>
        {actions}
      </div>
      <div className="mx-auto w-full max-w-5xl px-8 pb-16 pt-6">{children}</div>
    </div>,
    document.body,
  )
}

/** Round buttons floating left of a drawer (Minimise, Focus appointment, View group). */
export function FloatingDrawerButtons({ drawerWidth, buttons }: { drawerWidth: number; buttons: { label: string; icon: ReactNode; onClick: () => void }[] }) {
  return createPortal(
    <div className="fixed z-[51] hidden flex-col gap-3 sm:flex" style={{ top: 76, right: drawerWidth + 16 }}>
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={b.onClick}
          aria-label={b.label}
          title={b.label}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md hover:bg-sunken"
        >
          {b.icon}
        </button>
      ))}
    </div>,
    document.body,
  )
}

/**
 * Intercepts the drawer host's close paths (× button, backdrop, Escape) while
 * there are unsaved changes, so the "You have unsaved changes" modal can ask
 * first. Returns the modal state.
 */
export function useCloseGuard(dirty: boolean, closeLabel: string) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const closer = target?.closest?.(`[aria-label="${closeLabel}"]`)
      if (!closer || closer.closest('[data-cal-drawer]')) return
      e.stopPropagation()
      e.preventDefault()
      setAsking(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return
      e.stopPropagation()
      setAsking(true)
    }
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [dirty, closeLabel])
  return { asking, ask: () => setAsking(true), dismiss: () => setAsking(false) }
}

export function UnsavedChangesModal({ open, onBack, onExit }: { open: boolean; onBack: () => void; onExit: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onBack}
      size="sm"
      title={t('calendar.unsaved.title')}
      footer={
        <>
          <Button onClick={onBack}>{t('calendar.unsaved.back')}</Button>
          <Button variant="danger" onClick={onExit}>
            {t('calendar.unsaved.exit')}
          </Button>
        </>
      }
    >
      <p className="text-body text-muted">{t('calendar.unsaved.body')}</p>
    </Modal>
  )
}

/** Small "×" icon button used in popover headers. */
export function CloseX({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="icon-btn h-8 w-8">
      <X size={16} aria-hidden />
    </button>
  )
}

/** Count badge (purple chip in the reference, primary here). */
export function CountBadge({ value, className }: { value: number; className?: string }) {
  return <span className={clsx('inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-on-primary', className)}>{value}</span>
}
