import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, PageSkeleton, usePageLoading } from '@/components/ui'
import { configBool, findAddOn, isAddOnOn, isOnTrial } from '@/api/addons'
import { useDb } from '@/store/db'
import { ADDONS, cardHref, INTEGRATIONS, META } from './catalog'
import { AddOnIcon } from './components/shared'

/** Add-ons page (add-ons.md §1): Add-ons / Integrations tabs, cards with status chips; View opens the intro or manage page. */
export function AddOnsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  const locations = useDb((s) => s.locations)
  const published = locations.some((l) => l.marketplace?.listed)
  const [tab, setTab] = useState<'addons' | 'integrations'>(location.hash === '#integrations' ? 'integrations' : 'addons')

  // Settings › "Reserve with Google" and other links land on #integrations.
  useEffect(() => {
    if (loading || location.hash !== '#integrations') return
    setTab('integrations')
    document.getElementById('integrations')?.scrollIntoView({ block: 'start' })
  }, [loading, location.hash])

  if (loading) return <div className="mx-auto w-full max-w-[1120px] px-8 py-8"><PageSkeleton /></div>

  const goTo = (id: 'addons' | 'integrations') => {
    setTab(id)
    window.history.replaceState(null, '', id === 'integrations' ? '#integrations' : window.location.pathname)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const card = (slug: string) => {
    const rec = findAddOn(addOns, slug)
    const integration = META[slug]?.kind === 'integration'
    const on = integration ? isAddOnOn(rec) && configBool(rec, 'connected') !== false : isAddOnOn(rec)
    const href = cardHref(slug, on, published)
    return (
      <li key={slug} className="card flex flex-col p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <AddOnIcon slug={slug} size={24} className="h-14 w-14 rounded-md" />
          {isOnTrial(rec) ? <Chip tone="info">{t('addons.onTrial')}</Chip> : on ? <Chip tone="success">{integration ? t('addons.integration.connected') : t('addons.active')}</Chip> : null}
        </div>
        <h3 className="text-body-lg font-semibold text-ink">{t(`addons.items.${slug}.name`)}</h3>
        <p className="mt-1 flex-1 text-body text-muted">{t(`addons.items.${slug}.description`)}</p>
        <div className="mt-6">
          <Button size="sm" className="h-9 rounded-full px-4" disabled={!href} title={!href ? t('addons.needsProfile') : undefined} aria-label={`${t('addons.view')} ${t(`addons.items.${slug}.name`)}`} onClick={() => href && navigate(href)}>
            {t('addons.view')}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-8 py-8">
      <header className="mb-5">
        <h1 className="font-display text-title-1 text-ink">{t('addons.title')}</h1>
        <p className="mt-1 text-body-lg text-muted">{t('addons.subtitle')}</p>
      </header>
      <div className="sticky top-0 z-10 -mx-2 mb-6 flex gap-1 bg-canvas px-2 py-2" role="tablist" aria-label={t('addons.title')}>
        {(['addons', 'integrations'] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => goTo(id)} className={clsx('h-10 rounded-full px-5 text-body-strong transition-colors', tab === id ? 'bg-ink text-canvas' : 'text-ink hover:bg-sunken')}>
            {id === 'addons' ? t('addons.tabAddons') : t('addons.integrations')}
          </button>
        ))}
      </div>
      <ul id="addons" className="grid scroll-mt-20 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('addons.tabAddons')}>
        {ADDONS.map(card)}
      </ul>
      <h2 id="integrations" className="mb-5 mt-12 scroll-mt-20 font-display text-title-2 text-ink">
        {t('addons.integrations')}
      </h2>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('addons.integrations')}>
        {INTEGRATIONS.map(card)}
      </ul>
    </div>
  )
}
