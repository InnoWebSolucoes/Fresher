import { Check, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Field, Modal, TextInput, confirm, toast } from '@/components/ui'
import { configBool, configString, disableAddOn, enableAddOn, findAddOn, isAddOnOn, updateAddOnConfig } from '@/api/addons'
import { useDb } from '@/store/db'
import { META, NEEDS_PROFILE } from './catalog'
import { IntroScreen } from './components/shared'
import { useReturnTo } from './AddOnIntroPage'

/** Validation of the ID fields per integration (field, optional second field). */
const RULES: Record<string, [RegExp, RegExp?]> = {
  'google-reserve': [/^https?:\/\/(www\.)?(g\.page|maps\.app\.goo\.gl|google\.[a-z.]+\/maps|business\.google\.com)\/\S+$/i],
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

/**
 * /add-ons/integration/:slug/intro (add-ons.md §3.2): intro → Set up now →
 * publish gate (no marketplace profile) or the ID form → connected state.
 */
export function IntegrationIntroPage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const locations = useDb((s) => s.locations)
  const back = useReturnTo('/add-ons#integrations')
  const [formOpen, setFormOpen] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (META[slug]?.kind !== 'integration') return <Navigate to="/add-ons#integrations" replace />
  const copy = t(`addons.integration.${slug}`, { returnObjects: true }) as Copy
  const name = t(`addons.items.${slug}.name`)
  const connected = isAddOnOn(record) && configBool(record, 'connected') === true
  const published = locations.some((l) => l.marketplace?.listed)

  const setUp = () => (NEEDS_PROFILE.includes(slug) && !published ? setGateOpen(true) : setFormOpen(true))

  const disconnect = async () => {
    const ok = await confirm({ title: t('addons.integration.disconnectTitle', { name }), body: t('addons.integration.disconnectBody'), confirmLabel: t('addons.integration.disconnect'), tone: 'danger' })
    if (!ok) return
    setBusy(true)
    await disableAddOn(slug, 'disconnected')
    setBusy(false)
    toast(t('addons.integration.disconnectedToast', { name }))
  }

  return (
    <>
      <IntroScreen
        slug={slug}
        label={name}
        heading={copy.heading}
        body={copy.body}
        bullets={copy.bullets}
        badge={connected ? <Chip tone="success">{t('addons.integration.connected')}</Chip> : undefined}
        price={connected ? undefined : <p className="font-display text-title-2 text-ink">{t('addons.includedInPlan')}</p>}
        primary={{ label: connected ? t('addons.integration.edit') : t('addons.setUpNow'), onClick: setUp }}
        onClose={() => navigate(back)}
        footer={
          connected ? (
            <div className="card max-w-xl p-6">
              <p className="flex items-center gap-2 text-body-strong text-success">
                <CheckCircle2 size={20} aria-hidden />
                {t('addons.integration.connected')}
              </p>
              <p className="mt-1 text-body text-muted">{t(slug === 'google-reserve' ? 'addons.integration.connectedBodyReserve' : 'addons.integration.connectedBody', { name })}</p>
              <dl className="mt-4 flex flex-col gap-1 text-body">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{copy.field}</dt>
                  <dd className="break-all font-mono">{configString(record, 'id')}</dd>
                </div>
                {copy.field2 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{copy.field2}</dt>
                    <dd className="font-mono">{configString(record, 'id2')}</dd>
                  </div>
                )}
              </dl>
              {slug !== 'google-reserve' && slug !== 'fb-and-ig-bookings' && (
                <>
                  <p className="mt-4 text-small font-semibold uppercase tracking-wide text-muted">{t('addons.integration.events')}</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {(t('addons.integration.eventList', { returnObjects: true }) as string[]).map((e) => (
                      <li key={e}>
                        <Chip>{e}</Chip>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <Button variant="ghost" className="mt-5 text-danger" loading={busy} onClick={() => void disconnect()}>
                {t('addons.integration.disconnect')}
              </Button>
            </div>
          ) : undefined
        }
      />
      <IdForm open={formOpen} slug={slug} name={name} copy={copy} onClose={() => setFormOpen(false)} />
      <PublishGate open={gateOpen} name={name} onClose={() => setGateOpen(false)} onStart={() => navigate('/online-presence/locations')} />
    </>
  )
}

function IdForm({ open, slug, name, copy, onClose }: { open: boolean; slug: string; name: string; copy: Copy; onClose: () => void }) {
  return open ? <IdFormBody slug={slug} name={name} copy={copy} onClose={onClose} /> : null
}

function IdFormBody({ slug, name, copy, onClose }: { slug: string; name: string; copy: Copy; onClose: () => void }) {
  const { t } = useTranslation()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const [v1, setV1] = useState(configString(record, 'id') ?? '')
  const [v2, setV2] = useState(configString(record, 'id2') ?? '')
  const [errors, setErrors] = useState<{ v1?: string; v2?: string }>({})
  const [busy, setBusy] = useState(false)
  const [rule1, rule2] = RULES[slug]
  const save = async () => {
    const next: typeof errors = {}
    if (!rule1.test(v1.trim())) next.v1 = copy.error
    if (rule2 && copy.field2 && !rule2.test(v2.trim())) next.v2 = copy.error2
    setErrors(next)
    if (next.v1 || next.v2) return
    setBusy(true)
    const patch = { connected: true, id: v1.trim(), id2: rule2 ? v2.trim() : undefined }
    if (record && isAddOnOn(record)) await updateAddOnConfig(slug, patch)
    else await enableAddOn(slug, { name, config: patch })
    setBusy(false)
    toast(t('addons.integration.connectedToast', { name }))
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('addons.integration.setupTitle', { name })}
      subtitle={t(slug === 'google-reserve' ? 'addons.integration.setupBodyReserve' : 'addons.integration.setupBody')}
      footer={
        <>
          <Button onClick={onClose}>{t('addons.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('addons.integration.save')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label={copy.field} error={errors.v1}>
          {(id) => <TextInput id={id} placeholder={copy.placeholder} value={v1} invalid={Boolean(errors.v1)} onChange={(e) => setV1(e.target.value)} />}
        </Field>
        {copy.field2 && (
          <Field label={copy.field2} error={errors.v2}>
            {(id) => <TextInput id={id} placeholder={copy.placeholder2} value={v2} invalid={Boolean(errors.v2)} onChange={(e) => setV2(e.target.value)} />}
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** "Set up your marketplace profile to enable …" (add-ons.md §3.2, addons-60–62). */
function PublishGate({ open, name, onClose, onStart }: { open: boolean; name: string; onClose: () => void; onStart: () => void }) {
  const { t } = useTranslation()
  const bullets = t('addons.integration.gate.bullets', { returnObjects: true }) as string[]
  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="grid items-center gap-8 p-4 md:grid-cols-[1fr_300px]">
        <div>
          <h2 className="font-display text-[32px] font-bold leading-[40px] text-ink">{t('addons.integration.gate.title', { name })}</h2>
          <p className="mt-6 text-body-lg text-ink">{t('addons.integration.gate.body')}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          <Button variant="primary" size="lg" className="mt-8 rounded-full" onClick={onStart}>
            {t('addons.startNow')}
          </Button>
        </div>
        <div className="hidden h-[320px] rounded-xl bg-gradient-to-br from-primary-subtle to-success-subtle md:block" aria-hidden />
      </div>
    </Modal>
  )
}
