import { zodResolver } from '@hookform/resolvers/zod'
import { differenceInYears } from 'date-fns'
import { format } from '@/lib/dates'
import { BadgeCheck, Building2, CheckCircle2, ChevronRight, Globe2, Loader2, ShieldCheck, Smartphone, Store, User, Users } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Checkbox, Field, LearnMore, Select, TextInput, toast } from '@/components/ui'
import { addPaymentsAccount, findAddOn, paymentsAccounts, verifyPaymentsAccount } from '@/api/addons'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { WizardFrame } from './components/shared'

const STEPS = ['overview', 'rates', 'what-to-expect', 'select', 'ready', 'details'] as const
const TYPES = ['sole_trader', 'company', 'partnership'] as const
const TYPE_ICONS = { sole_trader: User, company: Building2, partnership: Users }
const BRANDS = ['VISA', 'Mastercard', 'Maestro', 'AMEX', 'Diners', 'Discover', 'Apple Pay', 'G Pay']

interface Row {
  title: string
  body: string
  price?: string
  per?: string
}

/** /payments/onboarding/:step (add-ons.md §2.1): six steps, then verification. */
export function PaymentsOnboardingPage() {
  const { step = 'overview' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const type = params.get('type') ?? ''
  const index = STEPS.indexOf(step as (typeof STEPS)[number])
  if (step === 'finished') return <Finished />
  if (index < 0) return <Navigate to="/payments/onboarding/overview" replace />
  if (step === 'details' && !type) return <Navigate to="/payments/onboarding/select" replace />

  const go = (i: number, nextType = type) => navigate(`/payments/onboarding/${STEPS[i]}${nextType ? `?type=${nextType}` : ''}`)
  const rows = (key: string) => t(`addons.payments.${key}.rows`, { returnObjects: true }) as Row[]
  const close = () => navigate('/setup')
  const primary = step === 'select' ? undefined : step === 'details' ? { label: t('addons.continue'), form: 'payments-details', arrow: true } : { label: t('addons.continue'), onClick: () => go(index + 1), arrow: true }

  return (
    <WizardFrame steps={STEPS.length} step={index + 1} onBack={index > 0 ? () => go(index - 1) : undefined} onClose={close} closeLabel={t('addons.payments.close')} primary={primary} maxWidth={step === 'overview' || step === 'what-to-expect' ? 'max-w-[1200px]' : 'max-w-[720px]'}>
      {index < STEPS.length - 1 && <p className="mb-2 text-small text-muted">{t('addons.payments.stepsLeft', { count: STEPS.length - index - 1 })}</p>}
      {step === 'overview' && (
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <h1 className="font-display text-[40px] font-bold leading-[48px] text-ink">{t('addons.payments.overview.title')}</h1>
          <ul className="flex flex-col divide-y divide-line">
            {rows('overview').map((r, i) => {
              const Icon = [Globe2, Smartphone, Store][i] ?? Store
              return (
                <li key={r.title} className="flex items-start gap-6 py-6">
                  <div className="flex-1">
                    <h2 className="text-title-3 text-ink">{r.title}</h2>
                    <p className="mt-1 text-body-lg text-muted">{r.body}</p>
                  </div>
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-subtle to-info-subtle text-primary" aria-hidden>
                    <Icon size={30} />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {step === 'rates' && (
        <>
          <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('addons.payments.rates.title')}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('addons.payments.rates.body')}</p>
          <div className="card mt-6 p-6">
            <ul className="flex flex-col gap-5">
              {rows('rates').map((r) => (
                <li key={r.title} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-body-strong text-ink">{r.title}</p>
                    <p className="text-body text-muted">{r.body}</p>
                  </div>
                  <div className="text-right">
                    {r.per ? <p className="text-body-strong text-primary">{r.price}</p> : <span className="chip bg-success-subtle text-success">{r.price}</span>}
                    {r.per && <p className="text-small text-muted">{r.per}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-small text-muted">
              {t('addons.payments.rates.footer')} {t('addons.payments.rates.see')} <LearnMore topic={t('addons.payments.topics.pricing')}>{t('addons.payments.rates.pricingPage')}</LearnMore> {t('addons.payments.rates.details')}
            </p>
          </div>
          <p className="mt-8 text-center text-body text-muted">{t('addons.payments.rates.accepts')}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {[...BRANDS, t('addons.payments.rates.contactless')].map((m) => (
              <li key={m} className="rounded-sm border border-line px-2 py-1 text-caption font-bold text-muted">
                {m}
              </li>
            ))}
          </ul>
        </>
      )}
      {step === 'what-to-expect' && (
        <div className="grid items-center gap-12 py-10 lg:grid-cols-[320px_1fr]">
          <span className="mx-auto flex h-56 w-56 items-center justify-center rounded-[48px] bg-gradient-to-br from-primary to-info text-white shadow-lg" aria-hidden>
            <ShieldCheck size={110} />
          </span>
          <div>
            <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('addons.payments.expect.title')}</h1>
            <p className="mt-4 text-body-lg text-muted">{t('addons.payments.expect.body')}</p>
          </div>
        </div>
      )}
      {step === 'select' && (
        <>
          <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('addons.payments.select.title')}</h1>
          <p className="mt-2 text-body-lg text-muted">
            {t('addons.payments.select.body')} <LearnMore topic={t('addons.payments.topics.accountType')}>{t('addons.learnMore')}</LearnMore>
          </p>
          <ul className="mt-6 flex flex-col gap-3" aria-label={t('addons.payments.select.title')}>
            {TYPES.map((k) => {
              const Icon = TYPE_ICONS[k]
              return (
                <li key={k}>
                  <button type="button" className="card flex w-full items-center gap-4 p-5 text-left transition-colors hover:border-primary hover:bg-primary-subtle/40" onClick={() => go(index + 1, k)}>
                    <div className="flex-1">
                      <p className="text-body-strong text-ink">{t(`addons.payments.select.options.${k}.title`)}</p>
                      <p className="text-body text-muted">{t(`addons.payments.select.options.${k}.body`)}</p>
                    </div>
                    <Icon size={26} className="shrink-0 text-primary" aria-hidden />
                    <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {step === 'ready' && (
        <>
          <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('addons.payments.ready.title')}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('addons.payments.ready.body')}</p>
          <ol className="mt-6 flex flex-col gap-4">
            {rows('ready').map((r, i) => (
              <li key={r.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary text-caption text-primary">{i + 1}</span>
                <div>
                  <p className="text-body-strong text-ink">{r.title}</p>
                  <p className="text-body text-muted">{r.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {step === 'details' && <DetailsForm accountType={type} />}
    </WizardFrame>
  )
}

/** Month names from the date library, in the current language (built per render, not at import). */
const monthNames = () => Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), 'MMMM'))

function DetailsForm({ accountType }: { accountType: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const workspace = useDb((s) => s.workspace)
  const location = useDb((s) => s.locations[0])
  const schema = useMemo(() => {
    const req = z.string().trim().min(1, t('addons.payments.details.errors.required'))
    return z
      .object({
        firstName: req,
        lastName: req,
        month: req,
        day: req,
        year: req,
        email: z.string().trim().email(t('addons.payments.details.errors.email')),
        mobile: z.string().refine((v) => /^9[1236]\d{7}$/.test(v.replace(/\s/g, '')), t('addons.payments.details.errors.mobile')),
        businessName: req,
        nipc: z.string().trim().regex(/^\d{9}$/, t('addons.payments.details.errors.nipc')),
        vat: z.string().trim(),
        noVat: z.boolean(),
        address: req,
        iban: z.string().refine((v) => /^PT50\d{21}$/.test(v.replace(/\s/g, '').toUpperCase()), t('addons.payments.details.errors.iban')),
      })
      .superRefine((v, ctx) => {
        if (!v.noVat && !/^PT\d{9}$/i.test(v.vat.replace(/\s/g, ''))) ctx.addIssue({ code: 'custom', path: ['vat'], message: t('addons.payments.details.errors.vat') })
        const dob = new Date(Number(v.year), Number(v.month) - 1, Number(v.day))
        if (v.year && v.month && v.day && (Number.isNaN(dob.getTime()) || dob.getDate() !== Number(v.day) || differenceInYears(now(), dob) < 18)) ctx.addIssue({ code: 'custom', path: ['year'], message: t('addons.payments.details.errors.dob') })
      })
  }, [t])
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, watch, setValue, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', month: '', day: '', year: '', email: user?.email ?? '', mobile: '', businessName: `${workspace.name}, Lda`, nipc: '', vat: '', noVat: false, address: location ? [location.address.line1, location.address.postcode, location.address.city].filter(Boolean).join(', ') : '', iban: '' },
  })
  const err = formState.errors
  const noVat = watch('noVat')
  const submit = async (v: Form) => {
    const account = await addPaymentsAccount({ accountType, firstName: v.firstName.trim(), lastName: v.lastName.trim(), businessName: v.businessName.trim(), nipc: v.nipc.trim(), vat: v.noVat ? undefined : v.vat.replace(/\s/g, '').toUpperCase(), email: v.email.trim(), mobile: `+351 ${v.mobile.replace(/\s/g, '')}`, address: v.address.trim(), iban: v.iban.replace(/\s/g, '').toUpperCase() })
    toast(t('addons.payments.finished.submitted'))
    navigate(`/payments/onboarding/finished?account=${account.id}`)
  }
  const e = (k: keyof Form) => err[k]?.message as string | undefined
  return (
    <>
      <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('addons.payments.details.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">{t('addons.payments.details.body')}</p>
      <form id="payments-details" noValidate onSubmit={handleSubmit(submit)} className="mt-6 flex flex-col gap-5" aria-busy={formState.isSubmitting}>
        <Field label={t('addons.payments.details.firstName')} error={e('firstName')}>{(id) => <TextInput id={id} autoComplete="given-name" invalid={Boolean(err.firstName)} {...register('firstName')} />}</Field>
        <Field label={t('addons.payments.details.lastName')} error={e('lastName')}>{(id) => <TextInput id={id} autoComplete="family-name" invalid={Boolean(err.lastName)} {...register('lastName')} />}</Field>
        <fieldset>
          <legend className="mb-1.5 text-body-strong text-ink">{t('addons.payments.details.dob')}</legend>
          <div className="grid grid-cols-3 gap-3">
            <Select aria-label={t('addons.payments.details.month')} placeholder={t('addons.payments.details.month')} options={monthNames().map((m, i) => ({ value: String(i + 1), label: m }))}
 {...register('month')} />
            <TextInput aria-label={t('addons.payments.details.day')} placeholder={t('addons.payments.details.day')} inputMode="numeric" {...register('day')} />
            <TextInput aria-label={t('addons.payments.details.year')} placeholder={t('addons.payments.details.year')} inputMode="numeric" {...register('year')} />
          </div>
          {(err.month || err.day || err.year) && <p className="mt-1.5 text-small text-danger">{e('year') ?? e('month') ?? e('day')}</p>}
        </fieldset>
        <Field label={t('addons.payments.details.email')} error={e('email')}>{(id) => <TextInput id={id} type="email" autoComplete="email" invalid={Boolean(err.email)} {...register('email')} />}</Field>
        <Field label={t('addons.payments.details.mobile')} error={e('mobile')}>{(id) => <TextInput id={id} prefix="+351" inputMode="tel" autoComplete="tel-national" placeholder="912 345 678" invalid={Boolean(err.mobile)} {...register('mobile')} />}</Field>
        <Field label={t('addons.payments.details.businessName')} hint={t('addons.payments.details.businessNameHint')} error={e('businessName')}>{(id) => <TextInput id={id} autoComplete="organization" invalid={Boolean(err.businessName)} {...register('businessName')} />}</Field>
        <Field label={t('addons.payments.details.nipc')} error={e('nipc')}>{(id) => <TextInput id={id} inputMode="numeric" placeholder={t('addons.payments.details.nipcPlaceholder')} invalid={Boolean(err.nipc)} {...register('nipc')} />}</Field>
        <div>
          <Field label={t('addons.payments.details.vat')} error={noVat ? undefined : e('vat')}>{(id) => <TextInput id={id} placeholder={t('addons.payments.details.vatPlaceholder')} disabled={noVat} invalid={!noVat && Boolean(err.vat)} {...register('vat')} />}</Field>
          <Checkbox className="mt-2" label={t('addons.payments.details.noVat')} checked={noVat} onChange={(v) => setValue('noVat', v, { shouldValidate: formState.isSubmitted })} />
        </div>
        <Field label={t('addons.payments.details.address')} error={e('address')}>{(id) => <TextInput id={id} autoComplete="street-address" invalid={Boolean(err.address)} {...register('address')} />}</Field>
        <Field label={t('addons.payments.details.iban')} hint={t('addons.payments.details.ibanHint')} error={e('iban')}>{(id) => <TextInput id={id} placeholder={t('addons.payments.details.ibanPlaceholder')} invalid={Boolean(err.iban)} {...register('iban')} />}</Field>
        {formState.isSubmitting && (
          <p className="flex items-center gap-2 text-body text-muted" aria-live="polite">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            {t('addons.payments.details.submitting')}
          </p>
        )}
      </form>
    </>
  )
}

function Finished() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('account') ?? ''
  const record = findAddOn(useDb((s) => s.addOns), 'payments')
  const account = paymentsAccounts(record).find((a) => a.id === id)
  const started = useRef(false)
  useEffect(() => {
    if (!account || account.status !== 'verifying' || started.current) return
    started.current = true
    void verifyPaymentsAccount(account.id).then(() => toast(t('addons.payments.finished.verifiedToast')))
  }, [account, t])
  if (!account) return <Navigate to="/add-ons/manage/payments" replace />
  const verified = account.status === 'verified'
  return (
    <WizardFrame steps={STEPS.length} step={STEPS.length} onClose={() => navigate('/setup')} closeLabel={t('addons.payments.close')}>
      <div className="flex flex-col items-center py-12 text-center">
        <span className={verified ? 'flex h-24 w-24 items-center justify-center rounded-full bg-success-subtle text-success' : 'flex h-24 w-24 items-center justify-center rounded-full bg-primary-subtle text-primary'}>
          {verified ? <CheckCircle2 size={48} aria-hidden /> : <Loader2 size={48} className="animate-spin" aria-hidden />}
        </span>
        <h1 className="mt-6 font-display text-title-1 text-ink" aria-live="polite">
          {verified ? t('addons.payments.finished.verifiedTitle') : t('addons.payments.finished.verifyingTitle')}
        </h1>
        <p className="mt-2 max-w-lg text-body-lg text-muted">{verified ? t('addons.payments.finished.verifiedBody', { iban: `•••• ${account.iban.slice(-4)}` }) : t('addons.payments.finished.verifyingBody')}</p>
        {verified && (
          <p className="mt-4 flex items-center gap-2 text-body text-success">
            <BadgeCheck size={18} aria-hidden />
            {account.businessName}
          </p>
        )}
        <div className="mt-8 flex gap-3">
          <Button className="rounded-full" onClick={() => navigate('/setup')}>
            {t('addons.payments.finished.done')}
          </Button>
          <Button variant="primary" className="rounded-full" onClick={() => navigate('/add-ons/manage/payments')}>
            {t('addons.payments.finished.manage')}
          </Button>
        </div>
      </div>
    </WizardFrame>
  )
}
