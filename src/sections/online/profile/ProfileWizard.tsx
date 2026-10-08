import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, MapPin, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Field, Menu, Modal, Select, Switch, TextArea, TextInput, toast } from '@/components/ui'
import { useDb } from '@/store/db'
import { generateDescription, saveProfile, setProfileListed, type ProfilePatch } from '@/api/online'
import { toClock } from '@/lib/time'
import type { Address, Location, OpeningHours, Weekday } from '@/types'
import { readImage, sampleImage, WEEKDAYS } from '../shared'
import { ProfilePreviewModal } from './ProfilePreview'

export const PROFILE_STEPS = ['overview', 'essentials-overview', 'essentials', 'location', 'working-hours', 'showcase-overview', 'images', 'features', 'about', 'bookings-overview', 'enable'] as const
export type ProfileStep = (typeof PROFILE_STEPS)[number]
const STAGES: ProfileStep[][] = [
  ['overview', 'essentials-overview', 'essentials', 'location', 'working-hours'],
  ['showcase-overview', 'images', 'features', 'about'],
  ['bookings-overview', 'enable'],
]
/** Dashboard tab each editable step returns to. */
export const STEP_TAB: Partial<Record<ProfileStep, string>> = { essentials: 'essentials', about: 'essentials', location: 'location', 'working-hours': 'working-hours', images: 'images', features: 'features' }

export const AMENITIES = ['Parking available', 'Near public transport', 'Showers', 'Lockers', 'Bath towels', 'Swimming pool', 'Sauna']
export const HIGHLIGHTS = ['Pet-friendly', 'Adults only', 'Kid-friendly', 'Wheelchair accessible', 'Men only', 'Women only']
export const VALUES = ['Organic products only', 'Vegan products only', 'Environmentally friendly', 'LGBTQ+', 'Black-owned', 'Woman-owned', 'Asian-owned', 'Hispanic-owned', 'Indigenous-owned']
const TIMES = Array.from({ length: 288 }, (_, i) => toClock(i * 5))
const MAX_IMAGES = 10

interface Draft {
  name: string
  phone: string
  email: string
  address: Address
  directions: string
  openingHours: OpeningHours
  images: string[]
  amenities: string[]
  highlights: string[]
  values: string[]
  description: string
}

const toDraft = (l: Location): Draft => ({
  name: l.name,
  phone: l.phone,
  email: l.email,
  address: { ...l.address },
  directions: l.directions ?? '',
  openingHours: structuredClone(l.openingHours),
  images: [...l.marketplace.images],
  amenities: [...l.marketplace.amenities],
  highlights: [...l.marketplace.highlights],
  values: [...l.marketplace.values],
  description: l.marketplace.description,
})

function patchFor(step: ProfileStep, d: Draft): { patch: ProfilePatch; title?: string } {
  switch (step) {
    case 'essentials':
      return { patch: { name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim() }, title: 'online.activity.essentials' }
    case 'location':
      return { patch: { address: d.address, directions: d.directions.trim() || undefined }, title: 'online.activity.location' }
    case 'working-hours':
      return { patch: { openingHours: d.openingHours }, title: 'online.activity.hours' }
    case 'images':
      return { patch: { marketplace: { images: d.images } }, title: 'online.activity.images' }
    case 'features':
      return { patch: { marketplace: { amenities: d.amenities, highlights: d.highlights, values: d.values } }, title: 'online.activity.features' }
    case 'about':
      return { patch: { marketplace: { description: d.description.trim() } }, title: 'online.activity.description' }
    default:
      return { patch: {} }
  }
}

/** Marketplace profile wizard (online-booking.md §1.1). */
export function ProfileWizardPage() {
  const { locationId = '', step: rawStep = 'overview' } = useParams()
  const locations = useDb((s) => s.locations)
  const location = locations.find((l) => l.id === locationId)
  if (!location) return <Navigate to="/online-presence/locations" replace />
  const step = (PROFILE_STEPS as readonly string[]).includes(rawStep) ? (rawStep as ProfileStep) : 'overview'
  return <Wizard key={location.id} location={location} step={step} />
}

function Wizard({ location, step }: { location: Location; step: ProfileStep }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromDashboard = params.get('from') === 'dashboard'
  const [draft, setDraft] = useState<Draft>(() => toDraft(location))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'continue' | 'exit' | null>(null)
  const [preview, setPreview] = useState(false)
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }
  useEffect(() => setError(null), [step])

  const index = PROFILE_STEPS.indexOf(step)
  const stage = STAGES.findIndex((s) => s.includes(step))
  const dashboardUrl = (tab?: string) => `/online-presence/profile/dashboard/${location.id}${tab ? `/${tab}` : ''}`
  const go = (s: ProfileStep) => navigate(`/online-presence/profile/edit/${location.id}/${s}${fromDashboard ? '?from=dashboard' : ''}`)

  const validate = (): string | null => {
    if (step === 'essentials') {
      if (!draft.name.trim()) return t('online.wizard.errors.name')
      if (!draft.phone.trim()) return t('online.wizard.errors.phone')
    }
    if (step === 'location' && (!draft.address.line1.trim() || !draft.address.city.trim())) return t('online.wizard.errors.address')
    if (step === 'images' && draft.images.length < 3) return t('online.wizard.errors.images')
    if (step === 'about' && draft.description.trim().length < 200) return t('online.wizard.errors.description')
    return null
  }

  const persist = async (nextStep?: ProfileStep) => {
    const { patch, title } = patchFor(step, draft)
    await saveProfile(location.id, { ...patch, marketplace: { ...patch.marketplace, ...(location.marketplace.listed ? {} : { step: nextStep ?? step }) } }, title ? t(title) : undefined)
  }

  const onContinue = async () => {
    const problem = validate()
    if (problem) return setError(problem)
    if (step === 'enable') {
      if (location.marketplace.listed) return navigate(dashboardUrl())
      setBusy('continue')
      try {
        await setProfileListed(location.id, true)
        toast(t('online.wizard.enabledToast'))
        navigate(dashboardUrl())
      } catch (e) {
        toast((e as Error).message)
      } finally {
        setBusy(null)
      }
      return
    }
    setBusy('continue')
    try {
      if (fromDashboard && STEP_TAB[step]) {
        await persist()
        toast(t('online.wizard.savedToast'))
        navigate(dashboardUrl(STEP_TAB[step]))
        return
      }
      const next = PROFILE_STEPS[index + 1]
      await persist(next)
      go(next)
    } finally {
      setBusy(null)
    }
  }

  const onSaveExit = async () => {
    setBusy('exit')
    try {
      if (!validate()) await persist()
      toast(t('online.wizard.savedToast'))
      navigate(fromDashboard ? dashboardUrl(STEP_TAB[step]) : '/online-presence/locations')
    } finally {
      setBusy(null)
    }
  }

  const onBack = () => {
    if (fromDashboard || index === 0) navigate(fromDashboard ? dashboardUrl(STEP_TAB[step]) : '/online-presence/locations')
    else go(PROFILE_STEPS[index - 1])
  }

  const stageProgress = (i: number) => {
    if (i < stage) return 1
    if (i > stage) return 0
    const s = STAGES[i]
    return (s.indexOf(step) + 1) / s.length
  }
  const overall = Math.round(((index + 1) / PROFILE_STEPS.length) * 100)
  const continueLabel = step === 'enable' ? (location.marketplace.listed ? t('online.common.done') : t('online.wizard.enable')) : fromDashboard && STEP_TAB[step] ? t('online.common.save') : t('online.common.continue')

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="grid grid-cols-3 gap-1.5 px-6 pt-3" role="progressbar" aria-valuenow={overall} aria-valuemin={0} aria-valuemax={100} aria-label={t('online.wizard.progress', { pct: overall })}>
        {STAGES.map((_, i) => (
          <div key={i} className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-primary transition-all duration-base" style={{ width: `${stageProgress(i) * 100}%` }} />
          </div>
        ))}
      </div>
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 px-6">
        <button type="button" className="icon-btn h-10 w-10" aria-label={t('online.common.back')} onClick={onBack}>
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPreview(true)} disabled={draft.images.length === 0 && !draft.description}>
            {t('online.wizard.preview')}
          </Button>
          <Button onClick={onSaveExit} loading={busy === 'exit'}>
            {fromDashboard ? t('online.common.close') : t('online.wizard.saveExit')}
          </Button>
          <Button variant="primary" onClick={onContinue} loading={busy === 'continue'} iconRight={step === 'enable' ? <Check size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}>
            {continueLabel}
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-6 pb-16 pt-6">
          <StepBody step={step} draft={draft} set={set} error={error} location={location} />
        </div>
      </main>
      <ProfilePreviewModal open={preview} onClose={() => setPreview(false)} location={{ ...location, name: draft.name, phone: draft.phone, address: draft.address, openingHours: draft.openingHours, marketplace: { ...location.marketplace, images: draft.images, amenities: draft.amenities, highlights: draft.highlights, values: draft.values, description: draft.description } }} />
    </div>
  )
}

function Heading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-body-strong text-primary">{eyebrow}</p>}
      <h1 className="font-display text-[32px] font-bold leading-[40px] text-ink">{title}</h1>
      {body && <p className="mt-2 text-body-lg text-muted">{body}</p>}
    </div>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-4 rounded-md bg-danger-subtle px-4 py-3 text-body text-danger">
      {error}
    </p>
  )
}

function StepBody({ step, draft, set, error, location }: { step: ProfileStep; draft: Draft; set: (p: Partial<Draft>) => void; error: string | null; location: Location }) {
  const { t } = useTranslation()
  switch (step) {
    case 'overview':
      return (
        <>
          <Heading title={t('online.wizard.overview.title')} />
          <ol className="flex flex-col gap-6">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-4 border-b border-line pb-6 last:border-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-display text-title-3 text-primary">{n}</span>
                <div>
                  <p className="text-title-3 text-ink">{t(`online.wizard.overview.s${n}`)}</p>
                  <p className="mt-1 text-body text-muted">{t(`online.wizard.overview.s${n}b`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )
    case 'essentials-overview':
    case 'showcase-overview':
    case 'bookings-overview': {
      const key = step.replace('-overview', '')
      const n = key === 'essentials' ? 1 : key === 'showcase' ? 2 : 3
      return (
        <div className="py-10">
          <Heading eyebrow={t('online.wizard.stepN', { n })} title={t(`online.wizard.${key}Overview.title`)} body={t(`online.wizard.${key}Overview.body`)} />
        </div>
      )
    }
    case 'essentials':
      return (
        <>
          <Heading title={t('online.wizard.essentials.title')} body={t('online.wizard.essentials.body')} />
          <div className="flex flex-col gap-5">
            <Field label={t('online.wizard.essentials.name')} hint={t('online.wizard.essentials.nameHint')} error={error && !draft.name.trim() ? error : undefined}>
              {(id) => <TextInput id={id} value={draft.name} onChange={(e) => set({ name: e.target.value })} invalid={!!error && !draft.name.trim()} />}
            </Field>
            <Field label={t('online.wizard.essentials.phone')} hint={t('online.wizard.essentials.phoneHint')} error={error && draft.name.trim() && !draft.phone.trim() ? error : undefined}>
              {(id) => <TextInput id={id} type="tel" prefix="+351" value={draft.phone.replace(/^\+351\s?/, '')} onChange={(e) => set({ phone: e.target.value ? `+351 ${e.target.value.replace(/^\+351\s?/, '')}` : '' })} invalid={!!error && !draft.phone.trim()} />}
            </Field>
            <Field label={t('online.wizard.essentials.email')} hint={t('online.wizard.essentials.emailHint')}>
              {(id) => <TextInput id={id} type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} />}
            </Field>
          </div>
        </>
      )
    case 'location':
      return <LocationStep draft={draft} set={set} error={error} />
    case 'working-hours':
      return <HoursStep draft={draft} set={set} />
    case 'images':
      return <ImagesStep draft={draft} set={set} error={error} />
    case 'features':
      return (
        <>
          <Heading title={t('online.wizard.features.title')} body={t('online.wizard.features.body')} />
          {(
            [
              ['amenities', AMENITIES],
              ['highlights', HIGHLIGHTS],
              ['values', VALUES],
            ] as const
          ).map(([key, options]) => (
            <section key={key} className="mb-8">
              <h2 className="mb-3 text-title-3 text-ink">{t(`online.wizard.features.${key}`)}</h2>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => {
                  const on = draft[key].includes(o)
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ [key]: on ? draft[key].filter((x) => x !== o) : [...draft[key], o] })}
                      className={clsx('flex h-10 items-center gap-2 rounded-full border px-4 text-body transition-colors', on ? 'border-primary bg-primary-subtle font-semibold text-primary' : 'border-line-strong bg-surface text-ink hover:bg-sunken')}
                    >
                      {on && <Check size={14} aria-hidden />}
                      {o}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      )
    case 'about':
      return <AboutStep draft={draft} set={set} error={error} locationId={location.id} />
    case 'enable':
      return (
        <div className="grid items-center gap-8 md:grid-cols-[1fr_240px]">
          <div>
            <Heading title={location.marketplace.listed ? t('online.wizard.enableStep.listedTitle') : t('online.wizard.enableStep.title')} body={location.marketplace.listed ? t('online.wizard.enableStep.listedBody') : t('online.wizard.enableStep.body')} />
            <ErrorLine error={error} />
          </div>
          <div className="card p-4 shadow-md">
            <img src={draft.images[0] ?? sampleImage(0)} alt="" className="h-28 w-full rounded-md object-cover" />
            <p className="mt-3 text-body-strong text-ink">{draft.name}</p>
            <p className="text-caption text-muted">{draft.address.city}</p>
            <div className="mt-3 rounded-md bg-ink py-1.5 text-center text-caption font-semibold text-surface">{t('online.preview.bookNow')}</div>
            <p className="mt-3 rounded-md bg-success-subtle px-3 py-2 text-center text-small font-semibold text-success">{t('online.wizard.enableStep.newClients')}</p>
          </div>
        </div>
      )
  }
}

function LocationStep({ draft, set, error }: { draft: Draft; set: (p: Partial<Draft>) => void; error: string | null }) {
  const { t } = useTranslation()
  const [showDirections, setShowDirections] = useState(!!draft.directions)
  const a = draft.address
  const setA = (p: Partial<Address>) => set({ address: { ...a, ...p } })
  return (
    <>
      <Heading title={t('online.wizard.location.title')} body={t('online.wizard.location.body')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('online.wizard.location.line1')} className="sm:col-span-2">
          {(id) => <TextInput id={id} value={a.line1} onChange={(e) => setA({ line1: e.target.value })} invalid={!!error && !a.line1.trim()} />}
        </Field>
        <Field label={t('online.wizard.location.district')}>{(id) => <TextInput id={id} value={a.district ?? ''} onChange={(e) => setA({ district: e.target.value })} />}</Field>
        <Field label={t('online.wizard.location.city')}>{(id) => <TextInput id={id} value={a.city} onChange={(e) => setA({ city: e.target.value })} invalid={!!error && !a.city.trim()} />}</Field>
        <Field label={t('online.wizard.location.postcode')}>{(id) => <TextInput id={id} value={a.postcode} onChange={(e) => setA({ postcode: e.target.value })} />}</Field>
        <Field label={t('online.wizard.location.country')}>{(id) => <TextInput id={id} value={a.country} onChange={(e) => setA({ country: e.target.value })} />}</Field>
      </div>
      <ErrorLine error={error} />
      <MapArt label={[a.line1, a.city].filter(Boolean).join(', ')} />
      <p className="mt-2 text-small text-muted">{t('online.wizard.location.mapHint')}</p>
      <section className="mt-8">
        <h2 className="text-title-3 text-ink">{t('online.wizard.location.gettingThere')}</h2>
        <p className="mt-1 text-body text-muted">{t('online.wizard.location.gettingThereBody')}</p>
        {showDirections ? (
          <TextArea className="mt-3" rows={3} value={draft.directions} onChange={(e) => set({ directions: e.target.value })} aria-label={t('online.wizard.location.gettingThere')} autoFocus />
        ) : (
          <Button className="mt-3" onClick={() => setShowDirections(true)}>
            {t('online.wizard.location.addInstructions')}
          </Button>
        )}
      </section>
    </>
  )
}

/** Stylised map with a pin (no third-party map tiles). */
export function MapArt({ label }: { label: string }) {
  return (
    <div className="relative mt-6 h-56 overflow-hidden rounded-lg border border-line bg-[#e9efe6]">
      <svg viewBox="0 0 600 220" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M0 150 C120 120 200 190 330 150 S520 90 600 120 L600 220 L0 220Z" fill="#cfe0ea" />
        <g stroke="#fff" strokeWidth="10" fill="none">
          <path d="M0 60 L600 90" />
          <path d="M180 0 L240 220" />
          <path d="M420 0 L380 220" />
        </g>
        <g stroke="#fff" strokeWidth="4" fill="none" opacity=".8">
          <path d="M0 110 L600 40" />
          <path d="M60 0 L120 220" />
          <path d="M520 0 L560 220" />
        </g>
      </svg>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="mb-1 max-w-[260px] truncate rounded-md bg-surface px-2 py-1 text-caption font-semibold text-ink shadow-sm">{label || '—'}</span>
        <MapPin size={36} className="fill-primary text-on-primary" aria-hidden />
      </div>
    </div>
  )
}

function HoursStep({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  const { t } = useTranslation()
  const h = draft.openingHours
  const setDay = (day: Weekday, p: Partial<OpeningHours[Weekday]>) => set({ openingHours: { ...h, [day]: { ...h[day], ...p } } })
  return (
    <>
      <Heading title={t('online.wizard.hours.title')} body={t('online.wizard.hours.body')} />
      <ul className="flex flex-col divide-y divide-line">
        {WEEKDAYS.map((day) => {
          const d = h[day]
          const r = d.ranges[0] ?? { start: '10:00', end: '19:00' }
          return (
            <li key={day} className="flex min-h-[64px] flex-wrap items-center gap-4 py-3">
              <div className="w-44">
                <Switch checked={d.open} onChange={(open) => setDay(day, { open, ranges: open && !d.ranges.length ? [r] : d.ranges })} label={t(`online.days.${day}`)} />
              </div>
              {d.open ? (
                <div className="flex items-center gap-2">
                  <Select aria-label={t('online.wizard.hours.start', { day: t(`online.days.${day}`) })} value={r.start} options={TIMES} onChange={(e) => setDay(day, { ranges: [{ ...r, start: e.target.value }, ...d.ranges.slice(1)] })} className="w-28" />
                  <span className="text-muted">–</span>
                  <Select aria-label={t('online.wizard.hours.end', { day: t(`online.days.${day}`) })} value={r.end} options={TIMES} onChange={(e) => setDay(day, { ranges: [{ ...r, end: e.target.value }, ...d.ranges.slice(1)] })} className="w-28" />
                </div>
              ) : (
                <span className="text-body text-muted">{t('online.wizard.hours.closed')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function ImagesStep({ draft, set, error }: { draft: Draft; set: (p: Partial<Draft>) => void; error: string | null }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [analyzing, setAnalyzing] = useState(0)
  const [over, setOver] = useState(false)
  const [full, setFull] = useState<number | null>(null)
  const [guidelines, setGuidelines] = useState(false)
  const add = async (files: File[]) => {
    const ok = files.filter((f) => /image\/(jpeg|png|webp)/.test(f.type) && f.size <= 45 * 1024 * 1024).slice(0, MAX_IMAGES - draft.images.length)
    if (!ok.length) return toast(t('online.wizard.images.invalid'))
    setAnalyzing(ok.length)
    try {
      const urls = await Promise.all(ok.map((f) => readImage(f)))
      await new Promise((r) => setTimeout(r, 900))
      set({ images: [...draft.images, ...urls].slice(0, MAX_IMAGES) })
      toast(t('online.wizard.images.uploaded', { count: urls.length }))
    } catch {
      toast(t('online.wizard.images.invalid'))
    } finally {
      setAnalyzing(0)
    }
  }
  const addSamples = async () => {
    const n = Math.max(1, Math.min(3, MAX_IMAGES - draft.images.length))
    setAnalyzing(n)
    await new Promise((r) => setTimeout(r, 900))
    set({ images: [...draft.images, ...Array.from({ length: n }, (_, i) => sampleImage(draft.images.length + i))] })
    setAnalyzing(0)
    toast(t('online.wizard.images.uploaded', { count: n }))
  }
  const move = (i: number, to: number) => {
    const next = [...draft.images]
    const [x] = next.splice(i, 1)
    next.splice(to, 0, x)
    set({ images: next })
  }
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <Heading title={t('online.wizard.images.title')} body={t('online.wizard.images.body')} />
        <Menu
          label={t('online.common.options')}
          trigger={({ toggle, open }) => (
            <Button onClick={toggle} aria-expanded={open}>
              {t('online.common.options')}
            </Button>
          )}
          groups={[{ items: [{ label: t('online.wizard.preview'), onSelect: () => (draft.images.length ? setFull(0) : toast(t('online.wizard.errors.images'))) }, { label: t('online.wizard.images.guidelines'), onSelect: () => setGuidelines(true) }] }]}
        />
      </div>
      {draft.images.length < MAX_IMAGES && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            void add([...e.dataTransfer.files])
          }}
          className={clsx('flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center', over ? 'border-primary bg-primary-subtle' : 'border-line-strong bg-surface')}
        >
          {analyzing ? (
            <>
              <Loader2 size={28} className="animate-spin text-primary" aria-hidden />
              <p className="text-body-strong text-ink">{t('online.wizard.images.analyzing', { count: analyzing })}</p>
              <p className="text-small text-muted">{t('online.wizard.images.analyzingBody')}</p>
            </>
          ) : (
            <>
              <ImagePlus size={28} className="text-muted" aria-hidden />
              <p className="text-body-strong text-ink">{t('online.wizard.images.drop')}</p>
              <p className="text-small text-muted">{t('online.wizard.images.browse')}</p>
              <div className="mt-2 flex gap-2">
                <Button onClick={() => input.current?.click()}>{t('online.wizard.images.choose')}</Button>
                <Button variant="ghost" onClick={addSamples}>
                  {t('online.wizard.images.samples')}
                </Button>
              </div>
              <p className="mt-2 text-caption text-muted">{t('online.wizard.images.rules')}</p>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            hidden
            onChange={(e) => {
              void add([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </div>
      )}
      <ErrorLine error={error} />
      {draft.images.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {draft.images.map((src, i) => (
            <li key={`${i}-${src.slice(-24)}`} className="group relative overflow-hidden rounded-md border border-line">
              <button type="button" className="block w-full" onClick={() => setFull(i)} aria-label={t('online.wizard.images.viewFull', { n: i + 1 })}>
                <img src={src} alt="" className="aspect-[16/10] w-full object-cover" />
              </button>
              {i === 0 && <span className="chip absolute left-2 top-2 bg-surface text-caption text-ink shadow-sm">{t('online.wizard.images.cover')}</span>}
              <div className="absolute right-1.5 top-1.5 rounded-full bg-surface shadow-sm">
                <Menu
                  label={t('online.common.actions')}
                  groups={[
                    {
                      items: [
                        { label: t('online.wizard.images.viewFull', { n: i + 1 }), onSelect: () => setFull(i) },
                        { label: t('online.wizard.images.makeCover'), onSelect: () => move(i, 0), disabled: i === 0 },
                        { label: t('online.wizard.images.moveLeft'), onSelect: () => move(i, i - 1), disabled: i === 0 },
                        { label: t('online.wizard.images.moveRight'), onSelect: () => move(i, i + 1), disabled: i === draft.images.length - 1 },
                      ],
                    },
                    { items: [{ label: t('online.common.delete'), danger: true, onSelect: () => set({ images: draft.images.filter((_, j) => j !== i) }) }] },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={full !== null} onClose={() => setFull(null)} size="xl" title={full !== null ? t('online.wizard.images.viewFull', { n: full + 1 }) : ''}>
        {full !== null && draft.images[full] && <img src={draft.images[full]} alt="" className="max-h-[70vh] w-full rounded-md object-contain" />}
      </Modal>
      <Modal open={guidelines} onClose={() => setGuidelines(false)} title={t('online.wizard.images.guidelines')} footer={<Button onClick={() => setGuidelines(false)}>{t('online.common.close')}</Button>}>
        <ul className="list-disc space-y-2 pl-5 text-body text-ink">
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>{t(`online.wizard.images.g${n}`)}</li>
          ))}
        </ul>
      </Modal>
    </>
  )
}

function AboutStep({ draft, set, error, locationId }: { draft: Draft; set: (p: Partial<Draft>) => void; error: string | null; locationId: string }) {
  const { t } = useTranslation()
  const [generating, setGenerating] = useState(false)
  const len = draft.description.length
  const short = useMemo(() => draft.description.trim().length < 200, [draft.description])
  const generate = async () => {
    setGenerating(true)
    try {
      const text = await generateDescription(locationId)
      set({ description: text })
      toast(t('online.wizard.about.generated'))
    } finally {
      setGenerating(false)
    }
  }
  return (
    <>
      <Heading title={t('online.wizard.about.title')} body={t('online.wizard.about.body')} />
      <Field label={t('online.wizard.about.label')} hint={t('online.wizard.about.hint')} counter={{ value: len, max: 1200 }} error={error ?? undefined}>
        {(id) => <TextArea id={id} rows={9} maxLength={1200} value={draft.description} onChange={(e) => set({ description: e.target.value })} invalid={!!error} />}
      </Field>
      {short && !error && <p className="mt-2 text-small text-muted">{t('online.wizard.errors.description')}</p>}
      <Button className="mt-4" icon={<Sparkles size={16} aria-hidden />} onClick={generate} loading={generating}>
        {t('online.wizard.about.generate')}
      </Button>
    </>
  )
}
