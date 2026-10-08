import { zodResolver } from '@hookform/resolvers/zod'
import clsx from 'clsx'
import { parseISO, startOfMonth } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowRight, CheckCircle2, Loader2, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Field, LearnMore, RadioGroup, Select, TextInput, toast } from '@/components/ui'
import { checkDiscountCode, enableAddOn, findAddOn, isAddOnOn, quoteOrder, type EnableOptions } from '@/api/addons'
import { ApiError } from '@/api/client'
import { money2 } from '@/lib/format'
import { now, nowISO, toISODate } from '@/lib/time'
import { useDb } from '@/store/db'
import type { BillingDetails } from '@/types'
import { useReturnTo } from './AddOnIntroPage'
import { eur, ledgerLabel, META, unitQuantity } from './catalog'
import { AddOnIcon, WizardFrame } from './components/shared'

const ACCOUNT_TYPES = ['sole_trader', 'company', 'partnership', 'association', 'non_profit'] as const
/** Billing details keep the English account type (other forms compare it), whatever the UI language. */
const storedAccountType = (k: (typeof ACCOUNT_TYPES)[number]) => i18n.getFixedT('en')(`addons.setup.accountTypes.${k}`)

/** /add-ons/add-on/:slug/setup: paid enable screen, plan activation, or the accounting connect wizard. */
export function AddOnSetupPage() {
  const { slug = '' } = useParams()
  const meta = META[slug]
  const record = findAddOn(useDb((s) => s.addOns), slug)
  // Decide once: finishing the flow turns the add-on on, which must not bounce the page mid-way.
  const [alreadyOn] = useState(() => isAddOnOn(record) && record?.status !== 'trial')
  if (!meta || (meta.kind !== 'paid' && meta.kind !== 'accounting')) return <Navigate to={`/add-ons/add-on/${slug}/intro`} replace />
  if (alreadyOn) return <Navigate to={`/add-ons/manage/${slug}`} replace />
  if (meta.kind === 'accounting') return <AccountingSetup slug={slug} />
  return <PaidSetup slug={slug} />
}

// ─── Paid add-ons ──────────────────────────────────────────────────────────

type Payload = Pick<EnableOptions, 'order' | 'billing' | 'card' | 'trialDays' | 'keepTrial'>

interface PaidProps {
  slug: string
  /** Accounting wizard: collect the order and continue instead of enabling now. */
  onConfirm?: (payload: Payload) => void
  onBack?: () => void
  onClose?: () => void
  progress?: { steps: number; step: number }
}

function PaidSetup({ slug, onConfirm, onBack, onClose, progress = { steps: 2, step: 1 } }: PaidProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const meta = META[slug]
  const name = t(`addons.items.${slug}.name`)
  const plan = slug === 'premium-support'
  const locations = useDb((s) => s.locations)
  const teamMembers = useDb((s) => s.teamMembers)
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const workspacePlan = useDb((s) => s.workspace.plan)
  const quantity = unitQuantity({ locations, teamMembers }, meta.unit)
  const back = useReturnTo('/add-ons')
  const done = useReturnTo(`/add-ons/manage/${slug}`)
  const [discountPct, setDiscountPct] = useState(0)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const runningTrial = plan && record?.trialEndsAt && record.trialEndsAt >= toISODate(now()) ? record.trialEndsAt : undefined
  const quote = useMemo(() => quoteOrder(quantity, meta.price ?? 0, runningTrial ? 0 : (meta.trialDays ?? 0), discountPct, runningTrial), [quantity, meta, discountPct, runningTrial])
  const saved = workspacePlan.card
  const bd = workspacePlan.billingDetails
  const accountLabel = (k: (typeof ACCOUNT_TYPES)[number]) => t(`addons.setup.accountTypes.${k}`)
  const initialType = ACCOUNT_TYPES.find((k) => k === bd?.accountType || [accountLabel(k), storedAccountType(k)].some((label) => label.toLowerCase() === bd?.accountType?.toLowerCase())) ?? 'sole_trader'
  const [vatOpen, setVatOpen] = useState(Boolean(bd?.vatNumber))

  const schema = useMemo(() => {
    const req = z.string().trim().min(1, t('addons.setup.errors.required'))
    return z
      .object({
        cardChoice: z.enum(['saved', 'new']),
        cardHolder: z.string(),
        cardNumber: z.string(),
        expiry: z.string(),
        cvv: z.string(),
        accountType: z.enum(ACCOUNT_TYPES),
        firstName: req,
        lastName: req,
        businessName: req,
        address: req,
        vatNumber: z.string().trim().refine((v) => !v || /^PT\d{9}$/i.test(v.replace(/\s/g, '')), t('addons.setup.errors.vat')),
      })
      .superRefine((v, ctx) => {
        if (v.cardChoice === 'saved') return
        if (!v.cardHolder.trim()) ctx.addIssue({ code: 'custom', path: ['cardHolder'], message: t('addons.setup.errors.required') })
        if (!/^\d{16}$/.test(v.cardNumber.replace(/\s/g, ''))) ctx.addIssue({ code: 'custom', path: ['cardNumber'], message: t('addons.setup.errors.card') })
        const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(v.expiry.trim())
        if (!m || new Date(2000 + Number(m[2]), Number(m[1]), 0) < startOfMonth(now())) ctx.addIssue({ code: 'custom', path: ['expiry'], message: t('addons.setup.errors.expiry') })
        if (!/^\d{3,4}$/.test(v.cvv.trim())) ctx.addIssue({ code: 'custom', path: ['cvv'], message: t('addons.setup.errors.cvv') })
      })
  }, [t])
  type Form = z.infer<typeof schema>
  const { register, handleSubmit, watch, setValue, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      cardChoice: saved ? 'saved' : 'new',
      cardHolder: '',
      cardNumber: '',
      expiry: '',
      cvv: '',
      accountType: initialType,
      firstName: bd?.firstName ?? '',
      lastName: bd?.lastName ?? '',
      businessName: bd?.businessName ?? '',
      address: bd?.address ?? '',
      vatNumber: bd?.vatNumber ?? '',
    },
  })
  const err = formState.errors
  const cardChoice = watch('cardChoice')

  const applyCode = async () => {
    setChecking(true)
    setCodeError('')
    try {
      setDiscountPct(await checkDiscountCode(code))
      toast(t('addons.setup.codeApplied'))
      setCodeOpen(false)
    } catch (e) {
      setCodeError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const submit = async (v: Form) => {
    const digits = v.cardNumber.replace(/\s/g, '')
    const billing: BillingDetails = { accountType: storedAccountType(v.accountType),
 firstName: v.firstName.trim(), lastName: v.lastName.trim(), businessName: v.businessName.trim(), address: v.address.trim(), vatNumber: v.vatNumber.replace(/\s/g, '').toUpperCase() || undefined }
    const payload: Payload = {
      trialDays: runningTrial ? undefined : meta.trialDays,
      keepTrial: Boolean(runningTrial),
      order: { line: { description: plan ? t('addons.setup.planLine') : t('addons.setup.addonLine', { name }), quantity, unitPrice: meta.price ?? 0 }, quote },
      billing,
      card: v.cardChoice === 'saved' && saved ? saved : { brand: digits.startsWith('4') ? 'Visa' : 'Mastercard', last4: digits.slice(-4), expiry: v.expiry.trim() },
    }
    if (onConfirm) return onConfirm(payload)
    setSaving(true)
    await enableAddOn(slug, { name, ...payload })
    setSaving(false)
    toast(plan ? t('addons.setup.planActivated') : t('addons.enabled', { name }))
    navigate(done)
  }

  const date = (iso: string) => format(parseISO(iso), 'MMM d, yyyy')
  const fieldError = (k: keyof Form) => err[k]?.message as string | undefined
  const titleKey = `addons.setup.titles.${slug}`
  const title = t(titleKey, { defaultValue: t('addons.setup.title', { name }) })
  const intro = t(`addons.setup.intros.${slug}`, { defaultValue: t('addons.setup.intro', { name }) })

  return (
    <WizardFrame
      steps={progress.steps}
      step={progress.step}
      onBack={onBack}
      onClose={onClose ?? (() => navigate(back))}
      primary={{ label: plan ? t('addons.setup.activate') : t('addons.enable'), form: 'addon-setup', loading: saving }}
      maxWidth="max-w-[1280px]"
    >
      <p className="text-small text-muted">{t('addons.setup.stepsLeft', { count: progress.steps - progress.step })}</p>
      <h1 className="mt-1 font-display text-[40px] font-bold leading-[48px] text-ink">{title}</h1>
      <p className="mt-2 text-body-lg text-muted">{intro}</p>
      <form id="addon-setup" noValidate onSubmit={handleSubmit(submit)} className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_440px]">
        <div className="flex flex-col gap-10">
          <section className="card p-8" aria-label={t('addons.setup.payment')}>
            {saved && (
              <div className="mb-6">
                <RadioGroup
                  name="cardChoice"
                  value={cardChoice}
                  onChange={(v) => setValue('cardChoice', v)}
                  options={[
                    { value: 'saved', label: t('addons.setup.savedCard', { brand: saved.brand, last4: saved.last4 }), hint: t('addons.setup.savedCardHint', { expiry: saved.expiry }) },
                    { value: 'new', label: t('addons.setup.newCard') },
                  ]}
                />
              </div>
            )}
            {cardChoice === 'new' && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t('addons.setup.cardHolder')} error={fieldError('cardHolder')} className="sm:col-span-2">
                  {(id) => <TextInput id={id} autoComplete="cc-name" placeholder={t('addons.setup.cardHolderPlaceholder')} invalid={Boolean(err.cardHolder)} {...register('cardHolder')} />}
                </Field>
                <Field label={t('addons.setup.cardNumber')} error={fieldError('cardNumber')} className="sm:col-span-2">
                  {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-number" placeholder={t('addons.setup.cardNumberPlaceholder')} suffix={<span className="text-caption font-bold text-info">VISA <span className="text-danger">●</span><span className="text-accent">●</span></span>} invalid={Boolean(err.cardNumber)} {...register('cardNumber')} />}
                </Field>
                <Field label={t('addons.setup.expiry')} error={fieldError('expiry')}>
                  {(id) => <TextInput id={id} autoComplete="cc-exp" placeholder={t('settings.common.expiryPlaceholder')} invalid={Boolean(err.expiry)} {...register('expiry')} />}
                </Field>
                <Field label={t('addons.setup.cvv')} error={fieldError('cvv')}>
                  {(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-csc" placeholder={t('addons.setup.cvvPlaceholder')} invalid={Boolean(err.cvv)} {...register('cvv')} />}
                </Field>
              </div>
            )}
          </section>
          <section className="card p-8" aria-labelledby="billing-heading">
            <h2 id="billing-heading" className="font-display text-title-2 text-ink">{t('addons.setup.billing')}</h2>
            <p className="mb-6 text-body text-muted">{t('addons.setup.billingHint')}</p>
            <div className="flex flex-col gap-5">
              <Field label={t('addons.setup.accountType')}>{(id) => <Select id={id} options={ACCOUNT_TYPES.map((a) => ({ value: a, label: accountLabel(a) }))} {...register('accountType')} />}</Field>
              <Field label={t('addons.setup.firstName')} error={fieldError('firstName')}>{(id) => <TextInput id={id} autoComplete="given-name" invalid={Boolean(err.firstName)} {...register('firstName')} />}</Field>
              <Field label={t('addons.setup.lastName')} error={fieldError('lastName')}>{(id) => <TextInput id={id} autoComplete="family-name" invalid={Boolean(err.lastName)} {...register('lastName')} />}</Field>
              <Field label={t('addons.setup.businessName')} hint={t('addons.setup.businessNameHint')} error={fieldError('businessName')}>{(id) => <TextInput id={id} autoComplete="organization" invalid={Boolean(err.businessName)} {...register('businessName')} />}</Field>
              <Field label={t('addons.setup.address')} error={fieldError('address')}>{(id) => <TextInput id={id} autoComplete="street-address" prefix={<MapPin size={18} aria-hidden />} invalid={Boolean(err.address)} {...register('address')} />}</Field>
              <div>
                <p className="mb-1.5 text-body-strong text-ink">{t('addons.setup.vat')}</p>
                <div className="rounded-lg bg-primary-subtle/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body-strong text-ink">{t('addons.setup.vatNumber')}</span>
                    {!vatOpen && (
                      <Button size="sm" className="rounded-full" onClick={() => setVatOpen(true)}>
                        {t('addons.setup.add')}
                      </Button>
                    )}
                  </div>
                  {vatOpen && (
                    <Field error={fieldError('vatNumber')} className="mt-3">
                      {(id) => <TextInput id={id} aria-label={t('addons.setup.vatNumber')} placeholder="PT123456789" invalid={Boolean(err.vatNumber)} {...register('vatNumber')} />}
                    </Field>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
        <aside className="card p-8 lg:sticky lg:top-6" aria-label={t('addons.setup.order')}>
          <div className="flex items-start gap-3">
            <AddOnIcon slug={slug} />
            <div>
              <p className="text-body-lg font-semibold text-ink">{plan ? t('addons.setup.planName') : name}</p>
              <p className="text-body text-muted">{plan ? t('addons.setup.planTagline') : t(`addons.taglines.${slug}`)}</p>
            </div>
          </div>
          {quote.trialEndsAt && <p className="mt-5 rounded-lg bg-primary-subtle px-5 py-4 text-body-lg text-ink">{runningTrial ? t('addons.setup.trialEnding', { date: date(quote.trialEndsAt) }) : t('addons.setup.trialLine', { count: meta.trialDays ?? 0, date: date(quote.trialEndsAt) })}</p>}
          <div className="mt-5 flex items-start justify-between gap-3 border-b border-line pb-5 text-body-lg">
            <div>
              <p className="text-ink">
                {quantity} x <span className="font-semibold text-primary">{t(`addons.unitNames.${meta.unit ?? 'location'}`, { count: quantity })}</span>
              </p>
              <p className="text-body text-muted">
                {meta.was && <span className="mr-1 line-through">{eur(meta.was)}</span>}
                {t(`addons.unitMonthly.${meta.unit ?? 'location'}`, { price: eur(meta.price ?? 0) })}
              </p>
            </div>
            <span className="tabular text-ink">{money2(quote.subtotal)}</span>
          </div>
          <dl className="flex flex-col gap-1 border-b border-line py-5 text-body-lg">
            <div className="flex justify-between"><dt className="text-muted">{t('addons.setup.subtotal')}</dt><dd className="tabular text-muted">{money2(quote.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t('addons.setup.tax')}</dt><dd className="tabular text-muted">{money2(quote.tax)}</dd></div>
            {quote.discount > 0 && <div className="flex justify-between text-success"><dt>{t('addons.setup.discount', { pct: discountPct })}</dt><dd className="tabular">-{money2(quote.discount)}</dd></div>}
          </dl>
          <div className="border-b border-line py-5">
            <div className="flex items-center justify-between">
              <span className="text-body-lg text-ink">{t('addons.setup.discountCode')}</span>
              {!codeOpen && discountPct === 0 && (
                <Button variant="link" onClick={() => setCodeOpen(true)}>
                  {t('addons.setup.add')}
                </Button>
              )}
            </div>
            {codeOpen && (
              <div className="mt-3 flex items-start gap-2">
                <Field error={codeError} className="flex-1">
                  {(id) => <TextInput id={id} aria-label={t('addons.setup.discountCode')} value={code} onChange={(e) => setCode(e.target.value)} invalid={Boolean(codeError)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCode() } }} />}
                </Field>
                <Button loading={checking} disabled={!code.trim()} onClick={() => void applyCode()}>
                  {t('addons.setup.apply')}
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-b border-line py-5">
            <span className="text-body-lg font-semibold text-ink">{quote.trialEndsAt ? t('addons.setup.totalMonthly') : t('addons.setup.payNow')}</span>
            <span className="font-display text-title-3 tabular text-ink">{money2(quote.trialEndsAt ? quote.totalMonthly : quote.payNow)}</span>
          </div>
          <p className="mt-5 text-body text-muted">{t('addons.setup.proRata')}</p>
          <p className="mt-4 text-body text-muted">{t('addons.setup.priceNote', { basis: t(`addons.basis.${meta.unit ?? 'location'}`), date: date(quote.billingStartsAt) })}</p>
        </aside>
      </form>
    </WizardFrame>
  )
}

// ─── Xero / QuickBooks ─────────────────────────────────────────────────────

interface Check {
  title: string
  body: string
  link?: string
}

const SALES_ACCOUNTS = ['200 - Sales', '260 - Other revenue', '4000 - Services revenue']
const PAYMENT_ACCOUNTS = ['090 - Business bank account', '800 - Card payments clearing', '610 - Accounts receivable']
const TIPS_ACCOUNTS = ['820 - Tips payable', '260 - Other revenue']

/**
 * Accounting wizard (add-ons.md §3.1): Get ready → Connect → Enable (billing)
 * → Account mapping → Sync settings → connected. Six steps as in the reference.
 */
function AccountingSetup({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useDb((s) => s.workspace)
  const provider = slug === 'xero' ? 'Xero' : 'QuickBooks'
  const name = t(`addons.items.${slug}.name`)
  const [step, setStep] = useState(1)
  const [connecting, setConnecting] = useState(false)
  const [signIn, setSignIn] = useState(false)
  const orgs = [`${workspace.name}, Lda`, t('addons.accounting.demoOrg', { name: workspace.name })]
  const [org, setOrg] = useState<string | null>(null)
  const [choice, setChoice] = useState(orgs[0])
  const [order, setOrder] = useState<Payload | null>(null)
  const [mapping, setMapping] = useState({ salesAccount: SALES_ACCOUNTS[0], paymentsAccount: PAYMENT_ACCOUNTS[1], tipsAccount: TIPS_ACCOUNTS[0] })
  const [sync, setSync] = useState({ from: toISODate(startOfMonth(now())), frequency: 'daily' as 'daily' | 'hourly', unpaid: false })
  const [saving, setSaving] = useState(false)
  const close = () => navigate('/add-ons#integrations')
  const checks = t(`addons.accounting.checks.${slug}`, { returnObjects: true }) as Check[]

  if (step === 3)
    return (
      <PaidSetup
        slug={slug}
        progress={{ steps: 6, step: 3 }}
        onBack={() => setStep(2)}
        onClose={close}
        onConfirm={(payload) => {
          setOrder(payload)
          setStep(4)
        }}
      />
    )

  const authorise = () => {
    setConnecting(true)
    window.setTimeout(() => {
      setConnecting(false)
      setOrg(choice)
      setSignIn(false)
      toast(t('addons.accounting.authorised', { name: provider }))
    }, 1200)
  }

  const finish = async () => {
    if (!order) return setStep(3)
    setSaving(true)
    await enableAddOn(slug, { name, ...order, config: { organisation: org, connected: true, connectedAt: nowISO(), ...mapping, syncFrom: sync.from, syncFrequency: sync.frequency, includeUnpaid: sync.unpaid } })
    setSaving(false)
    toast(t('addons.accounting.connectedToast', { name: provider }))
    navigate(`/add-ons/manage/${slug}`)
  }

  const primary =
    step === 1
      ? { label: t('addons.continue'), onClick: () => setStep(2), arrow: true }
      : step === 2
        ? org
          ? { label: t('addons.continue'), onClick: () => setStep(3), arrow: true }
          : undefined
        : step === 4
          ? { label: t('addons.continue'), onClick: () => setStep(5), arrow: true }
          : { label: t('addons.accounting.finish'), onClick: () => void finish(), loading: saving }

  return (
    <WizardFrame steps={6} step={step} onBack={step > 1 ? () => setStep(step === 4 ? 3 : step - 1) : undefined} onClose={close} primary={primary}>
      <p className="text-small text-muted">{t('addons.setup.stepsLeft', { count: 6 - step })}</p>
      {step === 1 && (
        <>
          <h1 className="mt-1 font-display text-[40px] font-bold leading-[48px] text-ink">{t('addons.accounting.readyTitle', { name: provider })}</h1>
          <p className="mt-3 text-body-lg text-muted">{t('addons.accounting.readyBody', { name: provider })}</p>
          <ul className="mt-8 flex list-disc flex-col gap-4 pl-6 text-body-lg">
            {checks.map((c) => (
              <li key={c.title}>
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="text-muted">
                  {c.body}{' '}
                  {c.link && <LearnMore topic={c.title}>{c.link}</LearnMore>}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="mt-1 font-display text-[40px] font-bold leading-[48px] text-ink">{t('addons.accounting.connectTitle', { name: provider })}</h1>
          <p className="mt-3 text-body-lg text-muted">{t('addons.accounting.connectBody', { name: provider })}</p>
          <div className="card mt-8 flex flex-col items-center gap-6 px-8 py-14 text-center">
            <div className="flex items-center gap-5" aria-hidden>
              <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-primary font-display text-title-3 font-bold text-on-primary">ib.</span>
              <ArrowRight size={22} className="text-ink" />
              <AddOnIcon slug={slug} size={30} className="h-20 w-20 rounded-lg" />
            </div>
            {org ? (
              <p className="flex items-center gap-2 text-body-lg font-semibold text-success">
                <CheckCircle2 size={22} aria-hidden />
                {t('addons.accounting.connected', { org })}
              </p>
            ) : signIn ? (
              <div className="w-full max-w-sm text-left">
                <p className="mb-3 text-body-strong text-ink">{t('addons.accounting.chooseOrg', { name: provider })}</p>
                <Field label={t('addons.accounting.organisation')}>{(id) => <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)} options={orgs} />}</Field>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => setSignIn(false)}>{t('addons.accounting.cancel')}</Button>
                  <Button variant="primary" disabled={connecting} icon={connecting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : undefined} onClick={authorise}>
                    {connecting ? t('addons.accounting.connecting', { name: provider }) : t('addons.accounting.allow')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-body-lg text-ink">{t('addons.accounting.connectHint', { name: provider })}</p>
                <Button variant="primary" size="lg" className="rounded-full" onClick={() => setSignIn(true)}>
                  {t('addons.accounting.connectButton', { name: provider })}
                </Button>
              </>
            )}
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <h1 className="mt-1 font-display text-[40px] font-bold leading-[48px] text-ink">{t('addons.accounting.mapTitle')}</h1>
          <p className="mt-3 text-body-lg text-muted">{t('addons.accounting.mapBody', { name: provider, org })}</p>
          <div className="card mt-8 flex flex-col gap-5 p-8">
            <Field label={t('addons.accounting.salesAccount')}>{(id) => <Select id={id} value={mapping.salesAccount} onChange={(e) => setMapping((m) => ({ ...m, salesAccount: e.target.value }))} options={SALES_ACCOUNTS.map((a) => ({ value: a, label: ledgerLabel(t, a) }))} />}</Field>
            <Field label={t('addons.accounting.paymentsAccount')}>{(id) => <Select id={id} value={mapping.paymentsAccount} onChange={(e) => setMapping((m) => ({ ...m, paymentsAccount: e.target.value }))} options={PAYMENT_ACCOUNTS.map((a) => ({ value: a, label: ledgerLabel(t, a) }))} />}</Field>
            <Field label={t('addons.accounting.tipsAccount')}>{(id) => <Select id={id} value={mapping.tipsAccount} onChange={(e) => setMapping((m) => ({ ...m, tipsAccount: e.target.value }))} options={TIPS_ACCOUNTS.map((a) => ({ value: a, label: ledgerLabel(t, a) }))} />
}</Field>
          </div>
        </>
      )}
      {step === 5 && (
        <>
          <h1 className="mt-1 font-display text-[40px] font-bold leading-[48px] text-ink">{t('addons.accounting.syncTitle')}</h1>
          <p className="mt-3 text-body-lg text-muted">{t('addons.accounting.syncBody', { name: provider })}</p>
          <div className="card mt-8 flex flex-col gap-5 p-8">
            <Field label={t('addons.accounting.syncFrom')}>{(id) => <input id={id} type="date" className="input" value={sync.from} max={toISODate(now())} onChange={(e) => setSync((s) => ({ ...s, from: e.target.value || s.from }))} />}</Field>
            <div>
              <p className="mb-2 text-body-strong text-ink">{t('addons.accounting.frequency')}</p>
              <RadioGroup value={sync.frequency} onChange={(v) => setSync((s) => ({ ...s, frequency: v }))} options={(['daily', 'hourly'] as const).map((f) => ({ value: f, label: t(`addons.accounting.frequencies.${f}`) }))} />
            </div>
            <label className={clsx('flex items-center gap-3 text-body text-ink')}>
              <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={sync.unpaid} onChange={(e) => setSync((s) => ({ ...s, unpaid: e.target.checked }))} />
              {t('addons.accounting.includeUnpaid')}
            </label>
          </div>
        </>
      )}
    </WizardFrame>
  )
}
