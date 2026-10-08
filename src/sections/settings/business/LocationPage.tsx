import clsx from 'clsx'
import { ArrowUpRight, ChevronRight, IdCard, MapPin, Tag, Timer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, Field, LearnMore, TextInput, confirm } from '@/components/ui'
import { deleteLocation, locationUsage, updateLocation } from '@/api/settings'
import { now, weekdayOf } from '@/lib/time'
import type { Location, OpeningHours } from '@/types'
import { ActionsPill, EditCard, FormCard, FormStack, InfoGrid, PillMenu, SettingsPage } from '../components/ui'
import { FullModal } from '../components/FullModal'
import { useAction } from '../components/useAction'
import { useLocations } from '../hooks'
import {
  AddressFields,
  BusinessTypeTiles,
  DEFAULT_MAP,
  MapPlaceholder,
  OpeningHoursEditor,
  PhoneInput,
  addressErrors,
  businessTypeLabel,
  dayName,
  formatAddress,
  openingHoursErrors,
  phoneWithPrefix,
  rangesLabel,
  validEmail,
  validPhone,
  type AddressDraft,
  type MapView,
} from './shared'
import { WEEKDAYS } from '@/api/settings'
import { saveLocationExtras, useLocationExtras } from './locationExtras'
import { LocationSalesTab } from './LocationSalesTab'

const TABS = [
  { id: 'business-details', icon: IdCard },
  { id: 'business-location', icon: MapPin },
  { id: 'opening-hours', icon: Timer },
  { id: 'sales', icon: Tag },
] as const
type TabId = (typeof TABS)[number]['id']

/** Location page with its four tabs (settings-business-setup.md §2.2). */
export function LocationPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '', tab = 'business-details' } = useParams()
  const locations = useLocations()
  const location = locations.find((l) => l.id === id)
  const [, run] = useAction()
  // Phones: the tab row scrolls sideways, so bring the current tab into view.
  const tabList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const list = tabList.current
    const current = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !current || list.scrollWidth <= list.clientWidth) return
    list.scrollLeft += current.getBoundingClientRect().left - list.getBoundingClientRect().left - 16
  }, [tab])
  if (!location) {
    return (
      <div className="card">
        <EmptyState
          icon={<MapPin size={26} />}
          title={t('settings.biz.location.notFound')}
          body={t('settings.biz.location.notFoundBody')}
          action={
            <Button variant="primary" onClick={() => navigate('/setup/business-setup/location-details')}>
              {t('settings.biz.location.backToLocations')}
            </Button>
          }
        />
      </div>
    )
  }
  if (!TABS.some((x) => x.id === tab)) return <Navigate to={`/setup/location/${id}/business-details`} replace />

  const today = location.openingHours[weekdayOf(now())]
  const opens = today.open && today.ranges.length ? t('settings.biz.location.opensAt', { time: today.ranges[0].start }) : t('settings.biz.location.closedToday')
  const place = [location.address.city, location.address.district && location.address.district !== location.address.city ? location.address.district : ''].filter(Boolean).join(', ')

  const remove = async () => {
    if (locations.length <= 1) return
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
    if (await confirm({ title: t('settings.biz.locations.deleteTitle'), body: t('settings.biz.locations.deleteBody', { name: location.name }), confirmLabel: t('settings.biz.locations.deleteConfirm'), tone: 'danger' })) {
      await run(() => deleteLocation(location.id), t('settings.biz.locations.deleted'), () => navigate('/setup/business-setup/location-details'))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap items-center gap-1.5 text-body text-muted" aria-label={t('settings.biz.locations.title')}>
        <Link to="/setup/business-setup/location-details" className="hover:text-ink hover:underline">
          {t('settings.biz.locations.title')}
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="text-ink">{location.name}</span>
      </nav>
      <SettingsPage
        title={location.name}
        description={
          <>
            {opens}
            {place && ` • ${place}`}
          </>
        }
        actions={<PillMenu label={t('settings.common.options')} groups={[{ items: [{ label: t('settings.biz.locations.delete'), danger: true, disabled: locations.length <= 1, hint: locations.length <= 1 ? t('settings.biz.locations.lastLocation') : undefined, onSelect: () => void remove() }] }]} />}
      >
        <div className="flex flex-col-reverse gap-2 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-x-6 md:gap-y-3 md:border-b md:border-line">
          <div ref={tabList} role="tablist" aria-label={t('settings.biz.location.settings')} className="-mx-4 flex gap-1 overflow-x-auto px-4 shadow-[inset_0_-1px_0_rgb(var(--border))] [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:shadow-none">
            {TABS.map(({ id: tabId, icon: Icon }) => (
              <Link
                key={tabId}
                to={`/setup/location/${location.id}/${tabId}`}
                role="tab"
                aria-selected={tab === tabId}
                className={clsx('inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-body-strong transition-colors md:-mb-px', tab === tabId ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink')}
              >
                <Icon size={16} aria-hidden />
                {t(`settings.biz.location.tabs.${tabId}`)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 md:gap-4 md:pb-3">
            <Link to={`/online-presence/profile/dashboard/${location.id}`} className="inline-flex items-center gap-1 text-body text-muted hover:text-ink">
              {t('settings.biz.location.marketplaceProfile')}
              <ArrowUpRight size={14} aria-hidden />
            </Link>
            <Link to="/setup/billing/business-details" className="inline-flex items-center gap-1 text-body text-muted hover:text-ink">
              {t('settings.biz.location.billingProfiles')}
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {(tab as TabId) === 'business-details' && <BusinessDetailsTab location={location} />}
          {(tab as TabId) === 'business-location' && <BusinessLocationTab location={location} />}
          {(tab as TabId) === 'opening-hours' && <OpeningHoursTab location={location} />}
          {(tab as TabId) === 'sales' && <LocationSalesTab location={location} />}
        </div>
      </SettingsPage>
    </div>
  )
}

// ─── Business details ──────────────────────────────────────────────────────

function BusinessDetailsTab({ location }: { location: Location }) {
  const { t } = useTranslation()
  const [modal, setModal] = useState<'details' | 'types' | null>(null)
  return (
    <>
      <EditCard title={t('settings.biz.location.details')} onEdit={() => setModal('details')} testId="location-details-card">
        <InfoGrid
          rows={[
            { label: t('settings.biz.location.name'), value: location.name },
            { label: t('settings.biz.location.internalName'), value: location.internalName },
            { label: t('settings.biz.location.email'), value: location.email },
            { label: t('settings.biz.location.phone'), value: location.phone },
          ]}
        />
      </EditCard>
      <EditCard title={t('settings.biz.types.cardTitle')} onEdit={() => setModal('types')} testId="business-types-card">
        <InfoGrid
          rows={[
            { label: t('settings.biz.types.main'), value: location.businessTypes[0] ? businessTypeLabel(t, location.businessTypes[0]) : undefined },
            { label: t('settings.biz.types.additional'), value: location.businessTypes.slice(1).map((name) => businessTypeLabel(t, name)).join(', ') },
          ]}
        />
      </EditCard>
      <EditBusinessModal location={location} open={modal === 'details'} onClose={() => setModal(null)} />
      <BusinessTypesModal location={location} open={modal === 'types'} onClose={() => setModal(null)} />
    </>
  )
}

function EditBusinessModal({ location, open, onClose }: { location: Location; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const initial = useMemo(() => ({ name: location.name, internalName: location.internalName ?? '', phone: location.phone, email: location.email }), [location])
  const [draft, setDraft] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setDraft(initial)
      setSubmitted(false)
    }
  }
  const errors = {
    name: !draft.name.trim() ? t('settings.biz.new.nameRequired') : undefined,
    phone: !draft.phone.trim() ? t('settings.common.required') : !validPhone(draft.phone) ? t('settings.biz.new.phoneInvalid') : undefined,
    email: !draft.email.trim() ? t('settings.common.required') : !validEmail(draft.email) ? t('settings.biz.new.emailInvalid') : undefined,
  }
  const e = submitted ? errors : { name: undefined, phone: undefined, email: undefined }
  const save = () => {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    void run(
      () =>
        updateLocation(location.id, (l) => {
          l.name = draft.name.trim()
          l.internalName = draft.internalName.trim() || undefined
          l.phone = phoneWithPrefix(draft.phone)
          l.email = draft.email.trim()
        }),
      t('settings.biz.location.detailsSaved'),
      onClose,
    )
  }
  return (
    <FullModal open={open} onClose={onClose} onSave={save} saving={saving} title={t('settings.biz.location.editBusiness')} testId="edit-business-modal">
      <FormCard>
        <Field label={t('settings.biz.location.displayName')} counter={{ value: draft.name.length, max: 60 }} hint={t('settings.biz.new.nameHint')} error={e.name}>
          {(id) => <TextInput id={id} maxLength={60} value={draft.name} invalid={Boolean(e.name)} onChange={(ev) => setDraft({ ...draft, name: ev.target.value })} />}
        </Field>
        <Field label={t('settings.biz.new.internalName')} optional counter={{ value: draft.internalName.length, max: 60 }} hint={t('settings.biz.new.internalNameHint')}>
          {(id) => <TextInput id={id} maxLength={60} value={draft.internalName} onChange={(ev) => setDraft({ ...draft, internalName: ev.target.value })} />}
        </Field>
        <Field label={t('settings.biz.location.contactNumber')} error={e.phone}>
          {(id) => <PhoneInput id={id} value={draft.phone} invalid={Boolean(e.phone)} onChange={(phone) => setDraft({ ...draft, phone })} />}
        </Field>
        <Field label={t('settings.biz.new.email')} error={e.email}>
          {(id) => <TextInput id={id} type="email" value={draft.email} invalid={Boolean(e.email)} onChange={(ev) => setDraft({ ...draft, email: ev.target.value })} />}
        </Field>
      </FormCard>
    </FullModal>
  )
}

function BusinessTypesModal({ location, open, onClose }: { location: Location; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [types, setTypes] = useState(location.businessTypes)
  const [lastOpen, setLastOpen] = useState(open)
  const [error, setError] = useState(false)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setTypes(location.businessTypes)
      setError(false)
    }
  }
  const save = () => {
    if (!types.length) {
      setError(true)
      return
    }
    void run(
      () =>
        updateLocation(location.id, (l) => {
          l.businessTypes = types
        }),
      t('settings.biz.types.saved'),
      onClose,
    )
  }
  return (
    <FullModal open={open} onClose={onClose} onSave={save} saving={saving} title={t('settings.biz.types.title')} subtitle={t('settings.biz.types.subtitle')} width="max-w-[1040px]" testId="business-types-modal">
      <BusinessTypeTiles
        value={types}
        onChange={(v) => {
          setTypes(v)
          setError(false)
        }}
      />
      {error && <p className="mt-3 text-small text-danger">{t('settings.biz.types.required')}</p>}
    </FullModal>
  )
}

// ─── Business location ─────────────────────────────────────────────────────

function BusinessLocationTab({ location }: { location: Location }) {
  const { t } = useTranslation()
  const extras = useLocationExtras(location.id)
  const [open, setOpen] = useState(false)
  return (
    <>
      <EditCard title={t('settings.biz.location.locationCard')} onEdit={() => setOpen(true)} testId="business-location-card">
        <InfoGrid
          cols={1}
          rows={[
            { label: t('settings.biz.location.businessAddress'), value: extras.noAddress ? t('settings.biz.location.noAddress') : formatAddress(location.address) },
            ...(location.directions && !extras.noAddress ? [{ label: t('settings.biz.address.directions'), value: location.directions }] : []),
          ]}
        />
        {!extras.noAddress && (
          <div className="mt-5">
            <MapPlaceholder label={location.name} view={extras.map ?? DEFAULT_MAP} height={220} />
          </div>
        )}
      </EditCard>
      <EditLocationModal location={location} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function EditLocationModal({ location, open, onClose }: { location: Location; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const extras = useLocationExtras(location.id)
  const saved: AddressDraft = useMemo(() => ({ ...location.address, line2: location.address.line2 ?? '', district: location.address.district ?? '', region: location.address.region ?? '', directions: location.directions ?? '' }), [location])
  const [address, setAddress] = useState<AddressDraft>(saved)
  const [noAddress, setNoAddress] = useState(Boolean(extras.noAddress))
  const [map, setMap] = useState<MapView>(extras.map ?? DEFAULT_MAP)
  const [submitted, setSubmitted] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setAddress(saved)
      setNoAddress(Boolean(extras.noAddress))
      setMap(extras.map ?? DEFAULT_MAP)
      setSubmitted(false)
    }
  }
  const errors = noAddress ? {} : addressErrors(address, t)
  const save = () => {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    void run(
      async () => {
        const { directions, ...rest } = address
        if (!noAddress)
          await updateLocation(location.id, (l) => {
            l.address = { ...rest, line2: rest.line2?.trim() || undefined, district: rest.district?.trim() || undefined, region: rest.region?.trim() || undefined }
            l.directions = directions?.trim() || undefined
          })
        await saveLocationExtras(location.id, { noAddress, map })
      },
      t('settings.biz.location.locationSaved'),
      onClose,
    )
  }
  const summary = [address.line2 ? `${address.line2}, ${address.line1}` : address.line1, address.city, [address.postcode, address.district].filter(Boolean).join(', '), address.region, address.country].filter(Boolean)
  return (
    <FullModal open={open} onClose={onClose} onSave={save} saving={saving} title={t('settings.biz.location.editLocation')} width="max-w-[860px]" testId="edit-location-modal">
      <FormStack>
        <FormCard>
          <Checkbox checked={noAddress} onChange={setNoAddress} label={t('settings.biz.location.noAddressLabel')} />
        </FormCard>
        {!noAddress && (
          <>
            <FormCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-title-3 text-ink">{t('settings.biz.location.businessLocation')}</h2>
                  <div className="mt-1 text-body-lg text-ink">
                    {summary.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.biz.location.resetAddress'), onSelect: () => setAddress(saved) },
                        { label: t('settings.biz.location.clearAddress'), onSelect: () => setAddress({ line1: '', line2: '', district: '', city: '', region: '', postcode: '', country: address.country, directions: '' }) },
                      ],
                    },
                  ]}
                />
              </div>
              <AddressFields value={address} onChange={setAddress} errors={submitted ? errors : {}} />
            </FormCard>
            <FormCard title={t('settings.biz.location.mapTitle')} description={t('settings.biz.location.mapHint')}>
              <MapPlaceholder label={location.name} view={map} onChange={setMap} height={300} />
            </FormCard>
          </>
        )}
      </FormStack>
    </FullModal>
  )
}

// ─── Opening hours ─────────────────────────────────────────────────────────

function OpeningHoursTab({ location }: { location: Location }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <EditCard
        title={t('settings.biz.hours.title')}
        description={
          <>
            {t('settings.biz.hours.description1')}{' '}
            <Link to="/setup/scheduling/closed-periods" className="text-primary hover:underline">
              {t('settings.biz.hours.settingsLink')}
            </Link>
            .
          </>
        }
        onEdit={() => setOpen(true)}
        testId="opening-hours-card"
      >
        <dl className="flex flex-col divide-y divide-line">
          {WEEKDAYS.map((d) => {
            const day = location.openingHours[d]
            return (
              <div key={d} className="flex items-center justify-between py-2.5 text-body">
                <dt className="text-body-strong text-ink">{dayName(t, d)}</dt>
                <dd className={day.open ? 'text-ink' : 'text-muted'}>{day.open && day.ranges.length ? rangesLabel(day.ranges) : t('settings.biz.hours.closed')}</dd>
              </div>
            )
          })}
        </dl>
      </EditCard>
      <EditHoursModal location={location} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function EditHoursModal({ location, open, onClose }: { location: Location; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [hours, setHours] = useState<OpeningHours>(location.openingHours)
  const [submitted, setSubmitted] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  const [saving, run] = useAction()
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setHours(location.openingHours)
      setSubmitted(false)
    }
  }
  const errors = openingHoursErrors(hours, t)
  const save = () => {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    void run(
      () =>
        updateLocation(location.id, (l) => {
          l.openingHours = hours
        }),
      t('settings.biz.hours.saved'),
      onClose,
    )
  }
  return (
    <FullModal
      open={open}
      onClose={onClose}
      onSave={save}
      saving={saving}
      title={t('settings.biz.hours.editTitle')}
      subtitle={
        <>
          {t('settings.biz.hours.editSubtitle')} <LearnMore topic={t('settings.biz.hours.title')}>{t('common.learnMore')}</LearnMore>

        </>
      }
      width="max-w-[860px]"
      testId="edit-hours-modal"
    >
      <FormCard>
        <OpeningHoursEditor value={hours} onChange={setHours} errors={submitted ? errors : {}} />
      </FormCard>
    </FullModal>
  )
}
