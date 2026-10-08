import clsx from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppointmentStatus, PaletteColor } from '@/types'
import { PALETTE, STATUS_STYLES } from '@/styles/palette'

/** Empty state with a clear next action (SPEC §3 quality floor). */
export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)} data-testid="empty-state">
      {icon && <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">{icon}</span>}
      <h3 className="font-display text-title-3 text-ink">{title}</h3>
      {body && <p className="max-w-md text-body text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-sunken', className)} aria-hidden />
}

/** A page-shaped skeleton: header, toolbar and rows. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('common.loadingLabel')}>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96" />
      <Skeleton className="mt-4 h-12 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

/**
 * Short simulated load on first render so pages show their skeleton, like
 * a real API round-trip (SPEC §3). Returns true while "loading".
 */
export function usePageLoading(ms = 350): boolean {
  const [loading, setLoading] = useState(import.meta.env.MODE !== 'test')
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])
  return loading
}

export function Chip({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline'; className?: string }) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    primary: 'bg-primary-subtle text-primary',
    success: 'bg-success-subtle text-success',
    warning: 'bg-warning-subtle text-warning',
    danger: 'bg-danger-subtle text-danger',
    info: 'bg-info-subtle text-info',
    outline: 'bg-transparent text-muted ring-1 ring-line-strong',
  }
  return <span className={clsx('chip whitespace-nowrap', tones[tone], className)}>{children}</span>
}

export function StatusChip({ status, className }: { status: AppointmentStatus; className?: string }) {
  const s = STATUS_STYLES[status]
  return (
    <span className={clsx('chip whitespace-nowrap', className)} style={{ color: s.fg, background: s.bg }}>
      {s.label}
    </span>
  )
}

export function ColorDot({ color, className }: { color: PaletteColor; className?: string }) {
  return <span className={clsx('inline-block h-3 w-3 shrink-0 rounded-full', className)} style={{ background: PALETTE[color].edge }} aria-hidden />
}

/** Initials avatar; shows `photo` (data URL, e.g. `client.photo`) when there is one. */
export function Avatar({ name, color, size = 40, className, photo }: { name: string; color?: PaletteColor; size?: number; className?: string; photo?: string }) {
  if (photo) {
    return <img src={photo} alt="" aria-hidden className={clsx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  }
  const parts = name.trim().split(/\s+/)
  const text = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] ?? '?')
  const palette = color ? PALETTE[color] : undefined
  return (
    <span
      className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold', !palette && 'bg-primary-subtle text-primary', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36), ...(palette ? { background: palette.fill, color: palette.text } : {}) }}
      aria-hidden
    >
      {text.toUpperCase()}
    </span>
  )
}

/** Simple white card section with optional heading and action. */
export function Card({ title, subtitle, action, children, className, padded = true }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx('card', padded && 'p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="font-display text-title-3 text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-body text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Label/value rows used in read-only detail cards. */
export function DetailList({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {rows.map((r, i) => (
        <div key={i}>
          <dt className="text-small text-muted">{r.label}</dt>
          <dd className="mt-0.5 text-body text-ink">{r.value || '-'}</dd>
        </div>
      ))}
    </dl>
  )
}
