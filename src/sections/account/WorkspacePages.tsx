import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { ArrowLeft, Building2, CalendarDays, CalendarPlus, Plus, Trash2 } from 'lucide-react'
import { Button, Checkbox, EmptyState, Field, LearnMore, Menu, MenuButton, Modal, PageHeader, PageSkeleton, RadioGroup, Select, Switch, TextInput, confirm, toast, usePageLoading } from '@/components/ui'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { cancelRequest, countPrefsOn, createRequest, defaultPrefs, linkCalendar, PREF_SCHEMA, saveNotificationPrefs, unlinkCalendar, usePanels, type NotificationPrefs, type PendingRequest, type PrefChannel, type PrefRowDef } from '@/api/panels'
import { fmtDate } from '@/lib/format'
import type { AppointmentStatus, User } from '@/types'
import { errorText, PendingRequestNote, SettingsCard, useMyTeamMember, usePendingRequest } from './shared'

function useMyPrefs(userId: string | undefined): NotificationPrefs {
  const stored = usePanels((s) => (userId ? s.prefs[userId] : undefined))
  return useMemo(() => stored ?? defaultPrefs(), [stored])
}

// ─── Workspaces ───────────────────────────────────────────────────────────

export function WorkspacesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const loading = usePageLoading()
  const user = useCurrentUser()
  const member = useMyTeamMember()
  const workspace = useDb((s) => s.workspace)
  const seededAt = useDb((s) => s.meta?.seededAt)
  const allRequests = usePanels((s) => s.requests)
  const pending = useMemo(() => allRequests.filter((r) => r.userId === user?.id && (r.kind === 'create_workspace' || r.kind === 'join_workspace')), [allRequests, user?.id])
  const [addMode, setAddMode] = useState<'create_workspace' | 'join_workspace' | null>(null)
  if (loading || !user) return <PageSkeleton rows={2} />

  const joined = member?.startDate ?? seededAt
  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeader
        title={t('account.workspaces.title')}
        subtitle={
          <>
            {t('account.workspaces.subtitle')} <LearnMore topic="workspaces">{t('account.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Menu
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle} primary>
                {t('account.workspaces.add')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  { label: t('account.workspaces.create'), icon: <Plus size={16} />, onSelect: () => setAddMode('create_workspace') },
                  { label: t('account.workspaces.join'), icon: <Building2 size={16} />, onSelect: () => setAddMode('join_workspace') },
                ],
              },
            ]}
          />
        }
      />
      <h2 className="mb-3 font-display text-title-3 text-ink">{t('account.workspaces.active')}</h2>
      <article className="card flex flex-wrap items-center gap-5 p-5">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/30 to-accent/40 text-primary">
          <Building2 size={28} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-title-3 text-ink">{workspace.name}</h3>
          <p className="mt-0.5 text-body text-muted">
            {t(`account.workspaces.roles.${user.role}`)}
            {joined && ` · ${t('account.workspaces.joined', { date: fmtDate(joined) })}`}
          </p>
        </div>
        <Button onClick={() => navigate(`/user-account/workspaces/${workspace.id}/settings`)}>{t('account.workspaces.manage')}</Button>
      </article>

      {pending.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-title-3 text-ink">{t('account.workspaces.pending')}</h2>
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <PendingWorkspace key={r.id} request={r} />
            ))}
          </ul>
        </>
      )}

      {addMode && <AddWorkspaceModal userId={user.id} email={user.email} mode={addMode} onClose={() => setAddMode(null)} />}
    </div>
  )
}

function PendingWorkspace({ request }: { request: PendingRequest }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const create = request.kind === 'create_workspace'
  const cancel = async () => {
    setBusy(true)
    try {
      await cancelRequest(request.id)
      toast(t('account.requests.canceled'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="card flex flex-wrap items-center gap-5 p-5">
      <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md bg-sunken text-muted">
        <Building2 size={28} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 font-display text-title-3 text-ink">
          {create ? request.detail : t('account.workspaces.joinTitle', { code: request.detail })}
          <span className="chip bg-warning-subtle text-warning">{create ? t('account.workspaces.setupPending') : t('account.workspaces.requestSent')}</span>
        </h3>
        <p className="mt-0.5 text-body text-muted">{create ? t('account.workspaces.setupPendingBody', { date: fmtDate(request.at) }) : t('account.workspaces.requestSentBody', { date: fmtDate(request.at) })}</p>
      </div>
      <Button loading={busy} onClick={cancel}>
        {t('account.requests.cancel')}
      </Button>
    </li>
  )
}

function AddWorkspaceModal({ userId, email, mode, onClose }: { userId: string; email: string; mode: 'create_workspace' | 'join_workspace'; onClose: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const create = mode === 'create_workspace'
  const submit = async () => {
    const v = value.trim()
    if (!v) return setError(t('account.info.required'))
    if (!create && !/^(https?:\/\/\S+|[A-Za-z0-9-]{6,})$/.test(v)) return setError(t('account.workspaces.codeError'))
    setBusy(true)
    try {
      await createRequest(userId, mode, { detail: v })
      toast(create ? t('account.requests.emailed', { email }) : t('account.workspaces.joinSentToast'))
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={create ? t('account.workspaces.create') : t('account.workspaces.join')}
      subtitle={create ? t('account.workspaces.createBody') : t('account.workspaces.joinBody')}
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {create ? t('account.workspaces.createAction') : t('account.workspaces.joinAction')}
          </Button>
        </>
      }
    >
      <Field label={create ? t('account.workspaces.businessName') : t('account.workspaces.invite')} error={error || undefined}>
        {(id) => (
          <TextInput
            id={id}
            autoFocus
            value={value}
            invalid={!!error}
            placeholder={create ? t('account.workspaces.businessNamePlaceholder') : t('account.workspaces.invitePlaceholder')}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        )}
      </Field>
    </Modal>
  )
}

// ─── Workspace settings ───────────────────────────────────────────────────

export function WorkspaceSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const loading = usePageLoading()
  const user = useCurrentUser()
  const member = useMyTeamMember()
  const workspace = useDb((s) => s.workspace)
  const prefs = useMyPrefs(user?.id)
  const [modal, setModal] = useState<'transfer' | 'delete' | null>(null)
  const transfer = usePendingRequest(user?.id, 'transfer_ownership')
  const deletion = usePendingRequest(user?.id, 'delete_workspace')
  const [linkOpen, setLinkOpen] = useState(false)
  const prefsOpen = params.get('d_prefs') === '1'

  const setPrefsOpen = (open: boolean) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (open) next.set('d_prefs', '1')
        else next.delete('d_prefs')
        return next
      },
      { replace: !open },
    )

  if (loading || !user) return <PageSkeleton rows={3} />

  const back = (
    <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/user-account/workspaces')}>
      {t('account.common.back')}
    </Button>
  )

  if (id !== workspace.id)
    return (
      <div className="mx-auto max-w-[1120px]">
        {back}
        <div className="card mt-6">
          <EmptyState icon={<Building2 size={24} aria-hidden />} title={t('account.settings.notFound')} body={t('account.settings.notFoundBody')} />
        </div>
      </div>
    )

  const unlink = async (calId: string, name: string) => {
    if (!member) return
    const ok = await confirm({ title: t('account.settings.linked.unlinkTitle'), body: t('account.settings.linked.unlinkBody', { name }), confirmLabel: t('account.settings.linked.unlink'), tone: 'danger' })
    if (!ok) return
    await unlinkCalendar(member.id, calId)
    toast(t('account.settings.linked.unlinked'))
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="mb-6 flex items-center gap-4">
        {back}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-body">
          <button type="button" className="text-muted hover:text-ink hover:underline" onClick={() => navigate('/user-account/workspaces')}>
            {t('account.settings.breadcrumb')}
          </button>
          <span className="text-subtle" aria-hidden>
            •
          </span>
          <span className="text-ink">{workspace.name}</span>
        </nav>
      </div>
      <PageHeader
        title={workspace.name}
        subtitle={
          <>
            {t('account.settings.subtitle')} <LearnMore topic="workspace settings">{t('account.common.learnMore')}</LearnMore>
          </>
        }
        actions={
          <Menu
            trigger={({ open, toggle }) => (
              <MenuButton open={open} toggle={toggle}>
                {t('account.settings.actions')}
              </MenuButton>
            )}
            groups={[
              {
                items: [
                  { label: t('account.settings.transfer'), disabled: user.role !== 'owner' || !!transfer, onSelect: () => setModal('transfer') },
                  { label: t('account.settings.delete'), danger: true, disabled: user.role !== 'owner' || !!deletion, onSelect: () => setModal('delete') },
                ],
              },
            ]}
          />
        }
      />
      <div className="flex flex-col gap-6">
        {transfer && <PendingRequestNote request={transfer} text={t('account.settings.transferPending', { name: transfer.detail })} />}
        {deletion && <PendingRequestNote request={deletion} text={t('account.settings.deletePending', { email: user.email })} />}
        <SettingsCard
          title={t('account.settings.linked.title')}
          body={
            <>
              {t('account.settings.linked.body')} <LearnMore topic="linked calendars">{t('account.common.learnMore')}</LearnMore>
            </>
          }
        >
          {member ? (
            <>
              {member.linkedCalendars.length > 0 && (
                <ul className="mb-4 flex flex-col divide-y divide-line rounded-md border border-line">
                  {member.linkedCalendars.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <CalendarDays size={18} className="shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-body-strong text-ink">{c.name}</span>
                          <span className="block text-small text-muted">{t('account.settings.linked.linkedOn', { date: fmtDate(c.createdAt) })}</span>
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => unlink(c.id, c.name)}>
                        {t('account.settings.linked.unlink')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button icon={<Plus size={16} />} onClick={() => setLinkOpen(true)}>
                {t('account.settings.linked.link')}
              </Button>
            </>
          ) : (
            <p className="text-body text-muted">{t('account.settings.linked.noMember')}</p>
          )}
        </SettingsCard>

        <SettingsCard title={t('account.settings.notifications.title')} action={<Button onClick={() => setPrefsOpen(true)}>{t('account.common.manage')}</Button>}>
          <p className="text-body text-ink">
            <Trans i18nKey={prefs.scope === 'all' ? 'account.settings.notifications.summaryAll' : 'account.settings.notifications.summaryMe'} values={{ count: countPrefsOn(prefs) }} components={{ b: <strong /> }} />
          </p>
        </SettingsCard>
      </div>

      {prefsOpen && <PrefsModal user={user} prefs={prefs} onClose={() => setPrefsOpen(false)} />}
      {linkOpen && member && <LinkCalendarModal user={user} memberId={member.id} onClose={() => setLinkOpen(false)} />}
      {modal === 'transfer' && <TransferModal user={user} onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteWorkspaceModal user={user} workspaceName={workspace.name} onClose={() => setModal(null)} />}
    </div>
  )
}

// ─── Transfer ownership / delete workspace (confirmed by email) ───────────

function TransferModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useTranslation()
  const users = useDb((s) => s.users)
  const candidates = users.filter((u) => u.id !== user.id && u.role !== 'none')
  const [target, setTarget] = useState(candidates[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const to = candidates.find((u) => u.id === target)
    if (!to) return
    setBusy(true)
    try {
      await createRequest(user.id, 'transfer_ownership', { targetUserId: to.id })
      toast(t('account.settings.transferSent', { name: `${to.firstName} ${to.lastName}` }))
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('account.settings.transfer')}
      subtitle={t('account.settings.transferBody')}
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!target} onClick={submit}>
            {t('account.settings.transferAction')}
          </Button>
        </>
      }
    >
      {candidates.length ? (
        <Field label={t('account.settings.newOwner')} hint={t('account.settings.newOwnerHint')}>
          {(id) => <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)} options={candidates.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} · ${u.email}` }))} />}
        </Field>
      ) : (
        <p className="text-body text-muted">{t('account.settings.noCandidates')}</p>
      )}
    </Modal>
  )
}

function DeleteWorkspaceModal({ user, workspaceName, onClose }: { user: User; workspaceName: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = typed.trim() === workspaceName
  const submit = async () => {
    setBusy(true)
    try {
      await createRequest(user.id, 'delete_workspace')
      toast(t('account.requests.emailed', { email: user.email }))
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('account.settings.deleteTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.cancel')}</Button>
          <Button variant="danger" loading={busy} disabled={!matches} onClick={submit}>
            {t('account.settings.delete')}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">{t('account.settings.deleteBody', { name: workspaceName })}</p>
      <Field className="mt-4" label={t('account.settings.typeName', { name: workspaceName })}>
        {(id) => <TextInput id={id} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />}
      </Field>
    </Modal>
  )
}

// ─── Link a calendar ──────────────────────────────────────────────────────

type Provider = 'google' | 'outlook' | 'ical'

function LinkCalendarModal({ user, memberId, onClose }: { user: User; memberId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [provider, setProvider] = useState<Provider>('google')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    let calName = `${t(`account.settings.linked.providers.${provider}`)} · ${user.email}`
    let calUrl = provider === 'google' ? `https://calendar.google.com/calendar/ical/${encodeURIComponent(user.email)}/private/basic.ics` : `https://outlook.office365.com/owa/calendar/${encodeURIComponent(user.email)}/calendar.ics`
    if (provider === 'ical') {
      if (!/^(https?|webcal):\/\/\S+\.\S+/.test(url.trim())) {
        setError(t('account.settings.linked.urlError'))
        return
      }
      calName = name.trim() || t('account.settings.linked.providers.ical')
      calUrl = url.trim()
    }
    setSaving(true)
    try {
      await linkCalendar(memberId, calName, calUrl)
      toast(t('account.settings.linked.added'))
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('account.settings.linked.modalTitle')}
      subtitle={t('account.settings.linked.modalBody')}
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.cancel')}</Button>
          <Button variant="primary" icon={<CalendarPlus size={16} />} loading={saving} onClick={submit}>
            {saving ? t('account.settings.linked.connecting') : t('account.settings.linked.connect')}
          </Button>
        </>
      }
    >
      <RadioGroup
        variant="cards"
        value={provider}
        onChange={(v) => {
          setProvider(v)
          setError('')
        }}
        options={(['google', 'outlook', 'ical'] as Provider[]).map((p) => ({ value: p, label: t(`account.settings.linked.providers.${p}`), hint: t(`account.settings.linked.providerHints.${p}`) }))}
      />
      {provider === 'ical' && (
        <div className="mt-5 flex flex-col gap-4">
          <Field label={t('account.settings.linked.name')} optional>
            {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('account.settings.linked.providers.ical')} />}
          </Field>
          <Field label={t('account.settings.linked.url')} error={error}>
            {(id) => (
              <TextInput
                id={id}
                value={url}
                invalid={!!error}
                placeholder="webcal://"
                onChange={(e) => {
                  setUrl(e.target.value)
                  setError('')
                }}
              />
            )}
          </Field>
        </div>
      )}
      {provider !== 'ical' && error && <p className="mt-3 text-small text-danger">{error}</p>}
    </Modal>
  )
}

// ─── Notification preferences (profile §5.1) ──────────────────────────────

const CHANNELS: PrefChannel[] = ['email', 'push', 'inApp']
const STATUSES: AppointmentStatus[] = ['booked', 'confirmed', 'arrived', 'started', 'completed', 'no_show', 'cancelled']

function PrefsModal({ user, prefs, onClose }: { user: User; prefs: NotificationPrefs; onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const [draft, setDraft] = useState<NotificationPrefs>(() => structuredClone(prefs))
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (fn: (d: NotificationPrefs) => NotificationPrefs) => setDraft((d) => fn(d))
  const setChannel = (row: string, channel: PrefChannel, on: boolean) => set((d) => ({ ...d, rows: { ...d.rows, [row]: { ...d.rows[row], [channel]: on } } }))

  const save = async () => {
    setSaving(true)
    try {
      await saveNotificationPrefs(user.id, draft)
      toast(t('account.prefs.saved'))
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const rowBody = (row: PrefRowDef) => {
    const vars = {
      statuses: draft.statuses.length ? draft.statuses.map((s) => t(`account.prefs.statusNames.${s}`)).join(', ') : t('account.prefs.allStatuses'),
      who: (row.edit === 'tipsScope' ? draft.tipsScope : draft.reviewsScope) === 'me' ? t('account.prefs.whoMe') : t('account.prefs.whoAnyone'),
      frequency: t(`account.prefs.frequency.${draft.lowStockFrequency}`),
    }
    return t(`account.prefs.rows.${row.key}.body`, vars)
  }

  const editor = (row: PrefRowDef) => {
    switch (row.edit) {
      case 'statuses':
        return (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STATUSES.map((s) => (
              <Checkbox
                key={s}
                label={t(`account.prefs.statusNames.${s}`)}
                checked={draft.statuses.length === 0 || draft.statuses.includes(s)}
                onChange={(on) =>
                  set((d) => {
                    const current = d.statuses.length ? d.statuses : [...STATUSES]
                    const next = on ? Array.from(new Set([...current, s])) : current.filter((x) => x !== s)
                    return { ...d, statuses: next.length === STATUSES.length ? [] : next }
                  })
                }
              />
            ))}
          </div>
        )
      case 'tipsScope':
      case 'reviewsScope': {
        const key = row.edit
        return (
          <RadioGroup
            value={draft[key]}
            onChange={(v) => set((d) => ({ ...d, [key]: v }))}
            options={[
              { value: 'anyone', label: t('account.prefs.anyone') },
              { value: 'me', label: t('account.prefs.me') },
            ]}
          />
        )
      }
      case 'lowStockFrequency':
        return <RadioGroup value={draft.lowStockFrequency} onChange={(v) => set((d) => ({ ...d, lowStockFrequency: v }))} options={(['daily', 'weekly', 'monthly'] as const).map((f) => ({ value: f, label: t(`account.prefs.frequency.${f}`) }))} />
      default:
        return null
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('account.prefs.title')}
      subtitle={
        <>
          {t('account.prefs.subtitle')} <LearnMore topic="notification preferences">{t('account.common.learnMore')}</LearnMore>
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>{t('account.common.close')}</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t('account.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-line p-5">
          <h3 className="font-display text-title-3 text-ink">{t('account.prefs.locations.title')}</h3>
          <p className="mt-0.5 text-body text-muted">{t('account.prefs.locations.body')}</p>
          <Field
            className="mt-4 max-w-sm"
            label={t('account.prefs.locations.label')}
            hint={draft.locationId === 'all' ? t('account.prefs.locations.allHint') : t('account.prefs.locations.oneHint', { name: locations.find((l) => l.id === draft.locationId)?.name ?? '' })}
          >
            {(id) => <Select id={id} value={draft.locationId} onChange={(e) => set((d) => ({ ...d, locationId: e.target.value }))} options={[{ value: 'all', label: t('account.prefs.locations.all') }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />}
          </Field>
        </section>

        {PREF_SCHEMA.map((section) => {
          const on = draft.sections[section.key]
          return (
            <section key={section.key} className="rounded-lg border border-line p-5">
              <Switch
                checked={on}
                onChange={(v) => set((d) => ({ ...d, sections: { ...d.sections, [section.key]: v } }))}
                label={
                  <span className="flex items-center gap-2 font-display text-title-3">
                    {t(`account.prefs.sections.${section.key}.title`)}
                    <span className={clsx('chip h-5 px-2 text-caption', on ? 'bg-success-subtle text-success' : 'bg-sunken text-muted')}>{on ? t('account.prefs.on') : t('account.prefs.off')}</span>
                  </span>
                }
                hint={t(`account.prefs.sections.${section.key}.body`)}
              />
              {on && (
                <div className="mt-5 flex flex-col gap-5">
                  {section.key === 'appointments' && (
                    <div>
                      <p className="mb-2 text-body-strong text-ink">{t('account.prefs.notifyMe')}</p>
                      <RadioGroup
                        value={draft.scope}
                        onChange={(v) => set((d) => ({ ...d, scope: v }))}
                        options={[
                          { value: 'all', label: t('account.prefs.scopeAll'), hint: t('account.prefs.scopeAllHint') },
                          { value: 'me', label: t('account.prefs.scopeMe'), hint: t('account.prefs.scopeMeHint') },
                        ]}
                      />
                    </div>
                  )}
                  {section.groups.map((group, gi) => (
                    <div key={group.key ?? gi}>
                      {group.key && (
                        <div className="mb-2">
                          <p className="text-body-strong text-ink">{t(`account.prefs.groups.${group.key}.title`)}</p>
                          <p className="text-small text-muted">{t(`account.prefs.groups.${group.key}.body`)}</p>
                        </div>
                      )}
                      <div className="overflow-x-auto rounded-md border border-line">
                        <table className="w-full min-w-[560px] text-left">
                          <thead>
                            <tr className="border-b border-line bg-sunken text-small text-muted">
                              <th className="px-4 py-2 font-semibold" />
                              {CHANNELS.map((c) => (
                                <th key={c} className="w-24 px-2 py-2 text-center font-semibold">
                                  {t(`account.prefs.channels.${c}`)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((row) => (
                              <tr key={row.key} className="border-b border-line last:border-0 align-top">
                                <td className="px-4 py-3">
                                  <p className="text-body text-ink">{t(`account.prefs.rows.${row.key}.title`)}</p>
                                  <p className="text-small text-muted">
                                    {rowBody(row)}
                                    {row.edit && (
                                      <>
                                        {' '}
                                        <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEditing(editing === row.key ? null : row.key)}>
                                          {editing === row.key ? t('account.prefs.done') : t('account.prefs.edit')}
                                        </button>
                                      </>
                                    )}
                                  </p>
                                  {editing === row.key && <div className="mt-3 rounded-md bg-sunken p-3">{editor(row)}</div>}
                                </td>
                                {CHANNELS.map((c) => (
                                  <td key={c} className="px-2 py-3 text-center">
                                    {row.channels.includes(c) ? (
                                      <input
                                        type="checkbox"
                                        className="h-5 w-5 cursor-pointer accent-[rgb(var(--primary))]"
                                        checked={!!draft.rows[row.key]?.[c]}
                                        onChange={(e) => setChannel(row.key, c, e.target.checked)}
                                        aria-label={`${t(`account.prefs.rows.${row.key}.title`)}: ${t(`account.prefs.channels.${c}`)}`}
                                      />
                                    ) : (
                                      <span className="text-subtle" aria-hidden>
                                        –
                                      </span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
