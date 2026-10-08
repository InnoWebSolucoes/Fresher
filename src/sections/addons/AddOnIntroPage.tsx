import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Chip, toast } from '@/components/ui'
import { enableAddOn, findAddOn, isAddOnOn } from '@/api/addons'
import { useDb } from '@/store/db'
import { eur, META } from './catalog'
import { IntroModal } from './components/shared'

interface IntroCopy {
  label: string
  heading: string
  body: string
  bullets: string[]
  price?: string
  words?: string[]
}

const normalize = (slug: string) => slug

/** /add-ons/add-on/:slug/intro (add-ons.md §1.1): intro modal with price and Continue. */
export function AddOnIntroPage() {
  const { slug: raw = '' } = useParams()
  const slug = normalize(raw)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const [busy, setBusy] = useState(false)
  const meta = META[slug]
  if (!meta || meta.kind === 'integration') return <Navigate to={meta ? `/add-ons/integration/${slug}/intro` : '/add-ons'} replace />
  if (slug === 'payments') return <Navigate to="/payments/payment-processing" replace />
  if (meta.href && meta.kind === 'external') return <Navigate to={meta.href} replace />
  const copy = t(`addons.intro.${slug}`, { returnObjects: true }) as IntroCopy
  const name = t(`addons.items.${slug}.name`)
  const on = isAddOnOn(record)

  const primary = async () => {
    if (on) return navigate(`/add-ons/manage/${slug}`)
    if (meta.kind === 'free') {
      setBusy(true)
      await enableAddOn(slug, { name })
      setBusy(false)
      toast(t('addons.enabled', { name }))
      return navigate(`/add-ons/manage/${slug}`)
    }
    navigate(`/add-ons/add-on/${slug}/setup`)
  }

  const label = on ? t('addons.view') : meta.kind === 'free' ? t('addons.enable') : t(`addons.${meta.cta ?? 'continue'}`)
  const price =
    meta.kind === 'free' ? null : (
      <div className="flex flex-col gap-1">
        {meta.was && <Chip tone="success" className="self-start">{t('addons.save25')}</Chip>}
        <p className="text-body-lg text-ink">
          {meta.was && <span className="mr-2 text-muted line-through">{eur(meta.was)}</span>}
          <span className="font-semibold">{eur(meta.price ?? 0)}</span> {t(`addons.units.${meta.unit ?? 'location'}`)}
        </p>
        {meta.trialDays && !on && <p className="text-body-lg font-semibold text-primary">{t('addons.tryFree', { count: meta.trialDays })}</p>}
      </div>
    )

  return (
    <IntroModal
      slug={slug}
      label={copy.label}
      heading={copy.heading}
      body={copy.body}
      bullets={copy.bullets ?? []}
      words={copy.words}
      price={price}
      badge={on ? <Chip tone="success">{t('addons.active')}</Chip> : undefined}
      primary={{ label, onClick: () => void primary(), loading: busy }}
      onClose={() => navigate('/add-ons')}
    />
  )
}

/** /payments/payment-processing (add-ons.md §2.1): Payments intro with Start now. */
export function PaymentsProcessingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const record = findAddOn(useDb((s) => s.addOns), 'payments')
  const copy = t('addons.intro.payments', { returnObjects: true }) as IntroCopy
  const hasAccounts = Boolean((record?.config?.accounts as unknown[] | undefined)?.length)
  return (
    <IntroModal
      slug="payments"
      label={copy.label}
      heading={copy.heading}
      body={copy.body}
      bullets={copy.bullets}
      price={<p className="text-body-lg font-semibold text-ink">{copy.price}</p>}
      badge={hasAccounts ? <Chip tone="success">{t('addons.active')}</Chip> : undefined}
      primary={{ label: hasAccounts ? t('addons.view') : t('addons.startNow'), onClick: () => navigate(hasAccounts ? '/add-ons/manage/payments' : '/payments/onboarding/overview') }}
      onClose={() => navigate('/add-ons')}
    />
  )
}
