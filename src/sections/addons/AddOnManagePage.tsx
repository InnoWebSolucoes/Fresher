import clsx from 'clsx'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CreditCard,
  ExternalLink,
  Gem,
  Info,
  Landmark,
  LineChart,
  Lock,
  MessageCircle,
  MessagesSquare,
  Minus,
  Phone,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  Users,
  Armchair,
  Link2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Chip, LearnMore, Menu, MenuButton, PageSkeleton, Select, Switch, confirm, toast, usePageLoading } from '@/components/ui'
import { configBool, configString, disableAddOn, findAddOn, isAddOnOn, isOnTrial, paymentsAccounts, removePaymentsAccount, syncAccounting, updateAddOnConfig } from '@/api/addons'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import type { AddOnState } from '@/types'
import { eur, ledgerLabel, META } from './catalog'
import { AddOnIcon } from './components/shared'

interface Feature {
  title: string
  body: string
  action?: string
  to?: string
}

const REASONS = ['missing_features', 'different_tool', 'missing_data', 'technical', 'too_complex', 'not_open', 'closing', 'support', 'accident', 'prefer_not', 'other']

const FEATURE_ICONS: Record<string, LucideIcon[]> = {
  payments: [Landmark, CreditCard, Smartphone, ShieldCheck],
  'premium-support': [Phone, MessageCircle],
  insights: [BarChart3, LineChart, Lock],
  'google-rating-boost': [Star, MessagesSquare],
  loyalty: [Gem, BarChart3],
  'data-connector': [Link2],
  'client-connect': [MessagesSquare, Settings],
  'team-chat': [Users],
  'bookable-resources': [Armchair, BookOpen, LineChart],
  xero: [RefreshCw, BookOpen],
  quickbooks: [RefreshCw, BookOpen],
}

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
  if (meta.kind === 'external' && slug !== 'payments') return <Navigate to={meta.href ?? '/add-ons'} replace />
  if (loading) return <div className="mx-auto max-w-[1200px] px-8 py-8"><PageSkeleton /></div>

  const name = t(`addons.manage.names.${slug}`, { defaultValue: t(`addons.items.${slug}.name`) })
  const on = isAddOnOn(record)
  const trial = isOnTrial(record)
  const activated = configBool(record, 'activated') === true
  const trialDays = record?.trialEndsAt ? Math.max(0, differenceInCalendarDays(parseISO(record.trialEndsAt), now())) : 0
  const features = (t(`addons.features.${slug}`, { returnObjects: true, defaultValue: [] }) as Feature[]) ?? []
  const help = t(`addons.help.${slug}`, { returnObjects: true, defaultValue: t('addons.help.default', { returnObjects: true }) }) as string[]
  const enableHref = slug === 'payments' ? '/payments/payment-processing' : meta.kind === 'free' ? `/add-ons/add-on/${slug}/intro` : record?.status === 'trial' ? `/add-ons/add-on/${slug}/setup` : `/add-ons/add-on/${slug}/intro`
  const icons = FEATURE_ICONS[slug] ?? []
  const pricing =
    slug === 'premium-support' ? (
      <>
        {t('addons.manage.includedIn')}{' '}
        <Link to="/setup/billing/business-details" className="text-primary hover:underline">
          {t('addons.manage.planName')}
        </Link>
      </>
    ) : meta.kind === 'free' || slug === 'payments' ? null : (
      `${eur(meta.price ?? 0)} ${t(`addons.units.${meta.unit ?? 'location'}`)}`
    )
  const options = on && (activated || !trial) ? [{ label: t('addons.disable'), danger: true, onSelect: () => setDisableOpen(true) }] : [{ label: t('addons.enable'), onSelect: () => navigate(enableHref) }, ...(on ? [{ label: t('addons.disable'), danger: true, onSelect: () => setDisableOpen(true) }] : [])]

  return (
    <div className="mx-auto w-full max-w-[1340px] px-8 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Button icon={<ArrowLeft size={16} />} className="rounded-full" onClick={() => navigate('/add-ons')}>
          {t('addons.back')}
        </Button>
        <nav aria-label={t('addons.manage.breadcrumbLabel')} className="text-body text-muted">
          <Link to="/add-ons" className="hover:text-ink hover:underline">{t('addons.manage.breadcrumb')}</Link> · <span className="text-ink">{name}</span>
        </nav>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <AddOnIcon slug={slug} size={32} className="h-[72px] w-[72px] rounded-lg" />
          <div>
            <h1 className="flex flex-wrap items-center gap-3 font-display text-title-1 text-ink">
              {name}
              {trial ? <Chip tone="info">{t('addons.onTrial')}</Chip> : on ? <Chip tone="success">{t('addons.active')}</Chip> : <Chip>{t('addons.inactive')}</Chip>}
            </h1>
            <p className="text-body-lg text-muted">{t('addons.innowebAddOn')}</p>
          </div>
        </div>
        <Menu trigger={({ open, toggle }) => <MenuButton open={open} toggle={toggle}>{t('addons.options')}</MenuButton>} groups={[{ items: options }]} />
      </div>
      <p className="mb-8 max-w-[1100px] text-body-lg text-muted">{t(`addons.taglines.${slug}`, { defaultValue: t(`addons.items.${slug}.description`) })}</p>
      {trial && !activated && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-6 py-4">
          <p className="text-body-lg text-ink">
            {t('addons.manage.trialBannerPrefix')} <strong>{t('addons.manage.days', { count: trialDays })}</strong>
          </p>
          <Button variant="primary" className="rounded-full" onClick={() => navigate(`/add-ons/add-on/${slug}/setup`)}>
            {t('addons.manage.activatePlan')}
          </Button>
        </div>
      )}
      {trial && activated && record?.trialEndsAt && (
        <div className="mb-8 flex items-center gap-3 rounded-lg bg-info-subtle px-6 py-4 text-body-lg text-ink">
          <Info size={20} className="shrink-0 text-info" aria-hidden />
          {t('addons.manage.trialActivated', { end: fmtDate(record.trialEndsAt), start: fmtDate(configString(record, 'billingStartsAt') ?? record.trialEndsAt) })}
        </div>
      )}
      {!on && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-6 py-4">
          <p className="text-body-lg text-muted">{record?.disabledAt ? t('addons.manage.disabledOn', { date: fmtDate(record.disabledAt) }) : t('addons.manage.notActive')}</p>
          <Button variant="primary" className="rounded-full" onClick={() => navigate(enableHref)}>
            {t('addons.enable')}
          </Button>
        </div>
      )}
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_420px]">
        <section aria-labelledby="included-heading">
          <h2 id="included-heading" className="mb-4 font-display text-title-2 text-ink">{t('addons.manage.included')}</h2>
          <div className="flex flex-col gap-5">
            {features.map((f, i) => {
              const Icon = icons[i]
              return (
                <article key={f.title} className="card flex flex-col p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-body-lg font-semibold text-ink">{f.title}</h3>
                      <p className="mt-2 text-body-lg text-ink">{f.body}</p>
                    </div>
                    {Icon && <Icon size={30} className="shrink-0 text-primary" aria-hidden />}
                  </div>
                  <FeatureExtra slug={slug} index={i} record={record} disabled={!on} />
                  {f.action && f.to && (
                    <Link to={f.to} className={clsx('mt-5 inline-flex h-11 items-center self-start rounded-full border border-line-strong bg-surface px-5 text-body-strong text-ink hover:bg-sunken', !on && 'pointer-events-none opacity-50')} aria-disabled={!on || undefined}>
                      {f.action}
                    </Link>
                  )}
                </article>
              )
            })}
          </div>
        </section>
        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="mb-4 font-display text-title-2 text-ink">{t('addons.manage.details')}</h2>
          <div className="card p-8">
            {pricing && (
              <div className="mb-6 border-b border-line pb-6">
                <h3 className="mb-3 text-body-lg font-semibold text-ink">{t('addons.manage.pricing')}</h3>
                <p className="text-body-lg text-ink">{pricing}</p>
                {on && record?.trialEndsAt && <p className="mt-1 text-body text-muted">{t('addons.manage.trialEnds', { date: fmtDate(record.trialEndsAt) })}</p>}
                {on && !record?.trialEndsAt && record?.enabledAt && <p className="mt-1 text-body text-muted">{t('addons.manage.enabledOn', { date: fmtDate(record.enabledAt) })}</p>}
              </div>
            )}
            <h3 className="mb-4 text-body-lg font-semibold text-ink">{t('addons.manage.helpCenter')}</h3>
            <ul className="flex flex-col gap-4">
              {help.map((h) => (
                <li key={h}>
                  <LearnMore topic={h}>
                    <span className="text-body-lg">{h}</span>
                  </LearnMore>
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <LearnMore topic={name}>
                <span className="inline-flex items-center gap-1.5 text-body-lg text-muted hover:text-ink">
                  {t('addons.manage.viewMore')} <ExternalLink size={16} aria-hidden />
                </span>
              </LearnMore>
            </div>
          </div>
        </section>
      </div>
      {disableOpen && <DisableScreen slug={slug} name={name} onClose={() => setDisableOpen(false)} />}
    </div>
  )
}

/** "Are you sure you want to disable …?" full-screen confirmation (add-ons.md §2.5, addons-51). */
function DisableScreen({ slug, name, onClose }: { slug: string; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lose = t(`addons.loseAccess.${slug}`, { returnObjects: true, defaultValue: t('addons.loseAccess.default', { returnObjects: true }) }) as string[]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const submit = async () => {
    if (!reason) return setError(t('addons.manage.selectReasonError'))
    setBusy(true)
    await disableAddOn(slug, reason)
    setBusy(false)
    toast(t('addons.manage.disabled', { name }))
    navigate('/add-ons')
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="disable-title" className="fixed inset-0 z-[80] overflow-y-auto bg-surface">
      <button type="button" className="fixed right-8 top-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface hover:bg-sunken" aria-label={t('addons.close')} onClick={onClose}>
        <X size={22} aria-hidden />
      </button>
      <div className="mx-auto flex max-w-[880px] flex-col gap-10 px-8 py-24">
        <h1 id="disable-title" className="font-display text-[44px] font-bold leading-[52px] text-ink">{t('addons.manage.disableTitle', { name })}</h1>
        <div className="card flex items-center gap-4 p-7">
          <AddOnIcon slug={slug} size={30} className="h-[70px] w-[70px] rounded-lg" />
          <div>
            <p className="text-body-lg font-semibold text-ink">{name}</p>
            <p className="text-body-lg text-muted">{t(`addons.taglines.${slug}`, { defaultValue: t(`addons.items.${slug}.description`) })}</p>
          </div>
        </div>
        <div className="card p-7">
          <p className="mb-4 text-body-lg font-semibold text-ink">{t('addons.manage.noLonger')}</p>
          <ol className="flex flex-col gap-3">
            {lose.map((l, i) => (
              <li key={l} className="flex items-center gap-3 text-body-lg text-ink">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary text-caption text-primary">{i + 1}</span>
                {l}
              </li>
            ))}
          </ol>
          <div className="my-6 border-t border-line" />
          <label htmlFor="disable-reason" className="mb-2 block text-body-lg font-semibold text-ink">
            {t('addons.manage.why')} *
          </label>
          <Select id="disable-reason" value={reason} placeholder={t('addons.manage.selectReason')} aria-invalid={Boolean(error)} className={clsx('h-14', error && 'border-danger')} onChange={(e) => { setReason(e.target.value); setError('') }} options={REASONS.map((r) => ({ value: r, label: t(`addons.manage.reasons.${r}`) }))} />
          {error && <p className="mt-1.5 text-small text-danger">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-5">
          <Button size="lg" className="h-14 rounded-full" onClick={onClose}>
            {t('addons.manage.goBack')}
          </Button>
          <Button size="lg" variant="danger" className="h-14 rounded-full" loading={busy} onClick={() => void submit()}>
            {t('addons.manage.disableNow')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Interactive bits inside feature cards (access code, chat, sync, payout accounts…). */
function FeatureExtra({ slug, index, record, disabled }: { slug: string; index: number; record: AddOnState | undefined; disabled: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const payouts = useDb((s) => s.payouts)
  const workspace = useDb((s) => s.workspace)
  const [code, setCode] = useState<string | null>(null)
  const [chat, setChat] = useState(false)
  const [busy, setBusy] = useState(false)
  if (disabled) return null

  if (slug === 'premium-support' && index === 0) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-6 text-body-lg">
        <div>
          <p className="text-ink">{t('addons.manage.supportNumber')}</p>
          <a href="tel:800319927" className="font-display text-title-3 font-semibold text-ink hover:underline">800 319 927</a>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-ink">
            {t('addons.manage.accessCode')}
            <span title={t('addons.manage.accessCodeHint')} aria-label={t('addons.manage.accessCodeHint')}><Info size={16} className="text-muted" aria-hidden /></span>
          </p>
          {code ? (
            <p className="font-display text-title-3 font-semibold tabular tracking-wider text-ink" aria-live="polite">{code}</p>
          ) : (
            <Button className="mt-1 rounded-full" onClick={() => { const n = String(Math.floor(100000 + Math.random() * 900000)); setCode(`${n.slice(0, 3)} ${n.slice(3)}`); toast(t('addons.manage.codeGenerated')) }}>
              {t('addons.manage.generate')}
            </Button>
          )}
        </div>
      </div>
    )
  }
  if (slug === 'premium-support' && index === 1) {
    return (
      <>
        <Button className="mt-5 self-start rounded-full" onClick={() => setChat(true)}>{t('addons.manage.startChat')}</Button>
        {chat && <ChatPanel onClose={() => setChat(false)} />}
      </>
    )
  }
  if (slug === 'payments' && index === 0) {
    const accounts = paymentsAccounts(record)
    const lastPayout = [...payouts].sort((a, b) => b.at.localeCompare(a.at))[0]
    const remove = async (id: string, label: string) => {
      const ok = await confirm({ title: t('addons.manage.removeAccountTitle'), body: t('addons.manage.removeAccountBody', { name: label }), confirmLabel: t('addons.manage.removeAccount'), tone: 'danger' })
      if (!ok) return
      await removePaymentsAccount(id)
      toast(t('addons.manage.accountRemoved'))
    }
    return (
      <div className="mt-5 flex flex-col gap-2">
        {lastPayout && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-sunken px-4 py-3 text-body">
            <span className="truncate">{workspace.name} · •••• {lastPayout.bankLast4}</span>
            <Chip tone="success">{t('addons.manage.verified')}</Chip>
          </div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-sunken px-4 py-3 text-body">
            <span className="truncate">{a.businessName} · •••• {a.iban.replace(/\s/g, '').slice(-4)}</span>
            <span className="flex items-center gap-2">
              <Chip tone={a.status === 'verified' ? 'success' : 'warning'}>{t(`addons.manage.${a.status}`)}</Chip>
              <button type="button" className="icon-btn h-8 w-8" aria-label={t('addons.manage.removeAccount')} onClick={() => void remove(a.id, a.businessName)}>
                <Trash2 size={16} aria-hidden />
              </button>
            </span>
          </div>
        ))}
        {!lastPayout && accounts.length === 0 && <p className="text-body text-muted">{t('addons.manage.noAccounts')}</p>}
        <Button className="mt-2 self-start rounded-full" onClick={() => navigate('/payments/onboarding/overview')}>{t('addons.manage.addAccount')}</Button>
      </div>
    )
  }
  if ((slug === 'xero' || slug === 'quickbooks') && index === 0) {
    const last = configString(record, 'lastSyncedAt')
    const org = configString(record, 'organisation')
    return (
      <div className="mt-5 flex flex-col gap-2 text-body-lg">
        {org && <p className="text-ink">{t('addons.manage.connectedTo', { org })}</p>}
        <p className="text-muted">{last ? t('addons.manage.lastSynced', { date: fmtDateTime(last) }) : t('addons.manage.neverSynced')}</p>
        <Button
          className="mt-2 self-start rounded-full"
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
  if ((slug === 'xero' || slug === 'quickbooks') && index === 1) {
    const rows = (['salesAccount', 'paymentsAccount', 'tipsAccount'] as const).map((k) => {
      const value = configString(record, k)
      return [t(`addons.accounting.${k}`), value ? ledgerLabel(t, value) : '-']
    })

    return (
      <dl className="mt-5 flex flex-col divide-y divide-line text-body-lg">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    )
  }
  if (slug === 'google-rating-boost' && index === 0) {
    const onPrompts = configBool(record, 'prompts') !== false
    return (
      <div className="mt-5 flex flex-col gap-4">
        <Switch
          checked={onPrompts}
          label={onPrompts ? t('addons.manage.reviewPrompts') : t('addons.manage.reviewPromptsOff')}
          onChange={async (v) => {
            await updateAddOnConfig(slug, { prompts: v })
            toast(v ? t('addons.manage.promptsOn') : t('addons.manage.promptsOff'))
          }}
        />
        {onPrompts && (
          <label className="flex items-center gap-3 text-body text-ink">
            {t('addons.manage.minRating')}
            <Select
              className="h-10 w-28"
              aria-label={t('addons.manage.minRating')}
              value={String(record?.config?.minRating ?? 4)}
              onChange={async (e) => {
                await updateAddOnConfig(slug, { minRating: Number(e.target.value) })
                toast(t('addons.manage.promptsUpdated'))
              }}
              options={['4', '5'].map((v) => ({ value: v, label: `${v} ★` }))}
            />
          </label>
        )}
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
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  const send = () => {
    if (!text.trim()) return
    setMessages((m) => [...m, { from: 'me', text: text.trim() }])
    setText('')
    window.setTimeout(() => setMessages((m) => [...m, { from: 'agent', text: t('addons.manage.chatReply') }]), 1200)
  }
  return (
    <div role="dialog" aria-label={t('addons.manage.chatTitle')} className="fixed bottom-4 right-4 z-50 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
      <div className="bg-gradient-to-br from-primary to-info px-5 py-4 text-on-primary">
        <div className="flex items-start justify-between">
          <span className="font-display text-title-3 font-bold">ib.</span>
          <div className="flex gap-1">
            <button type="button" className="rounded-full p-1.5 hover:bg-white/20" aria-label={t('addons.manage.minimise')} onClick={() => setMin((m) => !m)}><Minus size={16} aria-hidden /></button>
            <button type="button" className="rounded-full p-1.5 hover:bg-white/20" aria-label={t('addons.close')} onClick={onClose}><X size={16} aria-hidden /></button>
          </div>
        </div>
        <p className="mt-3 font-display text-title-3">{t('addons.manage.chatTitle')}</p>
        <div className="mt-2 flex items-center" aria-hidden>
          {['SR', 'JM', 'AP'].map((i) => <span key={i} className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-surface text-caption font-bold text-primary">{i}</span>)}
          <span className="ml-3 text-small">+5</span>
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
