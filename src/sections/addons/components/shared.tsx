import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, Link2, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, LearnMore } from '@/components/ui'
import { META } from '../catalog'

/** Add-on icon tile (cards, intro label, order card, manage header). */
export function AddOnIcon({ slug, size = 22, className = 'h-12 w-12 rounded-md' }: { slug: string; size?: number; className?: string }) {
  const meta = META[slug]
  const Icon = meta?.icon ?? (meta?.mark ? null : Link2)
  return (
    <span className={clsx('flex shrink-0 items-center justify-center font-display font-bold', meta?.tile ?? 'bg-primary-subtle text-primary', className)} aria-hidden>
      {Icon ? <Icon size={size} /> : <span style={{ fontSize: Math.round(size * 0.75) }}>{meta?.mark}</span>}
    </span>
  )
}

/** Pastel illustration panel; Bookable Resources cycles its words (add-ons.md §2.7). */
export function IntroArt({ slug, words }: { slug: string; words?: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!words?.length) return
    const id = window.setInterval(() => setI((x) => (x + 1) % words.length), 1400)
    return () => window.clearInterval(id)
  }, [words])
  return (
    <div className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-surface via-primary-subtle to-info-subtle">
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-info/20 blur-2xl" aria-hidden />
      <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-accent/20 blur-2xl" aria-hidden />
      <div className="relative w-[260px] rounded-xl bg-surface p-5 shadow-md" aria-hidden>
        <div className="flex items-center gap-3">
          <AddOnIcon slug={slug} size={20} className="h-10 w-10 rounded-md" />
          <span className="h-3 w-28 rounded-full bg-sunken" />
        </div>
        <div className="mt-5 flex h-24 items-end gap-2">
          {[55, 80, 40, 95, 65, 75].map((h, k) => (
            <span key={k} className="flex-1 rounded-t-sm bg-primary/70" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <span className="h-2.5 w-full rounded-full bg-sunken" />
          <span className="h-2.5 w-2/3 rounded-full bg-sunken" />
        </div>
      </div>
      {words?.length ? (
        <span className="absolute bottom-10 right-10 rounded-full bg-surface px-5 py-2 font-display text-title-3 text-ink shadow-md" aria-live="polite">
          {words[i]}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Intro screen (add-ons.md §1.1): full-screen white page with ✕ "Close modal
 * icon", icon + product name, heading, text, ✓ bullets, price, primary button
 * and Learn more on the left, illustration on the right.
 */
export function IntroScreen({
  slug,
  label,
  heading,
  body,
  bullets,
  price,
  badge,
  primary,
  onClose,
  words,
  footer,
}: {
  slug: string
  label: string
  heading: string
  body?: string
  bullets: string[]
  price?: ReactNode
  badge?: ReactNode
  primary: { label: string; onClick: () => void; loading?: boolean }
  onClose: () => void
  words?: string[]
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="addon-intro-heading" className="relative min-h-0 flex-1 overflow-y-auto bg-surface">
      <button type="button" className="icon-btn absolute right-3 top-3 z-10 h-11 w-11 md:right-8 md:top-6" aria-label={t('addons.closeModal')} onClick={onClose}>
        <X size={24} aria-hidden />
      </button>
      <div className="mx-auto grid min-h-full w-full max-w-[1240px] items-center gap-12 px-5 pb-10 pt-16 md:px-8 md:py-16 lg:grid-cols-[1fr_minmax(0,460px)]">
        <div>
          <div className="flex items-center gap-3">
            <AddOnIcon slug={slug} size={22} className="h-12 w-12 rounded-md" />
            <p className="min-w-0 text-body-lg font-semibold text-ink">{label}</p>
            {badge}
          </div>
          <h1 id="addon-intro-heading" className="mt-5 max-w-[620px] md:mt-6 font-display text-[30px] font-bold leading-[38px] md:text-[44px] md:leading-[52px] text-ink">
            {heading}
          </h1>
          {body && <p className="mt-4 max-w-[620px] text-body-lg text-ink md:text-[18px] md:leading-7">{body}</p>}
          <ul className="mt-6 flex max-w-[640px] flex-col gap-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          {price && <div className="mt-8 md:mt-12">{price}</div>}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 md:mt-10">
            <Button variant="primary" size="lg" className="rounded-full px-7" loading={primary.loading} onClick={primary.onClick}>
              {primary.label}
            </Button>
            <LearnMore topic={heading}>
              <span className="text-body-lg font-semibold text-ink hover:underline">{t('addons.learnMore')}</span>
            </LearnMore>
          </div>
          {footer && <div className="mt-10 md:mt-12">{footer}</div>}
        </div>
        <div className="hidden lg:block">
          <IntroArt slug={slug} words={words} />
        </div>
      </div>
    </div>
  )
}

/**
 * Wizard / enable-screen frame: segmented progress, ← back arrow on the left,
 * Close and the primary action on the right (add-ons.md §1.1, §2.1, §3.1).
 */
export function WizardFrame({
  steps,
  step,
  onBack,
  onClose,
  primary,
  closeLabel,
  children,
  maxWidth = 'max-w-[880px]',
}: {
  steps?: number
  step?: number
  onBack?: () => void
  onClose: () => void
  primary?: { label: string; onClick?: () => void; loading?: boolean; disabled?: boolean; form?: string; arrow?: boolean }
  closeLabel?: string
  children: ReactNode
  maxWidth?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas">
      {steps !== undefined && step !== undefined && (
        <div className="mx-auto flex w-full max-w-[1720px] gap-1.5 px-4 pt-3 md:gap-2 md:px-8 md:pt-4" role="progressbar" aria-valuemin={0} aria-valuemax={steps} aria-valuenow={step} aria-label={t('addons.progress', { step, steps })}>
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={clsx('h-1 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-line')} />
          ))}
        </div>
      )}
      <header className="mx-auto flex w-full max-w-[1720px] items-center justify-between gap-2 px-4 py-3 md:gap-4 md:px-8 md:py-4">
        {onBack ? (
          <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-sunken md:h-12 md:w-12" aria-label={t('addons.back')} onClick={onBack}>
            <ArrowLeft size={20} aria-hidden />
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button size="lg" className="rounded-full" onClick={onClose}>
            {closeLabel ?? t('addons.close')}
          </Button>
          {primary && (
            <Button size="lg" variant="primary" className="rounded-full" type={primary.form ? 'submit' : 'button'} form={primary.form} loading={primary.loading} disabled={primary.disabled} onClick={primary.onClick} iconRight={primary.arrow ? <ArrowRight size={18} aria-hidden /> : undefined}>
              {primary.label}
            </Button>
          )}
        </div>
      </header>
      <main className={clsx('mx-auto w-full flex-1 px-4 pb-12 pt-3 md:px-8 md:pb-16 md:pt-6', maxWidth)}>{children}</main>
    </div>
  )
}
