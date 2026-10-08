import { zodResolver } from '@hookform/resolvers/zod'
import clsx from 'clsx'
import { differenceInYears } from 'date-fns'
import { BadgeCheck, Building2, CheckCircle2, CreditCard, Globe2, Loader2, MapPin, Phone, ShieldCheck, Smartphone, Store, User, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Checkbox, Field, FullscreenFrame, Select, TextInput, toast } from '@/components/ui'
import { addPaymentsAccount, findAddOn, verifyPaymentsAccount, type PaymentsAccount } from '@/api/addons'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'

const STEPS = ['overview', 'rates', 'what-to-expect', 'select', 'ready', 'details'] as const
const TYPES = ['sole_trader', 'company', 'partnership'] as const
const TYPE_ICONS = { sole_trader: User, company: Building2, partnership: Users }

interface Row {
  title: string
  body: string
  price?: string
  per?: string
}

/** /payments/onboarding/:step (add-ons.md §2.1): six steps and a finished screen. */
export function PaymentsOnboardingPage() {
  const { step = 'overview' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const type = params.get('type') ?? ''
  const [typeError, setTypeError] = useState(false)
  const index = STEPS.indexOf(step as (typeof STEPS)[number])
  if (step === 'finished') return <Finished />
  if (index < 0) return <Navigate to="/payments/onboarding/overview" replace />

  const go = (i: number) => navigate(`/payments/onboarding/${STEPS[i]}${type ? `?type=${type}` : ''}`)
  const next = () => {
    if (step === 'select' && !type) return setTypeError(true)
    go(index + 1)
  }
  const left = STEPS.length - index
  const rows = (key: string) => t(`addons.payments.${key}.rows`, { returnObjects: true }) as Row[]

  return (
    <FullscreenFrame
      title={t('addons.items.payments.name')}
      closeLabel={t('addons.payments.close')}
      onClose={() => navigate('/setup')}
      progress={(index + 1) / (STEPS.length + 1)}
      actions={
        <>
          {index > 0 && <Button onClick={() => go(index - 1)}>{t('addons.payments.back')}</Button>}
          {step === 'details' ? (
            <Button variant="primary" type="submit" form="payments-details">{t('addons.payments.details.submit')}</Button>
          ) : (
            <Button variant="primary" onClick={next}>{t('addons.payments.continue')}</Button>
          )}
        </>
      }
    >
      <p className="text-small text-muted">{t('addons.payments.stepsLeft', { count: left })}</p>
      {step === 'overview' && (
        <>
          <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.payments.overview.title')}</h1>
          <div className="mt-6 flex flex-col gap-4">
            {rows('overview').map((r, i) => {
              const Icon = [Globe2, Smartphone, Store][i] ?? CreditCard
              return (
                <div key={r.title} className="card flex items-start gap-4 p-5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><Icon size={28} aria-hidden /></span>
                  <div><p className="text-body-strong text-ink">{r.title}</p><p className="text-body text-muted">{r.body}</p></div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {step === 'rates' && (
        <>
          <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.payments.rates.title')}</h1>
          <p className="mt-1 text-body-lg text-muted">{t('addons.payments.rates.body')}</p>
          <div className="card mt-6 divide-y divide-line">
            {rows('rates').map((r) => (
              <div key={r.title} className="flex items-center justify-between gap-4 p-4">
                <div><p className="text-body-strong text-ink">{r.title}</p><p className="text-body text-muted">{r.body}</p></div>
                <div className="text-right"><p className="text-body-strong text-ink">{r.price}</p>{r.per && <p className="text-small text-muted">{r.per}</p>}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-small text-muted">{t('addons.payments.rates.footer')}</p>
          <p className="mt-6 text-body-strong text-ink">{t('addons.payments.rates.accepts')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {(t('addons.payments.rates.methods', { returnObjects: true }) as string[]).map((m) => <li key={m} className="rounded-md border border-line px-3 py-1.5 text-small font-semibold text-muted">{m}</li>)}
          </ul>
        </>
      )}
      {step === 'what-to-expect' && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-subtle text-primary"><ShieldCheck size={48} aria-hidden /></span>
          <h1 className="mt-6 max-w-xl font-display text-title-1 text-ink">{t('addons.payments.expect.title')}</h1>
          <p className="mt-3 max-w-xl text-body-lg text-muted">{t('addons.payments.expect.body')}</p>
        </div>
      )}
      {step === 'select' && (
        <>
          <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.payments.select.title')}</h1>
          <p className="mt-1 text-body-lg text-muted">{t('addons.payments.select.body')}</p>
          <div className="mt-6 flex flex-col gap-3" role="radiogroup" aria-label={t('addons.payments.select.title')}>
            {TYPES.map((k) => {
              const Icon = TYPE_ICONS[k]
              const selected = type === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={clsx('card flex items-start gap-4 p-5 text-left transition-colors', selected ? 'border-2 border-primary' : 'hover:bg-sunken')}
                  onClick={() => { setTypeError(false); setParams({ type: k }, { replace: true }) }}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><Icon size={24} aria-hidden /></span>
                  <div><p className="text-body-strong text-ink">{t(`addons.payments.select.options.${k}.title`)}</p><p className="text-body text-muted">{t(`addons.payments.select.options.${k}.body`)}</p></div>
                </button>
              )
            })}
          </div>
          {typeError && <p className="mt-3 text-small text-danger">{t('addons.payments.select.required')}</p>}
        </>
      )}
      {step === 'ready' && (
        <>
          <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.payments.ready.title')}</h1>
          <p className="mt-1 text-body-lg text-muted">{t('addons.payments.ready.body')}</p>
          <div className="mt-6 flex flex-col gap-3">
            {rows('ready').map((r, i) => {
              const Icon = [BadgeCheck, Phone, MapPin][i] ?? BadgeCheck
              return (
                <div key={r.title} className="card flex items-start gap-4 p-5">
                  <Icon size={24} className="shrink-0 text-primary" aria-hidden />
                  <div><p className="text-body-strong text-ink">{r.title}</p><p className="text-body text-muted">{r.body}</p></div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {step === 'details' && (type ? <DetailsForm accountType={type} /> : <Navigate to="/payments/onboarding/select" replace />)}
    </FullscreenFrame>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
        nipc: z.string().regex(/^\d{9}$/, t('addons.payments.details.errors.nipc')),
        vat: z.string().trim(),
        noVat: z.boolean(),
        address: req,
        iban: z.string().refine((v) => /^PT50\d{21}$/.test(v.replace(/\s/g, '').toUpperCase()), t('addons.payments.details.errors.iban')),
      })
      .superRefine((v, ctx) => {
        if (!v.noVat && !/^PT\d{9}$/i.test(v.vat)) ctx.addIssue({ code: 'custom', path: ['vat'], message: t('addons.payments.details.errors.vat') })
        const dob = new Date(Number(v.year), Number(v.month) - 1, Number(v.day))
        if (v.year && v.month && v.day && (Number.isNaN(dob.getTime()) || dob.getDate() !== Number(v.day) || differenceInYears(now(), dob) < 18)) ctx.addIssue({ code: 'custom', path: ['year'], message: t('addons.payments.details.errors.dob') })
      })
  }, [t])
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, watch, setValue, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', month: '', day: '', year: '', email: user?.email ?? '', mobile: '', businessName: `${workspace.name} Lda`, nipc: '', vat: '', noVat: false, address: location ? [location.address.line1, location.address.postcode, location.address.city].filter(Boolean).join(', ') : '', iban: '' },
  })
  const err = formState.errors
  const noVat = watch('noVat')
  const submit = async (v: Form) => {
    const account = await addPaymentsAccount({ accountType, firstName: v.firstName, lastName: v.lastName, businessName: v.businessName, nipc: v.nipc, vat: v.noVat ? undefined : v.vat.toUpperCase(), email: v.email, mobile: `+351 ${v.mobile.replace(/\s/g, '')}`, address: v.address, iban: v.iban.replace(/\s/g, '').toUpperCase() })
    toast(t('addons.payments.finished.submitted'))
    navigate(`/payments/onboarding/finished?account=${account.id}`)
  }
  const e = (k: keyof Form) => err[k]?.message as string | undefined
  return (
    <>
      <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.payments.details.title')}</h1>
      <p className="mt-1 text-body-lg text-muted">{t('addons.payments.details.body')}</p>
      <form id="payments-details" noValidate onSubmit={handleSubmit(submit)} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2">
        <Field label={t('addons.payments.details.firstName')} error={e('firstName')}>{(id) => <TextInput id={id} invalid={Boolean(err.firstName)} {...register('firstName')} />}</Field>
        <Field label={t('addons.payments.details.lastName')} error={e('lastName')}>{(id) => <TextInput id={id} invalid={Boolean(err.lastName)} {...register('lastName')} />}</Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-body-strong text-ink">{t('addons.payments.details.dob')}</legend>
          <div className="grid grid-cols-3 gap-3">
            <Select aria-label={t('addons.payments.details.month')} placeholder={t('addons.payments.details.month')} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} {...register('month')} />
            <TextInput aria-label={t('addons.payments.details.day')} placeholder={t('addons.payments.details.day')} inputMode="numeric" {...register('day')} />
            <TextInput aria-label={t('addons.payments.details.year')} placeholder={t('addons.payments.details.year')} inputMode="numeric" {...register('year')} />
          </div>
          {(err.month || err.day || err.year) && <p className="mt-1.5 text-small text-danger">{e('year') ?? e('month') ?? e('day')}</p>}
        </fieldset>
        <Field label={t('addons.payments.details.email')} error={e('email')}>{(id) => <TextInput id={id} type="email" invalid={Boolean(err.email)} {...register('email')} />}</Field>
        <Field label={t('addons.payments.details.mobile')} error={e('mobile')}>{(id) => <TextInput id={id} prefix="+351" inputMode="tel" placeholder="912 345 678" invalid={Boolean(err.mobile)} {...register('mobile')} />}</Field>
        <Field label={t('addons.payments.details.businessName')} hint={t('addons.payments.details.businessNameHint')} error={e('businessName')} className="sm:col-span-2">{(id) => <TextInput id={id} invalid={Boolean(err.businessName)} {...register('businessName')} />}</Field>
        <Field label={t('addons.payments.details.nipc')} error={e('nipc')} className="sm:col-span-2">{(id) => <TextInput id={id} inputMode="numeric" placeholder={t('addons.payments.details.nipcPlaceholder')} invalid={Boolean(err.nipc)} {...register('nipc')} />}</Field>
        <div className="sm:col-span-2">
          <Field label={t('addons.payments.details.vat')} error={noVat ? undefined : e('vat')}>{(id) => <TextInput id={id} placeholder={t('addons.payments.details.vatPlaceholder')} disabled={noVat} invalid={!noVat && Boolean(err.vat)} {...register('vat')} />}</Field>
          <Checkbox className="mt-2" label={t('addons.payments.details.noVat')} checked={noVat} onChange={(v) => setValue('noVat', v, { shouldValidate: formState.isSubmitted })} />
        </div>
        <Field label={t('addons.payments.details.address')} error={e('address')} className="sm:col-span-2">{(id) => <TextInput id={id} invalid={Boolean(err.address)} {...register('address')} />}</Field>
        <Field label={t('addons.payments.details.iban')} error={e('iban')} className="sm:col-span-2">{(id) => <TextInput id={id} placeholder={t('addons.payments.details.ibanPlaceholder')} invalid={Boolean(err.iban)} {...register('iban')} />}</Field>
        <Button type="submit" variant="primary" className="justify-self-start sm:col-span-2" loading={formState.isSubmitting}>{t('addons.payments.details.submit')}</Button>
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
  const account = ((record?.config?.accounts as PaymentsAccount[] | undefined) ?? []).find((a) => a.id === id)
  const started = useRef(false)
  useEffect(() => {
    if (!account || account.status !== 'verifying' || started.current) return
    started.current = true
    void verifyPaymentsAccount(account.id)
  }, [account])
  if (!account) return <Navigate to="/add-ons/manage/payments" replace />
  const verified = account.status === 'verified'
  return (
    <FullscreenFrame title={t('addons.items.payments.name')} closeLabel={t('addons.payments.close')} onClose={() => navigate('/setup')} progress={1}>
      <div className="flex flex-col items-center py-12 text-center">
        <span className={clsx('flex h-24 w-24 items-center justify-center rounded-full', verified ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary')}>
          {verified ? <CheckCircle2 size={48} aria-hidden /> : <Loader2 size={48} className="animate-spin" aria-hidden />}
        </span>
        <h1 className="mt-6 font-display text-title-1 text-ink" aria-live="polite">{verified ? t('addons.payments.finished.verifiedTitle') : t('addons.payments.finished.verifyingTitle')}</h1>
        <p className="mt-2 max-w-lg text-body-lg text-muted">{verified ? t('addons.payments.finished.verifiedBody', { iban: `•••• ${account.iban.slice(-4)}` }) : t('addons.payments.finished.verifyingBody')}</p>
        <div className="mt-8 flex gap-3">
          <Button onClick={() => navigate('/setup')}>{t('addons.payments.finished.done')}</Button>
          <Button variant="primary" onClick={() => navigate('/add-ons/manage/payments')}>{t('addons.payments.finished.manage')}</Button>
        </div>
      </div>
    </FullscreenFrame>
  )
}
