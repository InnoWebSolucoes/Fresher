import clsx from 'clsx'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ArrowDownUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TeamMember } from '@/types'
import { PALETTE } from '@/styles/palette'
import { useDismiss } from '@/lib/useDismiss'
import { Button, Menu, Select, type MenuGroup } from '@/components/ui'
import { asRecord, useMemberExtras } from '@/api/team'
import { TIME_OPTIONS } from '../lib/shifts'

/** Round avatar in the member's calendar colour (or their photo). */
export function MemberAvatar({ member, size = 40, className }: { member: Pick<TeamMember, 'firstName' | 'lastName' | 'color'> & { id?: string }; size?: number; className?: string }) {
  const extras = useMemberExtras()
  const photo = 'id' in member && member.id ? asRecord(member as TeamMember, extras).photo : undefined
  const palette = PALETTE[member.color] ?? PALETTE.blue
  const text = `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase() || '?'
  if (photo) {
    return <img src={photo} alt="" className={clsx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size, boxShadow: `0 0 0 2px ${palette.edge}55` }} />
  }
  return (
    <span
      aria-hidden
      className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34), background: palette.fill, color: palette.text, boxShadow: `inset 0 0 0 2px ${palette.edge}66` }}
    >
      {text}
    </span>
  )
}

/** HH:mm select in 5-minute steps. */
export function TimeSelect({ value, onChange, placeholder, ...rest }: { value: string; onChange: (v: string) => void; placeholder?: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const options = value && !TIME_OPTIONS.includes(value) ? [...TIME_OPTIONS, value].sort() : TIME_OPTIONS
  return <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} placeholder={placeholder} {...rest} />
}

/** Popover anchored under a trigger. */
export function Popover({ trigger, children, align = 'left', className }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss([ref], open, close)
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <div className={clsx('absolute top-full z-[60] mt-2 rounded-lg border border-line bg-raised p-4 shadow-md', align === 'right' ? 'right-0' : 'left-0', className)}>{children(close)}</div>}
    </div>
  )
}

/** Month grid used by the week picker and date buttons. */
export function MiniCalendar({ value, onPick, highlightWeek }: { value: string; onPick: (date: string) => void; highlightWeek?: boolean }) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value)))
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  const selected = parseISO(value)
  const wStart = startOfWeek(selected, { weekStartsOn: 1 })
  const wEnd = endOfWeek(selected, { weekStartsOn: 1 })
  return (
    <div className="w-[280px]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="icon-btn h-8 w-8" aria-label={t('team.common.prevMonth')} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-body-strong text-ink">{format(month, 'MMMM yyyy')}</span>
        <button type="button" className="icon-btn h-8 w-8" aria-label={t('team.common.nextMonth')} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-caption text-muted">
        {days.slice(0, 7).map((d) => (
          <span key={d.toISOString()} className="py-1">
            {format(d, 'EEEEEE')}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd')
          const inWeek = highlightWeek && d >= wStart && d <= wEnd
          const isSel = iso === value
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              className={clsx(
                'h-9 text-small transition-colors',
                !isSameMonth(d, month) && 'text-subtle',
                inWeek ? 'bg-primary-subtle text-primary' : 'rounded-full hover:bg-sunken',
                inWeek && d.getTime() === wStart.getTime() && 'rounded-l-full',
                inWeek && format(d, 'yyyy-MM-dd') === format(wEnd, 'yyyy-MM-dd') && 'rounded-r-full',
                !highlightWeek && isSel && 'rounded-full bg-primary text-on-primary hover:bg-primary',
              )}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Sort pill with a checked option list. */
export function SortMenu<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  const current = options.find((o) => o.value === value)
  return (
    <Menu
      align="right"
      width={260}
      groups={[{ items: options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) })) }]}
      trigger={({ open, toggle }) => (
        <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
          {current?.label}
          <ArrowDownUp size={16} aria-hidden />
        </button>
      )}
    />
  )
}

/** Small product tour popover ("Step N of M"). */
export function Tour({ steps, onClose }: { steps: { title?: string; body: string }[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const last = index === steps.length - 1
  return (
    <div role="dialog" aria-label={t('team.tour.label')} className="fixed bottom-6 right-6 z-[65] w-[380px] rounded-xl bg-primary p-5 text-on-primary shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="text-small opacity-80">{t('team.tour.step', { n: index + 1, total: steps.length })}</p>
        <button type="button" onClick={onClose} aria-label={t('team.common.close')} className="-mr-2 -mt-2 rounded-md p-1.5 hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
      {step.title && <h3 className="mt-1 font-display text-title-3">{step.title}</h3>}
      <p className={clsx(step.title ? 'mt-1 text-body' : 'mt-1 text-body-lg font-semibold')}>{step.body}</p>
      <div className="mt-4 flex justify-end gap-2">
        {index > 0 && (
          <Button size="sm" variant="ghost" className="text-on-primary hover:bg-white/10" onClick={() => setIndex(index - 1)}>
            {t('team.tour.back')}
          </Button>
        )}
        <Button size="sm" className="border-0 bg-surface text-ink hover:bg-sunken" onClick={() => (last ? onClose() : setIndex(index + 1))}>
          {last ? t('team.tour.complete') : t('team.tour.next')}
        </Button>
      </div>
    </div>
  )
}

/** A small "label / value" row used across breakdowns and drawers. */
export function Row({ label, value, strong, className }: { label: ReactNode; value: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-4 py-1.5', strong ? 'text-body-strong text-ink' : 'text-body text-muted', className)}>
      <span>{label}</span>
      <span className={clsx('tabular text-right', strong ? 'text-ink' : 'text-ink/80')}>{value}</span>
    </div>
  )
}

/** Big stat card (Earnings / Other / Total / Paid / To pay). */
export function StatCard({ label, value, strong, sub, children }: { label: ReactNode; value: ReactNode; strong?: boolean; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className={clsx('card flex justify-between gap-4 p-5', children ? 'items-center' : 'items-start')}>
      <div className="min-w-0">
        <p className={clsx('text-body', strong ? 'font-semibold text-ink' : 'text-muted')}>{label}</p>
        <p className="mt-1 font-display text-title-2 tabular text-ink">{value}</p>
        {sub}
      </div>
      {children}
    </div>
  )
}

/**
 * Dropdown menu rendered in a portal with fixed positioning, so it isn't
 * clipped by scrolling tables or cards (row "Actions ⌄" menus).
 */
export function PortalMenu({ groups, trigger, width = 240, align = 'right' }: { groups: MenuGroup[]; trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; width?: number; align?: 'left' | 'right' }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const open = rect !== null
  const close = useCallback(() => setRect(null), [])
  useDismiss([anchor, menu], open, close)
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return
      close()
    }
    window.addEventListener('resize', close)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])
  const toggle = () => setRect((r) => (r ? null : (anchor.current?.getBoundingClientRect() ?? null)))
  const above = rect ? rect.bottom > window.innerHeight * 0.62 : false
  const left = rect ? Math.max(8, Math.min(window.innerWidth - width - 8, align === 'right' ? rect.right - width : rect.left)) : 0
  return (
    <span ref={anchor} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle })}
      {rect &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ width, left, ...(above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }), maxHeight: above ? rect.top - 16 : window.innerHeight - rect.bottom - 16 }}
            className="fixed z-[90] overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md"
          >
            {groups.map((group, gi) => (
              <div key={gi} className={clsx(gi > 0 && 'mt-1 border-t border-line pt-1')}>
                {group.heading && <p className="px-3 pb-1 pt-2 text-caption uppercase tracking-wide text-muted">{group.heading}</p>}
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
                    className={clsx('flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-body disabled:cursor-not-allowed disabled:opacity-50', item.danger ? 'text-danger hover:bg-danger-subtle' : 'text-ink hover:bg-sunken')}
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
            ))}
          </div>,
          document.body,
        )}
    </span>
  )
}

/** "Actions ⌄" pill trigger. */
export function ActionsPill({ open, toggle, label, variant = 'pill' }: { open: boolean; toggle: () => void; label: string; variant?: 'pill' | 'link' }) {
  if (variant === 'link') {
    return (
      <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="inline-flex items-center gap-1 text-small font-semibold text-primary hover:underline">
        {label}
        <ChevronDown size={14} aria-hidden />
      </button>
    )
  }
  return (
    <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
      {label}
      <ChevronDown size={14} aria-hidden />
    </button>
  )
}
