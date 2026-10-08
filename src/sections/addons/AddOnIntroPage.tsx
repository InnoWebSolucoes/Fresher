import { useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Chip, toast } from '@/components/ui'
import { enableAddOn, findAddOn, isAddOnOn } from '@/api/addons'
import { useDb } from '@/store/db'
import { eur, META } from './catalog'
import { IntroScreen } from './components/shared'

interface IntroCopy {
  label: string
  heading: string
  body?: string
  bullets: string[]
  price?: string
  words?: string[]
}

/** Where an intro/setup screen returns to (`?return=` from the reports Insights gate). */
export function useReturnTo(fallback: string): string {
  const [params] = useSearchParams()
  const to = params.get('return')
  return to && to.startsWith('/') && !to.startsWith('//') ? to : fallback
}

/** /add-ons/add-on/:slug/intro (add-ons.md §1.1): intro screen with price and Continue / Start now / Enable. */
export function AddOnIntroPage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const back = useReturnTo('/add-ons')
  const [busy, setBusy] = useState(false)
  const meta = META[slug]
  if (!meta) return <Navigate to="/add-ons" replace />
  if (meta.kind === 'integration') return <Navigate to={`/add-ons/integration/${slug}/intro`} replace />
  if (slug === 'payments') return <Navigate to="/payments/payment-processing" replace />
  if (meta.href && meta.kind === 'external') return <Navigate to={meta.href} replace />
  const copy = t(`addons.intro.${slug}`, { returnObjects: true }) as IntroCopy
  const name = t(`addons.items.${slug}.name`)
  const on = isAddOnOn(record)
  const query = params.get('return') ? `?return=${encodeURIComponent(params.get('return') ?? '')}` : ''

  const primary = async () => {
    if (on) return navigate(`/add-ons/manage/${slug}`)
    if (meta.kind === 'free') {
      setBusy(true)
      await enableAddOn(slug, { name })
      setBusy(false)
      toast(t('addons.enabled', { name }))
      return navigate(`/add-ons/manage/${slug}`)
    }
    navigate(`/add-ons/add-on/${slug}/setup${query}`)
  }

  const label = on ? t('addons.manageAddOn') : meta.kind === 'free' ? t('addons.enable') : t(`addons.${meta.cta ?? 'continue'}`)
  const price =
    meta.kind === 'free' ? null : (
      <div className="flex flex-col gap-1">
        {meta.was && (
          <Chip tone="success" className="mb-2 self-start">
            {t('addons.save25')}
          </Chip>
        )}
        <p className="font-display text-title-1 text-ink">
          {meta.was && <span className="mr-2 font-normal text-muted line-through">{eur(meta.was)}</span>}
          {eur(meta.price ?? 0)} {t(`addons.units.${meta.unit ?? 'location'}`)}
        </p>
        {meta.trialDays && !on && <p className="text-body-lg text-ink">{t('addons.tryFree', { count: meta.trialDays })}</p>}
      </div>
    )

  return (
    <IntroScreen
      slug={slug}
      label={copy.label}
      heading={copy.heading}
      body={copy.body}
      bullets={copy.bullets ?? []}
      words={copy.words}
      price={price}
      badge={on ? <Chip tone="success">{t('addons.active')}</Chip> : undefined}
      primary={{ label, onClick: () => void primary(), loading: busy }}
      onClose={() => navigate(back)}
    />
  )
}
