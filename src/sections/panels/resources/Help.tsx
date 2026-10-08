import clsx from 'clsx'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { ArrowRight, ArrowUpRight, CheckCircle2, Copy, FileUp, Headphones, LifeBuoy, Mail, MessageCircle, Paperclip, Phone, Search, Send, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDrawer } from '@/lib/drawer'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { Button, Field, Select, TextArea, TextInput, confirm, toast } from '@/components/ui'
import { createSupportTicket, endLiveChat, generateAccessCode, resetLiveChat, sendChatMessage, startLiveChat, panelsState, useChatTyping, usePanels, type ChatMessage, type SupportTicket } from '@/api/panels'
import { ApiError } from '@/api/client'
import { num } from '@/lib/format'
import { now } from '@/lib/time'
import { AgentAvatars, PanelHeader, Spinner, useTimeAgo } from '../shared'
import { ARTICLES, TOP_ARTICLES, searchArticles } from './articles'

const REASONS = ['account', 'billing', 'calendar', 'privacy', 'payments', 'technical', 'wallets', 'other'] as const
const MAX_DESCRIPTION = 10000
const MAX_FILE = 100 * 1024 * 1024

/** Help tab: home, help centre (search + articles), email form, phone support and live chat (help.md). */
export function HelpPanel({ params }: { params: URLSearchParams }) {
  const view = params.get('d_view')
  const q = params.get('d_q') ?? ''
  if (view === 'help-center') return <HelpCenter key={q} initialQuery={q} />
  if (view === 'article') return <ArticleView slug={params.get('d_article') ?? ''} />
  if (view === 'email') return <EmailSupport />
  if (view === 'phone') return <PhoneSupport />
  if (view === 'chat') return <LiveChatView />
  return <HelpHome />
}

function useArticleText() {
  const { t } = useTranslation()
  return (slug: string) => ({ title: t(`panels.articles.${slug}.title`), summary: t(`panels.articles.${slug}.summary`), body: t(`panels.articles.${slug}.body`) })
}

// ─── Home ─────────────────────────────────────────────────────────────────

function HelpHome() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const addOns = useDb((s) => s.addOns)
  const tickets = usePanels((s) => s.tickets)
  const timeAgo = useTimeAgo()
  const mine = useMemo(() => tickets.filter((x) => x.userId === user?.id), [tickets, user?.id])
  const premium = addOns.find((a) => a.slug === 'premium-support')
  const daysLeft = premium?.trialEndsAt ? Math.max(0, differenceInCalendarDays(parseISO(premium.trialEndsAt), now())) : 0

  const options = [
    { key: 'email', icon: Mail, view: 'help-center' },
    { key: 'chat', icon: Send, view: 'chat' },
    { key: 'phone', icon: Phone, view: 'phone' },
  ] as const

  return (
    <div className="px-6 pb-8 pt-6">
      <h2 className="font-display text-title-2 text-ink">{t('panels.help.greeting', { name: user?.firstName ?? '' })}</h2>
      <div className="mt-5 flex flex-col gap-2.5">
        {options.map(({ key, icon: Icon, view }) => (
          <button
            key={key}
            type="button"
            onClick={() => drawer.update({ d_view: view })}
            className="flex items-center gap-4 rounded-md bg-primary px-5 py-3.5 text-left text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Icon size={22} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-body-strong">{t(`panels.help.options.${key}.title`)}</span>
              <span className="block text-small opacity-90">{t(`panels.help.options.${key}.sub`)}</span>
            </span>
            <ArrowRight size={18} aria-hidden className="opacity-80" />
          </button>
        ))}
      </div>

      <button type="button" onClick={() => navigate('/add-ons/manage/premium-support')} className="mt-3 flex w-full items-center gap-4 overflow-hidden rounded-md bg-sunken p-5 text-left hover:bg-line/60">
        <span className="min-w-0 flex-1">
          <span className="block text-caption uppercase tracking-wide text-muted">{t('panels.help.premium.label')}</span>
          <span className="mt-1 block text-body-strong text-ink">{premium?.status === 'active' ? t('panels.help.premium.activeTitle') : premium?.status === 'trial' ? t('panels.help.premium.trialTitle') : t('panels.help.premium.inactiveTitle')}</span>
          <span className="mt-0.5 block text-small text-muted">
            {premium?.status === 'active' ? t('panels.help.premium.activeBody') : premium?.status === 'trial' ? t('panels.help.premium.trialBody', { count: daysLeft }) : t('panels.help.premium.inactiveBody')}
          </span>
        </span>
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden>
          <Headphones size={28} />
        </span>
      </button>

      {mine.length > 0 && (
        <section className="mt-8">
          <h3 className="font-display text-title-3 text-ink">{t('panels.help.requests.title')}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {mine.slice(0, 5).map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} ago={timeAgo(ticket.at)} />
            ))}
          </ul>
        </section>
      )}

      <h3 className="mt-8 font-display text-title-3 text-ink">{t('panels.help.needMore')}</h3>
      <button type="button" onClick={() => drawer.update({ d_view: 'help-center' })} className="card mt-3 flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-sunken">
        <LifeBuoy size={18} className="text-muted" aria-hidden />
        <span className="flex-1 text-body text-ink">{t('panels.help.visitCenter')}</span>
        <ArrowUpRight size={18} className="text-muted" aria-hidden />
      </button>
    </div>
  )
}

function TicketRow({ ticket, ago }: { ticket: SupportTicket; ago: string }) {
  const { t } = useTranslation()
  return (
    <li className="card flex items-center gap-3 px-4 py-3">
      <Mail size={18} className="shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong text-ink">{t(`panels.help.reasons.${ticket.reason}`)}</span>
        <span className="block text-small text-muted">
          {ticket.ref} · {ago}
        </span>
      </span>
      <span className="chip bg-info-subtle text-info">{t('panels.help.requests.open')}</span>
    </li>
  )
}

// ─── Help centre ──────────────────────────────────────────────────────────

function HelpCenter({ initialQuery }: { initialQuery: string }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const text = useArticleText()
  const [query, setQuery] = useState(initialQuery)
  const results = useMemo(() => (query.trim() ? searchArticles(query, text) : []), [query, text])
  const searching = query.trim().length > 0

  const openArticle = (slug: string) => drawer.update({ d_view: 'article', d_article: slug, d_q: query || undefined })

  return (
    <div className="pb-8">
      <PanelHeader title={t('panels.help.center.title')} subtitle={t('panels.help.center.subtitle')} onBack={() => drawer.update({ d_view: undefined, d_q: undefined })} />
      <div className="px-6">
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('panels.help.center.placeholder')}
            aria-label={t('panels.help.center.placeholder')}
            className="h-11 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-body text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>

        <h3 className="mt-6 text-body-strong text-ink">{searching ? t('panels.help.center.results', { count: results.length }) : t('panels.help.center.top')}</h3>
        {searching && results.length === 0 ? (
          <p className="mt-3 rounded-md bg-sunken p-4 text-body text-muted">{t('panels.help.center.noResults', { query })}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {(searching ? results.map((a) => a.slug) : TOP_ARTICLES).map((slug) => (
              <li key={slug}>
                <button type="button" onClick={() => openArticle(slug)} className="group w-full py-3 text-left">
                  <span className="block text-body-strong text-primary group-hover:underline">{text(slug).title}</span>
                  <span className="mt-0.5 block text-small text-muted">{text(slug).summary}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button className="mt-6 w-full" onClick={() => drawer.update({ d_view: 'email', d_q: query || undefined })}>
          {t('panels.help.center.cantFind')}
        </Button>
        {!searching && (
          <>
            <h3 className="mt-8 text-body-strong text-ink">{t('panels.help.center.all')}</h3>
            <ul className="mt-2 grid grid-cols-1 gap-1">
              {ARTICLES.filter((a) => !TOP_ARTICLES.includes(a.slug)).map((a) => (
                <li key={a.slug}>
                  <button type="button" onClick={() => openArticle(a.slug)} className="w-full rounded-sm px-2 py-1.5 text-left text-body text-ink hover:bg-sunken">
                    {text(a.slug).title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function ArticleView({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const navigate = useNavigate()
  const text = useArticleText()
  const article = ARTICLES.find((a) => a.slug === slug)
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null)
  if (!article) {
    return (
      <div>
        <PanelHeader title={t('panels.help.article.missing')} onBack={() => drawer.update({ d_view: 'help-center', d_article: undefined })} />
      </div>
    )
  }
  const { title, summary, body } = text(slug)
  const related = ARTICLES.filter((a) => a.slug !== slug && a.keywords.some((k) => article.keywords.includes(k))).slice(0, 3)

  return (
    <div className="pb-8">
      <PanelHeader title={title} subtitle={summary} onBack={() => drawer.update({ d_view: 'help-center', d_article: undefined })} />
      <div className="px-6">
        <div className="flex flex-col gap-3 text-body-lg text-ink">
          {body.split('\n\n').map((para, i) =>
            para.startsWith('- ') ? (
              <ul key={i} className="ml-5 list-disc space-y-1">
                {para.split('\n').map((line) => (
                  <li key={line}>{line.replace(/^- /, '')}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{para}</p>
            ),
          )}
        </div>
        {article.to && (
          <Button className="mt-6" variant="primary" iconRight={<ArrowRight size={16} />} onClick={() => navigate(article.to!)}>
            {t('panels.help.article.openPage')}
          </Button>
        )}

        <div className="mt-8 rounded-md bg-sunken p-4">
          {feedback ? (
            <p className="flex items-center gap-2 text-body text-ink">
              <CheckCircle2 size={18} className="text-success" aria-hidden />
              {t('panels.help.article.thanks')}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex-1 text-body-strong text-ink">{t('panels.help.article.helpful')}</span>
              {(['yes', 'no'] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  icon={v === 'yes' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                  onClick={() => {
                    setFeedback(v)
                    toast(t('panels.help.article.feedbackToast'))
                  }}
                >
                  {t(`panels.help.article.${v}`)}
                </Button>
              ))}
            </div>
          )}
          {feedback === 'no' && (
            <Button variant="link" className="mt-2" onClick={() => drawer.update({ d_view: 'email', d_article: undefined })}>
              {t('panels.help.center.cantFind')}
            </Button>
          )}
        </div>

        {related.length > 0 && (
          <>
            <h3 className="mt-8 text-body-strong text-ink">{t('panels.help.article.related')}</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {related.map((a) => (
                <li key={a.slug}>
                  <button type="button" onClick={() => drawer.update({ d_article: a.slug })} className="text-left text-body text-primary hover:underline">
                    {text(a.slug).title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Email support ────────────────────────────────────────────────────────

function EmailSupport() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const user = useCurrentUser()
  const [email, setEmail] = useState(user?.email ?? '')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<{ name: string; size: number }[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<SupportTicket | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list)
    const tooBig = next.filter((f) => f.size > MAX_FILE)
    if (tooBig.length) toast(t('panels.help.email.tooBig', { name: tooBig[0].name }), 'error')
    setFiles((prev) => [...prev, ...next.filter((f) => f.size <= MAX_FILE).map((f) => ({ name: f.name, size: f.size }))])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = t('panels.help.email.errors.email')
    if (!reason) errs.reason = t('panels.help.email.errors.reason')
    if (description.trim().length < 10) errs.description = t('panels.help.email.errors.description')
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const ticket = await createSupportTicket({ email, reason, description, files })
      setSent(ticket)
      toast(t('panels.help.email.sentToast'))
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('panels.common.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="pb-8">
        <PanelHeader title={t('panels.help.email.sentTitle')} onBack={() => drawer.update({ d_view: undefined, d_q: undefined })} />
        <div className="px-6">
          <div className="flex flex-col items-center rounded-lg bg-success-subtle px-6 py-8 text-center">
            <CheckCircle2 size={40} className="text-success" aria-hidden />
            <p className="mt-3 font-display text-title-3 text-ink">{t('panels.help.email.sentRef', { ref: sent.ref })}</p>
            <p className="mt-1 text-body text-muted">{t('panels.help.email.sentBody', { email: sent.email })}</p>
          </div>
          <Button className="mt-6 w-full" onClick={() => drawer.update({ d_view: undefined, d_q: undefined })}>
            {t('panels.help.email.backToHelp')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="pb-8" noValidate>
      <PanelHeader title={t('panels.help.email.title')} subtitle={t('panels.help.email.subtitle')} onBack={() => drawer.update({ d_view: 'help-center' })} />
      <div className="flex flex-col gap-5 px-6">
        <Field label={t('panels.help.email.email')} hint={t('panels.help.email.emailHint')} error={errors.email}>
          {(id) => <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} autoComplete="email" />}
        </Field>
        <Field label={t('panels.help.email.reason')} error={errors.reason}>
          {(id) => (
            <Select
              id={id}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('panels.help.email.pleaseSelect')}
              options={REASONS.map((r) => ({ value: r, label: t(`panels.help.reasons.${r}`) }))}
              className={clsx(errors.reason && 'border-danger')}
            />
          )}
        </Field>
        <Field label={t('panels.help.email.description')} counter={{ value: description.length, max: MAX_DESCRIPTION }} error={errors.description}>
          {(id) => <TextArea id={id} rows={6} maxLength={MAX_DESCRIPTION} value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!errors.description} />}
        </Field>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }}
          className={clsx('flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors', dragging ? 'border-primary bg-primary-subtle' : 'border-line-strong bg-sunken')}
        >
          <FileUp size={26} className="text-ink" aria-hidden />
          <p className="mt-2 font-display text-title-3 text-ink">{t('panels.help.email.addFiles')}</p>
          <p className="text-small text-muted">{t('panels.help.email.maxSize')}</p>
          <Button size="sm" className="mt-4 rounded-full" onClick={() => fileInput.current?.click()}>
            {t('panels.help.email.chooseFile')}
          </Button>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>
        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                <Paperclip size={16} className="text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-body text-ink">{f.name}</span>
                <span className="text-caption text-muted">{formatSize(f.size)}</span>
                <button type="button" className="icon-btn h-8 w-8" aria-label={t('panels.help.email.removeFile', { name: f.name })} onClick={() => setFiles((prev) => prev.filter((_, x) => x !== i))}>
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {t('panels.help.email.send')}
        </Button>
      </div>
    </form>
  )
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${num(Math.round(bytes / 1024), { useGrouping: false })} KB`
  return `${num(bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })} MB`
}

// ─── Phone support ────────────────────────────────────────────────────────

function PhoneSupport() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const access = usePanels((s) => s.accessCode)
  const [busy, setBusy] = useState(false)
  const valid = access && parseISO(access.expiresAt) > now()

  const generate = async () => {
    setBusy(true)
    try {
      await generateAccessCode()
      toast(t('panels.help.phone.generatedToast'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-8">
      <div className="px-6 pt-6">
        <button type="button" onClick={() => drawer.update({ d_view: undefined })} className="btn-secondary h-9 rounded-full px-3">
          <ArrowRight size={16} className="rotate-180" aria-hidden />
          {t('common.back')}
        </button>
      </div>
      <div className="flex flex-col items-center px-6 pt-6 text-center">
        <h2 className="font-display text-title-2 text-ink">{t('panels.help.phone.title')}</h2>
        <p className="mt-1 text-body text-muted">{t('panels.help.phone.subtitle')}</p>
        <div className="mt-6">
          <AgentAvatars names={['Ana', 'Tiago', 'Carla']} extra={6} />
        </div>
        <p className="mt-8 text-body text-ink">{t('panels.help.phone.number')}</p>
        <a href={`tel:${t('panels.help.phone.numberValue').replace(/\s/g, '')}`} className="font-display text-title-1 text-ink">
          {t('panels.help.phone.numberValue')}
        </a>
        <p className="mt-6 text-body text-ink">{t('panels.help.phone.accessCode')}</p>
        {valid ? (
          <>
            <p className="mt-1 font-display text-title-1 tracking-[0.2em] text-primary tabular">{access.code}</p>
            <p className="text-small text-muted">{t('panels.help.phone.validUntil', { time: format(parseISO(access.expiresAt), 'HH:mm') })}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                icon={<Copy size={14} />}
                onClick={() => {
                  void navigator.clipboard?.writeText(access.code).catch(() => undefined)
                  toast(t('panels.help.phone.copied'))
                }}
              >
                {t('panels.common.copy')}
              </Button>
              <Button size="sm" loading={busy} onClick={generate}>
                {t('panels.help.phone.regenerate')}
              </Button>
            </div>
          </>
        ) : (
          <Button className="mt-2 min-w-40 rounded-full" loading={busy} onClick={generate}>
            {t('panels.help.phone.generate')}
          </Button>
        )}
        <p className="mt-8 max-w-sm text-small text-muted">{t('panels.help.phone.hours')}</p>
      </div>
    </div>
  )
}

// ─── Live chat ────────────────────────────────────────────────────────────

function LiveChatView() {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const user = useCurrentUser()
  const chat = usePanels((s) => s.chat)
  const typing = useChatTyping()
  const [text, setText] = useState('')
  const [ending, setEnding] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const firstName = user?.firstName ?? ''

  useEffect(() => {
    const status = panelsState().chat.status
    if (status === 'idle' || status === 'connecting') startLiveChat(firstName)
  }, [firstName])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages.length, typing])

  const render = (m: ChatMessage) => (m.key ? t(m.key, m.vars) : (m.text ?? ''))

  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    sendChatMessage(text)
    setText('')
  }

  const end = async () => {
    if (!(await confirm({ title: t('panels.chat.endConfirm'), body: t('panels.chat.endBody'), confirmLabel: t('panels.chat.end'), tone: 'primary' }))) return
    setEnding(true)
    try {
      const transcript = chat.messages.map((m) => `[${format(parseISO(m.at), 'HH:mm')}] ${m.from === 'user' ? firstName : m.from === 'agent' ? (chat.agent ?? '') : '—'}: ${render(m)}`).join('\n')
      await endLiveChat(transcript)
      toast(t('panels.chat.endedToast'))
    } finally {
      setEnding(false)
    }
  }

  return (
    <div className="flex h-full min-h-[600px] flex-col">
      <div className="relative bg-gradient-to-br from-primary to-primary-active px-6 pb-6 pt-5 text-center text-on-primary">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => drawer.update({ d_view: undefined })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-small hover:bg-white/25">
            <ArrowRight size={14} className="rotate-180" aria-hidden />
            {t('common.back')}
          </button>
          {chat.status === 'active' && (
            <button type="button" onClick={end} disabled={ending} className="inline-flex h-9 items-center rounded-full bg-white/15 px-3 text-small hover:bg-white/25 disabled:opacity-60">
              {t('panels.chat.end')}
            </button>
          )}
        </div>
        <p className="mt-3 font-display text-title-3">{t('panels.chat.title')}</p>
        <div className="mt-3">
          <AgentAvatars names={['Ana', 'Tiago', 'Carla']} extra={5} light />
        </div>
      </div>

      {chat.status === 'connecting' || chat.status === 'idle' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center" role="status">
          <Spinner />
          <p className="text-body text-ink">
            {t('panels.chat.finding')}
            <br />
            {t('panels.chat.wait')}
          </p>
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-5" aria-live="polite">
            {chat.messages.map((m) =>
              m.from === 'system' ? (
                <p key={m.id} className="text-center text-caption text-muted">
                  {render(m)}
                </p>
              ) : (
                <div key={m.id} className={clsx('flex max-w-[85%] flex-col', m.from === 'user' ? 'self-end items-end' : 'self-start items-start')}>
                  {m.from === 'agent' && <span className="mb-0.5 text-caption text-muted">{t('panels.chat.agentLabel', { agent: chat.agent ?? '' })}</span>}
                  <div className={clsx('whitespace-pre-line rounded-lg px-3.5 py-2.5 text-body', m.from === 'user' ? 'rounded-br-xs bg-primary text-on-primary' : 'rounded-bl-xs bg-sunken text-ink')}>{render(m)}</div>
                  <span className="mt-0.5 text-[11px] text-subtle">{format(parseISO(m.at), 'HH:mm')}</span>
                </div>
              ),
            )}
            {typing && (
              <div className="self-start rounded-lg rounded-bl-xs bg-sunken px-3.5 py-2.5 text-small text-muted" aria-label={t('panels.chat.typing', { agent: chat.agent ?? '' })}>
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:240ms]" />
                </span>
              </div>
            )}
          </div>
          {chat.status === 'ended' ? (
            <div className="border-t border-line p-4">
              <Button
                variant="primary"
                className="w-full"
                icon={<MessageCircle size={16} />}
                onClick={() => {
                  resetLiveChat()
                  startLiveChat(firstName)
                }}
              >
                {t('panels.chat.newChat')}
              </Button>
            </div>
          ) : (
            <form onSubmit={send} className="flex items-center gap-2 border-t border-line p-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('panels.chat.placeholder')}
                aria-label={t('panels.chat.placeholder')}
                className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-body text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button type="submit" disabled={!text.trim()} aria-label={t('panels.chat.send')} className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40">
                <Send size={18} aria-hidden />
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
