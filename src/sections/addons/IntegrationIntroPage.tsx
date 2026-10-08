import { Check, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Field, FullscreenFrame, LearnMore, TextInput, confirm, toast } from '@/components/ui'
import { disableAddOn, enableAddOn, findAddOn, updateAddOnConfig } from '@/api/addons'
import { useDb } from '@/store/db'
import { META } from './catalog'
import { IntroArt } from './components/shared'

/** Validation of the ID fields per integration (field, optional second field). */
const RULES: Record<string, [RegExp, RegExp?]> = {
  'fb-and-ig-bookings': [/^https?:\/\/(www\.|m\.)?facebook\.com\/[\w.-]+\/?$/i, /^@?[\w.]{2,30}$/],
  'meta-pixel-ads': [/^\d{15,16}$/],
  'google-analytics': [/^G-[A-Z0-9]{6,12}$/i],
  'google-ads': [/^AW-\d{9,11}$/i, /^[\w-]{4,40}$/],
}

interface Copy {
  heading: string
  body: string
  bullets: string[]
  field: string
  placeholder: string
  error: string
  field2?: string
  placeholder2?: string
  error2?: string
}

/** /add-ons/integration/:slug/intro (add-ons.md §3.2): intro → ID form → connected state. */
export function IntegrationIntroPage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const config = record?.config ?? {}
  const connected = record?.status === 'active' && config.connected === true
  const [editing, setEditing] = useState(false)
  const [v1, setV1] = useState(String(config.id ?? ''))
  const [v2, setV2] = useState(String(config.id2 ?? ''))
  const [errors, setErrors] = useState<{ v1?: string; v2?: string }>({})
  const [busy, setBusy] = useState(false)
  if (META[slug]?.kind !== 'integration') return <Navigate to="/add-ons#integrations" replace />
  const copy = t(`addons.integration.${slug}`, { returnObjects: true }) as Copy
  const name = t(`addons.items.${slug}.name`)
  const [rule1, rule2] = RULES[slug]

  const save = async () => {
    const next: typeof errors = {}
    if (!rule1.test(v1.trim())) next.v1 = copy.error
    if (rule2 && copy.field2 && !rule2.test(v2.trim())) next.v2 = copy.error2
    setErrors(next)
    if (next.v1 || next.v2) return
    setBusy(true)
    const patch = { connected: true, id: v1.trim(), id2: rule2 ? v2.trim() : undefined }
    if (record && record.status === 'active') await updateAddOnConfig(slug, patch)
    else await enableAddOn(slug, { name, config: patch })
    setBusy(false)
    setEditing(false)
    toast(t('addons.integration.connectedToast', { name }))
  }

  const disconnect = async () => {
    const ok = await confirm({ title: t('addons.integration.disconnectTitle', { name }), body: t('addons.integration.disconnectBody'), confirmLabel: t('addons.integration.disconnect'), tone: 'danger' })
    if (!ok) return
    await updateAddOnConfig(slug, { connected: false })
    await disableAddOn(slug, 'disconnected')
    toast(t('addons.integration.disconnectedToast', { name }))
  }

  const form = (
    <div className="card mt-8 max-w-xl p-6">
      <h2 className="font-display text-title-3 text-ink">{t('addons.integration.setupTitle', { name })}</h2>
      <p className="mb-4 text-body text-muted">{t('addons.integration.setupBody')}</p>
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label={copy.field} error={errors.v1}>{(id) => <TextInput id={id} placeholder={copy.placeholder} value={v1} invalid={Boolean(errors.v1)} onChange={(e) => setV1(e.target.value)} />}</Field>
        {copy.field2 && <Field label={copy.field2} error={errors.v2}>{(id) => <TextInput id={id} placeholder={copy.placeholder2} value={v2} invalid={Boolean(errors.v2)} onChange={(e) => setV2(e.target.value)} />}</Field>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={busy}>{t('addons.integration.save')}</Button>
          {connected && <Button onClick={() => setEditing(false)}>{t('addons.close')}</Button>}
        </div>
      </form>
    </div>
  )

  return (
    <FullscreenFrame title={name} onClose={() => navigate('/add-ons#integrations')} maxWidth="max-w-6xl">
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,420px)]">
        <div>
          <div className="flex items-center gap-2">
            <Chip tone="warning">{t('addons.includedInPlan')}</Chip>
            {connected && <Chip tone="success">{t('addons.integration.connected')}</Chip>}
          </div>
          <h1 className="mt-4 font-display text-[36px] font-bold leading-[44px] text-ink">{copy.heading}</h1>
          <p className="mt-3 max-w-xl text-body-lg text-muted">{copy.body}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {copy.bullets.map((b) => <li key={b} className="flex items-start gap-3 text-body-lg text-ink"><Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />{b}</li>)}
          </ul>
          {connected && !editing ? (
            <div className="card mt-8 max-w-xl p-6">
              <p className="flex items-center gap-2 text-body-strong text-success"><CheckCircle2 size={20} aria-hidden />{t('addons.integration.connected')}</p>
              <p className="mt-1 text-body text-muted">{t('addons.integration.connectedBody', { name })}</p>
              <dl className="mt-4 flex flex-col gap-1 text-body">
                <div className="flex justify-between gap-3"><dt className="text-muted">{copy.field}</dt><dd className="font-mono">{String(config.id ?? '')}</dd></div>
                {copy.field2 && <div className="flex justify-between gap-3"><dt className="text-muted">{copy.field2}</dt><dd className="font-mono">{String(config.id2 ?? '')}</dd></div>}
              </dl>
              <p className="mt-4 text-small font-semibold uppercase tracking-wide text-muted">{t('addons.integration.events')}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {(t('addons.integration.eventList', { returnObjects: true }) as string[]).map((e) => <li key={e}><Chip>{e}</Chip></li>)}
              </ul>
              <div className="mt-6 flex gap-2">
                <Button onClick={() => { setV1(String(config.id ?? '')); setV2(String(config.id2 ?? '')); setEditing(true) }}>{t('addons.integration.edit')}</Button>
                <Button variant="ghost" className="text-danger" onClick={() => void disconnect()}>{t('addons.integration.disconnect')}</Button>
              </div>
            </div>
          ) : editing ? (
            form
          ) : (
            <div className="mt-8 flex items-center gap-4">
              <Button variant="primary" size="lg" onClick={() => setEditing(true)}>{t('addons.setUpNow')}</Button>
              <LearnMore topic={name}>{t('addons.learnMore')}</LearnMore>
            </div>
          )}
        </div>
        <div className="hidden lg:block"><IntroArt slug={slug} /></div>
      </div>
    </FullscreenFrame>
  )
}
