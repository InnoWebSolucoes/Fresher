import { Award, BarChart3, Boxes, Check, CreditCard, Database, Headphones, Link2, MessageCircle, Star, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, LearnMore } from '@/components/ui'

export const ICONS: Record<string, LucideIcon> = {
  payments: CreditCard,
  'premium-support': Headphones,
  insights: BarChart3,
  'google-rating-boost': Star,
  loyalty: Award,
  'data-connector': Database,
  'client-connect': MessageCircle,
  'team-chat': Users,
  'bookable-resources': Boxes,
}

export function AddOnIcon({ slug, size = 24, className = 'h-12 w-12' }: { slug: string; size?: number; className?: string }) {
  const Icon = ICONS[slug] ?? Link2
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary ${className}`}>
      <Icon size={size} aria-hidden />
    </span>
  )
}

/** Pastel illustration panel; Bookable Resources cycles its words. */
export function IntroArt({ slug, words }: { slug: string; words?: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!words?.length) return
    const id = window.setInterval(() => setI((x) => (x + 1) % words.length), 1400)
    return () => window.clearInterval(id)
  }, [words])
  const Icon = ICONS[slug] ?? Link2
  return (
    <div className="relative flex h-full min-h-[320px] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-subtle via-accent-subtle to-info-subtle">
      <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-surface/50" aria-hidden />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-surface/40" aria-hidden />
      <div className="relative flex flex-col items-center gap-4">
        <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-surface text-primary shadow-md">
          <Icon size={48} aria-hidden />
        </span>
        {words?.length ? <span className="rounded-full bg-surface px-4 py-1.5 font-display text-title-3 text-ink shadow-sm" aria-live="polite">{words[i]}</span> : null}
      </div>
    </div>
  )
}

/** Intro modal over a full-screen overlay (add-ons.md §1.1). */
export function IntroModal({
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
}: {
  slug: string
  label: string
  heading: string
  body: string
  bullets: string[]
  price?: ReactNode
  badge?: ReactNode
  primary: { label: string; onClick: () => void; loading?: boolean }
  onClose: () => void
  words?: string[]
}) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="flex min-h-full items-center justify-center bg-ink/40 p-4 sm:p-8">
      <div role="dialog" aria-modal="true" aria-labelledby="addon-intro-heading" className="relative grid w-full max-w-[1040px] gap-8 rounded-xl bg-surface p-6 shadow-lg md:grid-cols-[1fr_minmax(0,420px)] md:p-10">
        <button type="button" className="icon-btn absolute left-4 top-4 h-10 w-10" aria-label={t('addons.closeModal')} onClick={onClose}>
          <X size={20} aria-hidden />
        </button>
        <div className="pt-8">
          <div className="flex items-center gap-2">
            <p className="text-body-strong text-muted">{label}</p>
            {badge}
          </div>
          <h1 id="addon-intro-heading" className="mt-3 font-display text-[32px] font-bold leading-[40px] text-ink">{heading}</h1>
          <p className="mt-3 text-body-lg text-muted">{body}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          {price && <div className="mt-6">{price}</div>}
          <div className="mt-8 flex items-center gap-4">
            <Button variant="primary" size="lg" loading={primary.loading} onClick={primary.onClick}>
              {primary.label}
            </Button>
            <LearnMore topic={heading}>{t('addons.learnMore')}</LearnMore>
          </div>
        </div>
        <div className="hidden md:block">
          <IntroArt slug={slug} words={words} />
        </div>
      </div>
    </div>
  )
}
