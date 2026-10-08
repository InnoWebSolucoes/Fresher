import clsx from 'clsx'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Calculator, ChevronLeft, ChevronRight, Minus, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, IconButton, Menu, MenuButton, Modal, TextInput, toast } from '@/components/ui'
import type { MenuGroup } from '@/components/ui'
import { useDismiss } from '@/lib/useDismiss'
import { money, round2 } from '@/lib/format'
import type { SaleStatus } from '@/types'

/** Pill used in list toolbars (date range, filters, sort). */
export const PILL = 'inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken'

// ─── Filters ────────────────────────────────────────────────────────────────

/** Filters state: applied values plus a draft edited inside the modal. */
export function useFilters<T>(initial: T) {
  const [applied, setApplied] = useState<T>(initial)
  const [draft, setDraft] = useState<T>(initial)
  const [open, setOpen] = useState(false)
  return {
    applied,
    setApplied,
    draft,
    setDraft,
    open,
    openModal: () => {
      setDraft(applied)
      setOpen(true)
    },
    close: () => setOpen(false),
    apply: () => {
      setApplied(draft)
      setOpen(false)
    },
    clearDraft: () => setDraft(initial),
    reset: () => {
      setApplied(initial)
      setDraft(initial)
    },
  }
}

export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button type="button" className={PILL} onClick={onClick} aria-haspopup="dialog">
      <SlidersHorizontal size={16} aria-hidden />
      {t('sales.common.filters')}
      {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-caption text-canvas">{count}</span>}
    </button>
  )
}

/** Centred 720px "Filters" modal with Clear filters / Apply. */
export function FiltersModal({ open, onClose, onClear, onApply, children }: { open: boolean; onClose: () => void; onClear: () => void; onApply: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sales.common.filters')}
      size="lg"
      footer={
        <>
          <Button onClick={onClear}>{t('sales.common.clearFilters')}</Button>
          <Button variant="primary" onClick={onApply}>
            {t('sales.common.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">{children}</div>
    </Modal>
  )
}

export interface FilterChip {
  key: string
  label: ReactNode
  onRemove: () => void
}

/** Applied filters as removable chips with "Clear all". */
export function FilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  const { t } = useTranslation()
  if (!chips.length) return null
  return (
    <div className="-mt-1 mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface pl-3 pr-1.5 text-small text-ink">
          {c.label}
          <button type="button" onClick={c.onRemove} aria-label={t('sales.common.removeFilter')} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-sunken">
            <X size={14} aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="px-2 text-small font-semibold text-primary hover:underline">
        {t('sales.common.clearAll')}
      </button>
    </div>
  )
}

// ─── Sort ───────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string = string> {
  key: K
  dir: SortDir
}

/** "Sort ▾" pill listing the sort options; the selected one is ticked. */
export function SortMenu<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label?: string }) {
  const current = options.find((o) => o.value === value)
  return (
    <Menu
      width={300}
      trigger={({ open, toggle }) => (
        <button type="button" className={PILL} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          {label ?? current?.label}
          <ArrowUpDown size={16} aria-hidden />
        </button>
      )}
      groups={[{ items: options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) })) }]}
    />
  )
}

/** Sortable column header button (↓/↑) for DataTable columns we sort ourselves. */
export function SortHeader({ label, active, dir, onClick }: { label: ReactNode; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-primary" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {label}
      {active && (dir === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />)}
    </button>
  )
}

export function sortBy<T>(rows: T[], value: (row: T) => string | number, dir: SortDir): T[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    return (va < vb ? -1 : va > vb ? 1 : 0) * factor
  })
}

// ─── Header menus ───────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'csv' | 'xlsx'

/** "Export ▾" with PDF / CSV / Excel; shows "Report generated" when done. */
export function ExportMenu({ formats = ['pdf', 'csv', 'xlsx'], onExport }: { formats?: ExportFormat[]; onExport: (format: ExportFormat) => void | Promise<void> }) {
  const { t } = useTranslation()
  const run = async (format: ExportFormat) => {
    try {
      await onExport(format)
      toast(t('sales.common.reportGenerated'))
    } catch {
      toast(t('sales.common.exportFailed'), 'error')
    }
  }
  return (
    <Menu
      width={200}
      trigger={({ open, toggle }) => (
        <MenuButton open={open} toggle={toggle}>
          {t('sales.common.export')}
        </MenuButton>
      )}
      groups={[{ items: formats.map((f) => ({ label: t(`sales.common.formats.${f}`), onSelect: () => void run(f) })) }]}
    />
  )
}

/** "Options ▾" header menu. */
export function OptionsMenu({ groups, width = 260 }: { groups: MenuGroup[]; width?: number }) {
  const { t } = useTranslation()
  return (
    <Menu
      width={width}
      trigger={({ open, toggle }) => (
        <MenuButton open={open} toggle={toggle}>
          {t('sales.common.options')}
        </MenuButton>
      )}
      groups={groups}
    />
  )
}

/** Link-styled button inside table cells (doesn't trigger the row click). */
export function TableLink({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={clsx('text-left text-primary hover:underline', className)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

// ─── Status chips ───────────────────────────────────────────────────────────

const SALE_TONES: Record<SaleStatus, 'success' | 'outline' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  completed: 'success',
  unpaid: 'outline',
  part_paid: 'warning',
  refunded: 'outline',
  voided: 'danger',
  draft: 'neutral',
}

export function SaleStatusChip({ status }: { status: SaleStatus }) {
  const { t } = useTranslation()
  return <Chip tone={SALE_TONES[status]}>{t(`sales.saleStatus.${status}`)}</Chip>
}

// ─── Full-screen modal ──────────────────────────────────────────────────────

/**
 * Full-screen modal used by register flows (Open register, Cash in/out,
 * Count, Close, Set up register preferences): optional segmented progress
 * bar, ← back, Close and a primary action at the top right.
 */
export function FullscreenOverlay({
  open,
  onClose,
  onBack,
  actions,
  steps,
  escape = true,
  label,
  width = 'max-w-[880px]',
  children,
}: {
  open: boolean
  onClose: () => void
  onBack?: () => void
  actions?: ReactNode
  steps?: { total: number; current: number }
  /** Disable Escape while a child modal (e.g. Cash counter) is open. */
  escape?: boolean
  label?: string
  width?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !escape) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, escape, onClose])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]), textarea')
    ;(first ?? ref.current)?.focus()
    return () => previous?.focus?.()
  }, [open])
  if (!open) return null
  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="fixed inset-0 z-[75] flex flex-col overflow-y-auto bg-canvas outline-none">
      {steps && (
        <div className="flex gap-2 px-6 pt-3" role="progressbar" aria-valuemin={0} aria-valuemax={steps.total} aria-valuenow={steps.current}>
          {Array.from({ length: steps.total }, (_, i) => (
            <span key={i} className={clsx('h-1 flex-1 rounded-full transition-colors', i < steps.current ? 'bg-primary' : 'bg-sunken')} />
          ))}
        </div>
      )}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-canvas/95 px-6 py-4 backdrop-blur">
        <div>
          {onBack && (
            <IconButton label={t('sales.common.back')} onClick={onBack} className="h-11 w-11 rounded-full border border-line-strong bg-surface">
              <ArrowLeft size={20} aria-hidden />
            </IconButton>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onClose}>{t('sales.common.close')}</Button>
          {actions}
        </div>
      </header>
      <div className={clsx('mx-auto w-full flex-1 px-6 pb-16 pt-2', width)}>{children}</div>
    </div>,
    document.body,
  )
}

/** Big title + subtitle at the top of a full-screen flow. */
export function FlowHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-body-lg text-muted">{subtitle}</p>}
    </div>
  )
}

// ─── Amounts and the cash counter ───────────────────────────────────────────

export const parseAmount = (value: string): number | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? round2(n) : null
}

/** € amount field with an optional calculator button that opens the cash counter. */
export function AmountInput({
  id,
  value,
  onChange,
  onCount,
  invalid,
  placeholder = '0.00',
  disabled,
  className,
  align = 'left',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onCount?: () => void
  invalid?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
  align?: 'left' | 'right'
}) {
  const { t } = useTranslation()
  return (
    <TextInput
      id={id}
      prefix="€"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      invalid={invalid}
      className={clsx(align === 'right' && '[&_input]:text-right', className)}
      onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
      suffix={
        onCount ? (
          <button type="button" onClick={onCount} aria-label={t('sales.register.count')} title={t('sales.register.count')} className="-mr-1 flex h-8 w-8 items-center justify-center rounded-sm text-primary hover:bg-sunken">
            <Calculator size={18} aria-hidden />
          </button>
        ) : undefined
      }
    />
  )
}

const NOTES = [500, 200, 100, 50, 20, 10, 5]
const COINS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]

/** Cash counter: every note and coin with a stepper; Apply fills the amount field. */
export function CashCounterModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (total: number) => void }) {
  const { t } = useTranslation()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const total = useMemo(() => round2([...NOTES, ...COINS].reduce((s, d) => s + d * (counts[String(d)] ?? 0), 0)), [counts])
  const set = (d: number, n: number) => setCounts((c) => ({ ...c, [String(d)]: Math.max(0, Math.floor(n) || 0) }))
  const row = (d: number, kind: 'notes' | 'coins') => {
    const n = counts[String(d)] ?? 0
    return (
      <div key={d} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2.5">
        <div>
          <p className="text-body-strong text-ink">{money(d)}</p>
          <p className="text-small text-muted">{t(`sales.counter.${kind}`)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t('sales.counter.decrease', { value: money(d) })} disabled={n === 0} onClick={() => set(d, n - 1)} className={clsx('flex h-11 w-11 items-center justify-center rounded-md', n > 0 ? 'bg-primary text-on-primary' : 'bg-sunken text-subtle')}>
            <Minus size={16} aria-hidden />
          </button>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={t('sales.counter.quantity', { value: money(d) })}
            value={n}
            onChange={(e) => set(d, Number(e.target.value))}
            className="h-11 w-24 rounded-sm border border-line-strong bg-surface text-center text-body text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="button" aria-label={t('sales.counter.increase', { value: money(d) })} onClick={() => set(d, n + 1)} className={clsx('flex h-11 w-11 items-center justify-center rounded-md', n > 0 ? 'bg-primary text-on-primary' : 'bg-sunken text-ink hover:bg-line')}>
            <Plus size={16} aria-hidden />
          </button>
        </div>
        <div className="text-right">
          <p className="text-small text-muted">× {money(d)}</p>
          <p className={clsx('tabular', n > 0 ? 'text-body-strong text-ink' : 'text-body text-subtle')}>{money(round2(d * n))}</p>
        </div>
      </div>
    )
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sales.counter.title')}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <div>
            <p className="text-small text-muted">{t('sales.counter.total')}</p>
            <p className="font-display text-title-3 text-ink tabular">{money(total)}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setCounts({})}>{t('sales.counter.reset')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                onApply(total)
                onClose()
              }}
            >
              {t('sales.common.apply')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="divide-y divide-line">
        <div>{NOTES.map((d) => row(d, 'notes'))}</div>
        <div>{COINS.map((d) => row(d, 'coins'))}</div>
      </div>
    </Modal>
  )
}

// ─── Day picker ─────────────────────────────────────────────────────────────

/** Single-month calendar popover; days after `max` are disabled. */
export function DayPicker({ value, max, onPick, onClose }: { value: string; max: string; onPick: (date: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [month, setMonth] = useState(() => startOfMonth(parseISO(value)))
  useDismiss([ref], true, onClose)
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const maxMonth = startOfMonth(parseISO(max))
  return (
    <div ref={ref} role="dialog" aria-label={t('sales.daily.pickDate')} className="absolute left-0 top-full z-[60] mt-2 w-[340px] rounded-lg border border-line bg-raised p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <IconButton label={t('sales.daily.previousMonth')} onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft size={18} aria-hidden />
        </IconButton>
        <p className="text-body-strong text-ink">{format(month, 'MMM yyyy')}</p>
        <IconButton label={t('sales.daily.nextMonth')} disabled={month >= maxMonth} onClick={() => setMonth((m) => addMonths(m, 1))} className="disabled:opacity-40">
          <ChevronRight size={18} aria-hidden />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {days.slice(0, 7).map((d) => (
          <span key={d.toISOString()} className="py-1 text-small text-muted">
            {format(d, 'EEE')}
          </span>
        ))}
        {days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd')
          const inMonth = isSameMonth(d, month)
          const disabled = iso > max
          const selected = iso === value
          if (!inMonth) return <span key={iso} />
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onPick(iso)}
              aria-pressed={selected}
              className={clsx('mx-auto flex h-10 w-10 items-center justify-center rounded-full text-body', selected ? 'bg-primary font-semibold text-on-primary' : disabled ? 'text-subtle' : 'text-ink hover:bg-sunken')}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
