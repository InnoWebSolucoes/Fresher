import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, Field, FullscreenFrame, LearnMore, TextArea, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { createStocktake } from '@/api/catalog'
import { LocationCard, LocationPicker } from '../ui'

/** "Add the stocktake info" wizard step (catalog.md §5 Create). */
export function StocktakeNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const locations = useDb((s) => s.locations)
  const products = useDb((s) => s.products)
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const tracked = useMemo(() => products.filter((p) => p.trackStock && !p.archived).length, [products])
  const location = locations.find((l) => l.id === locationId)

  const start = async () => {
    setBusy(true)
    try {
      const st = await createStocktake({ name, description, locationId })
      toast(t('catalog.inventory.stocktakeNew.started'))
      navigate(`/catalogue/stocktakes/${st.id}/count`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullscreenFrame closeLabel={t('catalog.common.close')}
      onClose={() => navigate('/catalogue/stocktakes')}
      progress={0.5}
      actions={
        <Button variant="primary" loading={busy} disabled={!tracked || !locationId} onClick={() => void start()}>
          {t('catalog.inventory.stocktakeNew.start')}
        </Button>
      }
    >
      <p className="text-body text-muted">{t('catalog.inventory.stocktakeNew.eyebrow')}</p>
      <h1 className="mt-1 font-display text-display text-ink">{t('catalog.inventory.stocktakeNew.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">
        {t('catalog.inventory.stocktakeNew.subtitle')} <LearnMore topic="Stocktakes">{t('catalog.common.learnMore')}</LearnMore>
      </p>
      {!tracked ? (
        <EmptyState
          className="mt-8 card"
          title={t('catalog.inventory.stocktakeNew.noProducts')}
          action={
            <Button variant="primary" onClick={() => navigate('/catalogue/products/add')}>
              {t('catalog.inventory.stocktakeNew.addProducts')}
            </Button>
          }
        />
      ) : (
        <form
          className="mt-8 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void start()
          }}
        >
          <LocationCard location={location} onChange={locations.length > 1 ? () => setPickerOpen(true) : undefined} />
          <h2 className="mt-4 font-display text-title-2 text-ink">{t('catalog.inventory.stocktakeNew.info')}</h2>
          <Field label={t('catalog.inventory.stocktakeNew.name')} optional>
            {(id) => <TextInput id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t('catalog.inventory.stocktakeNew.namePlaceholder')} />}
          </Field>
          <Field label={t('catalog.inventory.stocktakeNew.description')} optional counter={{ value: description.length, max: 200 }}>
            {(id) => <TextArea id={id} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder={t('catalog.inventory.stocktakeNew.descriptionPlaceholder')} />}
          </Field>
          <p className="text-small text-muted">{t('catalog.inventory.stocktakeNew.trackedCount', { count: tracked })}</p>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      )}
      <LocationPicker open={pickerOpen} onClose={() => setPickerOpen(false)} locations={locations} value={locationId} onChange={setLocationId} />
    </FullscreenFrame>
  )
}
