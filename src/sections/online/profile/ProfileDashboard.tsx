import clsx from 'clsx'
import { ArrowLeft, ArrowUpRight, Clock, Coins, IdCard, Image as ImageIcon, Info, LayoutGrid, MapPin, Smile, Sparkles, Store, TrendingUp, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Chip, confirm, DataTable, EmptyState, LearnMore, Menu, Modal, Page, PageSkeleton, toast, usePageLoading, type Column } from '@/components/ui'
import { useDb } from '@/store/db'
import { addOnStatus, ensureProfileActivity, saveProfile, setProfileListed, useFacebookConnection, useProfileActivity } from '@/api/online'
import { fmtDateTimeUS, money, num } from '@/lib/format'
import { now, weekdayOf } from '@/lib/time'
import type { ActivityEntry, Location } from '@/types'
import { addressLine, featureLabel, opensAt, sampleImage, WEEKDAYS } from '../shared'
import { InModal, MapArt, patchFor, StepBody, toDraft, validateStep, type Draft, type ProfileStep } from './ProfileWizard'
import { ProfilePreviewModal } from './ProfilePreview'

const TABS = ['overview', 'essentials', 'location', 'working-hours', 'images', 'features'] as const
type Tab = (typeof TABS)[number]
const TAB_ICONS: Record<Tab, ReactNode> = {
  overview: <LayoutGrid size={18} aria-hidden />,
  essentials: <IdCard size={18} aria-hidden />,
  location: <MapPin size={18} aria-hidden />,
  'working-hours': <Clock size={18} aria-hidden />,
  images: <Store size={18} aria-hidden />,
  features: <Smile size={18} aria-hidden />,
}
/** Marketplace fee charged on a new client's first booking (used for the ROI figure). */
const NEW_CLIENT_FEE = 0.2

/** Marketplace profile dashboard (online-booking.md §1.2). */
export function ProfileDashboardPage() {
  const { locationId = '', tab: rawTab = 'overview' } = useParams()
  const loading = usePageLoading()
  const locations = useDb((s) => s.locations)
  const location = locations.find((l) => l.id === locationId)
  if (!location) return <Navigate to="/online-presence/locations" replace />
  if (loading) return <Page><PageSkeleton /></Page>
  const tab = (TABS as readonly string[]).includes(rawTab) ? (rawTab as Tab) : 'overview'
  return <Dashboard location={location} tab={tab} />
}

function Dashboard({ location, tab }: { location: Location; tab: Tab }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reviews = useDb((s) => s.reviews)
  const appointments = useDb((s) => s.appointments)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<ProfileStep | null>(null)
  const listed = location.marketplace.listed
  /** Card "Edit" buttons open the matching wizard step as a modal. */
  const edit = (step: ProfileStep) => setEditing(step)

  const rating = useMemo(() => {
    const apptLoc = new Map(appointments.map((a) => [a.id, a.locationId]))
    const mine = reviews.filter((r) => r.platform === 'marketplace' && (!r.appointmentId || apptLoc.get(r.appointmentId) === location.id))
    return mine.length ? { avg: mine.reduce((n, r) => n + r.rating, 0) / mine.length, count: mine.length } : null
  }, [reviews, appointments, location.id])
  const opens = opensAt(location.openingHours, weekdayOf(now()))

  const toggleListed = async () => {
    if (listed) {
      const ok = await confirm({ title: t('online.dashboard.unlistTitle'), body: t('online.dashboard.unlistBody'), confirmLabel: t('online.dashboard.unlist'), tone: 'danger' })
      if (!ok) return
    }
    setBusy(true)
    try {
      await setProfileListed(location.id, !listed)
      toast(listed ? t('online.dashboard.unlistedToast') : t('online.wizard.enabledToast'))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const go = (to: Tab) => navigate(`/online-presence/profile/dashboard/${location.id}${to === 'overview' ? '' : `/${to}`}`)

  return (
    <Page wide>
      <div className="mb-6 flex items-center gap-4">
        <Button icon={<ArrowLeft size={16} aria-hidden />} onClick={() => navigate('/online-presence/locations')}>
          {t('online.common.back')}
        </Button>
        <nav aria-label={t('online.dashboard.breadcrumb')} className="flex items-center gap-2 text-body text-ink">
          <button type="button" className="hover:underline" onClick={() => navigate('/online-presence/locations')}>
            {t('online.dashboard.onlineProfile')}
          </button>
          <span aria-hidden className="text-muted">·</span>
          <span>{location.name}</span>
        </nav>
      </div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-title-1 text-ink">
            {location.name}
            <Chip tone={listed ? 'success' : 'neutral'}>{listed ? t('online.status.listed') : t('online.status.unlisted')}</Chip>
          </h1>
          <p className="mt-1 text-body-lg text-muted">
            {rating ? t('online.preview.rating', { avg: num(rating.avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: rating.count }) : t('online.dashboard.noReviews')} • {opens ? t('online.dashboard.opensAt', { time: opens }) : t('online.dashboard.closedToday')} • {[location.address.city, location.address.country].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPreview(true)}>{t('online.dashboard.profile')}</Button>
          <Button onClick={() => navigate(`/online-presence/profile/edit/${location.id}/essentials?from=dashboard`)}>{t('online.dashboard.edit')}</Button>
          <Menu
            label={t('online.common.options')}
            groups={[{ items: [{ label: listed ? t('online.dashboard.unlist') : t('online.dashboard.list'), onSelect: toggleListed, disabled: busy, danger: listed }] }]}
          />
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <nav className="card h-fit p-3" aria-label={t('online.dashboard.menu')}>
          <MenuItem active={tab === 'overview'} icon={TAB_ICONS.overview} onClick={() => go('overview')}>
            {t('online.dashboard.tabs.overview')}
          </MenuItem>
          <div className="my-2 border-t border-line" />
          {TABS.slice(1).map((k) => (
            <MenuItem key={k} active={tab === k} icon={TAB_ICONS[k]} onClick={() => go(k)}>
              {t(`online.dashboard.tabs.${k}`)}
            </MenuItem>
          ))}
          <div className="my-2 border-t border-line" />
          <MenuItem icon={<ArrowUpRight size={18} aria-hidden />} onClick={() => navigate(`/setup/location/${location.id}/business-details`)} muted>
            {t('online.dashboard.locationSettings')}
          </MenuItem>
          <MenuItem icon={<ArrowUpRight size={18} aria-hidden />} onClick={() => navigate('/online-presence/locations')} muted>
            {t('online.dashboard.bookingSettings')}
          </MenuItem>
        </nav>
        <div className="min-w-0">
          {tab === 'overview' && <Overview location={location} />}
          {tab === 'essentials' && (
            <div className="flex flex-col gap-6">
              <Card title={t('online.dashboard.essentials.title')} action={<Button onClick={() => edit('essentials')}>{t('online.dashboard.edit')}</Button>}>
                <dl className="grid gap-4">
                  <Row label={t('online.dashboard.essentials.displayName')} value={location.name} />
                  <Row label={t('online.dashboard.essentials.phone')} value={location.phone || '—'} />
                  <Row label={t('online.dashboard.essentials.email')} value={location.email || '—'} />
                </dl>
              </Card>
              <Card title={t('online.dashboard.essentials.about')} action={<Button onClick={() => edit('about')}>{t('online.dashboard.edit')}</Button>}>
                <Row label={t('online.wizard.about.label')} value={location.marketplace.description || '—'} />
              </Card>
            </div>
          )}
          {tab === 'location' && (
            <Card title={t('online.dashboard.tabs.location')} action={<Button onClick={() => edit('location')}>{t('online.dashboard.edit')}</Button>}>
              <Row label={t('online.dashboard.address')} value={addressLine(location)} />
              {location.directions && <Row label={t('online.wizard.location.gettingThere')} value={location.directions} />}
              <MapArt label={location.address.line1} />
            </Card>
          )}
          {tab === 'working-hours' && (
            <Card title={t('online.dashboard.hours.title')} action={<Button onClick={() => edit('working-hours')}>{t('online.dashboard.edit')}</Button>}>
              <ul className="divide-y divide-line">
                {WEEKDAYS.map((d) => {
                  const day = location.openingHours[d]
                  return (
                    <li key={d} className="flex justify-between py-3 text-body">
                      <span className="text-ink">{t(`online.days.${d}`)}</span>
                      <span className="text-muted">{day.open && day.ranges.length ? day.ranges.map((r) => t('online.dashboard.hours.range', { start: r.start, end: r.end })).join(', ') : t('online.wizard.hours.closed')}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-4 text-small text-muted">
                {t('online.dashboard.hours.note')}{' '}
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/setup/business-setup/location-details')}>
                  {t('online.dashboard.hours.settings')}
                </button>
              </p>
            </Card>
          )}
          {tab === 'images' && <ImagesCard location={location} onEdit={() => edit('images')} />}
          {tab === 'features' && <FeaturesCard location={location} onEdit={() => edit('features')} />}
        </div>
      </div>
      <ProfilePreviewModal open={preview} onClose={() => setPreview(false)} location={location} />
      {editing && <EditStepModal key={editing} location={location} step={editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}

const STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  essentials: 'online.wizard.essentials.title',
  about: 'online.wizard.about.title',
  location: 'online.wizard.location.title',
  'working-hours': 'online.wizard.hours.title',
  images: 'online.wizard.images.title',
  features: 'online.wizard.features.title',
}

/** One wizard step as a modal (Cancel / Save), opened from a dashboard card. */
function EditStepModal({ location, step, onClose }: { location: Location; step: ProfileStep; onClose: () => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>(() => toDraft(location))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }
  const save = async () => {
    const problem = validateStep(step, draft, t)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const { patch, title } = patchFor(step, draft)
      await saveProfile(location.id, patch, title)
      toast(t('online.wizard.savedToast'))
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size={step === 'images' || step === 'features' || step === 'location' ? 'lg' : 'md'}
      title={t(STEP_TITLES[step] ?? 'online.dashboard.edit')}
      footer={
        <>
          <Button onClick={onClose}>{t('online.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('online.common.save')}
          </Button>
        </>
      }
    >
      <InModal.Provider value>
        <StepBody step={step} draft={draft} set={set} error={error} location={location} />
      </InModal.Provider>
    </Modal>
  )
}

function MenuItem({ active, icon, onClick, children, muted }: { active?: boolean; icon: ReactNode; onClick: () => void; children: ReactNode; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx('flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-body', active ? 'bg-primary-subtle font-semibold text-primary' : muted ? 'text-muted hover:bg-sunken' : 'text-ink hover:bg-sunken')}
    >
      {icon}
      {children}
    </button>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-body text-ink">{value}</dd>
    </div>
  )
}

function Overview({ location }: { location: Location }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const appointments = useDb((s) => s.appointments)
  const addOns = useDb((s) => s.addOns)
  const profileActivity = useProfileActivity()
  const facebook = useFacebookConnection()
  const [all, setAll] = useState(false)

  const perf = useMemo(() => {
    const firstByClient = new Map<string, (typeof appointments)[number]>()
    for (const a of [...appointments].sort((x, y) => x.date.localeCompare(y.date))) {
      if (a.clientId && !firstByClient.has(a.clientId)) firstByClient.set(a.clientId, a)
    }
    const ok = (a: (typeof appointments)[number]) => a.channel === 'marketplace' && a.locationId === location.id && a.status !== 'cancelled' && a.status !== 'no_show'
    const value = (a: (typeof appointments)[number]) => a.items.reduce((n, i) => n + i.price, 0)
    const online = appointments.filter(ok)
    const newClients = [...firstByClient.values()].filter(ok)
    const total = online.reduce((n, a) => n + value(a), 0)
    const fees = newClients.reduce((n, a) => n + value(a), 0) * NEW_CLIENT_FEE
    return { newClients: newClients.length, total, roi: fees > 0 ? ((total - fees) / fees) * 100 : 0 }
  }, [appointments, location.id])

  useEffect(() => ensureProfileActivity(location.id), [location.id])
  const activity = profileActivity[location.id] ?? []
  const columns: Column<ActivityEntry>[] = [
    { key: 'date', header: t('online.dashboard.activity.date'), cell: (r) => fmtDateTimeUS(r.at) },
    { key: 'by', header: t('online.dashboard.activity.member'), cell: (r) => r.by },
    { key: 'action', header: t('online.dashboard.activity.action'), cell: (r) => (r.title.startsWith('online.activity.') ? t(r.title) : r.title) },
  ]
  const integrations = [
    { key: 'grb', name: t('online.dashboard.addons.grb'), icon: <Sparkles size={20} aria-hidden />, active: addOnStatus(addOns, 'google-rating-boost') === 'active', to: '/add-ons' },
    { key: 'reserve', name: t('online.dashboard.addons.reserve'), icon: <TrendingUp size={20} aria-hidden />, active: addOnStatus(addOns, 'google-reserve') === 'active', to: '/add-ons#integrations' },
    { key: 'fb', name: t('online.dashboard.addons.fb'), icon: <ImageIcon size={20} aria-hidden />, active: !!facebook, to: '/online-presence/facebook-setup' },
  ]
  return (
    <div className="flex flex-col gap-6">
      <Card title={t('online.dashboard.perf.title')} subtitle={t('online.dashboard.perf.subtitle', { name: location.name })} action={<Button onClick={() => navigate('/reports/report-group/1?category=all')}>{t('online.dashboard.perf.report')}</Button>}>
        <div className="flex flex-col gap-3">
          <PerfRow icon={<UserPlus size={18} aria-hidden />} label={t('online.dashboard.perf.newClients')} hint={t('online.dashboard.perf.newClientsHint')} value={String(perf.newClients)} />
          <PerfRow icon={<Coins size={18} aria-hidden />} label={t('online.dashboard.perf.value')} hint={t('online.dashboard.perf.valueHint')} value={money(perf.total)} />
          <PerfRow icon={<TrendingUp size={18} aria-hidden />} label={t('online.dashboard.perf.roi')} hint={t('online.dashboard.perf.roiHint')} value={`${num(perf.roi, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
        </div>
      </Card>
      <Card
        title={t('online.dashboard.activity.title')}
        action={
          activity.length > 0 && (
            <Button variant="link" onClick={() => setAll(true)}>
              {t('online.dashboard.activity.viewAll')}
            </Button>
          )
        }
      >
        {activity.length ? (
          <DataTable columns={columns} rows={activity.slice(0, 5)} rowKey={(r) => r.id} footer={false} />
        ) : (
          <EmptyState title={t('online.dashboard.activity.empty')} body={t('online.dashboard.activity.emptyBody')} />
        )}
      </Card>
      <Card title={t('online.dashboard.addons.title')} subtitle={t('online.dashboard.addons.subtitle')}>
        <ul className="divide-y divide-line">
          {integrations.map((i) => (
            <li key={i.key} className="flex items-center gap-4 py-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-ink">{i.icon}</span>
              <span className="flex-1 text-body-strong text-ink">{i.name}</span>
              {i.active ? <Chip tone="success">{t('online.common.active')}</Chip> : <Button onClick={() => navigate(i.to)}>{t('online.dashboard.addons.setUp')}</Button>}
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={all} onClose={() => setAll(false)} size="lg" title={t('online.dashboard.activity.allTitle')}>
        <DataTable columns={columns} rows={activity} rowKey={(r) => r.id} />
      </Modal>
    </div>
  )
}

function PerfRow({ icon, label, hint, value }: { icon: ReactNode; label: string; hint: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-primary-subtle px-5 py-4">
      <span className="flex items-center gap-3 text-body-lg text-ink">
        {icon}
        {label}
        <span className="text-subtle" title={hint} aria-label={hint} role="img">
          <Info size={15} aria-hidden />
        </span>
      </span>
      <span className="font-display text-title-2 text-ink">{value}</span>
    </div>
  )
}

function ImagesCard({ location, onEdit }: { location: Location; onEdit: () => void }) {
  const { t } = useTranslation()
  const [full, setFull] = useState<number | null>(null)
  const images = location.marketplace.images
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {t('online.dashboard.tabs.images')} <span className="chip bg-sunken text-muted">{images.length}</span>
        </span>
      }
      action={<Button onClick={onEdit}>{t('online.dashboard.edit')}</Button>}
    >
      <p className="mb-4 text-body text-muted">
        {t('online.dashboard.images.body')} <LearnMore topic={t('online.dashboard.tabs.images')}>{t('common.learnMore')}</LearnMore>
      </p>
      {images.length ? (
        <ul className="grid grid-cols-2 gap-4">
          {images.map((src, i) => (
            <li key={i} className={clsx('relative overflow-hidden rounded-lg', i === 0 && 'col-span-2')}>
              <button type="button" className="block w-full" onClick={() => setFull(i)} aria-label={t('online.dashboard.images.viewFull', { n: i + 1 })}>
                <img src={src} alt="" className="aspect-[16/9] w-full object-cover" />
              </button>
              {i === 0 && <span className="chip absolute left-2 top-2 bg-surface text-caption text-ink shadow-sm">{t('online.wizard.images.cover')}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<img src={sampleImage(3)} alt="" className="h-16 w-24 rounded-md object-cover" />}
          title={t('online.dashboard.images.empty')}
          body={t('online.wizard.errors.images')}
          action={
            <Button variant="primary" onClick={onEdit}>
              {t('online.dashboard.images.add')}
            </Button>
          }
        />
      )}
      <Modal open={full !== null} onClose={() => setFull(null)} size="xl" title={full !== null ? t('online.dashboard.images.viewFull', { n: full + 1 }) : ''}>
        {full !== null && images[full] && <img src={images[full]} alt="" className="max-h-[70vh] w-full rounded-md object-contain" />}
      </Modal>
    </Card>
  )
}

function FeaturesCard({ location, onEdit }: { location: Location; onEdit: () => void }) {
  const { t } = useTranslation()
  const m = location.marketplace
  const groups = [
    ['amenities', m.amenities],
    ['highlights', m.highlights],
    ['values', m.values],
  ] as const
  if (!m.amenities.length && !m.highlights.length && !m.values.length) {
    return (
      <Card>
        <EmptyState
          icon={<Smile size={32} aria-hidden />}
          title={t('online.dashboard.features.emptyTitle')}
          body={t('online.dashboard.features.emptyBody')}
          action={
            <Button variant="primary" onClick={onEdit}>
              {t('online.dashboard.features.setUp')}
            </Button>
          }
        />
      </Card>
    )
  }
  return (
    <Card title={t('online.dashboard.tabs.features')} action={<Button onClick={onEdit}>{t('online.dashboard.edit')}</Button>}>
      {groups.map(([key, list]) => (
        <section key={key} className="mb-5 last:mb-0">
          <h3 className="mb-2 text-body-strong text-ink">{t(`online.wizard.features.${key}`)}</h3>
          {list.length ? (
            <div className="flex flex-wrap gap-2">
              {list.map((x) => (
                <Chip key={x} tone="outline">
                  {featureLabel(t, x)}
                </Chip>

              ))}
            </div>
          ) : (
            <p className="text-body text-muted">{t('online.dashboard.features.none')}</p>
          )}
        </section>
      ))}
    </Card>
  )
}
