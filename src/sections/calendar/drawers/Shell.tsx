import clsx from 'clsx'
import { ChevronDown, MoreVertical } from 'lucide-react'
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

/** Standard 481px drawer: title row (with actions at the right), scrolling body, footer. */
export function DrawerShell({ title, subtitle, headerRight, above, children, footer, sunken, testId, bodyClassName }: { title?: ReactNode; subtitle?: ReactNode; headerRight?: ReactNode; above?: ReactNode; children: ReactNode; footer?: ReactNode; sunken?: boolean; testId?: string; bodyClassName?: string }) {
  return (
    <div className="flex h-full flex-col max-md:min-h-0" data-testid={testId}>
      {above}
      {(title || headerRight) && (
        <div className={clsx('flex items-start justify-between gap-4 px-8 pb-5 max-md:gap-3 max-md:px-4 max-md:pb-4', above ? 'pt-2' : 'pt-8 max-md:pt-4')}>
          <div className="min-w-0">
            {title && <h2 className="font-display text-title-1 text-ink max-md:text-title-2">{title}</h2>}
            {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
          </div>
          {headerRight && <div className="flex shrink-0 items-center gap-2">{headerRight}</div>}
        </div>
      )}
      <div className={clsx('min-h-0 flex-1 overflow-y-auto px-8 pb-6 max-md:px-4 max-md:pb-5', sunken && 'bg-sunken pt-6 max-md:pt-4', bodyClassName)}>{children}</div>
      {footer && <div className="flex items-center gap-3 border-t border-line bg-surface px-8 py-5 max-md:gap-2 max-md:px-4 max-md:py-3">{footer}</div>}
    </div>
  )
}

/** 48px round outline button (⋮ options in drawer headers and footers). */
export const RoundButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { size?: number }>(function RoundButton({ className, children, size = 48, style, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx('flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50', className)}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      {children ?? <MoreVertical size={18} aria-hidden />}
    </button>
  )
})

/** Pill trigger with a chevron (Saved filters ▾, All upcoming ▾, Actions ▾). */
export function PillTrigger({ open, onClick, children, className, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { open?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={clsx('inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body text-ink hover:bg-sunken', open && 'bg-sunken', className)} {...rest}>
      {children}
      {icon ?? <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />}
    </button>
  )
}

/** Button styled like a select (date and time fields that open a popover). */
export function SelectButton({ open, onClick, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { open?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={clsx('input flex items-center justify-between gap-2 text-left', open && 'border-primary ring-2 ring-primary/30', className)} {...rest}>
      <span className="truncate">{children}</span>
      <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden />
    </button>
  )
}

/** Checkbox that can show the "some selected" state (Select all, category rows). */
export function TriCheckbox({ checked, indeterminate, onChange, label, className, id }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label?: string; className?: string; id?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked
  }, [indeterminate, checked])
  return <input ref={ref} id={id} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className={clsx('h-5 w-5 shrink-0 cursor-pointer rounded-xs accent-[rgb(var(--primary))]', className)} />
}

/** Small grey count chip ("Hair & styling 2"). */
export function CountChip({ value, className }: { value: number; className?: string }) {
  return <span className={clsx('inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sunken px-1.5 text-caption font-semibold text-muted', className)}>{value}</span>
}
