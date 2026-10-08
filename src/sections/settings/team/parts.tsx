import clsx from 'clsx'
import { ChevronRight, Crown, Shield, ShieldCheck, ShieldHalf, ShieldOff, ShieldPlus, UserCog } from 'lucide-react'
import { Fragment, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui'
import { fullName } from '@/lib/format'
import type { TeamMember } from '@/types'
import { FullModal } from '../components/FullModal'

/** Icon for a permission role row. */
export function RoleIcon({ roleId, size = 20 }: { roleId: string; size?: number }) {
  const Icon = { basic: Shield, low: ShieldHalf, medium: ShieldCheck, high: ShieldPlus, owner: Crown, none: ShieldOff }[roleId] ?? UserCog
  return <Icon size={size} aria-hidden />
}

/** Overlapping member initials (max 3 + "+N"). */
export function MemberAvatars({ members, max = 3, label }: { members: TeamMember[]; max?: number; label?: string }) {
  if (!members.length) return null
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <div className="flex items-center" role="img" aria-label={label ?? members.map((m) => fullName(m)).join(', ')} title={members.map((m) => fullName(m)).join(', ')}>
      {shown.map((m, i) => (
        <Avatar key={m.id} name={fullName(m)} color={m.color} size={32} className={clsx('ring-2 ring-surface', i > 0 && '-ml-2')} />
      ))}
      {extra > 0 && <span className="-ml-2 inline-flex h-8 min-w-[32px] items-center justify-center rounded-full bg-sunken px-1.5 text-caption font-semibold text-muted ring-2 ring-surface">+{extra}</span>}
    </div>
  )
}

/** Green/grey state chip ("Active" / "Off", "On" / "Off"). */
export function StateChip({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return (
    <span className={clsx('inline-flex h-6 items-center rounded-full px-2.5 text-caption font-semibold', on ? 'bg-success-subtle text-success' : 'bg-sunken text-muted ring-1 ring-line-strong')}>{on ? onLabel : offLabel}</span>
  )
}

/** Wraps matches of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let from = 0
  let index = lower.indexOf(q)
  while (index !== -1) {
    if (index > from) parts.push(text.slice(from, index))
    parts.push(
      <mark key={index} className="rounded-xs bg-accent-subtle px-0.5 text-ink">
        {text.slice(index, index + q.length)}
      </mark>,
    )
    from = index + q.length
    index = lower.indexOf(q, from)
  }
  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

/** "Step one › Step two › Step three" breadcrumb of a wizard. */
export function StepCrumbs({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (index: number) => void }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('settings.tm.steps')} className="mb-3 flex flex-wrap items-center gap-2 text-body">
      {steps.map((label, index) => (
        <Fragment key={label}>
          {index > 0 && <ChevronRight size={16} className="text-muted" aria-hidden />}
          {onSelect && index < current ? (
            <button type="button" onClick={() => onSelect(index)} className="rounded-sm text-muted hover:text-ink hover:underline">
              {label}
            </button>
          ) : (
            <span className={index === current ? 'text-ink' : 'text-subtle'} aria-current={index === current ? 'step' : undefined}>
              {label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

/** Three-segment progress bar across the top of a wizard. */
function SegmentedProgress({ total, current }: { total: number; current: number }) {
  return (
    <div className="grid shrink-0 gap-2 px-6 pt-3" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={clsx('h-1 rounded-full transition-colors duration-base', index <= current ? 'bg-primary' : 'bg-sunken')} />
      ))}
    </div>
  )
}

/**
 * Page body for the 'full' layout routes (permission editor, add role and
 * PIN setup wizards): FullModal rendered in place, with an optional
 * segmented progress bar above it.
 */
export function TeamFullPage({ step, ...props }: Omit<ComponentProps<typeof FullModal>, 'open' | 'inline' | 'progress'> & { step?: { total: number; current: number } }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {step && <SegmentedProgress total={step.total} current={step.current} />}
      <div className="min-h-0 flex-1">
        <FullModal open inline {...props} />
      </div>
    </div>
  )
}
