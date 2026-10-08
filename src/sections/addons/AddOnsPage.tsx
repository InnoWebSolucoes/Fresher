import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Page, PageHeader, PageSkeleton, toast, usePageLoading } from '@/components/ui'
import { enableAddOn, findAddOn, isAddOnOn, isOnTrial } from '@/api/addons'
import { useDb } from '@/store/db'

const ADDONS = ['payments', 'premium-support', 'insights', 'google-rating-boost', 'loyalty', 'data-connector', 'client-connect', 'smart-website', 'team-chat', 'bookable-resources']
const INTEGRATIONS = ['xero', 'quickbooks', 'google-reserve', 'fb-and-ig-bookings', 'meta-pixel-ads', 'google-analytics', 'google-ads']

/** Add-ons page (add-ons.md §1): cards with status chips. */
export function AddOnsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  if (loading) return <Page><PageSkeleton /></Page>
  const card = (slug: string) => {
    const rec = findAddOn(addOns, slug)
    const on = isAddOnOn(rec)
    return (
      <div key={slug} className="card flex flex-col p-5">
        <div className="mb-3 flex justify-end">{isOnTrial(rec) ? <Chip tone="info">{t('addons.onTrial')}</Chip> : on ? <Chip tone="success">{t('addons.active')}</Chip> : <span className="h-6" />}</div>
        <h3 className="text-body-strong text-ink">{t(`addons.items.${slug}.name`)}</h3>
        <p className="mt-1 flex-1 text-body text-muted">{t(`addons.items.${slug}.description`)}</p>
        <div className="mt-4">
          <Button
            size="sm"
            onClick={async () => {
              if (slug === 'smart-website') return navigate('/add-ons/smart-website')
              if (on) return toast(t('addons.alreadyActive', { name: t(`addons.items.${slug}.name`) }))
              await enableAddOn(slug, { name: t(`addons.items.${slug}.name`) })
              toast(t('addons.enabled', { name: t(`addons.items.${slug}.name`) }))
            }}
          >
            {on ? t('addons.view') : t('addons.enable')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <Page>
      <PageHeader title={t('addons.title')} subtitle={t('addons.subtitle')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ADDONS.map(card)}</div>
      <h2 id="integrations" className="mb-4 mt-10 font-display text-title-2 text-ink">{t('addons.integrations')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{INTEGRATIONS.map(card)}</div>
    </Page>
  )
}
