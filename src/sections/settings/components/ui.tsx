import clsx from 'clsx'
import { CheckCircle2, Info, Lock, MinusCircle, MoreVertical, TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, LearnMore, Menu, MenuButton, PageSkeleton, usePageLoading, type MenuGroup } from '@/components/ui'

/**
 * Shared building blocks for every settings page (reference
 * settings-business-setup.md "Settings sub-page layout"): page title and
 * description "… Learn more.", header actions (Options ▾ + Add), white cards
 * each with a heading and an Edit button, and lists where every row is its
 * own card with an Actions ▾ menu (or a padlock for system rows).
 *
 * Edit and Add forms open full screen (./FullModal: Close + Save/Add at the
 * top right); previews, pickers and confirmations use the kit's Modal.
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
  const { t } = useTranslation()
  const loading = usePageLoading()
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between">
        <div className="min-w-0 md:flex-1">
          <h1 className="break-words font-display text-title-2 text-ink md:text-title-1">{title}</h1>
          {(description || learnMore) && (
            <p className="mt-1 max-w-3xl text-body text-muted md:text-body-lg">
              {description}
              {learnMore && (
                <>
                  {description ? ' ' : ''}
                  <LearnMore topic={learnMore}>{t('common.learnMore')}</LearnMore>.
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

/** The small secondary "Edit" (or custom label) button at the top right of a card. */
export function CardButton({ onClick, children, testId, disabled }: { onClick: () => void; children: ReactNode; testId?: string; disabled?: boolean }) {
  return (
    <Button size="sm" onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </Button>
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
    <section className={clsx('card', className)} data-testid={testId}>
      {banner && <div className="rounded-t-lg border-b border-line bg-sunken px-5 py-3 text-body text-ink md:px-6">{banner}</div>}
      <div className="p-5 md:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 md:flex md:justify-between md:gap-4">
          {/* Phones: the description runs full width under the title and the action. */}
          <div className="contents md:block md:min-w-0">
            <h2 className="self-center font-display text-title-3 text-ink md:self-auto">{title}</h2>
            {(description || learnMore) && (
              <p className="col-span-2 mt-1 text-body text-muted">
                {description}
                {learnMore && (
                  <>
                    {' '}
                    <LearnMore topic={learnMore}>{t('common.learnMore')}</LearnMore>

                  </>
                )}
              </p>
            )}
          </div>
          {(action || onEdit) && <div className="col-start-2 row-start-1 flex justify-end md:contents">{action ?? (onEdit && <CardButton onClick={onEdit}>{editLabel ?? t('settings.common.edit')}</CardButton>)}</div>}
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  )
}

/** White card holding the fields of a full-screen edit form. */
export function FormCard({ title, description, children, className, testId }: { title?: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={clsx('card flex flex-col gap-5 p-5 sm:p-8', className)} data-testid={testId}>
      {(title || description) && (
        <header>
          {title && <h2 className="font-display text-title-2 text-ink">{title}</h2>}
          {description && <p className="mt-1 text-body text-muted">{description}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Vertical stack of form cards. */
export function FormStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>
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
    <div className={clsx('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg px-4 py-3 md:flex-nowrap md:gap-3', tones[tone], className)} role="note">
      <Icon size={18} className={clsx('mt-0.5 shrink-0', iconTone)} aria-hidden />
      <div className="min-w-0 flex-1 text-body">
        {title && <p className="text-body-strong">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-ink/90')}>{children}</div>}
      </div>
      {action && <div className="order-last w-full shrink-0 pl-[30px] md:order-none md:w-auto md:pl-0">{action}</div>}
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
    <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[#0B4F4C] p-5 text-on-primary md:p-7">
      <div className="relative z-10 pr-6 md:max-w-[60%] md:pr-0">
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
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] md:block" aria-hidden>
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

/** "Options ▾" (or any label) menu button for page headers. */
export function PillMenu({ label, groups, primary, align = 'right', width = 280, testId }: { label: ReactNode; groups: MenuGroup[]; primary?: boolean; align?: 'left' | 'right'; width?: number; testId?: string }) {
  return (
    <Menu
      groups={groups}
      align={align}
      width={width}
      trigger={({ open, toggle }) => (
        <span data-testid={testId} className="contents">
          <MenuButton open={open} toggle={toggle} primary={primary}>
            {label}
          </MenuButton>
        </span>
      )}
    />
  )
}

/** "Actions ▾" menu used on cards and list rows (same look as Options ▾); a ⋮ icon button on phones. */
export function ActionsPill({ groups, label, width = 240, testId }: { groups: MenuGroup[]; label?: string; width?: number; testId?: string }) {
  const { t } = useTranslation()
  const text = label ?? t('settings.common.actions')
  return (
    <Menu
      groups={groups}
      align="right"
      width={width}
      trigger={({ open, toggle }) => (
        <span data-testid={testId} className="contents">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={text}
            onClick={toggle}
            className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface text-body-strong text-ink transition-colors hover:bg-sunken md:w-auto md:px-4"
          >
            <MoreVertical size={18} aria-hidden className="md:hidden" />
            <span className="hidden md:inline">{text}</span>
            <span aria-hidden className="hidden text-[10px] md:inline">▼</span>
          </button>
        </span>
      )}
    />
  )
}

/** A list of rows; each row is its own card (reference: Cancellation reasons, Registers…). */
export function ListCard({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div className={clsx('flex flex-col gap-3', className)} data-testid={testId}>
      {children}
    </div>
  )
}

/** One row card: leading tile, title, subtitle and trailing actions. */
export function ListRow({
  leading,
  tile = true,
  title,
  subtitle,
  trailing,
  onClick,
  accent,
  testId,
}: {
  leading?: ReactNode
  /** Wrap `leading` in the grey 44px tile (false when it brings its own). */
  tile?: boolean
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  /** Colour of a 4px bar on the left edge (appointment statuses). */
  accent?: string
  testId?: string
}) {
  return (
    <div className={clsx('card relative flex items-center gap-3 px-4 py-4 md:gap-4 md:px-6 md:py-5', onClick && 'cursor-pointer transition-colors hover:bg-sunken/50')} onClick={onClick} data-testid={testId}>
      {accent && <span className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ background: accent }} aria-hidden />}
      {leading && (tile ? <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-sunken text-title-3 text-ink">{leading}</div> : <div className="shrink-0">{leading}</div>)}
      <div className="min-w-0 flex-1">
        <div className="break-words text-body-strong text-ink md:truncate">{title}</div>
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

/** Grey padlock shown instead of Actions on rows that can't be edited (system items). */
export function LockMark({ label }: { label: string }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center text-subtle" title={label} role="img" aria-label={label}>
      <Lock size={20} aria-hidden />
    </span>
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

/** Divider used between groups inside cards. */
export const Rule = ({ className }: { className?: string }) => <hr className={clsx('border-line', className)} />

/** Form wrapper that submits on Enter (used inside full-screen forms). */
export function ModalForm({ onSubmit, children, className }: { onSubmit: () => void; children: ReactNode; className?: string }) {
  return (
    <form
      className={clsx('flex flex-col gap-5', className)}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
      <button type="submit" hidden aria-hidden tabIndex={-1} />
    </form>
  )
}
