import { Copy, MapPin, Plus, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Select, confirm, toast } from '@/components/ui'
import { deleteLocation, locationUsage } from '@/api/settings'
import { useDb } from '@/store/db'
import type { Location } from '@/types'
import { ActionsPill, PillMenu, SettingsPage } from '../components/ui'
import { useAction } from '../components/useAction'
import { useLocations, useWorkspace } from '../hooks'
import { formatAddress } from './shared'
import { useAllLocationExtras } from './locationExtras'

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Settings › Business setup › Locations (settings-business-setup.md §2). */
export function LocationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const locations = useLocations()
  const reviews = useDb((s) => s.reviews)
  const appointments = useDb((s) => s.appointments)
  const extras = useAllLocationExtras()
  const [share, setShare] = useState(false)
  const [, run] = useAction()

  const ratings = useMemo(() => {
    const locationOf = new Map(appointments.map((a) => [a.id, a.locationId]))
    const out: Record<string, { sum: number; count: number }> = {}
    reviews.forEach((r) => {
      const loc = r.appointmentId ? locationOf.get(r.appointmentId) : undefined
      if (!loc) return
      out[loc] = out[loc] ?? { sum: 0, count: 0 }
      out[loc].sum += r.rating
      out[loc].count += 1
    })
    return out
  }, [reviews, appointments])

  const remove = async (location: Location) => {
    const usage = locationUsage(location.id)
    if (usage.appointments || usage.sales) {
      const go = await confirm({
        title: t('settings.biz.locations.cantDeleteTitle'),
        body: t('settings.biz.locations.cantDeleteBody', { name: location.name, appointments: usage.appointments, sales: usage.sales }),
        confirmLabel: t('settings.biz.locations.addClosedPeriod'),
        tone: 'primary',
      })
      if (go) navigate('/setup/scheduling/closed-periods')
      return
    }
    const ok = await confirm({ title: t('settings.biz.locations.deleteTitle'), body: t('settings.biz.locations.deleteBody', { name: location.name }), confirmLabel: t('settings.biz.locations.deleteConfirm'), tone: 'danger' })
    if (ok) await run(() => deleteLocation(location.id), t('settings.biz.locations.deleted'))
  }

  return (
    <SettingsPage
      title={t('settings.biz.locations.title')}
      description={t('settings.biz.locations.description')}
      learnMore="Locations"
      actions={
        <>
          <PillMenu label={t('settings.common.options')} groups={[{ items: [{ label: t('settings.biz.locations.shareLink'), onSelect: () => setShare(true) }] }]} />
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/setup/location/new/basic-info')} data-testid="add-location">
            {t('settings.common.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {locations.map((location) => {
          const rating = ratings[location.id]
          const open = () => navigate(`/setup/location/${location.id}/business-details`)
          return (
            <div key={location.id} className="card flex cursor-pointer items-center gap-5 p-4 hover:border-line-strong" onClick={open} data-testid={`location-card-${location.id}`}>
              <LocationImage name={location.name} />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={open} className="text-left font-display text-title-3 text-ink hover:underline">
                  {location.name}
                </button>
                <p className="mt-0.5 flex items-center gap-1 text-body text-muted">
                  {rating ? (
                    <>
                      <Star size={14} className="fill-accent text-accent" aria-hidden />
                      <span className="text-ink">{(rating.sum / rating.count).toFixed(1)}</span> {t('settings.biz.locations.reviews', { count: rating.count })}
                    </>
                  ) : (
                    t('settings.biz.locations.noReviews')
                  )}
                </p>
                <p className="mt-1 flex items-center gap-1.5 truncate text-body text-muted">
                  <MapPin size={14} aria-hidden />
                  {extras[location.id]?.noAddress ? t('settings.biz.location.noAddress') : formatAddress(location.address)}
                </p>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.common.view'), onSelect: open },
                        { label: t('settings.biz.locations.delete'), danger: true, disabled: locations.length <= 1, hint: locations.length <= 1 ? t('settings.biz.locations.lastLocation') : undefined, onSelect: () => void remove(location) },
                      ],
                    },
                  ]}
                />
              </div>
            </div>
          )
        })}
      </div>
      <ShareLinkModal open={share} onClose={() => setShare(false)} />
    </SettingsPage>
  )
}

/** Original placeholder image: initials on a teal gradient. */
export function LocationImage({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary to-[#0B4F4C] font-display text-on-primary ${size === 'lg' ? 'h-24 w-36 text-title-1' : 'h-20 w-28 text-title-2'}`} aria-hidden>
      <span className="absolute -right-4 -top-4 h-12 w-12 rounded-full bg-accent/60" />
      <span className="relative">{initials}</span>
    </div>
  )
}

function ShareLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const locations = useLocations()
  const listed = locations.filter((l) => l.marketplace.listed)
  const [locationId, setLocationId] = useState('all')
  const base = `https://book.innoweb.app/${slugify(workspace.name)}`
  const link = locationId === 'all' ? base : `${base}/${slugify(locations.find((l) => l.id === locationId)?.internalName ?? locationId)}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the link is still shown.
    }
    toast(t('settings.common.copied'))
  }
  if (!listed.length) {
    // Reference: "To create a link for the entire service menu, publish your profile" (Start now / Close).
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={t('settings.biz.locations.publishTitle')}
        subtitle={t('settings.biz.locations.publishBody')}
        footer={
          <>
            <Button onClick={onClose}>{t('settings.common.close')}</Button>
            <Button variant="primary" onClick={() => navigate('/online-presence/locations')} data-testid="share-start-now">
              {t('settings.biz.locations.startNow')}
            </Button>
          </>
        }
      />
    )
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.biz.locations.shareTitle')}
      subtitle={t('settings.biz.locations.shareHint')}
      footer={
        <>
          <Button onClick={onClose}>{t('settings.common.done')}</Button>
          <Button variant="primary" icon={<Copy size={16} />} onClick={copy} data-testid="share-copy">
            {t('settings.biz.locations.copyLink')}
          </Button>
        </>
      }
    >
      <div className="pb-2">
        <label className="label" htmlFor="share-location">
          {t('settings.biz.locations.shareFor')}
        </label>
        <Select id="share-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} options={[{ value: 'all', label: t('settings.common.allLocations') }, ...listed.map((l) => ({ value: l.id, label: l.name }))]} />
        <p className="mt-4 break-all rounded-md bg-sunken px-4 py-3 font-mono text-small text-ink" data-testid="share-link">
          {link}
        </p>
      </div>
    </Modal>
  )
}
