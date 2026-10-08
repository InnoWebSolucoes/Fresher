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
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3 md:mb-6 md:gap-4">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 break-words font-display text-title-2 text-ink md:text-title-1">
          {title}
          {count !== undefined && <span className="chip bg-sunken text-muted">{count}</span>}
        </h1>
        {subtitle && <p className="mt-1 max-w-2xl text-body text-muted md:text-body-lg">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
