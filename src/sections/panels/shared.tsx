import clsx from 'clsx'
import { differenceInCalendarDays, formatDistanceStrict, isValid, parseISO } from 'date-fns'
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { now } from '@/lib/time'

/** "Just now", "8 minutes ago", "2 days ago". */
export function useTimeAgo() {
  const { t } = useTranslation()
  return (iso: string) => {
    const date = parseISO(iso)
    if (!isValid(date)) return ''
    const diff = now().getTime() - date.getTime()
    if (diff < 60_000) return t('panels.common.justNow')
    return formatDistanceStrict(date, now(), { addSuffix: true })
  }
}

/** "Today", "Yesterday" or a date label for day separators. */
export function useDayLabel() {
  const { t } = useTranslation()
  return (iso: string, fallback: string) => {
    const days = differenceInCalendarDays(now(), parseISO(iso))
    if (days === 0) return t('panels.common.today')
    if (days === 1) return t('panels.common.yesterday')
    return fallback
  }
}

/** Header used by the panel drawers (title, optional subtitle, Back and actions). */
export function PanelHeader({ title, subtitle, actions, onBack }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; onBack?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="px-6 pb-4 pt-6">
      {onBack && (
        <button type="button" onClick={onBack} className="btn-secondary mb-4 h-9 rounded-full px-3">
          <ArrowLeft size={16} aria-hidden />
          {t('common.back')}
        </button>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-title-2 text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export interface BottomTab<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  badge?: number
}

/** Bottom tab bar for the Resources and Notifications drawers. */
export function BottomTabs<T extends string>({ items, value, onChange }: { items: BottomTab<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex shrink-0 border-t border-line bg-surface">
      {items.map(({ value: v, label, icon: Icon, badge }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-caption transition-colors',
            value === v ? 'text-primary' : 'text-muted hover:text-ink',
          )}
        >
          {value === v && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
          <span className="relative">
            <Icon size={20} strokeWidth={1.75} aria-hidden />
            {!!badge && (
              <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>
            )}
          </span>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Highlights each query word inside `text` with <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!words.length) return <>{text}</>
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-xs bg-accent-subtle px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/** "↑ 12%" / "↓ 4%" / "0%" comparison label. */
export function Change({ current, previous, className }: { current: number; previous: number; className?: string }) {
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - previous) / Math.abs(previous)) * 100)
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : ArrowUpDown
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-caption', pct > 0 ? 'text-success' : pct < 0 ? 'text-danger' : 'text-muted', className)}>
      <Icon size={12} aria-hidden />
      {Math.abs(pct)}%
    </span>
  )
}

/** Small spinner ring used in simulated waits. */
export function Spinner({ size = 28 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-[3px] border-primary/25 border-t-primary motion-reduce:animate-none" style={{ width: size, height: size }} aria-hidden />
}

/** Stacked initials avatars ("+6"), used for support agents. */
export function AgentAvatars({ names, extra, light }: { names: string[]; extra: number; light?: boolean }) {
  const tones = ['bg-accent text-on-accent', 'bg-primary-subtle text-primary', 'bg-info-subtle text-info', 'bg-success-subtle text-success']
  return (
    <div className="flex items-center justify-center">
      {names.map((n, i) => (
        <span key={n} className={clsx('-ml-2 flex h-11 w-11 items-center justify-center rounded-full font-display text-body-strong ring-2 first:ml-0', light ? 'ring-white/70' : 'ring-surface', tones[i % tones.length])} aria-hidden>
          {n[0]}
        </span>
      ))}
      <span className={clsx('-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-body-strong ring-2', light ? 'bg-white/25 text-white ring-white/70' : 'bg-sunken text-muted ring-surface')}>+{extra}</span>
    </div>
  )
}
