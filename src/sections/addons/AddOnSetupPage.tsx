import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, CreditCard, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button, Field, FullscreenFrame, Select, TextInput, toast } from '@/components/ui'
import { checkDiscountCode, enableAddOn, findAddOn, isAddOnOn, quoteOrder } from '@/api/addons'
import { ApiError } from '@/api/client'
import { money2 } from '@/lib/format'
import { nowISO } from '@/lib/time'
import { useDb } from '@/store/db'
import { eur, META, unitQuantity } from './catalog'
import { AddOnIcon } from './components/shared'

const ACCOUNT_TYPES = ['sole_trader', 'company', 'partnership', 'association', 'non_profit'] as const

const normalize = (slug: string) => (slug === 'fresha-insights' ? 'insights' : slug)

/** /add-ons/add-on/:slug/setup: paid enable screen, or the accounting connect wizard. */
export function AddOnSetupPage() {
  const { slug: raw = '' } = useParams()
  const slug = normalize(raw)
  const meta = META[slug]
  const record = findAddOn(useDb((s) => s.addOns), slug)
  if (!meta || (meta.kind !== 'paid' && meta.kind !== 'accounting')) return <Navigate to={`/add-ons/add-on/${slug}/intro`} replace />
  if (isAddOnOn(record)) return <Navigate to={`/add-ons/manage/${slug}`} replace />
  if (meta.kind === 'accounting') return <AccountingSetup slug={slug} />
  return <PaidSetup slug={slug} />
}

// ─── Paid add-ons ──────────────────────────────────────────────────────────

function PaidSetup({ slug, config, stepsLeft = 1, onBack }: { slug: string; config?: Record<string, unknown>; stepsLeft?: number; onBack?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const meta = META[slug]
  const name = t(`addons.items.${slug}.name`)
  const locations = useDb((s) => s.locations)
  const teamMembers = useDb((s) => s.teamMembers)
  const plan = useDb((s) => s.workspace.plan)
  const quantity = unitQuantity({ locations, teamMembers }, meta.unit)
  const [discountPct, setDiscountPct] = useState(0)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const quote = useMemo(() => quoteOrder(quantity, meta.price ?? 0, meta.trialDays ?? 0, discountPct), [quantity, meta, discountPct])
  const returnTo = params.get('return')

  const schema = useMemo(() => {
    const req = z.string().trim().min(1, t('addons.setup.errors.required'))
    return z.object({
      cardHolder: req,
      cardNumber: z.string().refine((v) => /^\d{16}$/.test(v.replace(/\s/g, '')), t('addons.setup.errors.card')),
      expiry: z.string().refine((v) => {
        const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(v.trim())
        if (!m) return false
        const exp = new Date(2000 + Number(m[2]), Number(m[1]), 0)
        return exp >= parseISO(quote.billingStartsAt.slice(0, 7) + '-01')
      }, t('addons.setup.errors.expiry')),
      cvv: z.string().regex(/^\d{3,4}$/, t('addons.setup.errors.cvv')),
      accountType: z.enum(ACCOUNT_TYPES),
      firstName: req,
      lastName: req,
      businessName: req,
      address: req,
      vatNumber: z.string().trim().refine((v) => !v || /^PT\d{9}$/i.test(v), t('addons.setup.errors.vat')),
    })
  }, [t, quote.billingStartsAt])
  type Form = z.infer<typeof schema>
  const bd = plan.billingDetails
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      cardHolder: '',
      cardNumber: '',
      expiry: '',
      cvv: '',
      accountType: (ACCOUNT_TYPES as readonly string[]).includes(bd?.accountType ?? '') ? (bd!.accountType as Form['accountType']) : 'company',
      firstName: bd?.firstName ?? '',
      lastName: bd?.lastName ?? '',
      businessName: bd?.businessName ?? '',
      address: bd?.address ?? '',
      vatNumber: bd?.vatNumber ?? '',
    },
  })
  const err = formState.errors

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
    setSaving(true)
    const digits = v.cardNumber.replace(/\s/g, '')
    await enableAddOn(slug, {
      name,
      trialDays: meta.trialDays,
      order: { line: { description: `${name} add-on`, quantity, unitPrice: meta.price ?? 0 }, quote },
      billing: { accountType: v.accountType, firstName: v.firstName, lastName: v.lastName, businessName: v.businessName, address: v.address, vatNumber: v.vatNumber || undefined },
      card: { brand: digits.startsWith('4') ? 'Visa' : 'Mastercard', last4: digits.slice(-4), expiry: v.expiry },
      config,
    })
    setSaving(false)
    toast(t('addons.enabled', { name }))
    navigate(returnTo && returnTo.startsWith('/') ? returnTo : `/add-ons/manage/${slug}`)
  }

  const date = (iso: string) => format(parseISO(iso), 'MMM d, yyyy')
  const fieldError = (k: keyof Form) => err[k]?.message as string | undefined

  return (
    <FullscreenFrame
      title={t('addons.setup.title', { name })}
      onClose={onBack ?? (() => navigate(returnTo && returnTo.startsWith('/') ? returnTo : '/add-ons'))}
      progress={1 - stepsLeft / (stepsLeft + 2)}
      maxWidth="max-w-5xl"
      actions={<Button variant="primary" type="submit" form="addon-setup" loading={saving}>{t('addons.enable')}</Button>}
    >
      <p className="text-small text-muted">{t('addons.setup.stepsLeft', { count: stepsLeft })}</p>
      <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.setup.title', { name })}</h1>
      <p className="mt-1 text-body-lg text-muted">{t('addons.setup.intro', { name })}</p>
      <form id="addon-setup" noValidate onSubmit={handleSubmit(submit)} className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-8">
          <section className="card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-title-3 text-ink"><CreditCard size={20} aria-hidden />{t('addons.setup.payment')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('addons.setup.cardHolder')} error={fieldError('cardHolder')} className="sm:col-span-2">{(id) => <TextInput id={id} autoComplete="cc-name" invalid={Boolean(err.cardHolder)} {...register('cardHolder')} />}</Field>
              <Field label={t('addons.setup.cardNumber')} error={fieldError('cardNumber')} className="sm:col-span-2">{(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" suffix={<span className="text-caption font-semibold text-muted">VISA · MC</span>} invalid={Boolean(err.cardNumber)} {...register('cardNumber')} />}</Field>
              <Field label={t('addons.setup.expiry')} error={fieldError('expiry')}>{(id) => <TextInput id={id} autoComplete="cc-exp" placeholder="MM/YY" invalid={Boolean(err.expiry)} {...register('expiry')} />}</Field>
              <Field label={t('addons.setup.cvv')} error={fieldError('cvv')}>{(id) => <TextInput id={id} inputMode="numeric" autoComplete="cc-csc" placeholder="123" invalid={Boolean(err.cvv)} {...register('cvv')} />}</Field>
            </div>
          </section>
          <section className="card p-6">
            <h2 className="font-display text-title-3 text-ink">{t('addons.setup.billing')}</h2>
            <p className="mb-4 text-body text-muted">{t('addons.setup.billingHint')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('addons.setup.accountType')} className="sm:col-span-2">{(id) => <Select id={id} options={ACCOUNT_TYPES.map((a) => ({ value: a, label: t(`addons.setup.accountTypes.${a}`) }))} {...register('accountType')} />}</Field>
              <Field label={t('addons.setup.firstName')} error={fieldError('firstName')}>{(id) => <TextInput id={id} invalid={Boolean(err.firstName)} {...register('firstName')} />}</Field>
              <Field label={t('addons.setup.lastName')} error={fieldError('lastName')}>{(id) => <TextInput id={id} invalid={Boolean(err.lastName)} {...register('lastName')} />}</Field>
              <Field label={t('addons.setup.businessName')} hint={t('addons.setup.businessNameHint')} error={fieldError('businessName')} className="sm:col-span-2">{(id) => <TextInput id={id} invalid={Boolean(err.businessName)} {...register('businessName')} />}</Field>
              <Field label={t('addons.setup.address')} error={fieldError('address')} className="sm:col-span-2">{(id) => <TextInput id={id} invalid={Boolean(err.address)} {...register('address')} />}</Field>
              <Field label={`${t('addons.setup.vat')} · ${t('addons.setup.vatNumber')}`} optional error={fieldError('vatNumber')} className="sm:col-span-2">{(id) => <TextInput id={id} placeholder="PT123456789" invalid={Boolean(err.vatNumber)} {...register('vatNumber')} />}</Field>
            </div>
          </section>
        </div>
        <aside className="card h-fit p-6">
          <div className="flex items-center gap-3">
            <AddOnIcon slug={slug} />
            <div>
              <p className="text-body-strong text-ink">{name}</p>
              <p className="text-small text-muted">{t(`addons.taglines.${slug}`)}</p>
            </div>
          </div>
          {quote.trialEndsAt && <p className="mt-4 rounded-md bg-info-subtle px-3 py-2 text-small text-info">{t('addons.setup.trialLine', { count: meta.trialDays, date: date(quote.trialEndsAt) })}</p>}
          <div className="mt-4 flex items-start justify-between gap-3 border-b border-line pb-4 text-body">
            <div>
              <p className="font-semibold text-primary">{t(`addons.qty.${meta.unit ?? 'location'}`, { count: quantity })}</p>
              <p className="text-small text-muted">
                {meta.was && <span className="mr-1 line-through">{eur(meta.was)}</span>}
                {t(`addons.unitMonthly.${meta.unit ?? 'location'}`, { price: eur(meta.price ?? 0) })}
              </p>
            </div>
            <span className="tabular text-ink">{money2(quote.subtotal)}</span>
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-body">
            <div className="flex justify-between"><dt className="text-muted">{t('addons.setup.subtotal')}</dt><dd className="tabular">{money2(quote.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">{t('addons.setup.tax')}</dt><dd className="tabular">{money2(quote.tax)}</dd></div>
            {quote.discount > 0 && <div className="flex justify-between text-success"><dt>{t('addons.setup.discount', { pct: discountPct })}</dt><dd className="tabular">-{money2(quote.discount)}</dd></div>}
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t('addons.setup.discountCode')}</dt>
              <dd>{!codeOpen && <Button variant="link" type="button" onClick={() => setCodeOpen(true)}>{t('addons.setup.add')}</Button>}</dd>
            </div>
          </dl>
          {codeOpen && (
            <div className="mt-2 flex items-start gap-2">
              <Field error={codeError} className="flex-1">{(id) => <TextInput id={id} aria-label={t('addons.setup.discountCode')} value={code} onChange={(e) => setCode(e.target.value)} invalid={Boolean(codeError)} />}</Field>
              <Button type="button" loading={checking} disabled={!code.trim()} onClick={applyCode}>{t('addons.setup.apply')}</Button>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="text-body-strong text-ink">{quote.trialEndsAt ? t('addons.setup.totalMonthly') : t('addons.setup.payNow')}</span>
            <span className="font-display text-title-3 tabular text-ink">{money2(quote.trialEndsAt ? quote.totalMonthly : quote.payNow)}</span>
          </div>
          <p className="mt-4 text-small text-muted">{t('addons.setup.proRata')}</p>
          <p className="mt-2 text-small text-muted">{t('addons.setup.priceNote', { basis: t(`addons.basis.${meta.unit ?? 'location'}`), date: date(quote.billingStartsAt) })}</p>
        </aside>
      </form>
    </FullscreenFrame>
  )
}

// ─── Xero / QuickBooks ─────────────────────────────────────────────────────

interface Check {
  title: string
  body: string
}

function AccountingSetup({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useDb((s) => s.workspace)
  const provider = slug === 'xero' ? 'Xero' : 'QuickBooks'
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [connecting, setConnecting] = useState(false)
  const [org, setOrg] = useState<string | null>(null)
  const orgs = [`${workspace.name} Lda`, `${workspace.name} (Demo company)`]
  const [choice, setChoice] = useState(orgs[0])

  if (step === 3) return <PaidSetup slug={slug} stepsLeft={1} config={{ organisation: org, connected: true, connectedAt: nowISO() }} onBack={() => setStep(2)} />

  const connect = () => {
    setConnecting(true)
    window.setTimeout(() => {
      setConnecting(false)
      setOrg(choice)
    }, 1400)
  }
  const checks = t(`addons.accounting.checks.${slug}`, { returnObjects: true }) as Check[]

  return (
    <FullscreenFrame
      title={t('addons.setup.title', { name: t(`addons.items.${slug}.name`) })}
      onClose={() => navigate('/add-ons#integrations')}
      progress={step === 1 ? 0.15 : 0.35}
      actions={
        step === 1 ? (
          <Button variant="primary" onClick={() => setStep(2)}>{t('addons.continue')}</Button>
        ) : (
          <>
            <Button onClick={() => setStep(1)}>{t('addons.back')}</Button>
            <Button variant="primary" disabled={!org} onClick={() => setStep(3)}>{t('addons.continue')}</Button>
          </>
        )
      }
    >
      <p className="text-small text-muted">{t('addons.setup.stepsLeft', { count: step === 1 ? 5 : 4 })}</p>
      {step === 1 ? (
        <>
          <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.accounting.readyTitle', { name: provider })}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('addons.accounting.readyBody', { name: provider })}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {checks.map((c) => (
              <li key={c.title} className="card flex gap-3 p-4">
                <CheckCircle2 size={22} className="shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="text-body-strong text-ink">{c.title}</p>
                  <p className="text-body text-muted">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h1 className="mt-1 font-display text-title-1 text-ink">{t('addons.accounting.connectTitle', { name: provider })}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('addons.accounting.connectBody', { name: provider })}</p>
          <div className="card mt-6 p-6">
            {org ? (
              <p className="flex items-center gap-2 text-body-strong text-success"><CheckCircle2 size={20} aria-hidden />{t('addons.accounting.connected', { org })}</p>
            ) : (
              <div className="flex flex-col gap-4">
                <Field label={t('addons.accounting.organisation')}>{(id) => <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)} options={orgs} />}</Field>
                <p className="text-small text-muted">{t('addons.accounting.connectHint', { name: provider })}</p>
                <Button variant="primary" className="self-start" disabled={connecting} icon={connecting ? <Loader2 size={16} className="animate-spin" aria-hidden /> : undefined} onClick={connect}>
                  {connecting ? t('addons.accounting.connecting', { name: provider }) : t('addons.accounting.connectButton', { name: provider })}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </FullscreenFrame>
  )
}
