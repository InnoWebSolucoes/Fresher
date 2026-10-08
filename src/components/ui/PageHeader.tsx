import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  count?: number
  actions?: ReactNode
}

/** Page title, one-line subtitle and actions on the right (SPEC §6). */
export function PageHeader({ title, subtitle, count, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
          {title}
          {count !== undefined && <span className="chip bg-sunken text-muted">{count}</span>}
        </h1>
        {subtitle && <p className="mt-1 max-w-2xl text-body-lg text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
