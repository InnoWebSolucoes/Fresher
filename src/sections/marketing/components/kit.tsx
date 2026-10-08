import clsx from 'clsx'
import { ArrowLeft, Info, Mail, MessageCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { BillingDetails } from '@/types'
import { Field, Select, TextInput } from '@/components/ui'

/**
 * Building blocks shared by the Marketing and Online presence sections:
 * the wizard frame (segmented progress, round back button), device and
 * inbox mock-ups, stat cards and the card + billing details form.
 */

export function WizardFrame({
  segments,
  onBack,
  actions,
  children,
  maxWidth = 'max-w-[760px]',
  backLabel,
}: {
  segments?: number[]
  onBack?: () => void
  actions?: ReactNode
  children: ReactNode
  maxWidth?: string
  backLabel?: string
}) {
  const { t } = useTranslation()
  const total = segments?.length ? Math.round((segments.reduce((s, f) => s + Math.max(0, Math.min(1, f)), 0) / segments.length) * 100) : 0
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {segments && (
        <div className="flex gap-2 px-6 pt-3" role="progressbar" aria-valuenow={total} aria-valuemin={0} aria-valuemax={100} aria-label={t('marketing.kit.progress', { value: total })}>
          {segments.map((fill, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-primary transition-all duration-base" style={{ width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%` }} />
            </div>
          ))}
        </div>
      )}
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 px-6">
        <div>
          {onBack && (
            <button type="button" onClick={onBack} aria-label={backLabel ?? t('marketing.kit.back')} className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-sunken">
              <ArrowLeft size={20} aria-hidden />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={clsx('mx-auto w-full px-6 pb-16 pt-2', maxWidth)}>{children}</div>
      </div>
    </div>
  )
}

export function WizardTitle({ eyebrow, title, subtitle, className }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-8', className)}>
      {eyebrow && <p className="mb-2 text-body text-muted">{eyebrow}</p>}
      <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{title}</h1>
      {subtitle && <p className="mt-3 max-w-2xl text-body-lg text-muted">{subtitle}</p>}
    </div>
  )
}

/** Three-numbered-stage overview screen used by wizards ("Get published…", "Launch your website…"). */
export function StagesOverview({ title, highlight, stages }: { title: ReactNode; highlight?: ReactNode; stages: { title: string; body: string; icon: ReactNode }[] }) {
  return (
    <div className="grid items-center gap-12 py-8 lg:grid-cols-2">
      <h1 className="font-display text-[44px] font-bold leading-[52px] text-ink">
        {title} {highlight && <span className="text-primary">{highlight}</span>}
      </h1>
      <ol className="divide-y divide-line">
        {stages.map((stage, i) => (
          <li key={stage.title} className="flex items-start gap-4 py-6 first:pt-0 last:pb-0">
            <span className="font-display text-title-2 text-ink">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-title-2 text-ink">{stage.title}</h2>
              <p className="mt-2 text-body-lg text-muted">{stage.body}</p>
            </div>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">{stage.icon}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** "Step N" chapter screen inside a wizard. */
export function ChapterScreen({ step, title, body, icon }: { step: string; title: string; body: string; icon: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-10 md:flex-row md:justify-start">
      <span className="flex h-40 w-40 shrink-0 items-center justify-center rounded-[36px] bg-gradient-to-br from-primary-subtle to-accent-subtle text-primary shadow-sm">{icon}</span>
      <div className="max-w-xl">
        <p className="text-body-strong text-ink">{step}</p>
        <h1 className="mt-2 font-display text-[36px] font-bold leading-[44px] text-ink">{title}</h1>
        <p className="mt-4 text-body-lg text-ink">{body}</p>
      </div>
    </div>
  )
}

export function BrowserFrame({ children, url, className }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={clsx('overflow-hidden rounded-lg border border-line bg-surface shadow-md', className)}>
      <div className="flex items-center gap-3 border-b border-line bg-sunken px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </span>
        {url && <span className="min-w-0 flex-1 truncate rounded-full bg-surface px-3 py-1 text-caption text-muted">{url}</span>}
      </div>
      {children}
    </div>
  )
}

export function PhoneFrame({ children, className, width = 300 }: { children: ReactNode; className?: string; width?: number }) {
  return (
    <div className={clsx('relative mx-auto overflow-hidden rounded-[36px] border-[7px] border-ink bg-surface shadow-lg', className)} style={{ width }}>
      <div className="absolute left-1/2 top-1.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" aria-hidden />
      <div className="max-h-[600px] min-h-[520px] overflow-y-auto pt-8">{children}</div>
    </div>
  )
}

/** Inbox-style email mock (subject, sender, body). */
export function EmailMock({ subject, fromName, fromEmail, children, className }: { subject: ReactNode; fromName: string; fromEmail: string; children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={clsx('overflow-hidden rounded-xl border-4 border-primary-subtle bg-surface shadow-sm', className)}>
      <div className="flex gap-1.5 bg-primary-subtle/60 px-4 py-3" aria-hidden>
        <span className="h-3 w-3 rounded-full bg-primary/30" />
        <span className="h-3 w-3 rounded-full bg-primary/30" />
        <span className="h-3 w-3 rounded-full bg-primary/30" />
      </div>
      <div className="border-b border-line px-6 py-5">
        <p className="font-display text-title-3 text-ink">{subject}</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <Mail size={18} aria-hidden />
          </span>
          <div className="min-w-0 text-body">
            <p className="truncate">
              <span className="font-semibold text-ink">{fromName}</span> <span className="text-muted">&lt;{fromEmail}&gt;</span>
            </p>
            <p className="text-muted">{t('marketing.kit.toInbox')}</p>
          </div>
        </div>
      </div>
      <div className="bg-sunken/60 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-[560px] rounded-xl bg-surface px-6 py-8 shadow-xs sm:px-10">{children}</div>
      </div>
    </div>
  )
}

/** Phone conversation with a single incoming bubble (text message or WhatsApp). */
export function MessageBubblePreview({ sender, text, kind }: { sender: string; text: string; kind: 'sms' | 'whatsapp' }) {
  const { t } = useTranslation()
  return (
    <PhoneFrame width={290}>
      <div className={clsx('flex items-center gap-2 border-b px-4 pb-3', kind === 'whatsapp' ? 'border-success/30 bg-success-subtle' : 'border-line')}>
        <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full text-caption font-semibold', kind === 'whatsapp' ? 'bg-success text-white' : 'bg-sunken text-ink')}>
          <MessageCircle size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-body-strong text-ink">{sender}</p>
          <p className="text-caption text-muted">{kind === 'whatsapp' ? t('marketing.kit.whatsappBusiness') : t('marketing.kit.textMessage')}</p>
        </div>
      </div>
      <div className={clsx('min-h-[440px] px-3 py-4', kind === 'whatsapp' ? 'bg-[#efe7dc] dark:bg-sunken' : 'bg-surface')}>
        <p className="mb-2 text-center text-caption text-muted">{t('marketing.kit.today')}</p>
        <div className={clsx('max-w-[230px] whitespace-pre-wrap rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-small text-ink shadow-xs', kind === 'whatsapp' ? 'bg-white text-[#10201F]' : 'bg-sunken')}>{text}</div>
      </div>
    </PhoneFrame>
  )
}

export function StatCard({ label, value, hint, icon, tone = 'plain', info }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'plain' | 'tinted'; info?: string }) {
  return (
    <div className={clsx('rounded-lg border p-5', tone === 'tinted' ? 'border-primary/20 bg-primary-subtle/50' : 'border-line bg-surface')}>
      <div className="flex items-center gap-2 text-body text-ink">
        {icon && <span className="text-muted">{icon}</span>}
        <span>{label}</span>
        {info && (
          <span title={info} className="text-subtle">
            <Info size={14} aria-label={info} />
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-title-1 text-ink">{value}</p>
      {hint && <div className="mt-1 text-small text-muted">{hint}</div>}
    </div>
  )
}

/** Breadcrumb row with a Back pill ("← Back  Automations · Appointment reminder"). */
export function BackCrumbs({ onBack, crumbs }: { onBack: () => void; crumbs: { label: string; onClick?: () => void }[] }) {
  const { t } = useTranslation()
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-body-strong text-ink hover:bg-sunken">
        <ArrowLeft size={16} aria-hidden />
        {t('marketing.kit.back')}
      </button>
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-body">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-subtle">·</span>}
            {c.onClick ? (
              <button type="button" onClick={c.onClick} className="text-muted hover:text-ink hover:underline">
                {c.label}
              </button>
            ) : (
              <span className="text-ink">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  )
}

// ─── Card + billing details form ───────────────────────────────────────────

export interface BillingValues {
  cardHolder: string
  cardNumber: string
  expiry: string
  cvv: string
  accountType: string
  firstName: string
  lastName: string
  businessName: string
  vatNumber: string
  address: string
}

export const ACCOUNT_TYPES = ['Sole trader / Freelancer', 'Company', 'Incorporated partnership', 'Incorporated association', 'Non-profit organization']

export function initialBilling(details?: BillingDetails): BillingValues {
  return {
    cardHolder: details ? `${details.firstName} ${details.lastName}` : '',
    cardNumber: '',
    expiry: '',
    cvv: '',
    accountType: details?.accountType && ACCOUNT_TYPES.includes(details.accountType) ? details.accountType : details?.accountType === 'Company' ? 'Company' : ACCOUNT_TYPES[0],
    firstName: details?.firstName ?? '',
    lastName: details?.lastName ?? '',
    businessName: details?.businessName ?? '',
    vatNumber: details?.vatNumber ?? '',
    address: details?.address ?? '',
  }
}

export type BillingErrors = Partial<Record<keyof BillingValues, string>>

export function validateBilling(v: BillingValues, t: TFunction): BillingErrors {
  const e: BillingErrors = {}
  const req = t('marketing.kit.required')
  if (!v.cardHolder.trim()) e.cardHolder = req
  const digits = v.cardNumber.replace(/\D/g, '')
  if (!digits) e.cardNumber = req
  else if (digits.length < 13 || digits.length > 19) e.cardNumber = t('marketing.kit.invalidCard')
  const m = /^(\d{2})\/(\d{2})$/.exec(v.expiry.trim())
  if (!v.expiry.trim()) e.expiry = req
  else if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.expiry = t('marketing.kit.invalidExpiry')
  if (!v.cvv.trim()) e.cvv = req
  else if (!/^\d{3,4}$/.test(v.cvv.trim())) e.cvv = t('marketing.kit.invalidCvv')
  if (!v.firstName.trim()) e.firstName = req
  if (!v.lastName.trim()) e.lastName = req
  if (!v.businessName.trim()) e.businessName = req
  if (!v.address.trim()) e.address = req
  return e
}

const formatCard = (s: string) =>
  s
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim()

const formatExpiry = (s: string) => {
  const d = s.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

function CardBrands() {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      <span className="text-caption font-bold italic text-info">VISA</span>
      <span className="relative inline-flex h-4 w-6">
        <span className="absolute left-0 h-4 w-4 rounded-full bg-danger/80" />
        <span className="absolute right-0 h-4 w-4 rounded-full bg-accent/90" />
      </span>
    </span>
  )
}

export function CardFields({ values, errors, onChange }: { values: BillingValues; errors: BillingErrors; onChange: (patch: Partial<BillingValues>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="card flex flex-col gap-5 p-6 sm:p-8">
      <Field label={t('marketing.kit.cardHolder')} error={errors.cardHolder}>
        {(id) => <TextInput id={id} value={values.cardHolder} invalid={Boolean(errors.cardHolder)} placeholder={t('marketing.kit.cardHolderPlaceholder')} autoComplete="cc-name" onChange={(e) => onChange({ cardHolder: e.target.value })} />}
      </Field>
      <Field label={t('marketing.kit.cardNumber')} error={errors.cardNumber}>
        {(id) => (
          <TextInput
            id={id}
            value={values.cardNumber}
            invalid={Boolean(errors.cardNumber)}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder={t('marketing.kit.cardNumberPlaceholder')}
            suffix={<CardBrands />}
            onChange={(e) => onChange({ cardNumber: formatCard(e.target.value) })}
          />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('marketing.kit.expiry')} error={errors.expiry}>
          {(id) => <TextInput id={id} value={values.expiry} invalid={Boolean(errors.expiry)} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" onChange={(e) => onChange({ expiry: formatExpiry(e.target.value) })} />}
        </Field>
        <Field label={t('marketing.kit.cvv')} error={errors.cvv}>
          {(id) => <TextInput id={id} value={values.cvv} invalid={Boolean(errors.cvv)} inputMode="numeric" autoComplete="cc-csc" placeholder={t('marketing.kit.cvvPlaceholder')} onChange={(e) => onChange({ cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />}
        </Field>
      </div>
    </div>
  )
}

export function BillingDetailsFields({ values, errors, onChange }: { values: BillingValues; errors: BillingErrors; onChange: (patch: Partial<BillingValues>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="card flex flex-col gap-5 p-6 sm:p-8">
      <div>
        <h2 className="font-display text-title-2 text-ink">{t('marketing.kit.billingDetails')}</h2>
        <p className="mt-1 text-body text-muted">{t('marketing.kit.billingDetailsHint')}</p>
      </div>
      <Field label={t('marketing.kit.accountType')}>
        {(id) => <Select id={id} value={values.accountType} options={ACCOUNT_TYPES} onChange={(e) => onChange({ accountType: e.target.value })} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('marketing.kit.firstName')} error={errors.firstName}>
          {(id) => <TextInput id={id} value={values.firstName} invalid={Boolean(errors.firstName)} onChange={(e) => onChange({ firstName: e.target.value })} />}
        </Field>
        <Field label={t('marketing.kit.lastName')} error={errors.lastName}>
          {(id) => <TextInput id={id} value={values.lastName} invalid={Boolean(errors.lastName)} onChange={(e) => onChange({ lastName: e.target.value })} />}
        </Field>
      </div>
      <Field label={t('marketing.kit.businessName')} hint={t('marketing.kit.businessNameHint')} error={errors.businessName}>
        {(id) => <TextInput id={id} value={values.businessName} invalid={Boolean(errors.businessName)} onChange={(e) => onChange({ businessName: e.target.value })} />}
      </Field>
      <Field label={t('marketing.kit.vatNumber')} optional hint={t('marketing.kit.vatHint')}>
        {(id) => <TextInput id={id} value={values.vatNumber} placeholder="PT123456789" onChange={(e) => onChange({ vatNumber: e.target.value })} />}
      </Field>
      <Field label={t('marketing.kit.address')} error={errors.address}>
        {(id) => <TextInput id={id} value={values.address} invalid={Boolean(errors.address)} placeholder={t('marketing.kit.addressPlaceholder')} onChange={(e) => onChange({ address: e.target.value })} />}
      </Field>
    </div>
  )
}

/** Small segmented "% | €" toggle used next to value inputs. */
export function UnitToggle({ value, onChange, labels }: { value: 'percent' | 'amount'; onChange: (v: 'percent' | 'amount') => void; labels: { percent: string; amount: string } }) {
  return (
    <div className="inline-flex h-11 shrink-0 overflow-hidden rounded-sm border border-line-strong" role="radiogroup">
      {(['percent', 'amount'] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          aria-label={labels[u]}
          onClick={() => onChange(u)}
          className={clsx('w-11 text-body-strong transition-colors', value === u ? 'bg-surface text-ink' : 'bg-sunken text-muted hover:text-ink')}
        >
          {u === 'percent' ? '%' : '€'}
        </button>
      ))}
    </div>
  )
}

/** Big check circle used on "… is set!" screens. */
export function SuccessBadge() {
  return (
    <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#2BA59C] text-white shadow-md">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  )
}
