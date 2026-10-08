import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Globe, Home, Link2, Loader2, Monitor, Play, Plus, ShoppingCart, Smartphone, Sparkles, X, XCircle } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Chip, confirm, Field, IconButton, IntroPage, LearnMore, Menu, Modal, Page, PageHeader, PageSkeleton, Segmented, Select, Switch, TextArea, TextInput, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { activateSmartWebsite, addOnStatus, cancelSmartWebsite, checkDomain, defaultWebsite, saveWebsite, SITE_SUFFIX, SMART_WEBSITE_PRICE, IVA, smartWebsiteProRata, useWebsite, type SitePage, type WebsiteConfig } from '@/api/online'
import { fmtDateTime, money2 } from '@/lib/format'
import { uid } from '@/lib/ids'
import { BillingDetailsFields, CardFields, initialBilling, validateBilling, type BillingErrors, type BillingValues } from '@/sections/marketing/components/kit'
import { CheckList, copyText } from '../shared'
import { BrowserFrame, FONT_PACKS, PALETTES, SitePreview, TEMPLATES } from './SitePreview'

const STEPS = ['overview', 'design', 'styling', 'builder', 'domain-type', 'domain', 'enable'] as const
type Step = (typeof STEPS)[number]
const TLDS = ['.com', '.pt', '.salon', '.beauty']

/** Smart Website (online-booking.md §5): intro, or the live-site dashboard once active. */
export function SmartWebsitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  const website = useWebsite()
  const [visit, setVisit] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  if (loading) return <Page><PageSkeleton /></Page>
  const active = addOnStatus(addOns, 'smart-website') === 'active' && !!website?.publishedAt

  if (!active || !website) {
    return (
      <Page>
        {website && (
          <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-lg bg-info-subtle p-4 md:flex-row md:items-center md:gap-4 md:px-5">
            <p className="text-body text-ink">{t('online.website.draftNote')}</p>
            <Button variant="primary" onClick={() => navigate('/online-presence/smart-website/builder')}>
              {t('online.website.continueEditing')}
            </Button>
          </div>
        )}
        <IntroPage
          badge={t('online.website.badge')}
          title={t('online.website.introTitle')}
          body={t('online.website.introBody')}
          bullets={[t('online.website.b1'), t('online.website.b2'), t('online.website.b3')]}
          price={<span className="font-semibold">{t('online.website.price', { price: money2(SMART_WEBSITE_PRICE) })}</span>}
          primary={{ label: t('online.common.continue'), onClick: () => navigate('/online-presence/smart-website/overview') }}
          art={
            <BrowserFrame url={website?.domain ?? `${t('online.website.demo.domain')}${SITE_SUFFIX}`}>
              <div className="pointer-events-none h-[300px] overflow-hidden">
                <SitePreview config={website ?? demoConfig(t)} compact />
              </div>
            </BrowserFrame>
          }
        />
      </Page>
    )
  }

  const cancel = async () => {
    if (!(await confirm({ title: t('online.website.cancelTitle'), body: t('online.website.cancelBody'), confirmLabel: t('online.website.cancel'), tone: 'danger' }))) return
    await cancelSmartWebsite()
    toast(t('online.website.cancelledToast'))
  }
  const url = `https://${website.domain}`
  return (
    <Page wide>
      <PageHeader
        title={t('online.website.title')}
        subtitle={t('online.website.activeSubtitle')}
        actions={
          <>
            <Menu
              label={t('online.common.options')}
              trigger={({ toggle, open }) => (
                <Button onClick={toggle} aria-expanded={open}>
                  {t('online.common.options')}
                </Button>
              )}
              groups={[
                {
                  items: [
                    { label: t('online.website.changeTemplate'), onSelect: () => navigate('/online-presence/smart-website/design') },
                    { label: t('online.website.changeStyling'), onSelect: () => navigate('/online-presence/smart-website/styling') },
                    { label: t('online.website.changeDomain'), onSelect: () => navigate('/online-presence/smart-website/domain-type') },
                    { label: t('online.common.copyLink'), onSelect: () => copyText(url, t('online.common.linkCopied')) },
                  ],
                },
                { items: [{ label: t('online.website.cancel'), danger: true, onSelect: () => void cancel() }] },
              ]}
            />
            <Button onClick={() => setVisit(true)}>{t('online.website.visit')}</Button>
            <Button variant="primary" onClick={() => navigate('/online-presence/smart-website/builder')}>
              {t('online.website.edit')}
            </Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title={t('online.website.siteDetails')} className="h-fit">
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-small text-muted">{t('online.website.status')}</dt>
              <dd className="mt-1">
                <Chip tone="success">{t('online.website.live')}</Chip>
              </dd>
            </div>
            <div>
              <dt className="text-small text-muted">{t('online.website.domainLabel')}</dt>
              <dd className="mt-1 flex items-center gap-2 text-body text-ink">
                <Globe size={16} aria-hidden />
                <button type="button" className="truncate text-primary hover:underline" onClick={() => setVisit(true)}>
                  {website.domain}
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-small text-muted">{t('online.website.template')}</dt>
              <dd className="mt-1 text-body text-ink">{t(`online.website.templates.${website.template}.name`)}</dd>
            </div>
            <div>
              <dt className="text-small text-muted">{t('online.website.published')}</dt>
              <dd className="mt-1 text-body text-ink">{fmtDateTime(website.publishedAt!)}</dd>
            </div>
            <div>
              <dt className="text-small text-muted">{t('online.website.plan')}</dt>
              <dd className="mt-1 text-body text-ink">{t('online.website.planValue', { price: money2(SMART_WEBSITE_PRICE) })}</dd>
            </div>
          </dl>
        </Card>
        <BrowserFrame url={url}>
          <SitePreview config={website} />
        </BrowserFrame>
      </div>
      <Modal
        open={visit}
        onClose={() => setVisit(false)}
        size="xl"
        title={<DomainTitle domain={website.domain} />}
        footer={<Segmented value={device} onChange={setDevice} items={[{ value: 'desktop', label: t('online.website.desktop') }, { value: 'mobile', label: t('online.website.mobile') }]} />}
      >
        <BrowserFrame url={url} mobile={device === 'mobile'}>
          <SitePreview config={website} mobile={device === 'mobile'} />
        </BrowserFrame>
      </Modal>
    </Page>
  )
}

/** A domain as a modal title: on phones a size smaller, and allowed to wrap after its dots. */
function DomainTitle({ domain }: { domain: string }) {
  const parts = domain.split('.')
  return (
    <span className="max-md:text-title-3">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && '.'}
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </span>
  )
}

/** Sample site shown on the intro page before a website exists (built in the current language). */
const demoConfig = (t: TFunction): WebsiteConfig => ({
  template: 'elegant',
  palette: 2,
  fontPack: 0,
  hideNavigation: false,
  hero: { eyebrow: t('online.website.demo.eyebrow'), heading: t('online.website.demo.heading'), text: t('online.website.demo.text'), button: t('online.preview.bookNow') },
  pages: [],
  domainType: 'included',
  domain: `${t('online.website.demo.domain')}${SITE_SUFFIX}`,
})

/** Smart Website wizard (online-booking.md §5). */
export function SmartWebsiteWizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step: raw = 'overview' } = useParams()
  const step: Step = (STEPS as readonly string[]).includes(raw) ? (raw as Step) : 'overview'
  const workspace = useDb((s) => s.workspace)
  const services = useDb((s) => s.services)
  const addOns = useDb((s) => s.addOns)
  const website = useWebsite()
  const active = addOnStatus(addOns, 'smart-website') === 'active' && !!website?.publishedAt
  const [config, setConfig] = useState<WebsiteConfig>(() => website ?? defaultWebsite({ workspace, services }))
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [page, setPage] = useState('home')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [domainOk, setDomainOk] = useState<boolean | null>(null)
  const [billing, setBilling] = useState<BillingValues>(() => initialBilling(workspace.plan.billingDetails))
  const [billingErrors, setBillingErrors] = useState<BillingErrors>({})
  const index = STEPS.indexOf(step)
  const set = (p: Partial<WebsiteConfig>) => setConfig((c) => ({ ...c, ...p }))
  const patchBilling = (p: Partial<BillingValues>) => {
    setBilling((b) => ({ ...b, ...p }))
    setBillingErrors((e) => {
      const next = { ...e }
      Object.keys(p).forEach((k) => delete next[k as keyof BillingValues])
      return next
    })
  }

  // The editor saves as you go ("Saving" → "All changes saved").
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaving('saving')
    const timer = window.setTimeout(() => void saveWebsite(config, true).then(() => setSaving('saved')), 700)
    return () => window.clearTimeout(timer)
  }, [config])

  const go = async (s: Step) => {
    await saveWebsite(config, true)
    navigate(`/online-presence/smart-website/${s}`)
  }
  const close = async () => {
    await saveWebsite(config, true)
    toast(t('online.website.draftSaved'))
    navigate('/online-presence/smart-website')
  }
  const back = () => (index === 0 ? navigate('/online-presence/smart-website') : void go(STEPS[index - 1]))

  const onContinue = async () => {
    if (step === 'domain' && !domainOk) return toast(t('online.website.domainCheckFirst'))
    if (step !== 'enable') {
      setBusy(true)
      try {
        await go(STEPS[index + 1])
      } finally {
        setBusy(false)
      }
      return
    }
    if (active) {
      setBusy(true)
      try {
        await saveWebsite(config)
        toast(t('online.website.publishedToast'))
        navigate('/online-presence/smart-website')
      } finally {
        setBusy(false)
      }
      return
    }
    const errs = validateBilling(billing, t)
    setBillingErrors(errs)
    if (Object.keys(errs).length) return toast(t('online.website.billing.fix'), 'error')
    setBusy(true)
    try {
      await activateSmartWebsite(config, billing)
      toast(t('online.website.activatedToast'))
      navigate('/online-presence/smart-website')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const stage = step === 'overview' ? -1 : ['design', 'styling', 'builder'].includes(step) ? 0 : step === 'enable' ? 2 : 1
  const continueLabel = step === 'enable' ? (active ? t('online.website.publishChanges') : t('online.website.activate')) : t('online.common.continue')
  const editor = step === 'styling' || step === 'builder'
  return (
    <div className="flex h-full flex-col bg-canvas">
      {stage >= 0 && (
        <div className="grid grid-cols-3 gap-1.5 px-4 pt-3 md:px-6" role="progressbar" aria-valuenow={Math.round(((index + 1) / STEPS.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('online.wizard.progress', { pct: Math.round(((index + 1) / STEPS.length) * 100) })}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-1.5 overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-primary transition-all duration-base" style={{ width: i < stage ? '100%' : i === stage ? `${step === 'design' || step === 'domain-type' ? 34 : step === 'styling' ? 67 : 100}%` : '0%' }} />
            </div>
          ))}
        </div>
      )}
      <header className={clsx('flex h-16 shrink-0 items-center justify-between gap-3 px-4 md:px-6', editor && 'border-b border-line bg-surface')}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="icon-btn h-10 w-10 shrink-0 rounded-full border border-line-strong" aria-label={t('online.common.back')} onClick={back}>
            <ArrowLeft size={20} aria-hidden />
          </button>
          {editor && (
            <>
              {/* Phones: the device switch sits above the live preview instead (DeviceSwitch). */}
              <Segmented
                value={device}
                onChange={setDevice}
                className="max-md:hidden"
                items={[
                  { value: 'desktop', label: <Monitor size={16} aria-label={t('online.website.desktop')} /> },
                  { value: 'mobile', label: <Smartphone size={16} aria-label={t('online.website.mobile')} /> },
                ]}
              />
              <span className="flex items-center gap-1.5 text-small text-muted" aria-live="polite">
                {saving === 'saving' && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {saving === 'saved' && <CheckCircle2 size={14} className="text-success" aria-hidden />}
                <span className="max-md:sr-only">{saving === 'saving' ? t('online.website.builder.saving') : saving === 'saved' ? t('online.website.builder.saved') : ''}</span>
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editor && (
            <Button icon={<Play size={16} aria-hidden />} onClick={() => setPreviewOpen(true)} aria-label={t('online.wizard.preview')} className="max-md:w-10 max-md:px-0">
              <span className="max-md:hidden">{t('online.wizard.preview')}</span>
            </Button>
          )}
          <Button icon={<X size={16} className="md:hidden" aria-hidden />} onClick={close} aria-label={t('online.common.close')} className="max-md:w-10 max-md:px-0">
            <span className="max-md:hidden">{t('online.common.close')}</span>
          </Button>
          {step !== 'domain-type' && (
            <Button variant="primary" onClick={onContinue} loading={busy} disabled={step === 'domain' && !domainOk} iconRight={step === 'enable' ? <Check size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}>
              {continueLabel}
            </Button>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {step === 'styling' && <StylingStep config={config} set={set} device={device} setDevice={setDevice} />}
        {step === 'builder' && <BuilderStep config={config} set={set} device={device} setDevice={setDevice} page={page} setPage={setPage} />}
        {!editor && (
          <div className={clsx('mx-auto w-full px-4 pb-16 pt-5 md:px-6 md:pt-10', step === 'design' || step === 'enable' ? 'max-w-[1100px]' : 'max-w-[760px]')}>
            {step === 'overview' && (
              <>
                <h1 className="mb-6 font-display text-[26px] font-bold leading-[32px] text-ink md:mb-8 md:text-[32px] md:leading-[40px]">{t('online.website.overview.title')}</h1>
                <ol className="flex flex-col gap-6">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex gap-4 border-b border-line pb-6 last:border-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-display text-title-3 text-primary">{n}</span>
                      <div>
                        <p className="text-title-3 text-ink">{t(`online.website.overview.s${n}`)}</p>
                        <p className="mt-1 text-body text-muted">{t(`online.website.overview.s${n}b`)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {step === 'design' && <DesignStep config={config} set={set} />}
            {step === 'domain-type' && (
              <>
                <h1 className="font-display text-[26px] font-bold leading-[32px] text-ink md:text-[32px] md:leading-[40px]">{t('online.website.domainType.title')}</h1>
                <p className="mb-6 mt-2 text-body-lg text-muted md:mb-8">
                  {t('online.website.domainType.body')} <LearnMore topic={t('online.website.topics.domains')}>{t('common.learnMore')}</LearnMore>
                </p>
                <ul className="flex flex-col gap-3">
                  {DOMAIN_TYPES.map(({ value, icon }) => (
                    <li key={value}>
                      <button
                        type="button"
                        aria-pressed={config.domainType === value}
                        onClick={() => {
                          set({ domainType: value })
                          setDomainOk(null)
                          navigate('/online-presence/smart-website/domain')
                        }}
                        className={clsx('flex w-full items-center gap-4 rounded-lg border bg-surface p-5 text-left transition-colors hover:border-line-strong', config.domainType === value ? 'border-primary' : 'border-line')}
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">{icon}</span>
                        <span>
                          <span className="block text-body-strong text-ink">{t(`online.website.domainType.${value}`)}</span>
                          <span className="block text-body text-muted">{t(`online.website.domainType.${value}Hint`, { suffix: SITE_SUFFIX })}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {step === 'domain' && <DomainStep config={config} set={set} onStatus={setDomainOk} />}
            {step === 'enable' && <EnableStep active={active} config={config} billing={billing} setBilling={patchBilling} errors={billingErrors} />}
          </div>
        )}
      </main>
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size="xl"
        title={<DomainTitle domain={config.domain} />}
        footer={<Segmented value={device} onChange={setDevice} items={[{ value: 'desktop', label: t('online.website.desktop') }, { value: 'mobile', label: t('online.website.mobile') }]} />}
      >
        <BrowserFrame url={`https://${config.domain}`} mobile={device === 'mobile'}>
          <SitePreview config={config} mobile={device === 'mobile'} page={step === 'builder' ? page : 'home'} />
        </BrowserFrame>
      </Modal>
    </div>
  )
}

const DOMAIN_TYPES: { value: WebsiteConfig['domainType']; icon: ReactNode }[] = [
  { value: 'included', icon: <Globe size={22} aria-hidden /> },
  { value: 'custom', icon: <ShoppingCart size={22} aria-hidden /> },
  { value: 'existing', icon: <Link2 size={22} aria-hidden /> },
]

function DesignStep({ config, set }: { config: WebsiteConfig; set: (p: Partial<WebsiteConfig>) => void }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<string | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const pick = (id: string) => {
    const tmpl = TEMPLATES.find((x) => x.id === id)!
    set({ template: id, palette: tmpl.palette, fontPack: tmpl.fontPack })
  }
  const previewConfig = preview ? { ...config, template: preview, palette: TEMPLATES.find((x) => x.id === preview)!.palette, fontPack: TEMPLATES.find((x) => x.id === preview)!.fontPack } : null
  return (
    <>
      <h1 className="font-display text-[26px] font-bold leading-[32px] text-ink md:text-[32px] md:leading-[40px]">{t('online.website.design.title')}</h1>
      <p className="mb-6 mt-2 text-body-lg text-muted md:mb-8">{t('online.website.design.body')}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((tmpl) => {
          const selected = config.template === tmpl.id
          return (
            <div key={tmpl.id} className={clsx('card overflow-hidden', selected && 'ring-2 ring-primary')}>
              <button type="button" className="block w-full text-left" onClick={() => pick(tmpl.id)} aria-pressed={selected}>
                <div className="pointer-events-none h-44 overflow-hidden border-b border-line">
                  <div className="origin-top-left scale-[0.5]" style={{ width: '200%' }}>
                    <SitePreview config={{ ...config, template: tmpl.id, palette: tmpl.palette, fontPack: tmpl.fontPack }} />
                  </div>
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-2 text-body-strong text-ink">
                    {t(`online.website.templates.${tmpl.id}.name`)}
                    {selected && <Chip tone="primary">{t('online.website.design.selected')}</Chip>}
                  </p>
                  <p className="mt-1 text-small text-muted">{t(`online.website.templates.${tmpl.id}.description`)}</p>
                </div>
              </button>
              <div className="flex gap-2 px-4 pb-4">
                <Button size="sm" onClick={() => setPreview(tmpl.id)}>
                  {t('online.wizard.preview')}
                </Button>
                {!selected && (
                  <Button size="sm" variant="primary" onClick={() => pick(tmpl.id)}>
                    {t('online.website.design.use')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        size="xl"
        title={preview ? t(`online.website.templates.${preview}.name`) : ''}
        footer={
          <div className="flex w-full items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-3">
            <Segmented value={device} onChange={setDevice} className="max-md:self-center" items={[{ value: 'desktop', label: t('online.website.desktop') }, { value: 'mobile', label: t('online.website.mobile') }]} />
            <Button
              variant="primary"
              onClick={() => {
                if (preview) pick(preview)
                setPreview(null)
                toast(t('online.website.design.selectedToast'))
              }}
            >
              {t('online.website.design.use')}
            </Button>
          </div>
        }
      >
        {previewConfig && (
          <BrowserFrame url={config.domain} mobile={device === 'mobile'}>
            <SitePreview config={previewConfig} mobile={device === 'mobile'} />
          </BrowserFrame>
        )}
      </Modal>
    </>
  )
}

function StylingStep({ config, set, device, setDevice }: { config: WebsiteConfig; set: (p: Partial<WebsiteConfig>) => void; device: 'desktop' | 'mobile'; setDevice: (d: 'desktop' | 'mobile') => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-full lg:grid-cols-[360px_1fr]">
      <aside className="border-line bg-surface p-4 max-md:border-b md:border-r md:p-6">
        <h1 className="mb-5 font-display text-title-2 text-ink md:mb-6 md:text-title-1">{t('online.website.styling.title')}</h1>
        <h2 className="mb-3 text-title-3 text-ink">{t('online.website.styling.palettes')}</h2>
        <div className="grid grid-cols-4 gap-2">
          {PALETTES.map((p, i) => (
            <button key={i} type="button" onClick={() => set({ palette: i })} aria-pressed={config.palette === i} aria-label={t('online.website.styling.palette', { n: i + 1 })} className={clsx('overflow-hidden rounded-md border', config.palette === i ? 'border-primary ring-2 ring-primary' : 'border-line')}>
              <span className="flex h-10">
                {p.slice(0, 4).map((c, j) => (
                  <span key={j} className="flex-1" style={{ background: c }} />
                ))}
              </span>
            </button>
          ))}
        </div>
        <h2 className="mb-3 mt-8 text-title-3 text-ink">{t('online.website.styling.fonts')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {FONT_PACKS.map((f, i) => (
            <button key={i} type="button" onClick={() => set({ fontPack: i })} aria-pressed={config.fontPack === i} className={clsx('rounded-md border p-3 text-left', config.fontPack === i ? 'border-primary bg-primary-subtle' : 'border-line hover:bg-sunken')}>
              <span className="block text-[20px] text-ink" style={{ fontFamily: f.heading }}>
                {t('online.website.styling.heading')}
              </span>
              <span className="text-caption text-muted">{t(`online.website.fonts.${i}`)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="bg-sunken p-4 max-md:min-w-0 md:p-6">
        <DeviceSwitch device={device} setDevice={setDevice} />
        <BrowserFrame url={config.domain} mobile={device === 'mobile'}>
          <SitePreview config={config} mobile={device === 'mobile'} />
        </BrowserFrame>
      </div>
    </div>
  )
}

/** The page editor (online-booking.md §5 "sites/builder"): page list with options, page content, live preview. */
function BuilderStep({ config, set, device, setDevice, page, setPage }: { config: WebsiteConfig; set: (p: Partial<WebsiteConfig>) => void; device: 'desktop' | 'mobile'; setDevice: (d: 'desktop' | 'mobile') => void; page: string; setPage: (id: string) => void }) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState('')
  const selected = config.pages.find((p) => p.id === page) ?? config.pages[0]
  const setHero = (p: Partial<WebsiteConfig['hero']>) => set({ hero: { ...config.hero, ...p } })
  const setPageFields = (id: string, p: Partial<SitePage>) => set({ pages: config.pages.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const move = (id: string, dir: -1 | 1) => {
    const i = config.pages.findIndex((x) => x.id === id)
    const j = i + dir
    if (i < 1 || j < 1 || j >= config.pages.length) return
    const next = [...config.pages]
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ pages: next })
  }
  const addPage = () => {
    const name = newName.trim()
    if (!name) return setNameError(t('online.website.builder.nameRequired'))
    if (config.pages.some((p) => p.name.toLowerCase() === name.toLowerCase())) return setNameError(t('online.website.builder.nameTaken'))
    const id = uid('pg')
    set({ pages: [...config.pages, { id, name, heading: name, text: '', hidden: false, system: false }] })
    setPage(id)
    setAdding(false)
    setNewName('')
    toast(t('online.website.builder.addedToast', { name }))
  }
  const remove = async (p: SitePage) => {
    if (!(await confirm({ title: t('online.website.builder.deleteTitle'), body: t('online.website.builder.deleteBody', { name: p.name }), confirmLabel: t('online.website.builder.deletePage'), tone: 'danger' }))) return
    set({ pages: config.pages.filter((x) => x.id !== p.id) })
    if (page === p.id) setPage('home')
    toast(t('online.website.builder.deletedToast'))
  }
  return (
    <div className="grid min-h-full lg:grid-cols-[320px_1fr]">
      <aside className="flex flex-col border-line bg-surface max-md:min-w-0 max-md:border-b md:border-r">
        <div className="border-b border-line p-4 md:p-5">
          <h1 className="font-display text-title-2 text-ink">{t('online.website.builder.title')}</h1>
          <div className="mt-4">
            <Switch checked={config.hideNavigation} onChange={(v) => set({ hideNavigation: v })} label={t('online.website.builder.hideNav')} />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-2 pt-4 md:px-5">
          <h2 className="text-body-strong text-ink">{t('online.website.builder.mainMenu')}</h2>
          <IconButton
            label={t('online.website.builder.addNew')}
            onClick={() => {
              setAdding(true)
              setNameError('')
            }}
          >
            <Plus size={18} aria-hidden />
          </IconButton>
        </div>
        <ul className="flex flex-col gap-0.5 px-3">
          {config.pages.map((p, i) => (
            <li key={p.id} className={clsx('flex items-center rounded-md pr-1', p.id === selected?.id ? 'bg-primary-subtle' : 'hover:bg-sunken')}>
              <button type="button" onClick={() => setPage(p.id)} aria-current={p.id === selected?.id ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-body">
                {p.id === 'home' ? <Home size={16} className="shrink-0 text-primary" aria-hidden /> : <FileText size={16} className="shrink-0 text-muted" aria-hidden />}
                <span className={clsx('truncate', p.hidden ? 'text-muted line-through' : 'text-ink', p.id === selected?.id && 'font-semibold')}>{p.name}</span>
                {p.hidden && <span className="chip ml-auto bg-sunken text-caption text-muted">{t('online.website.builder.hidden')}</span>}
              </button>
              <Menu
                label={t('online.website.builder.pageOptions', { name: p.name })}
                groups={[
                  {
                    items: [
                      { label: t('online.website.builder.editPage'), onSelect: () => setPage(p.id) },
                      ...(p.id !== 'home'
                        ? [
                            { label: p.hidden ? t('online.website.builder.showInNav') : t('online.website.builder.hideFromNav'), onSelect: () => setPageFields(p.id, { hidden: !p.hidden }) },
                            { label: t('online.website.builder.moveUp'), onSelect: () => move(p.id, -1), disabled: i <= 1 },
                            { label: t('online.website.builder.moveDown'), onSelect: () => move(p.id, 1), disabled: i === config.pages.length - 1 },
                          ]
                        : []),
                    ],
                  },
                  ...(!p.system ? [{ items: [{ label: t('online.website.builder.deletePage'), danger: true, onSelect: () => void remove(p) }] }] : []),
                ]}
              />
            </li>
          ))}
        </ul>
        {selected && (
          <div className="mt-4 flex flex-col gap-3 border-t border-line p-4 md:p-5">
            <h2 className="text-body-strong text-ink">{t('online.website.builder.pageContent', { name: selected.name })}</h2>
            {selected.id === 'home' ? (
              <>
                <Field label={t('online.website.styling.eyebrow')}>{(id) => <TextInput id={id} value={config.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} />}</Field>
                <Field label={t('online.website.styling.headline')}>{(id) => <TextInput id={id} value={config.hero.heading} onChange={(e) => setHero({ heading: e.target.value })} />}</Field>
                <Field label={t('online.website.styling.text')}>{(id) => <TextArea id={id} rows={3} value={config.hero.text} onChange={(e) => setHero({ text: e.target.value })} />}</Field>
                <Field label={t('online.website.styling.button')}>{(id) => <TextInput id={id} value={config.hero.button} onChange={(e) => setHero({ button: e.target.value })} />}</Field>
              </>
            ) : (
              <>
                <Field label={t('online.website.builder.pageName')}>{(id) => <TextInput id={id} value={selected.name} onChange={(e) => setPageFields(selected.id, { name: e.target.value })} />}</Field>
                <Field label={t('online.website.builder.heading')}>{(id) => <TextInput id={id} value={selected.heading} onChange={(e) => setPageFields(selected.id, { heading: e.target.value })} />}</Field>
                <Field label={t('online.website.builder.text')}>{(id) => <TextArea id={id} rows={4} value={selected.text} onChange={(e) => setPageFields(selected.id, { text: e.target.value })} />}</Field>
              </>
            )}
          </div>
        )}
        <div className="mt-auto border-t border-line p-4 text-center md:p-5">
          <LearnMore topic={t('online.website.title')}>{t('online.website.builder.helpCenter')}</LearnMore>
        </div>
      </aside>
      <div className="bg-sunken p-4 max-md:min-w-0 md:p-6">
        <DeviceSwitch device={device} setDevice={setDevice} />
        <BrowserFrame url={`${config.domain}${selected && selected.id !== 'home' ? `/${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`} mobile={device === 'mobile'}>
          <SitePreview config={config} mobile={device === 'mobile'} page={selected?.id ?? 'home'} />
        </BrowserFrame>
      </div>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title={t('online.website.builder.addTitle')}
        footer={
          <>
            <Button onClick={() => setAdding(false)}>{t('online.common.cancel')}</Button>
            <Button variant="primary" onClick={addPage}>
              {t('online.website.builder.add')}
            </Button>
          </>
        }
      >
        <Field label={t('online.website.builder.pageName')} error={nameError || undefined}>
          {(id) => (
            <TextInput
              id={id}
              value={newName}
              autoFocus
              placeholder={t('online.website.builder.pageNamePlaceholder')}
              invalid={!!nameError}
              onChange={(e) => {
                setNewName(e.target.value)
                setNameError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && addPage()}
            />
          )}
        </Field>
      </Modal>
    </div>
  )
}

/** Phones: Desktop / Mobile switch above the live preview (from md up it sits in the header). */
function DeviceSwitch({ device, setDevice }: { device: 'desktop' | 'mobile'; setDevice: (d: 'desktop' | 'mobile') => void }) {
  const { t } = useTranslation()
  return (
    <div className="mb-3 flex justify-center md:hidden">
      <Segmented value={device} onChange={setDevice} items={[{ value: 'desktop', label: t('online.website.desktop') }, { value: 'mobile', label: t('online.website.mobile') }]} />
    </div>
  )
}

function DomainStep({ config, set, onStatus }: { config: WebsiteConfig; set: (p: Partial<WebsiteConfig>) => void; onStatus: (ok: boolean | null) => void }) {
  const { t } = useTranslation()
  const kind = config.domainType
  const initial = useMemo(() => {
    if (kind === 'existing') return { name: config.domain.endsWith(SITE_SUFFIX) ? '' : config.domain, tld: '' }
    const tld = TLDS.find((x) => config.domain.endsWith(x)) ?? TLDS[0]
    const name = config.domain.endsWith(SITE_SUFFIX) ? config.domain.slice(0, -SITE_SUFFIX.length) : config.domain.split('.')[0]
    return { name, tld }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])
  const [name, setName] = useState(initial.name)
  const [tld, setTld] = useState(initial.tld || TLDS[0])
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const [price, setPrice] = useState<number | undefined>()
  const full = kind === 'included' ? `${name}${SITE_SUFFIX}` : kind === 'custom' ? `${name}${tld}` : name.trim().toLowerCase()

  useEffect(() => {
    let alive = true
    if (!name.trim()) {
      setState('idle')
      onStatus(false)
      return
    }
    setState('checking')
    onStatus(null)
    const timer = setTimeout(async () => {
      const res = await checkDomain(kind === 'existing' ? name.replace(/^www\./, '') : name, kind)
      if (!alive) return
      setState(res.available ? 'ok' : 'taken')
      setPrice(res.price)
      onStatus(res.available)
      if (res.available) set({ domain: full })
    }, 450)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, tld, kind])

  return (
    <>
      <h1 className="font-display text-[26px] font-bold leading-[32px] text-ink md:text-[32px] md:leading-[40px]">{t(`online.website.domain.${kind}Title`)}</h1>
      <p className="mb-6 mt-2 text-body-lg text-muted md:mb-8">{t(`online.website.domain.${kind}Body`)}</p>
      <div className="flex items-start gap-2">
        <Field label={t('online.website.domain.name')} className="flex-1">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, ''))} suffix={kind === 'included' ? SITE_SUFFIX : undefined} placeholder={kind === 'existing' ? t('online.website.demo.existingDomain') : t('online.website.demo.domain')}
 />}
        </Field>
        {kind === 'custom' && (
          <Field label={t('online.website.domain.ending')}>
            {(id) => <Select id={id} value={tld} onChange={(e) => setTld(e.target.value)} options={TLDS} className="w-32" />}
          </Field>
        )}
      </div>
      <p className="mt-3 flex items-center gap-2 text-body max-md:flex-wrap max-md:gap-y-0.5" aria-live="polite">
        {state === 'checking' && (
          <>
            <Loader2 size={16} className="animate-spin text-muted" aria-hidden />
            <span className="text-muted">{t('online.website.domain.checking')}</span>
          </>
        )}
        {state === 'ok' && (
          <>
            <CheckCircle2 size={16} className="text-success" aria-hidden />
            <span className="text-success">{kind === 'existing' ? t('online.website.domain.ready') : t('online.website.domain.available')}</span>
            {price && (
              <span className="text-muted max-md:basis-full max-md:pl-6">
                <span className="max-md:hidden">· </span>
                {t('online.website.domain.priceNote', { price: money2(price) })}
              </span>
            )}
          </>
        )}
        {state === 'taken' && (
          <>
            <XCircle size={16} className="text-danger" aria-hidden />
            <span className="text-danger">{t('online.website.domain.taken')}</span>
          </>
        )}
      </p>
      {kind === 'existing' && state === 'ok' && (
        <div className="mt-6 rounded-lg bg-sunken p-4 text-small text-ink">
          <p className="mb-2 text-body-strong">{t('online.website.domain.dns')}</p>
          <p className="font-mono">CNAME www → sites{SITE_SUFFIX}</p>
          <p className="font-mono">A @ → 76.76.21.21</p>
        </div>
      )}
    </>
  )
}

function EnableStep({ active, config, billing, setBilling, errors }: { active: boolean; config: WebsiteConfig; billing: BillingValues; setBilling: (p: Partial<BillingValues>) => void; errors: BillingErrors }) {
  const { t } = useTranslation()
  const { tax, payNow } = smartWebsiteProRata()
  if (active) {
    return (
      <div className="max-w-[680px]">
        <h1 className="font-display text-[26px] font-bold leading-[32px] text-ink md:text-[32px] md:leading-[40px]">{t('online.website.enable.activeTitle')}</h1>
        <p className="mt-2 text-body-lg text-muted">{t('online.website.enable.activeBody', { domain: config.domain })}</p>
      </div>
    )
  }
  return (
    <>
      <h1 className="mb-6 font-display text-[26px] font-bold leading-[32px] text-ink md:mb-8 md:text-[32px] md:leading-[40px]">{t('online.website.enable.title')}</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <CardFields values={billing} errors={errors} onChange={setBilling} />
          <BillingDetailsFields values={billing} errors={errors} onChange={setBilling} />
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-0">
          <section className="card flex items-start gap-4 p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-info text-on-primary">
              <Sparkles size={22} aria-hidden />
            </span>
            <div>
              <p className="text-title-3 text-ink">{t('online.website.title')}</p>
              <p className="mt-1 text-body text-muted">{t('online.website.enable.tagline')}</p>
            </div>
          </section>
          <section className="card p-6">
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <p className="text-body text-ink">{t('online.website.enable.fixedPrice')}</p>
                <p className="text-body text-muted">{t('online.website.enable.monthly')}</p>
              </div>
              <p className="text-body text-ink">{money2(SMART_WEBSITE_PRICE)}</p>
            </div>
            <dl className="flex flex-col gap-1 border-b border-line py-4 text-body text-muted">
              <div className="flex justify-between">
                <dt>{t('online.website.enable.subtotal')}</dt>
                <dd>{money2(SMART_WEBSITE_PRICE)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('online.website.enable.iva', { pct: Math.round(IVA * 100) })}</dt>
                <dd>{money2(tax)}</dd>
              </div>
            </dl>
            <div className="flex justify-between border-b border-line py-4 text-title-3 text-ink">
              <span>{t('online.website.enable.payNow')}</span>
              <span>{money2(payNow)}</span>
            </div>
            <div className="flex flex-col gap-3 pt-4 text-body text-muted">
              <p>{t('online.website.enable.proRata')}</p>
              <p>{t('online.website.enable.renews', { price: money2(SMART_WEBSITE_PRICE) })}</p>
              <p>{t('online.website.enable.autoRenew')}</p>
              <p>{t('online.website.enable.manage')}</p>
            </div>
          </section>
          <CheckList items={[t('online.website.enable.c1', { domain: config.domain }), t('online.website.enable.c2')]} />
        </div>
      </div>
    </>
  )
}
