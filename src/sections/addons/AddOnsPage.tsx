import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Page, PageHeader, PageSkeleton, usePageLoading } from '@/components/ui'
import { findAddOn, isAddOnOn, isOnTrial } from '@/api/addons'
import { useDb } from '@/store/db'
import { ADDONS, cardHref, INTEGRATIONS } from './catalog'
import { AddOnIcon } from './components/shared'

/** Add-ons page (add-ons.md §1): cards with status chips; View opens the intro or manage page. */
export function AddOnsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  if (loading) return <Page><PageSkeleton /></Page>
  const card = (slug: string) => {
    const rec = findAddOn(addOns, slug)
    const on = isAddOnOn(rec)
    const href = cardHref(slug, on)
    return (
      <div key={slug} className="card flex flex-col p-5">
        <div className="mb-3 flex items-start justify-between">
          <AddOnIcon slug={slug} />
          {isOnTrial(rec) ? <Chip tone="info">{t('addons.onTrial')}</Chip> : on ? <Chip tone="success">{t('addons.active')}</Chip> : null}
        </div>
        <h3 className="text-body-strong text-ink">{t(`addons.items.${slug}.name`)}</h3>
        <p className="mt-1 flex-1 text-body text-muted">{t(`addons.items.${slug}.description`)}</p>
        <div className="mt-4">
          <Button size="sm" disabled={!href} onClick={() => href && navigate(href)}>
            {t('addons.view')}
          </Button>
        </div>
      </div>
    )
  }
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <Page>
      <PageHeader title={t('addons.title')} subtitle={t('addons.subtitle')} />
      <div className="mb-6 flex gap-2" role="tablist">
        <button type="button" role="tab" className="chip h-9 cursor-pointer bg-ink px-4 text-surface" onClick={() => scrollTo('addons')}>{t('addons.tabAddons')}</button>
        <button type="button" role="tab" className="chip h-9 cursor-pointer border border-line bg-surface px-4 text-ink hover:bg-sunken" onClick={() => { window.history.replaceState(null, '', '#integrations'); scrollTo('integrations') }}>{t('addons.integrations')}</button>
      </div>
      <div id="addons" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ADDONS.map(card)}</div>
      <h2 id="integrations" className="mb-4 mt-10 scroll-mt-20 font-display text-title-2 text-ink">{t('addons.integrations')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{INTEGRATIONS.map(card)}</div>
    </Page>
  )
}
