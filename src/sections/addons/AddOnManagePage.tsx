import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowLeft, ExternalLink, Minus, Phone, RefreshCw, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, Field, LearnMore, Menu, MenuButton, Modal, PageSkeleton, Select, Switch, toast, usePageLoading } from '@/components/ui'
import { disableAddOn, findAddOn, isAddOnOn, isOnTrial, syncAccounting, updateAddOnConfig, type PaymentsAccount } from '@/api/addons'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { eur, META } from './catalog'
import { AddOnIcon } from './components/shared'

interface Feature {
  title: string
  body: string
  action?: string
  to?: string
}

const REASONS = ['missing_features', 'different_tool', 'missing_data', 'technical', 'too_complex', 'not_open', 'closing', 'support', 'accident', 'prefer_not', 'other']

/** /add-ons/manage/:slug (add-ons.md §1.1, §2.2, §2.5, §2.7). */
export function AddOnManagePage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const [disableOpen, setDisableOpen] = useState(false)
  const meta = META[slug]
  if (!meta) return <Navigate to="/add-ons" replace />
  if (meta.kind === 'integration') return <Navigate to={`/add-ons/integration/${slug}/intro`} replace />
  if (loading) return <div className="mx-auto max-w-[1200px] px-8 py-8"><PageSkeleton /></div>

  const name = t(`addons.items.${slug}.name`)
  const on = isAddOnOn(record)
  const trial = isOnTrial(record)
  const trialDays = record?.trialEndsAt ? Math.max(0, differenceInCalendarDays(parseISO(record.trialEndsAt), now())) : 0
  const features = (t(`addons.features.${slug}`, { returnObjects: true, defaultValue: [] }) as Feature[]) ?? []
  const help = t(`addons.help.${slug}`, { returnObjects: true, defaultValue: t('addons.help.default', { returnObjects: true }) }) as string[]
  const enableHref = slug === 'payments' ? '/payments/onboarding/overview' : META[slug].kind === 'free' ? `/add-ons/add-on/${slug}/intro` : `/add-ons/add-on/${slug}/setup`

  const pricing = meta.kind === 'free' || slug === 'payments' ? t('addons.manage.includedInPlan') : `${eur(meta.price ?? 0)} ${t(`addons.units.${meta.unit ?? 'location'}`)}`

  return (
    <div className="mx-auto w-full max-w-[1200px] px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/add-ons')}>{t('addons.back')}</Button>
        <span className="text-body text-muted">{t('addons.manage.breadcrumb')} · <span className="text-ink">{name}</span></span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <AddOnIcon slug={slug} size={36} className="h-20 w-20" />
          <div>
            <h1 className="flex flex-wrap items-center gap-3 font-display text-title-1 text-ink">
              {name}
              {trial ? <Chip tone="info">{t('addons.onTrial')}</Chip> : on ? <Chip tone="success">{t('addons.active')}</Chip> : <Chip>{t('addons.inactive')}</Chip>}
            </h1>
            <p className="text-body text-muted">{t('addons.innowebAddOn')}</p>
          </div>
        </div>
        <Menu
          trigger={({ open, toggle }) => <MenuButton open={open} toggle={toggle}>{t('addons.options')}</MenuButton>}
          groups={[{ items: on && !trial ? [{ label: t('addons.disable'), danger: true, onSelect: () => setDisableOpen(true) }] : [{ label: t('addons.enable'), onSelect: () => navigate(enableHref) }, ...(on ? [{ label: t('addons.disable'), danger: true, onSelect: () => setDisableOpen(true) }] : [])] }]}
        />
      </div>
      <p className="mb-6 max-w-3xl text-body-lg text-muted">{t(`addons.taglines.${slug}`, { defaultValue: t(`addons.items.${slug}.description`) })}</p>
      {trial && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-info-subtle px-5 py-4">
          <p className="text-body text-ink">{t('addons.manage.trialBanner', { count: trialDays })}</p>
          <Button variant="primary" onClick={() => navigate(`/add-ons/add-on/${slug}/setup`)}>{t('addons.manage.activatePlan')}</Button>
        </div>
      )}
      {!on && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-5 py-4">
          <p className="text-body text-muted">{t('addons.manage.notActive')}</p>
          <Button variant="primary" onClick={() => navigate(enableHref)}>{t('addons.enable')}</Button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 font-display text-title-3 text-ink">{t('addons.manage.included')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((f, i) => (
              <div key={f.title} className="card flex flex-col p-5">
                <p className="text-body-strong text-ink">{f.title}</p>
                <p className="mt-1 flex-1 text-body text-muted">{f.body}</p>
                <FeatureExtra slug={slug} index={i} disabled={!on} />
                {f.action && f.to && (
                  <Link to={f.to} className="mt-4 self-start text-body-strong text-primary hover:underline">
                    {f.action}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
        <aside className="card h-fit p-5">
          <h2 className="mb-3 font-display text-title-3 text-ink">{t('addons.manage.details')}</h2>
          <p className="text-small font-semibold uppercase tracking-wide text-muted">{t('addons.manage.pricing')}</p>
          <p className="mb-4 text-body text-ink">{pricing}</p>
          {record?.enabledAt && on && <p className="mb-4 text-body text-muted">{t('addons.manage.enabledOn', { date: fmtDate(record.enabledAt) })}</p>}
          <p className="text-small font-semibold uppercase tracking-wide text-muted">{t('addons.manage.helpCenter')}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {help.map((h) => <li key={h}><LearnMore topic={h}>{h}</LearnMore></li>)}
          </ul>
          <div className="mt-4">
            <LearnMore topic={name}>
              <span className="inline-flex items-center gap-1">{t('addons.manage.viewMore')} <ExternalLink size={14} aria-hidden /></span>
            </LearnMore>
          </div>
        </aside>
      </div>
      <DisableModal open={disableOpen} slug={slug} name={name} onClose={() => setDisableOpen(false)} />
    </div>
  )
}

function DisableModal({ open, slug, name, onClose }: { open: boolean; slug: string; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lose = t(`addons.loseAccess.${slug}`, { returnObjects: true, defaultValue: t('addons.loseAccess.default', { returnObjects: true }) }) as string[]
  const submit = async () => {
    if (!reason) return setError(t('addons.manage.selectReason'))
    setBusy(true)
    await disableAddOn(slug, reason)
    setBusy(false)
    toast(t('addons.manage.disabled', { name }))
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('addons.manage.disableTitle', { name })}
      footer={
        <>
          <Button onClick={onClose}>{t('addons.manage.goBack')}</Button>
          <Button variant="danger" loading={busy} onClick={submit}>{t('addons.manage.disableNow')}</Button>
        </>
      }
    >
      <p className="text-body text-muted">{t('addons.manage.noLonger')}</p>
      <ul className="mb-4 mt-2 list-disc pl-6 text-body text-ink">
        {lose.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <Field label={`${t('addons.manage.why')} *`} error={error}>
        {(id) => <Select id={id} value={reason} placeholder={t('addons.manage.selectReason')} onChange={(e) => { setReason(e.target.value); setError('') }} options={REASONS.map((r) => ({ value: r, label: t(`addons.manage.reasons.${r}`) }))} />}
      </Field>
    </Modal>
  )
}

/** Interactive bits inside feature cards (access code, chat, sync, payout accounts…). */
function FeatureExtra({ slug, index, disabled }: { slug: string; index: number; disabled: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const record = findAddOn(useDb((s) => s.addOns), slug)
  const [code, setCode] = useState<string | null>(null)
  const [chat, setChat] = useState(false)
  const [busy, setBusy] = useState(false)
  if (disabled) return null

  if (slug === 'premium-support' && index === 0) {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-md bg-sunken p-3 text-body">
        <p className="flex items-center gap-2"><Phone size={16} aria-hidden />{t('addons.manage.supportNumber')} <strong>800 319 927</strong></p>
        <p className="flex items-center gap-2" title={t('addons.manage.accessCodeHint')}>
          {t('addons.manage.accessCode')}
          {code ? (
            <strong className="tabular tracking-wider">{code}</strong>
          ) : (
            <Button variant="link" onClick={() => { const n = String(Math.floor(100000 + Math.random() * 900000)); setCode(`${n.slice(0, 3)} ${n.slice(3)}`); toast(t('addons.manage.codeGenerated')) }}>
              {t('addons.manage.generate')}
            </Button>
          )}
        </p>
      </div>
    )
  }
  if (slug === 'premium-support' && index === 1) {
    return (
      <>
        <Button className="mt-4 self-start" onClick={() => setChat(true)}>{t('addons.manage.startChat')}</Button>
        {chat && <ChatPanel onClose={() => setChat(false)} />}
      </>
    )
  }
  if (slug === 'payments' && index === 0) {
    const accounts = (record?.config?.accounts as PaymentsAccount[] | undefined) ?? []
    return (
      <div className="mt-4 flex flex-col gap-2">
        {accounts.length === 0 && <p className="text-body text-muted">{t('addons.manage.noAccounts')}</p>}
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-sunken px-3 py-2 text-body">
            <span className="truncate">{a.businessName} · •••• {a.iban.replace(/\s/g, '').slice(-4)}</span>
            <Chip tone={a.status === 'verified' ? 'success' : 'warning'}>{t(`addons.manage.${a.status}`)}</Chip>
          </div>
        ))}
        <Button className="self-start" onClick={() => navigate('/payments/onboarding/overview')}>{t('addons.manage.addAccount')}</Button>
      </div>
    )
  }
  if ((slug === 'xero' || slug === 'quickbooks') && index === 0) {
    const last = record?.config?.lastSyncedAt as string | undefined
    const org = record?.config?.organisation as string | undefined
    return (
      <div className="mt-4 flex flex-col gap-2 text-body">
        {org && <p className="text-ink">{t('addons.manage.connectedTo', { org })}</p>}
        <p className="text-muted">{last ? t('addons.manage.lastSynced', { date: fmtDateTime(last) }) : t('addons.manage.neverSynced')}</p>
        <Button
          className="self-start"
          icon={<RefreshCw size={16} />}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            const r = await syncAccounting(slug)
            setBusy(false)
            toast(t('addons.manage.synced', r))
          }}
        >
          {t('addons.manage.syncNow')}
        </Button>
      </div>
    )
  }
  if (slug === 'google-rating-boost' && index === 0) {
    const onPrompts = record?.config?.prompts !== false
    return (
      <div className="mt-4">
        <Switch
          checked={onPrompts}
          label={onPrompts ? t('addons.manage.reviewPrompts') : t('addons.manage.reviewPromptsOff')}
          onChange={async (v) => {
            await updateAddOnConfig(slug, { prompts: v })
            toast(t('addons.manage.promptsUpdated'))
          }}
        />
      </div>
    )
  }
  return null
}

interface ChatMessage {
  from: 'agent' | 'me'
  text: string
}

/** Premium Support live chat panel (add-ons.md §2.2, addons-23). */
function ChatPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [min, setMin] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setMessages([{ from: 'agent', text: t('addons.manage.chatGreeting', { name: user?.firstName ?? '' }) }]), 1800)
    return () => window.clearTimeout(id)
  }, [t, user?.firstName])
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages])
  const send = () => {
    if (!text.trim()) return
    setMessages((m) => [...m, { from: 'me', text: text.trim() }])
    setText('')
    window.setTimeout(() => setMessages((m) => [...m, { from: 'agent', text: t('addons.manage.chatReply') }]), 1200)
  }
  return (
    <div role="dialog" aria-label={t('addons.manage.chatTitle')} className="fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between bg-gradient-to-r from-primary to-info px-4 py-3 text-on-primary">
        <div>
          <p className="text-body-strong">{t('addons.manage.chatTitle')}</p>
          <p className="text-caption opacity-90">Innoweb · +5</p>
        </div>
        <div className="flex gap-1">
          <button type="button" className="rounded-full p-1.5 hover:bg-white/20" aria-label={t('addons.manage.minimise')} onClick={() => setMin((m) => !m)}><Minus size={16} aria-hidden /></button>
          <button type="button" className="rounded-full p-1.5 hover:bg-white/20" aria-label={t('addons.close')} onClick={onClose}><X size={16} aria-hidden /></button>
        </div>
      </div>
      {!min && (
        <>
          <div className="flex h-72 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
            {messages.length === 0 ? (
              <div className="m-auto text-center">
                <p className="text-body-strong text-ink">{t('addons.manage.chatFinding')}</p>
                <p className="text-body text-muted">{t('addons.manage.chatWait')}</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <p key={i} className={m.from === 'me' ? 'max-w-[80%] self-end rounded-lg bg-primary px-3 py-2 text-body text-on-primary' : 'max-w-[80%] self-start rounded-lg bg-sunken px-3 py-2 text-body text-ink'}>
                  {m.text}
                </p>
              ))
            )}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send() }}>
            <input className="input flex-1" aria-label={t('addons.manage.chatPlaceholder')} placeholder={t('addons.manage.chatPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} disabled={messages.length === 0} />
            <button type="submit" className="icon-btn h-10 w-10" aria-label={t('addons.manage.send')} disabled={messages.length === 0}><Send size={16} aria-hidden /></button>
          </form>
        </>
      )}
    </div>
  )
}
