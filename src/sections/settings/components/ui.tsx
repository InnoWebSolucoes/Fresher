import clsx from 'clsx'
import { CheckCircle2, ChevronDown, Info, MinusCircle, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, LearnMore, Menu, MenuButton, PageSkeleton, usePageLoading, type MenuGroup } from '@/components/ui'

/**
 * Shared building blocks for the settings pages (reference
 * settings-business-setup.md §0: title, description "… Learn more.", then
 * white cards each with a heading and an Edit button).
 */

/** Right-hand content of a settings sub-page: header + skeleton on first render. */
export function SettingsPage({
  title,
  description,
  learnMore,
  actions,
  children,
  skeletonRows = 4,
}: {
  title: ReactNode
  description?: ReactNode
  /** Help-centre topic for the "Learn more" link; omit to hide the link. */
  learnMore?: string
  actions?: ReactNode
  children: ReactNode
  skeletonRows?: number
}) {
  const loading = usePageLoading()
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-title-1 text-ink">{title}</h1>
          {(description || learnMore) && (
            <p className="mt-1 max-w-3xl text-body-lg text-muted">
              {description}
              {learnMore && (
                <>
                  {' '}
                  <LearnMore topic={learnMore} />
                </>
              )}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {loading ? <PageSkeleton rows={skeletonRows} /> : children}
    </div>
  )
}

/** White card with heading, description and an Edit (or custom) action at the top right. */
export function EditCard({
  title,
  description,
  learnMore,
  onEdit,
  editLabel,
  action,
  children,
  banner,
  className,
  testId,
}: {
  title: ReactNode
  description?: ReactNode
  learnMore?: string
  onEdit?: () => void
  editLabel?: string
  action?: ReactNode
  children?: ReactNode
  /** Grey strip above the card content (e.g. "This setting is using workspace defaults"). */
  banner?: ReactNode
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <section className={clsx('card overflow-hidden', className)} data-testid={testId}>
      {banner && <div className="border-b border-line bg-sunken px-6 py-3 text-body text-ink">{banner}</div>}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-title-3 text-ink">{title}</h2>
            {(description || learnMore) && (
              <p className="mt-1 text-body text-muted">
                {description}
                {learnMore && (
                  <>
                    {' '}
                    <LearnMore topic={learnMore} />
                  </>
                )}
              </p>
            )}
          </div>
          {action ??
            (onEdit && (
              <Button size="sm" className="rounded-full px-4" onClick={onEdit}>
                {editLabel ?? t('settings.common.edit')}
              </Button>
            ))}
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  )
}

/** Label (ink) over value (muted) pairs in one or two columns. */
export function InfoGrid({ rows, cols = 2 }: { rows: { label: ReactNode; value: ReactNode; key?: string }[]; cols?: 1 | 2 }) {
  return (
    <dl className={clsx('grid gap-x-8 gap-y-4', cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
      {rows.map((r, i) => (
        <div key={r.key ?? i} className="min-w-0">
          <dt className="text-body-strong text-ink">{r.label}</dt>
          <dd className="mt-0.5 break-words text-body text-muted">{r.value === '' || r.value === null || r.value === undefined ? '-' : r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Bulleted summary lines ("• Clients can book …"). `on: false` renders a muted minus icon. */
export function SummaryList({ items, variant = 'dot' }: { items: { text: ReactNode; on?: boolean; key?: string }[]; variant?: 'dot' | 'check' }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={item.key ?? i} className="flex items-start gap-2.5 text-body text-ink">
          {variant === 'check' ? (
            item.on === false ? (
              <MinusCircle size={18} className="mt-px shrink-0 text-muted" aria-hidden />
            ) : (
              <CheckCircle2 size={18} className="mt-px shrink-0 text-success" aria-hidden />
            )
          ) : (
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
          )}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Inline notice. */
export function Banner({ tone = 'info', title, children, action, onDismiss, className }: { tone?: 'info' | 'warning' | 'success' | 'neutral' | 'danger'; title?: ReactNode; children?: ReactNode; action?: ReactNode; onDismiss?: () => void; className?: string }) {
  const { t } = useTranslation()
  const tones = {
    info: 'bg-info-subtle text-ink',
    warning: 'bg-warning-subtle text-ink',
    success: 'bg-success-subtle text-ink',
    neutral: 'bg-sunken text-ink',
    danger: 'bg-danger-subtle text-ink',
  }
  const Icon = tone === 'warning' || tone === 'danger' ? TriangleAlert : tone === 'success' ? CheckCircle2 : Info
  const iconTone = { info: 'text-info', warning: 'text-warning', success: 'text-success', neutral: 'text-muted', danger: 'text-danger' }[tone]
  return (
    <div className={clsx('flex items-start gap-3 rounded-lg px-4 py-3', tones[tone], className)} role="note">
      <Icon size={18} className={clsx('mt-0.5 shrink-0', iconTone)} aria-hidden />
      <div className="min-w-0 flex-1 text-body">
        {title && <p className="text-body-strong">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-ink/90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={t('common.dismiss')} className="icon-btn -my-1 -mr-2 h-8 w-8 shrink-0">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  )
}

/** Teal promo banner with our own abstract artwork (Payments, Client Connect, add-ons…). */
export function PromoCard({ eyebrow, title, body, action, onDismiss, art = 'cards' }: { eyebrow?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; onDismiss?: () => void; art?: 'cards' | 'phone' | 'terminal' }) {
  const { t } = useTranslation()
  return (
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[#0B4F4C] p-7 text-on-primary">
      <div className="relative z-10 max-w-[60%]">
        {eyebrow && <p className="text-caption uppercase tracking-wide text-on-primary/80">{eyebrow}</p>}
        <h2 className="mt-1 font-display text-title-2">{title}</h2>
        {body && <p className="mt-2 text-body-lg text-on-primary/90">{body}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
      <PromoArt kind={art} />
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={t('common.dismiss')} className="absolute right-3 top-3 z-20 rounded-full p-1.5 text-on-primary hover:bg-white/15">
          <X size={18} aria-hidden />
        </button>
      )}
    </section>
  )
}

function PromoArt({ kind }: { kind: 'cards' | 'phone' | 'terminal' }) {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%]" aria-hidden>
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-accent/50" />
      <div className="absolute bottom-[-30px] right-24 h-32 w-32 rounded-full bg-white/10" />
      {kind === 'phone' && (
        <div className="absolute bottom-[-20px] right-10 h-44 w-24 rounded-[22px] border-4 border-white/80 bg-white/15 p-2">
          <div className="mt-6 h-2 w-12 rounded-full bg-white/70" />
          <div className="mt-2 h-8 rounded-md bg-white/80" />
          <div className="mt-2 ml-auto h-6 w-14 rounded-md bg-accent" />
        </div>
      )}
      {kind === 'terminal' && (
        <div className="absolute bottom-4 right-10 h-36 w-24 rotate-12 rounded-2xl bg-ink/80 p-2 shadow-lg">
          <div className="h-12 rounded-lg bg-primary-subtle/80" />
          <div className="mt-2 grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="h-3 rounded-sm bg-white/30" />
            ))}
          </div>
        </div>
      )}
      {kind === 'cards' && (
        <>
          <div className="absolute bottom-8 right-16 h-24 w-40 -rotate-6 rounded-lg bg-white/90 shadow-md">
            <div className="m-3 h-3 w-10 rounded-full bg-primary/40" />
            <div className="mx-3 mt-6 h-2 w-24 rounded-full bg-ink/20" />
          </div>
          <div className="absolute bottom-16 right-6 h-24 w-40 rotate-6 rounded-lg bg-accent shadow-md">
            <div className="m-3 h-3 w-10 rounded-full bg-white/70" />
          </div>
        </>
      )}
    </div>
  )
}

/** "Options ▾" (or any label) pill menu. */
export function PillMenu({ label, groups, primary, align = 'right', width = 280 }: { label: ReactNode; groups: MenuGroup[]; primary?: boolean; align?: 'left' | 'right'; width?: number }) {
  return (
    <Menu
      groups={groups}
      align={align}
      width={width}
      trigger={({ open, toggle }) => (
        <MenuButton open={open} toggle={toggle} primary={primary}>
          {label}
        </MenuButton>
      )}
    />
  )
}

/** Small "Actions ⌄" pill used on cards and list rows. */
export function ActionsPill({ groups, label, width = 220 }: { groups: MenuGroup[]; label?: string; width?: number }) {
  const { t } = useTranslation()
  return (
    <Menu
      groups={groups}
      width={width}
      label={label ?? t('settings.common.actions')}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken"
        >
          {label ?? t('settings.common.actions')}
          <ChevronDown size={16} aria-hidden />
        </button>
      )}
    />
  )
}

/** A card containing a list of rows. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('card divide-y divide-line', className)}>{children}</div>
}

/** One row: leading tile, title, subtitle and trailing actions. */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  testId,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  testId?: string
}) {
  return (
    <div className={clsx('flex items-center gap-4 px-5 py-4', onClick && 'cursor-pointer hover:bg-sunken/60')} onClick={onClick} data-testid={testId}>
      {leading && <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-sunken text-title-3 text-ink">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-strong text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-body text-muted">{subtitle}</div>}
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {trailing}
        </div>
      )}
    </div>
  )
}

/** Section heading inside a card or modal. */
export function SectionHeading({ title, description, className }: { title: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="font-display text-title-3 text-ink">{title}</h3>
      {description && <p className="mt-1 text-body text-muted">{description}</p>}
    </div>
  )
}

/** Green "Active" / grey "Inactive" label. */
export function ActiveLabel({ active, activeText, inactiveText }: { active: boolean; activeText?: string; inactiveText?: string }) {
  const { t } = useTranslation()
  return <span className={clsx('text-small', active ? 'text-success' : 'text-muted')}>{active ? (activeText ?? t('settings.common.active')) : (inactiveText ?? t('settings.common.inactive'))}</span>
}

/** "Add" link-style button used in empty values ("Add"). */
export function AddLink({ onClick, children }: { onClick: () => void; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onClick} className="text-body-strong text-primary hover:underline">
      {children ?? t('settings.common.add')}
    </button>
  )
}
