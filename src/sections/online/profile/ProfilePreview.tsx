import { MapPin, Star } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Modal, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { money, num } from '@/lib/format'
import { durationLabel, now, weekdayOf } from '@/lib/time'
import type { Location } from '@/types'
import { addressLine, featureLabel, opensAt, sampleImage } from '../shared'

/** How the listing looks to clients on the marketplace. */
export function ProfilePreviewModal({ open, onClose, location }: { open: boolean; onClose: () => void; location: Location }) {
  const { t } = useTranslation()
  const services = useDb((s) => s.services)
  const reviews = useDb((s) => s.reviews)
  const appointments = useDb((s) => s.appointments)
  const list = useMemo(() => services.filter((s) => !s.archived && s.onlineBooking && s.locationIds.includes(location.id)).slice(0, 6), [services, location.id])
  const rating = useMemo(() => {
    const apptLoc = new Map(appointments.map((a) => [a.id, a.locationId]))
    const mine = reviews.filter((r) => r.platform === 'marketplace' && (!r.appointmentId || apptLoc.get(r.appointmentId) === location.id))
    return mine.length ? { avg: mine.reduce((n, r) => n + r.rating, 0) / mine.length, count: mine.length } : null
  }, [reviews, appointments, location.id])
  const images = location.marketplace.images.length ? location.marketplace.images : [sampleImage(0), sampleImage(1), sampleImage(2)]
  const open_ = opensAt(location.openingHours, weekdayOf(now()))
  const m = location.marketplace
  return (
    <Modal open={open} onClose={onClose} size="xl" title={t('online.preview.title')} subtitle={t('online.preview.subtitle')}>
      <div className="grid grid-cols-3 gap-2 overflow-hidden rounded-lg">
        <img src={images[0]} alt="" className="col-span-2 row-span-2 h-72 w-full object-cover" />
        <img src={images[1] ?? images[0]} alt="" className="h-[140px] w-full object-cover" />
        <img src={images[2] ?? images[0]} alt="" className="h-[140px] w-full object-cover" />
      </div>
      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_280px]">
        <div>
          <h3 className="font-display text-title-1 text-ink">{location.name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-body text-muted">
            <Star size={16} className="text-warning" aria-hidden />
            {rating ? t('online.preview.rating', { avg: num(rating.avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: rating.count }) : t('online.dashboard.noReviews')}
            <span aria-hidden>•</span>
            {open_ ? t('online.dashboard.opensAt', { time: open_ }) : t('online.dashboard.closedToday')}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-body text-muted">
            <MapPin size={16} aria-hidden />
            {addressLine(location)}
          </p>
          {(m.amenities.length > 0 || m.highlights.length > 0 || m.values.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {[...m.highlights, ...m.amenities, ...m.values].map((x) => (
                <Chip key={x} tone="outline">
                  {featureLabel(t, x)}
                </Chip>

              ))}
            </div>
          )}
          <h4 className="mt-6 text-title-3 text-ink">{t('online.preview.about')}</h4>
          <p className="mt-2 whitespace-pre-line text-body text-muted">{m.description || t('online.preview.noDescription')}</p>
          <h4 className="mt-6 text-title-3 text-ink">{t('online.preview.services')}</h4>
          <ul className="mt-2 divide-y divide-line">
            {list.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <span>
                  <span className="block text-body-strong text-ink">{s.name}</span>
                  <span className="text-small text-muted">{durationLabel(s.durationMin)}</span>
                </span>
                <span className="text-body text-ink">{s.priceType === 'free' ? t('online.preview.free') : `${s.priceType === 'from' ? t('online.preview.from') + ' ' : ''}${money(s.price)}`}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="card h-fit p-5">
          <p className="font-display text-title-3 text-ink">{location.name}</p>
          <p className="mt-1 text-small text-muted">{location.phone}</p>
          <Button variant="primary" className="mt-4 w-full" onClick={() => toast(t('online.preview.bookNote'))}>
            {t('online.preview.bookNow')}
          </Button>
        </aside>
      </div>
    </Modal>
  )
}
