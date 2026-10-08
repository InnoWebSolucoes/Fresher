import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Globe, Loader2, Monitor, Smartphone, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Chip, confirm, Field, IntroPage, Menu, Modal, Page, PageHeader, PageSkeleton, RadioGroup, Segmented, Select, Switch, TextInput, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { activateSmartWebsite, addOnStatus, cancelSmartWebsite, checkDomain, defaultWebsite, saveWebsite, SITE_SUFFIX, SMART_WEBSITE_PRICE, IVA, smartWebsiteProRata, useOnlineState, type BillingInput, type WebsiteConfig } from '@/api/online'
import { fmtDateTime, money2 } from '@/lib/format'
import { CheckList, copyText } from '../shared'
import { BrowserFrame, FONT_PACKS, PALETTES, SitePreview, TEMPLATES } from './SitePreview'

const STEPS = ['overview', 'design', 'styling', 'domain-type', 'domain', 'enable'] as const
type Step = (typeof STEPS)[number]
const TLDS = ['.com', '.pt', '.salon', '.beauty']

/** Smart Website (online-booking.md §5): intro, or the live-site dashboard once active. */
export function SmartWebsitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const addOns = useDb((s) => s.addOns)
  const { website } = useOnlineState()
  const [visit, setVisit] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  if (loading) return <Page><PageSkeleton /></Page>
  const active = addOnStatus(addOns, 'smart-website') === 'active' && !!website?.publishedAt

  if (!active || !website) {
    return (
      <Page>
        {website && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-lg bg-info-subtle px-5 py-4">
            <p className="text-body text-ink">{t('online.website.draftNote')}</p>
            <Button variant="primary" onClick={() => navigate('/online-presence/smart-website/styling')}>
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
            <BrowserFrame url={website?.domain ?? `yourbusiness${SITE_SUFFIX}`}>
              <div className="pointer-events-none h-[300px] overflow-hidden">
                <SitePreview config={website ?? DEMO_CONFIG} compact />
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
                    { label: t('online.website.changeDomain'), onSelect: () => navigate('/online-presence/smart-website/domain-type') },
                    { label: t('online.common.copyLink'), onSelect: () => copyText(url, t('online.common.linkCopied')) },
                  ],
                },
                { items: [{ label: t('online.website.cancel'), danger: true, onSelect: () => void cancel() }] },
              ]}
            />
            <Button onClick={() => setVisit(true)}>{t('online.website.visit')}</Button>
            <Button variant="primary" onClick={() => navigate('/online-presence/smart-website/styling')}>
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
        title={website.domain}
        footer={<Segmented value={device} onChange={setDevice} items={[{ value: 'desktop', label: t('online.website.desktop') }, { value: 'mobile', label: t('online.website.mobile') }]} />}
      >
        <BrowserFrame url={url} mobile={device === 'mobile'}>
          <SitePreview config={website} mobile={device === 'mobile'} />
        </BrowserFrame>
      </Modal>
    </Page>
  )
}

const DEMO_CONFIG: WebsiteConfig = {
  template: 'elegant',
  palette: 2,
  fontPack: 0,
  hideNavigation: false,
  hero: { eyebrow: 'Your neighbourhood studio', heading: 'Look and feel your best', text: 'Book online in seconds.', button: 'Book now' },
  pages: [],
  domainType: 'included',
  domain: `yourbusiness${SITE_SUFFIX}`,
}

/** Smart Website wizard (online-booking.md §5). */
export function SmartWebsiteWizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { step: raw = 'overview' } = useParams()
  const step: Step = (STEPS as readonly string[]).includes(raw) ? (raw as Step) : 'overview'
  const workspace = useDb((s) => s.workspace)
  const services = useDb((s) => s.services)
  const addOns = useDb((s) => s.addOns)
  const { website } = useOnlineState()
  const active = addOnStatus(addOns, 'smart-website') === 'active' && !!website?.publishedAt
  const [config, setConfig] = useState<WebsiteConfig>(() => website ?? defaultWebsite({ workspace, services }))
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [busy, setBusy] = useState(false)
  const [domainOk, setDomainOk] = useState<boolean | null>(null)
  const [billing, setBilling] = useState<BillingInput & { cvc: string }>(() => {
    const b = workspace.plan.billingDetails
    return { cardHolder: '', cardNumber: '', expiry: '', cvc: '', accountType: b?.accountType ?? 'Business', firstName: b?.firstName ?? '', lastName: b?.lastName ?? '', businessName: b?.businessName ?? workspace.name, vatNumber: b?.vatNumber ?? '', address: b?.address ?? '' }
  })
  const [billingErrors, setBillingErrors] = useState<Record<string, string>>({})
  const index = STEPS.indexOf(step)
  const set = (p: Partial<WebsiteConfig>) => setConfig((c) => ({ ...c, ...p }))

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
    const errs: Record<string, string> = {}
    const req = t('online.website.billing.required')
    if (!billing.cardHolder.trim()) errs.cardHolder = req
    if (billing.cardNumber.replace(/\D/g, '').length < 12) errs.cardNumber = t('online.website.billing.cardInvalid')
    if (!/^\d{2}\s?\/\s?\d{2}$/.test(billing.expiry.trim())) errs.expiry = t('online.website.billing.expiryInvalid')
    if (!/^\d{3,4}$/.test(billing.cvc.trim())) errs.cvc = req
    if (!billing.firstName.trim()) errs.firstName = req
    if (!billing.lastName.trim()) errs.lastName = req
    if (!billing.address.trim()) errs.address = req
    setBillingErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await activateSmartWebsite(config, billing)
      toast(t('online.website.activatedToast'))
      navigate('/online-presence/smart-website')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const continueLabel = step === 'enable' ? (active ? t('online.website.publishChanges') : t('online.website.activate')) : t('online.common.continue')
  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="h-1 w-full bg-sunken" role="progressbar" aria-valuenow={Math.round(((index + 1) / STEPS.length) * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-all duration-base" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
      </div>
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-6">
        <div className="flex items-center gap-3">
          <button type="button" className="icon-btn h-10 w-10" aria-label={t('online.common.back')} onClick={back}>
            <ArrowLeft size={20} aria-hidden />
          </button>
          {step === 'styling' && (
            <Segmented
              value={device}
              onChange={setDevice}
              items={[
                { value: 'desktop', label: <Monitor size={16} aria-label={t('online.website.desktop')} /> },
                { value: 'mobile', label: <Smartphone size={16} aria-label={t('online.website.mobile')} /> },
              ]}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={close}>{t('online.common.close')}</Button>
          <Button variant="primary" onClick={onContinue} loading={busy} disabled={step === 'domain' && !domainOk} iconRight={step === 'enable' ? <Check size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}>
            {continueLabel}
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {step === 'styling' ? (
          <StylingStep config={config} set={set} device={device} />
        ) : (
          <div className={clsx('mx-auto w-full px-6 pb-16 pt-10', step === 'design' ? 'max-w-[1100px]' : 'max-w-[680px]')}>
            {step === 'overview' && (
              <>
                <h1 className="mb-8 font-display text-[32px] font-bold leading-[40px] text-ink">{t('online.website.overview.title')}</h1>
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
                <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('online.website.domainType.title')}</h1>
                <p className="mb-8 mt-2 text-body-lg text-muted">{t('online.website.domainType.body')}</p>
                <RadioGroup
                  variant="cards"
                  value={config.domainType}
                  onChange={(v) => {
                    set({ domainType: v })
                    setDomainOk(null)
                  }}
                  options={(['included', 'custom', 'existing'] as const).map((v) => ({ value: v, label: t(`online.website.domainType.${v}`), hint: t(`online.website.domainType.${v}Hint`, { suffix: SITE_SUFFIX }) }))}
                />
              </>
            )}
            {step === 'domain' && <DomainStep config={config} set={set} onStatus={setDomainOk} />}
            {step === 'enable' && <EnableStep active={active} config={config} billing={billing} setBilling={setBilling} errors={billingErrors} />}
          </div>
        )}
      </main>
    </div>
  )
}

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
      <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('online.website.design.title')}</h1>
      <p className="mb-8 mt-2 text-body-lg text-muted">{t('online.website.design.body')}</p>
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
          <div className="flex w-full items-center justify-between">
            <Segmented value={device} onChange={setDevice} items={[{ value: 'desktop', label: t('online.website.desktop') }, { value: 'mobile', label: t('online.website.mobile') }]} />
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

function StylingStep({ config, set, device }: { config: WebsiteConfig; set: (p: Partial<WebsiteConfig>) => void; device: 'desktop' | 'mobile' }) {
  const { t } = useTranslation()
  const setHero = (p: Partial<WebsiteConfig['hero']>) => set({ hero: { ...config.hero, ...p } })
  return (
    <div className="grid min-h-full lg:grid-cols-[360px_1fr]">
      <aside className="border-r border-line bg-surface p-6">
        <h1 className="mb-6 font-display text-title-1 text-ink">{t('online.website.styling.title')}</h1>
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
        <h2 className="mb-3 mt-8 text-title-3 text-ink">{t('online.website.styling.content')}</h2>
        <div className="flex flex-col gap-3">
          <Field label={t('online.website.styling.eyebrow')}>{(id) => <TextInput id={id} value={config.hero.eyebrow} onChange={(e) => setHero({ eyebrow: e.target.value })} />}</Field>
          <Field label={t('online.website.styling.headline')}>{(id) => <TextInput id={id} value={config.hero.heading} onChange={(e) => setHero({ heading: e.target.value })} />}</Field>
          <Field label={t('online.website.styling.text')}>{(id) => <TextInput id={id} value={config.hero.text} onChange={(e) => setHero({ text: e.target.value })} />}</Field>
          <Field label={t('online.website.styling.button')}>{(id) => <TextInput id={id} value={config.hero.button} onChange={(e) => setHero({ button: e.target.value })} />}</Field>
        </div>
        <h2 className="mb-3 mt-8 text-title-3 text-ink">{t('online.website.styling.pages')}</h2>
        <Switch checked={config.hideNavigation} onChange={(v) => set({ hideNavigation: v })} label={t('online.website.styling.hideNav')} />
        <ul className="mt-3 flex flex-col gap-1">
          {config.pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-sunken">
              <span className={clsx('text-body', p.hidden ? 'text-muted line-through' : 'text-ink')}>{p.name}</span>
              {p.id !== 'home' && (
                <Button size="sm" variant="ghost" onClick={() => set({ pages: config.pages.map((x) => (x.id === p.id ? { ...x, hidden: !x.hidden } : x)) })}>
                  {p.hidden ? t('online.website.styling.show') : t('online.website.styling.hide')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </aside>
      <div className="bg-sunken p-6">
        <BrowserFrame url={config.domain} mobile={device === 'mobile'}>
          <SitePreview config={config} mobile={device === 'mobile'} />
        </BrowserFrame>
      </div>
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
      <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t(`online.website.domain.${kind}Title`)}</h1>
      <p className="mb-8 mt-2 text-body-lg text-muted">{t(`online.website.domain.${kind}Body`)}</p>
      <div className="flex items-start gap-2">
        <Field label={t('online.website.domain.name')} className="flex-1">
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, ''))} suffix={kind === 'included' ? SITE_SUFFIX : undefined} placeholder={kind === 'existing' ? 'www.yourbusiness.com' : 'yourbusiness'} />}
        </Field>
        {kind === 'custom' && (
          <Field label={t('online.website.domain.ending')}>
            {(id) => <Select id={id} value={tld} onChange={(e) => setTld(e.target.value)} options={TLDS} className="w-32" />}
          </Field>
        )}
      </div>
      <p className="mt-3 flex items-center gap-2 text-body" aria-live="polite">
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
            {price && <span className="text-muted">· {t('online.website.domain.priceNote', { price: money2(price) })}</span>}
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

function EnableStep({ active, config, billing, setBilling, errors }: { active: boolean; config: WebsiteConfig; billing: BillingInput & { cvc: string }; setBilling: (fn: (b: BillingInput & { cvc: string }) => BillingInput & { cvc: string }) => void; errors: Record<string, string> }) {
  const { t } = useTranslation()
  const { tax, payNow } = smartWebsiteProRata()
  if (active) {
    return (
      <>
        <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('online.website.enable.activeTitle')}</h1>
        <p className="mt-2 text-body-lg text-muted">{t('online.website.enable.activeBody', { domain: config.domain })}</p>
      </>
    )
  }
  const f = (key: keyof (BillingInput & { cvc: string }), label: string, extra?: { placeholder?: string; className?: string; inputMode?: 'numeric' }) => (
    <Field label={label} error={errors[key]} className={extra?.className}>
      {(id) => <TextInput id={id} value={billing[key] ?? ''} placeholder={extra?.placeholder} inputMode={extra?.inputMode} onChange={(e) => setBilling((b) => ({ ...b, [key]: e.target.value }))} invalid={!!errors[key]} />}
    </Field>
  )
  return (
    <>
      <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('online.website.enable.title')}</h1>
      <Card className="mt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-body-strong text-ink">{t('online.website.title')}</p>
            <p className="text-small text-muted">{t('online.website.enable.fixed')}</p>
          </div>
          <p className="text-body-strong text-ink">{money2(SMART_WEBSITE_PRICE)}</p>
        </div>
        <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-body">
          <div className="flex justify-between">
            <dt className="text-muted">{t('online.website.enable.subtotal')}</dt>
            <dd className="text-ink">{money2(SMART_WEBSITE_PRICE)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('online.website.enable.iva', { pct: Math.round(IVA * 100) })}</dt>
            <dd className="text-ink">{money2(tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-body-strong">
            <dt className="text-ink">{t('online.website.enable.payNow')}</dt>
            <dd className="text-ink">{money2(payNow)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-small text-muted">{t('online.website.enable.note', { price: money2(SMART_WEBSITE_PRICE) })}</p>
      </Card>
      <h2 className="mb-3 mt-8 text-title-3 text-ink">{t('online.website.billing.card')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {f('cardHolder', t('online.website.billing.cardHolder'), { className: 'sm:col-span-2' })}
        {f('cardNumber', t('online.website.billing.cardNumber'), { placeholder: '4242 4242 4242 4242', className: 'sm:col-span-2', inputMode: 'numeric' })}
        {f('expiry', t('online.website.billing.expiry'), { placeholder: 'MM / YY' })}
        {f('cvc', t('online.website.billing.cvc'), { placeholder: '123', inputMode: 'numeric' })}
      </div>
      <h2 className="mb-3 mt-8 text-title-3 text-ink">{t('online.website.billing.details')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('online.website.billing.accountType')} className="sm:col-span-2">
          {(id) => <Select id={id} value={billing.accountType} onChange={(e) => setBilling((b) => ({ ...b, accountType: e.target.value }))} options={[{ value: 'Business', label: t('online.website.billing.business') }, { value: 'Individual', label: t('online.website.billing.individual') }]} />}
        </Field>
        {f('firstName', t('online.website.billing.firstName'))}
        {f('lastName', t('online.website.billing.lastName'))}
        {f('businessName', t('online.website.billing.businessName'))}
        {f('vatNumber', t('online.website.billing.vat'))}
        {f('address', t('online.website.billing.address'), { className: 'sm:col-span-2' })}
      </div>
      <CheckList className="mt-8" items={[t('online.website.enable.c1', { domain: config.domain }), t('online.website.enable.c2')]} />
    </>
  )
}
