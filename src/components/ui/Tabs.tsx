import clsx from 'clsx'
import type { ReactNode } from 'react'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

/** Pill tabs (selected = ink fill), as on list pages. */
export function PillTabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string }) {
  return (
    <div role="tablist" className={clsx('flex flex-wrap gap-2', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx('inline-flex h-9 items-center gap-2 rounded-full px-4 text-body-strong transition-colors', value === item.value ? 'bg-ink text-canvas' : 'bg-surface text-ink ring-1 ring-line hover:bg-sunken')}
        >
          {item.label}
          {item.count !== undefined && <span className={clsx('rounded-full px-1.5 text-caption', value === item.value ? 'bg-canvas/20' : 'bg-sunken text-muted')}>{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Underline tabs for drawers and detail pages. */
export function UnderlineTabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string }) {
  return (
    <div role="tablist" className={clsx('flex gap-6 border-b border-line', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx('-mb-px inline-flex items-center gap-2 border-b-2 pb-3 pt-1 text-body-strong transition-colors', value === item.value ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {item.label}
          {item.count !== undefined && <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Segmented control (e.g. Refund item | Refund amount, € | %). */
export function Segmented<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string }) {
  return (
    <div role="radiogroup" className={clsx('inline-flex rounded-md bg-sunken p-1', className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="radio"
          aria-checked={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx('h-8 rounded-sm px-3 text-small transition-colors', value === item.value ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
