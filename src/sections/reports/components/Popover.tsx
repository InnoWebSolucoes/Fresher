import clsx from 'clsx'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '@/lib/useDismiss'

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  /** Controlled open state (optional). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'left' | 'right'
  className?: string
  label?: string
}

/** Anchored panel that closes on Escape or an outside press (toolbar popovers on report pages). */
export function Popover({ trigger, children, open: controlled, onOpenChange, align = 'left', className, label }: PopoverProps) {
  const [inner, setInner] = useState(false)
  const open = controlled ?? inner
  const set = useCallback(
    (v: boolean) => {
      if (controlled === undefined) setInner(v)
      onOpenChange?.(v)
    },
    [controlled, onOpenChange],
  )
  const ref = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => [ref], [])
  const close = useCallback(() => set(false), [set])
  useDismiss(refs, open, close)
  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => set(!open) })}
      {open && (
        <div role="dialog" aria-label={label} className={clsx('absolute top-full z-[60] mt-2 rounded-lg border border-line bg-raised shadow-md', align === 'right' ? 'right-0' : 'left-0', className)}>
          {children(close)}
        </div>
      )}
    </div>
  )
}

/** Rounded toolbar pill used by Group by, the date range and Filters. */
export function Pill({ open, onClick, children, active, className, ...rest }: { open?: boolean; onClick: () => void; children: ReactNode; active?: boolean; className?: string; 'aria-label'?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      className={clsx(
        'inline-flex h-11 items-center gap-2 rounded-full border bg-surface px-5 text-body-strong text-ink transition-colors hover:bg-sunken',
        open || active ? 'border-primary ring-2 ring-primary/20' : 'border-line-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
