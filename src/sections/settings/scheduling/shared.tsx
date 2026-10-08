import clsx from 'clsx'
import type { TFunction } from 'i18next'
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MenuGroup } from '@/components/ui'
import { useDismiss } from '@/lib/useDismiss'
import { PillMenu } from '../components/ui'

/**
 * Small form and menu building blocks shared by the settings pages (cards,
 * lists and page headers come from ../components/ui).
 */

/** Heading + description inside a form card. */
export function FormHeading({ title, description, level = 'title' }: { title: ReactNode; description?: ReactNode; level?: 'title' | 'label' }) {
  return (
    <div>
      {level === 'title' ? <h2 className="font-display text-title-2 text-ink">{title}</h2> : <h3 className="text-body-strong text-ink">{title}</h3>}
      {description && <p className={clsx('mt-1 text-muted', level === 'title' ? 'text-body' : 'text-small')}>{description}</p>}
    </div>
  )
}

/** "Options ▾" in the header of a full-screen edit form (reference: Options › Delete). */
export function OverlayOptions({ groups }: { groups: MenuGroup[] }) {
  const { t } = useTranslation()
  return <PillMenu label={t('settings.common.options')} groups={groups} width={220} testId="overlay-options" />
}

/** Delete item for an Options / Actions menu. */
export function deleteItem(label: string, onSelect: () => void, disabled?: boolean, hint?: ReactNode) {
  return { label, onSelect, danger: !disabled, disabled, hint, icon: <Trash2 size={16} aria-hidden /> }
}

/** Standard row actions: Edit, Delete (+ Move up / Move down). */
export function rowActions(
  t: TFunction,
  options: {
    onEdit: () => void
    onDelete?: () => void
    deleteDisabled?: boolean
    deleteHint?: ReactNode
    move?: { onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean }
  },
): MenuGroup[] {
  const first: MenuGroup = {
    items: [{ label: t('settings.common.edit'), onSelect: options.onEdit, icon: <Pencil size={16} aria-hidden /> }],
  }
  if (options.onDelete) first.items.push(deleteItem(t('settings.common.delete'), options.onDelete, options.deleteDisabled, options.deleteHint))
  const groups = [first]
  if (options.move) {
    groups.push({
      items: [
        { label: t('settings.common.moveUp'), onSelect: options.move.onUp, disabled: !options.move.canUp, icon: <ArrowUp size={16} aria-hidden /> },
        { label: t('settings.common.moveDown'), onSelect: options.move.onDown, disabled: !options.move.canDown, icon: <ArrowDown size={16} aria-hidden /> },
      ],
    })
  }
  return groups
}

/** Radio with label and hint; `children` render nested under it while checked (e.g. "Strategy period"). */
export function RadioRow({
  name,
  checked,
  onSelect,
  label,
  hint,
  badge,
  disabled,
  children,
  testId,
}: {
  name: string
  checked: boolean
  onSelect: () => void
  label: ReactNode
  hint?: ReactNode
  badge?: ReactNode
  disabled?: boolean
  children?: ReactNode
  testId?: string
}) {
  const id = useId()
  return (
    <div>
      <div className={clsx('flex items-start gap-3', disabled && 'opacity-50')}>
        <input id={id} type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--primary))]" data-testid={testId} />
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="flex flex-wrap items-center gap-2 text-body text-ink">
            {label}
            {badge}
          </span>
          {hint && <span className="block text-small text-muted">{hint}</span>}
        </label>
      </div>
      {checked && children && <div className="ml-8 mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  )
}

/** Large selectable cards with an icon (waitlist type). Native radios keep keyboard support. */
export function RadioCards<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; name: string; options: { value: T; label: ReactNode; hint?: ReactNode; icon?: ReactNode }[] }) {
  return (
    <div role="radiogroup" className="flex flex-col gap-3">
      {options.map((o) => (
        <label key={o.value} className="relative block cursor-pointer">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
          <span
            className={clsx(
              'flex items-center gap-4 rounded-lg border bg-surface px-5 py-4 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40',
              value === o.value ? 'border-primary ring-1 ring-primary' : 'border-line hover:border-line-strong',
            )}
          >
            {o.icon && <span className="shrink-0 text-ink">{o.icon}</span>}
            <span className="min-w-0">
              <span className="block text-body-strong text-ink">{o.label}</span>
              {o.hint && <span className="block text-body text-muted">{o.hint}</span>}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** Dropdown with a checkbox list ("Select team members", related resources). */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  invalid,
  testId,
}: {
  options: { value: string; label: string; hint?: string }[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
  ariaLabel: string
  invalid?: boolean
  testId?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  const selected = options.filter((o) => value.includes(o.value))
  const summary = selected.length === 0 ? null : selected.length <= 2 ? selected.map((o) => o.label).join(', ') : t('settings.sched.common.selectedCount', { first: selected[0].label, count: selected.length - 1 })
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={clsx('input flex items-center justify-between gap-2 text-left', invalid && 'border-danger')}
        data-testid={testId}
      >
        <span className={clsx('truncate', !summary && 'text-subtle')}>{summary ?? placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" aria-label={ariaLabel} className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md">
          {options.length === 0 && <p className="px-3 py-2 text-body text-muted">{t('settings.common.noResults')}</p>}
          {options.map((o) => (
            <label key={o.value} role="option" aria-selected={value.includes(o.value)} className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-sunken">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--primary))]" />
              <span className="min-w-0">
                <span className="block text-body text-ink">{o.label}</span>
                {o.hint && <span className="block text-small text-muted">{o.hint}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Inline error text under a control. */
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <p className="mt-1.5 text-small text-danger">{children}</p>
}
