import clsx from 'clsx'
import { MoreVertical } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDismiss } from '@/lib/useDismiss'
import { useKeepOnScreen } from './responsive'

export interface MenuItem {
  label: ReactNode
  onSelect?: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** Shown as a small grey line under the label. */
  hint?: ReactNode
  checked?: boolean
}

export interface MenuGroup {
  heading?: ReactNode
  items: MenuItem[]
}

interface MenuProps {
  /** Custom trigger; defaults to a ⋮ "Actions" icon button. */
  trigger?: (props: { open: boolean; toggle: () => void }) => ReactNode
  groups: MenuGroup[]
  align?: 'left' | 'right'
  width?: number
  label?: string
}

/** Dropdown menu (three-dots row actions, Options ▾, Add ▾). */
export function Menu({ trigger, groups, align = 'right', width = 240, label }: MenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useDismiss([ref], open, () => setOpen(false))
  // Phones: slide the menu sideways so it never runs past the screen edge.
  const shift = useKeepOnScreen(panel, open)
  const toggle = () => setOpen((o) => !o)
  return (
    <div ref={ref} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      {trigger ? (
        trigger({ open, toggle })
      ) : (
        <button type="button" aria-label={label ?? t('common.actions')} aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="icon-btn h-10 w-10 md:h-9 md:w-9">
          <MoreVertical size={18} aria-hidden />
        </button>
      )}
      {open && (
        <div
          ref={panel}
          role="menu"
          style={{ width, maxWidth: 'calc(100vw - 16px)', transform: shift ? `translateX(${shift}px)` : undefined }}
          className={clsx('absolute top-full z-[60] mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-raised p-1.5 shadow-md', align === 'right' ? 'right-0' : 'left-0')}
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
                    setOpen(false)
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
          ))}
        </div>
      )}
    </div>
  )
}

/** Pill trigger used for "Options ▾", "Export ▾", "Add ▾". */
export function MenuButton({ children, open, toggle, primary }: { children: ReactNode; open: boolean; toggle: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={toggle}
      className={clsx(
        'inline-flex h-10 items-center gap-2 rounded-md px-4 text-body-strong transition-colors',
        primary ? 'bg-primary text-on-primary hover:bg-primary-hover' : 'border border-line-strong bg-surface text-ink hover:bg-sunken',
      )}
    >
      {children}
      <span aria-hidden className="text-[10px]">▼</span>
    </button>
  )
}
