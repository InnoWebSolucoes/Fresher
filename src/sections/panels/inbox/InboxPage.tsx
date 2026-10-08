import clsx from 'clsx'
import { isToday, parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import {
  Check,
  CheckCircle2,
  Copy,
  Globe,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Smile,
  Trash2,
  UserRound,
  UserX,
  Users,
  X,
  Zap,
  ArrowUp,
  ArrowLeft,
  CalendarPlus,
  MailOpen,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/shell/Wordmark'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { useDrawer } from '@/lib/drawer'
import { useDismiss } from '@/lib/useDismiss'
import { fullName, initialsOf } from '@/lib/format'
import { Button, EmptyState, Menu, Modal, Skeleton, confirm, toast, useIsPhone, usePageLoading } from '@/components/ui'
import {
  deleteConversationMessage,
  dismissInboxIntro,
  finishInboxTour,
  markConversationRead,
  sendConversationMessage,
  setConversationStatus,
  startConversation,
  usePanels,
} from '@/api/panels'
import { ApiError } from '@/api/client'
import type { Client, Conversation } from '@/types'
import { formatSize } from '../resources/Help'
import { useDayLabel, useTimeAgo } from '../shared'

type Filter = 'open' | 'closed'

const EMOJI = ['😀', '😊', '😍', '🥰', '😉', '😂', '🙏', '👍', '👏', '🙌', '💪', '✨', '💇‍♀️', '💅', '💆‍♀️', '💈', '🌸', '🌿', '❤️', '💜', '🎉', '📅', '⏰', '☕']
const QUICK_REPLIES = ['thanks', 'booking', 'parking', 'running', 'hours', 'review'] as const

/** Client Connect inbox (top-bar.md §5): full screen, live with the store. */
export function InboxPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id: selectedId } = useParams()
  const user = useCurrentUser()
  const loading = usePageLoading(350)
  const conversations = useDb((s) => s.conversations)
  const clients = useDb((s) => s.clients)
  const workspace = useDb((s) => s.workspace)
  const introSeen = usePanels((s) => (user ? !!s.inboxIntroSeen[user.id] : true))
  const tourDone = usePanels((s) => (user ? !!s.inboxTourDone[user.id] : true))
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [teamPromo, setTeamPromo] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const timeAgo = useTimeAgo()
  // Phones show one pane at a time: the list on /connect, the conversation on /connect/conversations/:id.
  const phone = useIsPhone()

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [conversations])
  const counts = useMemo(() => ({ open: sorted.filter((c) => c.status === 'open').length, closed: sorted.filter((c) => c.status === 'closed').length }), [sorted])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter((c) => {
      if (c.status !== filter) return false
      if (!q) return true
      const client = clientById.get(c.clientId)
      return fullName(client, '').toLowerCase().includes(q) || c.messages.some((m) => m.text.toLowerCase().includes(q))
    })
  }, [sorted, filter, query, clientById])
  const selected = conversations.find((c) => c.id === selectedId)

  // /connect with nothing selected: open the newest conversation in the list (side by side only; phones show the list).
  useEffect(() => {
    if (!phone && !selectedId && !teamPromo && visible[0]) navigate(`/connect/conversations/${visible[0].id}`, { replace: true })
  }, [phone, selectedId, visible, navigate, teamPromo])

  // Viewing a conversation marks it read, including messages that arrive while it's open.
  useEffect(() => {
    if (selected?.unread) void markConversationRead(selected.id)
  }, [selected?.id, selected?.unread])

  const select = (c: Conversation) => {
    setTeamPromo(false)
    navigate(`/connect/conversations/${c.id}`)
  }

  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))
  const showTour = introSeen && !tourDone && !loading && !teamPromo
  // Phones: a conversation is open (full width, with a back button) instead of the list.
  const threadView = Boolean(selectedId) && !teamPromo
  const navButton = (team: boolean, size: 'sm' | 'lg') => (
    <button
      type="button"
      aria-current={teamPromo === team ? 'page' : undefined}
      title={t(team ? 'panels.inbox.teamConnect' : 'panels.inbox.clientConnect')}
      aria-label={t(team ? 'panels.inbox.teamConnect' : 'panels.inbox.clientConnect')}
      onClick={() => setTeamPromo(team)}
      className={clsx('relative flex shrink-0 items-center justify-center rounded-md text-white', size === 'lg' ? 'h-12 w-12' : 'h-10 w-10', teamPromo === team ? 'bg-primary' : 'bg-white/10 hover:bg-white/20')}
    >
      {team ? <Users size={size === 'lg' ? 22 : 20} aria-hidden /> : <MessageCircle size={size === 'lg' ? 22 : 20} aria-hidden />}
      {team && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-on-accent">{t('panels.inbox.new')}</span>}
    </button>
  )

  return (
    <div className="flex h-full flex-col bg-rail">
      {/* Phones: brand, settings and close on top; search with the Client / Team Connect switch on a second row (list only). */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-3 px-3 py-3 text-white md:h-16 md:flex-nowrap md:gap-4 md:px-5 md:py-0">
        <div className="flex items-center gap-3 max-md:min-w-0 max-md:[&>span>span]:hidden">
          <Wordmark inverted />
          <span className="flex items-center gap-1.5 text-body-lg">
            <MessageCircle size={18} aria-hidden />
            {t('panels.inbox.connect')}
          </span>
        </div>
        <span className="flex-1 md:hidden" />
        <div className={clsx('order-last w-full items-center gap-2 md:order-none md:mx-auto md:flex md:max-w-md', threadView ? 'hidden' : 'flex')}>
          <label className="relative block w-full min-w-0 max-md:flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/60" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('panels.inbox.search')}
            aria-label={t('panels.inbox.search')}
            className="h-10 w-full rounded-full border border-white/20 bg-white/5 pl-10 pr-4 text-body text-white placeholder:text-white/50 focus:border-white/50 focus:outline-none"
          />
          </label>
          <div className="flex gap-2 md:hidden">
            {navButton(false, 'sm')}
            {navButton(true, 'sm')}
          </div>
        </div>
        <Menu
          width={260}
          label={t('panels.inbox.settings')}
          trigger={({ open, toggle }) => (
            <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('panels.inbox.settings')} title={t('panels.inbox.settings')} onClick={toggle} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 hover:bg-white/10">
              <Settings size={18} aria-hidden />
            </button>
          )}
          groups={[
            { items: [{ label: t('panels.inbox.contactPage'), icon: <Globe size={16} />, onSelect: () => setContactOpen(true) }] },
            {
              items: [
                { label: t('panels.inbox.messagingSettings'), onSelect: () => navigate('/setup/clients/messages') },
                { label: t('panels.inbox.notificationSettings'), onSelect: () => navigate(`/user-account/workspaces/${workspace.id}/settings?d_prefs=1`) },
              ],
            },
          ]}
        />
        <button type="button" onClick={close} aria-label={t('common.close')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 text-body-strong hover:bg-white/10 md:w-auto md:px-4">
          <X size={18} className="md:hidden" aria-hidden />
          <span className="hidden md:inline">{t('common.close')}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-[76px] shrink-0 flex-col items-center gap-3 pt-3 md:flex" aria-label={t('panels.inbox.connect')}>
          {navButton(false, 'lg')}
          {navButton(true, 'lg')}
        </nav>

        <div className="flex min-w-0 flex-1 overflow-hidden rounded-t-xl bg-surface md:rounded-tr-none">
          {teamPromo ? (
            <TeamConnectPromo />
          ) : (
            <>
              <aside className={clsx('w-full shrink-0 flex-col border-line md:flex md:w-[360px] md:border-r', threadView ? 'hidden' : 'flex')}>
                <div className="flex items-center justify-between px-4 pb-3 pt-4 md:px-5 md:pt-5">
                  <h1 className="font-display text-title-3 text-ink">{t('panels.inbox.clientMessages')}</h1>
                  <button type="button" className="icon-btn rounded-full" aria-label={t('panels.inbox.newMessage')} title={t('panels.inbox.newMessage')} onClick={() => setNewOpen(true)}>
                    <Plus size={20} aria-hidden />
                  </button>
                </div>
                <div className="flex gap-2 px-4 pb-3 md:px-5" role="tablist">
                  {(['open', 'closed'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={filter === f}
                      onClick={() => setFilter(f)}
                      className={clsx('inline-flex h-9 items-center gap-2 rounded-full px-4 text-body ring-1 transition-colors', filter === f ? 'text-ink ring-2 ring-primary' : 'text-ink ring-line-strong hover:bg-sunken')}
                    >
                      {t(`panels.inbox.filters.${f}`)}
                      {counts[f] > 0 && <span className="rounded-full bg-sunken px-1.5 text-caption text-muted">{counts[f]}</span>}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 md:px-3">
                  {loading ? (
                    <div className="flex flex-col gap-2 px-2" aria-busy="true">
                      {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-[68px] w-full" />
                      ))}
                    </div>
                  ) : visible.length === 0 ? (
                    <EmptyState
                      icon={<MessageCircle size={24} />}
                      title={query ? t('panels.inbox.noMatches') : t(`panels.inbox.empty.${filter}.title`)}
                      body={query ? t('panels.inbox.noMatchesBody', { query }) : t(`panels.inbox.empty.${filter}.body`)}
                      action={
                        <Button size="sm" onClick={() => (query ? setQuery('') : setNewOpen(true))}>
                          {query ? t('panels.inbox.clearSearch') : t('panels.inbox.newMessage')}
                        </Button>
                      }
                    />
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {visible.map((c) => {
                        const client = clientById.get(c.clientId)
                        const last = c.messages[c.messages.length - 1]
                        const active = c.id === selectedId
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => select(c)}
                              aria-current={active ? 'true' : undefined}
                              className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors', active ? 'bg-primary text-on-primary' : 'hover:bg-sunken')}
                            >
                              <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-small font-semibold', active ? 'bg-surface text-primary' : 'bg-primary-subtle text-primary')} aria-hidden>
                                {initialsOf(client)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline justify-between gap-2">
                                  <span className={clsx('truncate', c.unread ? 'font-bold' : 'font-semibold')}>{fullName(client, t('panels.inbox.unknownClient'))}</span>
                                  <span className={clsx('shrink-0 text-caption', active ? 'text-on-primary/80' : 'text-muted')}>{last ? (isToday(parseISO(last.at)) ? timeAgo(last.at) : format(parseISO(last.at), 'd MMM')) : ''}</span>
                                </span>
                                <span className="flex items-center gap-2">
                                  <span className={clsx('truncate text-small', active ? 'text-on-primary/90' : c.unread ? 'text-ink' : 'text-muted')}>
                                    {last ? `${last.from === 'business' ? `${t('panels.inbox.you')}: ` : ''}${last.text}` : ''}
                                  </span>
                                  {c.unread && !active && <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label={t('panels.common.unread')} />}
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </aside>
              <section className={clsx('relative min-w-0 flex-1 flex-col md:flex', threadView ? 'flex' : 'hidden')}>
                {loading ? (
                  <div className="flex flex-1 flex-col gap-4 p-6" aria-busy="true">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="mt-auto h-16 w-80 max-w-full" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                ) : selected ? (
                  <Thread key={selected.id} conversation={selected} client={clientById.get(selected.clientId)} />
                ) : (
                  <EmptyState
                    className="m-auto"
                    icon={<MessageCircle size={24} />}
                    title={t('panels.inbox.noneSelected')}
                    body={t('panels.inbox.noneSelectedBody')}
                    action={
                      <Button variant="primary" onClick={() => setNewOpen(true)}>
                        {t('panels.inbox.newMessage')}
                      </Button>
                    }
                  />
                )}
                {showTour && user && <Tour step={tourStep} setStep={setTourStep} onDone={() => finishInboxTour(user.id)} />}
              </section>
            </>
          )}
        </div>
      </div>

      {user && !introSeen && <IntroModal onClose={() => dismissInboxIntro(user.id)} />}
      <NewMessageModal open={newOpen} onClose={() => setNewOpen(false)} onStarted={(id) => navigate(`/connect/conversations/${id}`)} />
      <ContactPageModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  )
}

// ─── Thread ───────────────────────────────────────────────────────────────

function Thread({ conversation, client }: { conversation: Conversation; client: Client | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  const dayLabel = useDayLabel()
  const settings = useDb((s) => s.settings.clientConnect)
  const workspaceName = useDb((s) => s.workspace.name)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<{ name: string; size: number; uploading: boolean }[]>([])
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [popover, setPopover] = useState<'emoji' | 'quick' | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const name = fullName(client, t('panels.inbox.unknownClient'))
  const hasContact = !!(client && (client.phone || client.email))
  const closed = conversation.status === 'closed'
  useDismiss([popRef], popover !== null, () => setPopover(null))

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conversation.messages.length])

  const days = useMemo(() => {
    const groups: { day: string; label: string; messages: Conversation['messages'] }[] = []
    conversation.messages.forEach((m) => {
      const day = format(parseISO(m.at), 'yyyy-MM-dd')
      let g = groups[groups.length - 1]
      if (!g || g.day !== day) {
        g = { day, label: dayLabel(m.at, format(parseISO(m.at), 'EEE, d MMM yyyy')), messages: [] }
        groups.push(g)
      }
      g.messages.push(m)
    })
    return groups
  }, [conversation.messages, dayLabel])

  const insert = (value: string) => {
    const el = textRef.current
    if (!el) return setText((x) => x + value)
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    const next = text.slice(0, start) + value + text.slice(end)
    setText(next)
    window.requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + value.length, start + value.length)
    })
  }

  const attach = (list: FileList | null) => {
    if (!list?.length) return
    if (!settings.attachments) {
      toast(t('panels.inbox.attachmentsOff'), 'error')
      return
    }
    const added = Array.from(list).map((f) => ({ name: f.name, size: f.size, uploading: true }))
    setFiles((prev) => [...prev, ...added])
    window.setTimeout(() => setFiles((prev) => prev.map((f) => (added.some((a) => a.name === f.name) ? { ...f, uploading: false } : f))), 700)
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const ready = files.filter((f) => !f.uploading)
    const body = [text.trim(), ...ready.map((f) => `📎 ${f.name} (${formatSize(f.size)})`)].filter(Boolean).join('\n')
    if (!body || sending) return
    setSending(true)
    try {
      await sendConversationMessage(conversation.id, body)
      setText('')
      setFiles([])
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('panels.common.error'), 'error')
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const setStatus = async (status: 'open' | 'closed') => {
    setBusy(true)
    try {
      await setConversationStatus(conversation.id, status)
      toast(t(status === 'closed' ? 'panels.inbox.closedToast' : 'panels.inbox.reopenedToast'))
    } finally {
      setBusy(false)
    }
  }

  const removeMessage = async (messageId: string) => {
    if (!(await confirm({ title: t('panels.inbox.deleteTitle'), body: t('panels.inbox.deleteBody'), confirmLabel: t('panels.inbox.delete') }))) return
    await deleteConversationMessage(conversation.id, messageId)
    toast(t('panels.inbox.deletedToast'))
  }

  const canSend = hasContact && (text.trim().length > 0 || files.some((f) => !f.uploading))

  return (
    <>
      <div className="flex min-h-16 shrink-0 items-center gap-2 border-b border-line px-2 py-2 md:h-[72px] md:gap-3 md:px-6 md:py-0">
        <button type="button" onClick={() => navigate('/connect')} aria-label={t('common.back')} title={t('common.back')} className="icon-btn shrink-0 md:hidden">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <button type="button" onClick={() => client && drawer.open('client', { id: client.id })} className="flex min-w-0 items-center gap-3 rounded-md text-left hover:opacity-80" title={t('panels.inbox.viewProfile')}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-small font-semibold text-primary" aria-hidden>
            {initialsOf(client)}
          </span>
          <span className="min-w-0">
            <span className="block break-words font-display text-body-lg font-semibold text-ink md:truncate md:text-title-3">{name}</span>
            <span className="block truncate text-small text-muted">{client?.phone || client?.email || t('panels.inbox.noContact')}</span>
          </span>
        </button>
        {closed && <span className="chip hidden bg-sunken text-muted md:inline-flex">{t('panels.inbox.closedChip')}</span>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Menu
            label={t('panels.inbox.options')}
            width={260}
            trigger={({ open, toggle }) => (
              <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t('panels.inbox.options')} title={t('panels.inbox.options')} onClick={toggle} className="icon-btn rounded-full border border-line">
                <MoreVertical size={18} aria-hidden />
              </button>
            )}
            groups={[
              {
                items: [
                  { label: t('panels.inbox.viewProfile'), icon: <UserRound size={16} />, disabled: !client, onSelect: () => client && drawer.open('client', { id: client.id }) },
                  { label: t('panels.inbox.bookAppointment'), icon: <CalendarPlus size={16} />, disabled: !client, onSelect: () => client && drawer.open('new-appointment', { d_client: client.id }) },
                  {
                    label: t('panels.inbox.markUnread'),
                    icon: <MailOpen size={16} />,
                    onSelect: async () => {
                      navigate('/connect', { replace: true })
                      await markConversationRead(conversation.id, true)
                      toast(t('panels.inbox.markedUnread'))
                    },
                  },
                ],
              },
              {
                items: [
                  closed
                    ? { label: t('panels.inbox.reopen'), icon: <RotateCcw size={16} />, onSelect: () => setStatus('open') }
                    : { label: t('panels.inbox.closeConversation'), icon: <CheckCircle2 size={16} />, onSelect: () => setStatus('closed') },
                ],
              },
            ]}
          />
          {closed ? (
            <Button size="sm" icon={<RotateCcw size={16} />} loading={busy} onClick={() => setStatus('open')}>
              {t('panels.inbox.reopen')}
            </Button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setStatus('closed')} aria-label={t('panels.inbox.closeConversation')} title={t('panels.inbox.closeConversation')} className="icon-btn rounded-full border border-line disabled:opacity-50">
              <Check size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6" aria-live="polite">
        {days.map((g) => (
          <div key={g.day}>
            <div className="my-4 flex items-center gap-3" role="separator">
              <span className="h-px flex-1 bg-line" />
              <span className="text-body-strong text-ink">{g.label}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="flex flex-col gap-3">
              {g.messages.map((m) => {
                const mine = m.from === 'business'
                return (
                  <div key={m.id} className={clsx('group flex max-w-[88%] flex-col md:max-w-[70%]', mine ? 'items-end self-end' : 'items-start self-start')}>
                    <span className="mb-1 text-small text-muted">{mine ? (m.by ?? workspaceName) : name}</span>
                    <div className="flex items-start gap-1">
                      {mine && <MessageMenu text={m.text} onDelete={() => removeMessage(m.id)} />}
                      <div className={clsx('rounded-lg px-4 py-2.5', mine ? 'rounded-br-xs bg-primary text-on-primary' : 'rounded-bl-xs bg-sunken text-ink')}>
                        <p className="whitespace-pre-line break-words text-body-lg">{m.text}</p>
                        <p className={clsx('mt-1 text-right text-caption', mine ? 'text-on-primary/75' : 'text-muted')}>{format(parseISO(m.at), 'HH:mm')}</p>
                      </div>
                      {!mine && <MessageMenu text={m.text} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="shrink-0 px-3 pb-3 md:px-6 md:pb-6">
        {!hasContact && (
          <div className="flex items-center gap-3 rounded-t-lg bg-danger px-4 py-2.5 text-small font-semibold text-white">
            <UserX size={16} aria-hidden />
            <span className="flex-1">{t('panels.inbox.contactRequired')}</span>
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => client && navigate(`/clients/list/${client.id}/edit`)}>
              {t('panels.inbox.addDetails')}
            </button>
          </div>
        )}
        <div className={clsx('relative border border-line-strong bg-sunken px-4 pt-3 focus-within:border-primary', hasContact ? 'rounded-lg' : 'rounded-b-lg')}>
          {closed && <p className="mb-2 text-small text-muted">{t('panels.inbox.closedHint')}</p>}
          {files.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="chip gap-1.5 bg-surface text-ink ring-1 ring-line">
                  <Paperclip size={12} aria-hidden />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <span className="text-muted">{f.uploading ? t('panels.inbox.uploading') : formatSize(f.size)}</span>
                  <button type="button" aria-label={t('panels.inbox.removeAttachment', { name: f.name })} onClick={() => setFiles((prev) => prev.filter((_, x) => x !== i))}>
                    <X size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={textRef}
            value={text}
            disabled={!hasContact}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={t('panels.inbox.typeMessage')}
            aria-label={t('panels.inbox.typeMessage')}
            className="block max-h-40 w-full resize-none bg-transparent text-body-lg text-ink outline-none placeholder:text-subtle disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-1 py-2" ref={popRef}>
            <button type="button" disabled={!hasContact} className="icon-btn h-9 w-9 disabled:opacity-40" aria-label={t('panels.inbox.attach')} title={t('panels.inbox.attach')} onClick={() => fileRef.current?.click()}>
              <Plus size={18} aria-hidden />
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => attach(e.target.files)} />
            <button type="button" disabled={!hasContact} className="icon-btn h-9 w-9 disabled:opacity-40" aria-label={t('panels.inbox.emoji')} title={t('panels.inbox.emoji')} aria-expanded={popover === 'emoji'} onClick={() => setPopover((p) => (p === 'emoji' ? null : 'emoji'))}>
              <Smile size={18} aria-hidden />
            </button>
            <button type="button" disabled={!hasContact} className="icon-btn h-9 w-9 disabled:opacity-40" aria-label={t('panels.inbox.quickReplies')} title={t('panels.inbox.quickReplies')} aria-expanded={popover === 'quick'} onClick={() => setPopover((p) => (p === 'quick' ? null : 'quick'))}>
              <Zap size={18} aria-hidden />
            </button>
            <span className="ml-auto mr-2 hidden text-caption text-subtle md:inline">{t('panels.inbox.enterHint')}</span>
            <button type="submit" disabled={!canSend || sending} aria-label={t('panels.inbox.send')} title={t('panels.inbox.send')} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity disabled:opacity-40 max-md:ml-auto">
              <ArrowUp size={18} aria-hidden />
            </button>

            {popover === 'emoji' && (
              <div className="absolute bottom-14 left-2 z-20 grid w-[280px] grid-cols-8 gap-1 rounded-lg border border-line bg-raised p-2 shadow-md md:left-12" role="dialog" aria-label={t('panels.inbox.emoji')}>
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-sm text-[18px] hover:bg-sunken"
                    onClick={() => {
                      insert(e)
                      setPopover(null)
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {popover === 'quick' && (
              <div className="absolute bottom-14 left-2 right-2 z-20 rounded-lg border border-line bg-raised p-2 shadow-md md:left-20 md:right-auto md:w-[360px]" role="dialog" aria-label={t('panels.inbox.quickReplies')}>
                <p className="px-2 pb-1 pt-1 text-caption uppercase tracking-wide text-muted">{t('panels.inbox.quickReplies')}</p>
                {QUICK_REPLIES.map((k) => {
                  const value = t(`panels.inbox.quick.${k}.text`, { name: client?.firstName ?? '', business: workspaceName })
                  return (
                    <button
                      key={k}
                      type="button"
                      className="block w-full rounded-md px-2 py-2 text-left hover:bg-sunken"
                      onClick={() => {
                        insert(value)
                        setPopover(null)
                      }}
                    >
                      <span className="block text-body-strong text-ink">{t(`panels.inbox.quick.${k}.title`)}</span>
                      <span className="block truncate text-small text-muted">{value}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </form>
    </>
  )
}

function MessageMenu({ text, onDelete }: { text: string; onDelete?: () => void }) {
  const { t } = useTranslation()
  return (
    <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <Menu
        label={t('panels.inbox.messageOptions')}
        width={200}
        align={onDelete ? 'right' : 'left'}
        groups={[
          {
            items: [
              {
                label: t('panels.inbox.copyText'),
                icon: <Copy size={16} />,
                onSelect: () => {
                  void navigator.clipboard?.writeText(text).catch(() => undefined)
                  toast(t('panels.inbox.copied'))
                },
              },
              ...(onDelete ? [{ label: t('panels.inbox.delete'), icon: <Trash2 size={16} />, danger: true, onSelect: onDelete }] : []),
            ],
          },
        ]}
      />
    </span>
  )
}

// ─── Modals, tour, promo ──────────────────────────────────────────────────

function IntroModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const drawer = useDrawer()
  const conversations = useDb((s) => s.conversations)
  const clients = useDb((s) => s.clients)
  const previews = conversations.slice(0, 2).map((c) => ({ id: c.id, name: fullName(clients.find((x) => x.id === c.clientId)), text: c.messages[c.messages.length - 1]?.text ?? '' }))

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex overflow-y-auto bg-surface" role="dialog" aria-modal="true" aria-labelledby="inbox-intro-title">
      <button type="button" onClick={onClose} aria-label={t('common.close')} className="icon-btn absolute right-3 top-3 z-10 rounded-full md:right-6 md:top-6">
        <X size={22} aria-hidden />
      </button>
      <div className="grid w-full items-center gap-10 px-5 py-14 md:px-8 md:py-16 lg:grid-cols-2 lg:px-24">
        <div className="max-w-xl">
          <p className="text-body-strong uppercase tracking-wide text-primary">{t('panels.inbox.intro.badge')}</p>
          <h2 id="inbox-intro-title" className="mt-3 font-display text-[30px] font-bold leading-[38px] text-ink md:text-[42px] md:leading-[50px]">
            {t('panels.inbox.intro.title')}
          </h2>
          <p className="mt-4 text-body-lg text-ink">{t('panels.inbox.intro.body')}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {(['one', 'two', 'three'] as const).map((k) => (
              <li key={k} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                {t(`panels.inbox.intro.bullets.${k}`)}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button variant="primary" size="lg" className="rounded-full" onClick={onClose}>
              {t('panels.inbox.intro.go')}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                onClose()
                drawer.open('resources', { tab: 'help', d_view: 'article', d_article: 'client-connect' })
              }}
            >
              {t('common.learnMore')}
            </Button>
          </div>
        </div>
        <div className="hidden justify-center lg:flex" aria-hidden>
          <div className="relative h-[560px] w-[290px] rounded-[44px] border-[10px] border-ink bg-gradient-to-br from-primary via-[#1F8C84] to-[#0B3B37] p-4 shadow-lg">
            <p className="mt-10 text-center font-display text-[64px] font-bold text-white/90">9:41</p>
            <div className="absolute inset-x-4 bottom-20 flex flex-col gap-2">
              {previews.map((p) => (
                <div key={p.id} className="rounded-lg bg-white/85 px-3 py-2 shadow-sm">
                  <p className="flex items-center justify-between text-caption font-semibold text-ink">
                    {p.name}
                    <span className="text-muted">9:41</span>
                  </p>
                  <p className="truncate text-caption text-muted">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tour({ step, setStep, onDone }: { step: number; setStep: (n: number) => void; onDone: () => void }) {
  const { t } = useTranslation()
  const steps = ['contactPage', 'settings', 'quickReplies'] as const
  return (
    <div className="absolute left-3 right-3 top-20 z-10 rounded-lg bg-primary p-5 text-on-primary shadow-lg md:left-auto md:right-6 md:w-[380px]" role="dialog" aria-label={t('panels.inbox.tour.label')}>
      <p className="text-small font-semibold opacity-90">{t('panels.inbox.tour.step', { current: step + 1, total: steps.length })}</p>
      <p className="mt-1 text-body-lg font-semibold">{t(`panels.inbox.tour.${steps[step]}`)}</p>
      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={onDone} className="text-body-strong hover:underline">
          {t('common.close')}
        </button>
        <span className="flex-1" />
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="h-9 rounded-full px-3 text-body-strong hover:bg-white/10">
            {t('common.back')}
          </button>
        )}
        <button type="button" onClick={() => (step === steps.length - 1 ? onDone() : setStep(step + 1))} className="h-9 rounded-full bg-surface px-4 text-body-strong text-primary">
          {step === steps.length - 1 ? t('panels.inbox.tour.done') : t('panels.inbox.tour.next')}
        </button>
      </div>
    </div>
  )
}

function TeamConnectPromo() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const drawer = useDrawer()
  return (
    <div className="m-auto max-w-lg px-5 py-10 text-center md:px-6 md:py-12">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary-subtle text-primary" aria-hidden>
        <Users size={30} />
      </span>
      <h1 className="mt-5 font-display text-title-2 text-ink md:text-title-1">{t('panels.inbox.team.title')}</h1>
      <p className="mt-2 text-body-lg text-muted">{t('panels.inbox.team.body')}</p>
      <ul className="mx-auto mt-6 flex max-w-sm flex-col gap-2 text-left">
        {(['one', 'two', 'three'] as const).map((k) => (
          <li key={k} className="flex items-start gap-3 text-body text-ink">
            <Check size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            {t(`panels.inbox.team.bullets.${k}`)}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={() => navigate('/add-ons/add-on/team-chat/intro')}>
          {t('panels.inbox.team.cta')}
        </Button>
        <Button onClick={() => drawer.open('resources', { tab: 'help', d_view: 'help-center', d_q: 'Team Connect' })}>{t('common.learnMore')}</Button>
      </div>
    </div>
  )
}

function NewMessageModal({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (id: string) => void }) {
  const { t } = useTranslation()
  const clients = useDb((s) => s.clients)
  const [query, setQuery] = useState('')
  const [client, setClient] = useState<Client | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = clients.filter((c) => !c.deletedAt && !c.blocked)
    if (!q) return list.slice(0, 8)
    return list.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))).slice(0, 8)
  }, [clients, query])

  const reset = () => {
    setQuery('')
    setClient(null)
    setText('')
    setError('')
  }

  const submit = async () => {
    if (!client) return setError(t('panels.inbox.newModal.pickClient'))
    if (!text.trim()) return setError(t('panels.inbox.newModal.typeFirst'))
    setBusy(true)
    try {
      const id = await startConversation(client.id, text)
      toast(t('panels.inbox.sentToast', { name: fullName(client) }))
      reset()
      onClose()
      onStarted(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('panels.common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={t('panels.inbox.newMessage')}
      subtitle={t('panels.inbox.newModal.subtitle')}
      footer={
        client ? (
          <>
            <Button onClick={() => setClient(null)}>{t('common.back')}</Button>
            <Button variant="primary" loading={busy} onClick={submit}>
              {t('panels.inbox.send')}
            </Button>
          </>
        ) : undefined
      }
    >
      {client ? (
        <div className="flex flex-col gap-4 pb-3">
          <div className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-small font-semibold text-primary" aria-hidden>
              {initialsOf(client)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-strong text-ink">{fullName(client)}</span>
              <span className="block text-small text-muted">{client.phone || client.email}</span>
            </span>
          </div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={t('panels.inbox.typeMessage')}
            aria-label={t('panels.inbox.typeMessage')}
            className="w-full rounded-sm border border-line-strong bg-surface px-3 py-2.5 text-body text-ink placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-small text-danger">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-3">
          <label className="relative block">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('panels.inbox.newModal.search')} aria-label={t('panels.inbox.newModal.search')} className="input pl-10" />
          </label>
          {matches.length === 0 ? (
            <p className="rounded-md bg-sunken p-4 text-body text-muted">{t('panels.inbox.newModal.noClients')}</p>
          ) : (
            <ul className="flex flex-col">
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setClient(c)
                      setError('')
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-sunken"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-small font-semibold text-primary" aria-hidden>
                      {initialsOf(c)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong text-ink">{fullName(c)}</span>
                      <span className="block truncate text-small text-muted">{c.email || c.phone}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

function ContactPageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const workspace = useDb((s) => s.workspace)
  const enabled = useDb((s) => s.settings.clientConnect.contactPage)
  const slug = workspace.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const link = `https://innoweb.app/contact/${slug}`
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('panels.inbox.contactPage')}
      subtitle={t('panels.inbox.contactModal.subtitle')}
      footer={
        <>
          <Button onClick={() => navigate('/setup/clients/messages')}>{t('panels.inbox.messagingSettings')}</Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-3">
        <span className={clsx('chip self-start', enabled ? 'bg-success-subtle text-success' : 'bg-sunken text-muted')}>{enabled ? t('panels.inbox.contactModal.on') : t('panels.inbox.contactModal.off')}</span>
        <div className="flex items-center gap-2 rounded-md border border-line-strong bg-sunken px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-body text-ink">{link}</span>
          <Button
            size="sm"
            icon={<Copy size={14} />}
            onClick={() => {
              void navigator.clipboard?.writeText(link).catch(() => undefined)
              toast(t('panels.inbox.contactModal.copied'))
            }}
          >
            {t('panels.common.copy')}
          </Button>
        </div>
        <p className="text-small text-muted">{t('panels.inbox.contactModal.body')}</p>
      </div>
    </Modal>
  )
}
