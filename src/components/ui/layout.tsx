import clsx from 'clsx'
import { Check, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDrawer } from '@/lib/drawer'
import { money } from '@/lib/format'
import { Button } from './Button'

/** Standard content width for shell pages. */
export function Page({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return <div className={clsx('mx-auto w-full px-8 py-8', wide ? 'max-w-[1400px]' : 'max-w-[1120px]', className)}>{children}</div>
}

/** Search box used in list toolbars. */
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={clsx('relative block min-w-[240px] flex-1', className)}>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-10 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-body text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </label>
  )
}

/** Light-grey rounded band holding search, date range, filters and sort. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-2', className)}>{children}</div>
}

/** Opens the help centre on a topic (every "Learn more" link). */
export function LearnMore({ topic, children }: { topic: string; children?: ReactNode }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  return (
    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => drawer.open('resources', { tab: 'help', d_view: 'help-center', d_q: topic })}>
      {children ?? t('common.learnMore')}
    </button>
  )
}

/**
 * "Included in your plan" intro page used by features that aren't set up yet
 * (catalog.md intro pattern): badge, headline, text, ✓ bullets, Start now,
 * Learn more and an illustration slot.
 */
export function IntroPage({ badge, title, body, bullets, primary, secondary, price, art }: { badge?: string; title: ReactNode; body: ReactNode; bullets: string[]; primary: { label: string; onClick: () => void; loading?: boolean }; secondary?: ReactNode; price?: ReactNode; art?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="grid items-center gap-10 py-6 lg:grid-cols-[1fr_minmax(0,420px)]">
      <div>
        <span className="chip bg-accent-subtle text-warning">{badge ?? t('addons.includedInPlan')}</span>
        <h1 className="mt-4 font-display text-[36px] font-bold leading-[44px] text-ink">{title}</h1>
        <p className="mt-3 max-w-xl text-body-lg text-muted">{body}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
              <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
        {price && <p className="mt-6 text-body-lg text-ink">{price}</p>}
        <div className="mt-8 flex gap-3">
          <Button variant="primary" size="lg" onClick={primary.onClick} loading={primary.loading}>
            {primary.label}
          </Button>
          {secondary ?? <LearnMoreButton topic={String(title)} />}
        </div>
      </div>
      <div className="hidden lg:block">{art ?? <IntroArt />}</div>
    </div>
  )
}

function LearnMoreButton({ topic }: { topic: string }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  return (
    <Button size="lg" onClick={() => drawer.open('resources', { tab: 'help', d_view: 'help-center', d_q: topic })}>
      {t('common.learnMore')}
    </Button>
  )
}

/** Original abstract artwork for intro pages (no third-party illustrations). */
export function IntroArt() {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-primary-subtle">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-accent/40" />
      <div className="absolute bottom-6 left-6 right-16 rounded-lg bg-surface p-4 shadow-md">
        <div className="mb-3 h-3 w-24 rounded-full bg-primary/30" />
        {[70, 90, 55].map((w) => (
          <div key={w} className="mb-2 flex items-center gap-3">
            <span className="h-8 w-8 rounded-full bg-primary/20" />
            <span className="h-2.5 rounded-full bg-sunken" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="absolute right-6 top-10 rounded-lg bg-primary px-4 py-3 font-display text-title-3 text-on-primary shadow-md">{money(1240)}</div>
    </div>
  )
}

/**
 * Full-screen form/wizard frame: Close on the left, title, actions on the
 * right, optional progress bar and left section nav (SPEC §6 detail views).
 */
export function FullscreenFrame({
  title,
  onClose,
  actions,
  progress,
  nav,
  children,
  closeLabel,
  maxWidth = 'max-w-3xl',
}: {
  title?: ReactNode
  onClose?: () => void
  actions?: ReactNode
  progress?: number
  nav?: ReactNode
  children: ReactNode
  closeLabel?: string
  maxWidth?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const close = onClose ?? (() => (window.history.length > 1 ? navigate(-1) : navigate('/')))
  return (
    <div className="flex h-full flex-col bg-canvas">
      {progress !== undefined && (
        <div className="h-1 w-full bg-sunken" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-all duration-base" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6">
        <Button icon={<X size={16} />} onClick={close}>
          {closeLabel ?? t('common.close')}
        </Button>
        {title && <h1 className="truncate font-display text-title-3 text-ink">{title}</h1>}
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        {nav && <aside className="sticky top-0 hidden w-64 shrink-0 p-6 md:block">{nav}</aside>}
        <div className={clsx('mx-auto w-full flex-1 px-6 py-8', maxWidth)}>{children}</div>
      </div>
    </div>
  )
}

/** Left section nav for full-screen forms (Profile / Addresses / Settings…). */
export function SectionNav<T extends string>({ groups, value, onChange }: { groups: { heading?: string; items: { value: T; label: ReactNode; count?: number }[] }[]; value: T; onChange: (v: T) => void }) {
  return (
    <nav className="card p-3">
      {groups.map((g, i) => (
        <div key={i} className={clsx(i > 0 && 'mt-2 border-t border-line pt-2')}>
          {g.heading && <p className="px-3 pb-1 pt-1 text-caption uppercase tracking-wide text-muted">{g.heading}</p>}
          {g.items.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              aria-current={value === item.value ? 'true' : undefined}
              className={clsx('flex h-10 w-full items-center justify-between rounded-md px-3 text-left text-body', value === item.value ? 'bg-primary-subtle font-semibold text-primary' : 'text-ink hover:bg-sunken')}
            >
              {item.label}
              {item.count !== undefined && <span className="chip h-5 bg-sunken px-1.5 text-caption text-muted">{item.count}</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Right-hand drawer panel used inside a page (filters etc.). Registered drawers get the same chrome from DrawerHost. */
export function SideDrawer({ open, onClose, title, children, footer, width = 481 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label={t('drawers.closeDrawer')} tabIndex={-1} className="absolute inset-0 cursor-default bg-ink/10" onClick={onClose} />
      <div className="relative flex h-full animate-[slideIn_var(--dur-slow)_var(--ease)]">
        <button type="button" onClick={onClose} aria-label={t('drawers.closeDrawer')} className="absolute -left-16 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface shadow-md hover:bg-sunken">
          <X size={20} aria-hidden />
        </button>
        <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="flex h-full max-w-[100vw] flex-col bg-surface shadow-lg" style={{ width }}>
          <div className="border-b border-line px-6 py-5">
            <h2 className="font-display text-title-2 text-ink">{title}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
