import { CheckCircle2, Facebook, Instagram } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Chip, confirm, IntroPage, Menu, Modal, Page, PageHeader, PageSkeleton, RadioGroup, Select, Switch, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { connectFacebook, disconnectFacebook, facebookSignIn, useOnlineState } from '@/api/online'
import { fmtDateTime } from '@/lib/format'
import type { Location } from '@/types'
import { addressLine, PhoneArt, ProfileGateModal, sampleImage } from './shared'

const wizardUrl = (l: Location) => `/online-presence/profile/edit/${l.id}/${l.marketplace.step ?? 'overview'}`

/** Marketplace profile: both locations with their listing status (online-booking.md §1). */
export function MarketplaceProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const locations = useDb((s) => s.locations)
  if (loading) return <Page><PageSkeleton /></Page>
  const anyListed = locations.some((l) => l.marketplace.listed)
  const firstUnlisted = locations.find((l) => !l.marketplace.listed)
  return (
    <Page>
      {!anyListed && firstUnlisted ? (
        <IntroPage
          badge={t('online.common.included')}
          title={t('online.profile.intro.title')}
          body={t('online.profile.intro.subtitle')}
          bullets={[t('online.profile.intro.b1'), t('online.profile.intro.b2'), t('online.profile.intro.b3')]}
          primary={{ label: t('online.common.startNow'), onClick: () => navigate(wizardUrl(firstUnlisted)) }}
          art={<PhoneArt name={firstUnlisted.name} lines={[t('online.profile.art.instant'), t('online.profile.art.pay'), t('online.profile.art.access')]} />}
        />
      ) : (
        <PageHeader title={t('online.profile.title')} subtitle={t('online.profile.subtitle')} />
      )}
      <ul className="mt-2 flex flex-col gap-4">
        {locations.map((l) => {
          const listed = l.marketplace.listed
          const started = !!l.marketplace.step
          const open = () => navigate(listed ? `/online-presence/profile/dashboard/${l.id}` : wizardUrl(l))
          return (
            <li key={l.id} className="card flex flex-wrap items-center gap-5 p-4">
              <button type="button" onClick={open} className="shrink-0" aria-label={l.name}>
                <img src={l.marketplace.images[0] ?? l.imageUrl ?? sampleImage(l.id.length)} alt="" className="h-20 w-32 rounded-md object-cover" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-title-3 text-ink">
                  {l.name}
                  <Chip tone={listed ? 'success' : 'neutral'}>{listed ? t('online.status.listed') : t('online.status.unlisted')}</Chip>
                </p>
                <p className="mt-1 truncate text-body text-muted">{addressLine(l)}</p>
                <p className="mt-1 text-small text-muted">{t('online.profile.imagesCount', { count: l.marketplace.images.length })}</p>
              </div>
              <div className="flex items-center gap-2">
                {listed ? (
                  <Button variant="primary" onClick={open}>
                    {t('online.profile.manage')}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={open}>
                    {started ? t('online.profile.continueSetup') : t('online.common.startNow')}
                  </Button>
                )}
                <Menu
                  groups={[
                    {
                      items: [
                        { label: t('online.profile.viewDashboard'), onSelect: () => navigate(`/online-presence/profile/dashboard/${l.id}`) },
                        { label: t('online.profile.editProfile'), onSelect: () => navigate(`/online-presence/profile/edit/${l.id}/essentials?from=dashboard`) },
                        { label: t('online.dashboard.locationSettings'), onSelect: () => navigate(`/setup/location/${l.id}/business-details`) },
                      ],
                    },
                  ]}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Page>
  )
}

/** Facebook and Instagram bookings (online-booking.md §3), with a simulated connection. */
export function FacebookSetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const locations = useDb((s) => s.locations)
  const { facebook } = useOnlineState()
  const [gate, setGate] = useState(false)
  const [flow, setFlow] = useState<null | 'signin' | 'pick'>(null)
  const [pages, setPages] = useState<string[]>([])
  const [page, setPage] = useState('')
  const listedLocs = locations.filter((l) => l.marketplace.listed)
  const [locationId, setLocationId] = useState(listedLocs[0]?.id ?? '')
  const [instagram, setInstagram] = useState(true)
  const [busy, setBusy] = useState(false)
  if (loading) return <Page><PageSkeleton /></Page>

  const start = async () => {
    if (!listedLocs.length) return setGate(true)
    setFlow('signin')
    const list = await facebookSignIn()
    setPages(list)
    setPage(list[0])
    setLocationId(listedLocs[0].id)
    setFlow('pick')
  }
  const connect = async () => {
    setBusy(true)
    try {
      await connectFacebook({ pageName: page, instagram: instagram ? `@${page.toLowerCase().replace(/[^a-z0-9]+/g, '')}` : null, locationId })
      toast(t('online.facebook.connectedToast'))
      setFlow(null)
    } finally {
      setBusy(false)
    }
  }
  const disconnect = async () => {
    if (!(await confirm({ title: t('online.facebook.disconnectTitle'), body: t('online.facebook.disconnectBody'), confirmLabel: t('online.facebook.disconnect'), tone: 'danger' }))) return
    await disconnectFacebook()
    toast(t('online.facebook.disconnectedToast'))
  }

  if (facebook) {
    const loc = locations.find((l) => l.id === facebook.locationId)
    return (
      <Page>
        <PageHeader
          title={t('online.facebook.title')}
          subtitle={t('online.facebook.connectedSubtitle')}
          actions={
            <Button variant="danger" onClick={disconnect}>
              {t('online.facebook.disconnect')}
            </Button>
          }
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Card title={t('online.facebook.facebookPage')}>
            <p className="flex items-center gap-3 text-body-lg text-ink">
              <Facebook size={22} className="text-info" aria-hidden />
              {facebook.pageName}
              <Chip tone="success">{t('online.common.active')}</Chip>
            </p>
            <p className="mt-3 text-body text-muted">{t('online.facebook.bookButton')}</p>
          </Card>
          <Card title={t('online.facebook.instagramAccount')}>
            {facebook.instagram ? (
              <p className="flex items-center gap-3 text-body-lg text-ink">
                <Instagram size={22} className="text-danger" aria-hidden />
                {facebook.instagram}
                <Chip tone="success">{t('online.common.active')}</Chip>
              </p>
            ) : (
              <p className="text-body text-muted">{t('online.facebook.noInstagram')}</p>
            )}
          </Card>
          <Card title={t('online.facebook.details')} className="md:col-span-2">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-small text-muted">{t('online.facebook.location')}</dt>
                <dd className="text-body text-ink">{loc?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-small text-muted">{t('online.facebook.connectedAt')}</dt>
                <dd className="text-body text-ink">{fmtDateTime(facebook.connectedAt)}</dd>
              </div>
            </dl>
            <Button className="mt-5" onClick={() => navigate('/online-presence/buttons-and-links')}>
              {t('online.facebook.shareLink')}
            </Button>
          </Card>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <IntroPage
        badge={t('online.common.included')}
        title={t('online.facebook.introTitle')}
        body={t('online.facebook.introBody')}
        bullets={[t('online.facebook.b1'), t('online.facebook.b2'), t('online.facebook.b3')]}
        primary={{ label: t('online.facebook.setUpNow'), onClick: () => void start(), loading: flow === 'signin' }}
        art={<PhoneArt name={locations[0]?.name ?? ''} lines={[t('online.facebook.art1'), t('online.facebook.art2')]} />}
      />
      <ProfileGateModal open={gate} onClose={() => setGate(false)} title={t('online.facebook.gateTitle')} locations={locations} />
      <Modal
        open={flow === 'pick'}
        onClose={() => setFlow(null)}
        title={t('online.facebook.pickTitle')}
        subtitle={t('online.facebook.pickSubtitle')}
        footer={
          <>
            <Button onClick={() => setFlow(null)}>{t('online.common.cancel')}</Button>
            <Button variant="primary" onClick={connect} loading={busy} disabled={!page}>
              {t('online.facebook.connect')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <p className="flex items-center gap-2 rounded-md bg-success-subtle px-3 py-2 text-small text-success">
            <CheckCircle2 size={16} aria-hidden />
            {t('online.facebook.signedIn')}
          </p>
          <div>
            <p className="label mb-2">{t('online.facebook.facebookPage')}</p>
            <RadioGroup value={page} onChange={setPage} options={pages.map((p) => ({ value: p, label: p }))} />
          </div>
          <div>
            <p className="label mb-2">{t('online.facebook.location')}</p>
            <Select aria-label={t('online.facebook.location')} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={listedLocs.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
          <Switch checked={instagram} onChange={setInstagram} label={t('online.facebook.alsoInstagram')} hint={t('online.facebook.alsoInstagramHint')} />
        </div>
      </Modal>
    </Page>
  )
}
