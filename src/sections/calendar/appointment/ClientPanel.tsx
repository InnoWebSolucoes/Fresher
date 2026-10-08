import clsx from 'clsx'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { AlertTriangle, Cake, ChevronDown, FlaskConical, Phone, PersonStanding, Plus, Search, UserPlus, UserRound, VenusAndMars, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Field, Modal, Select, TextArea, TextInput, confirm, toast } from '@/components/ui'
import { crud } from '@/api/client'
import { messageClient } from '@/api/calendar'
import { useDb } from '@/store/db'
import { fullName } from '@/lib/format'
import { uid } from '@/lib/ids'
import { now, nowISO, toISODate } from '@/lib/time'
import type { Client, ID, MessageLog } from '@/types'
import { ClientAvatar, DropMenu } from '../ui'

/** Pronoun values are stored in English (data); these keys show them translated. */
const PRONOUN_KEYS: Record<string, string> = { 'She/Her': 'team.pronouns.she', 'He/Him': 'team.pronouns.he', 'They/Them': 'team.pronouns.they', 'Prefer not to say': 'team.pronouns.undisclosed' }

interface ClientPanelProps {
  clientId: ID | null
  walkIn: boolean
  readOnly?: boolean
  onChange: (clientId: ID | null, walkIn: boolean) => void
  /** Open the client drawer on top of this one. */
  onViewProfile: (clientId: ID) => void
  /** Leave for a full page (e.g. edit client details), keeping the appointment to come back to. */
  onLeaveTo: (path: string) => void
}

/** Left column of the appointment drawer: client picker and client details (calendar.md §7.1). */
export function ClientPanel({ clientId, walkIn, readOnly, onChange, onViewProfile, onLeaveTo }: ClientPanelProps) {
  const { t } = useTranslation()
  const client = useDb((s) => (clientId ? s.clients.find((c) => c.id === clientId) : undefined))
  const [searching, setSearching] = useState(false)

  if (searching && !readOnly) {
    return (
      <ClientSearch
        onCancel={() => setSearching(false)}
        onPick={(id, isWalkIn) => {
          setSearching(false)
          onChange(id, isWalkIn)
        }}
      />
    )
  }

  if (client) return <ClientDetails client={client} readOnly={readOnly} onRemove={() => onChange(null, false)} onChangeClient={() => setSearching(true)} onViewProfile={() => onViewProfile(client.id)} onLeaveTo={onLeaveTo} />

  if (walkIn) {
    return (
      <div className="flex flex-col items-center px-6 pt-10 text-center">
        <ClientAvatar walkIn size={96} />
        <p className="mt-4 text-title-3 font-semibold text-ink">{t('calendar.walkIn')}</p>
        {!readOnly && (
          <Button variant="link" className="mt-2" onClick={() => setSearching(true)}>
            {t('calendar.client.add')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <button type="button" disabled={readOnly} onClick={() => setSearching(true)} className="flex w-full flex-col items-center px-6 pt-10 text-center disabled:cursor-default" data-testid="add-client">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <UserPlus size={26} aria-hidden />
      </span>
      <span className="mt-4 text-body-lg font-semibold text-ink">{t('calendar.client.add')}</span>
      <span className="mt-1 text-body text-muted">{t('calendar.client.orWalkIn')}</span>
    </button>
  )
}

function ClientSearch({ onPick, onCancel }: { onPick: (id: ID | null, walkIn: boolean) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const clients = useDb((s) => s.clients)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const live = clients.filter((c) => !c.deletedAt)
    const hits = q ? live.filter((c) => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(q)) : live
    return [...hits].sort((a, b) => fullName(a).localeCompare(fullName(b))).slice(0, 40)
  }, [clients, query])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-5 pb-4 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-title-3 font-semibold text-ink">{t('calendar.client.select')}</h2>
          <button type="button" onClick={onCancel} aria-label={t('calendar.common.close')} className="icon-btn h-8 w-8">
            <X size={16} aria-hidden />
          </button>
        </div>
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('calendar.client.searchPlaceholder')} aria-label={t('calendar.client.searchPlaceholder')} className="input pl-9" data-testid="client-search" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-sunken">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <Plus size={20} aria-hidden />
          </span>
          <span className="text-body-strong text-ink">{t('calendar.client.addNew')}</span>
        </button>
        <button type="button" onClick={() => onPick(null, true)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-sunken">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <PersonStanding size={20} aria-hidden />
          </span>
          <span className="text-body-strong text-ink">{t('calendar.walkIn')}</span>
        </button>
        <div className="my-2 border-t border-line" />
        {results.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c.id, false)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-sunken">
            <ClientAvatar name={c.firstName} photo={c.photo} size={44} />
            <span className="min-w-0">
              <span className="block truncate text-body-strong text-ink">{fullName(c)}</span>
              <span className="block truncate text-small text-muted">{c.email || c.phone}</span>
            </span>
          </button>
        ))}
        {!results.length && <p className="px-2 py-4 text-small text-muted">{t('calendar.client.noResults')}</p>}
      </div>
      <AddClientModal open={adding} initialQuery={query} onClose={() => setAdding(false)} onCreated={(id) => onPick(id, false)} />
    </div>
  )
}

/** "Add new client": a quick inline form that creates the client and selects it. */
export function AddClientModal({ open, onClose, onCreated, initialQuery = '' }: { open: boolean; onClose: () => void; onCreated: (id: ID) => void; initialQuery?: string }) {
  const { t } = useTranslation()
  const sources = useDb((s) => s.clientSources)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', birthday: '', pronouns: '' })
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [seeded, setSeeded] = useState(false)
  if (open && !seeded) {
    setSeeded(true)
    const parts = initialQuery.includes('@') ? [] : initialQuery.trim().split(/\s+/)
    setForm({ firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), email: initialQuery.includes('@') ? initialQuery.trim() : '', phone: '', birthday: '', pronouns: '' })
  }
  if (!open && seeded) setSeeded(false)

  const errors = {
    firstName: !form.firstName.trim() ? t('calendar.client.errors.firstName') : '',
    email: form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? t('calendar.client.errors.email') : '',
    contact: !form.email.trim() && !form.phone.trim() ? t('calendar.client.errors.contact') : '',
  }
  const valid = !errors.firstName && !errors.email && !errors.contact
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async () => {
    setTouched(true)
    if (!valid) return
    setBusy(true)
    try {
      const source = sources.find((s) => s.id === 'src_walkin') ?? sources[0]
      const created = await crud('clients', 'cl').create({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        birthday: form.birthday || undefined,
        pronouns: form.pronouns || undefined,
        sourceId: source?.id ?? 'src_walkin',
        country: 'Portugal',
        tagIds: [],
        addresses: [],
        emergencyContacts: [],
        notifications: { email: true, sms: true, whatsapp: false },
        marketing: { email: false, sms: false, whatsapp: false },
        marketplace: false,
        allergies: [],
        patchTests: [],
        rewards: [],
        walletBalance: 0,
        files: [],
        createdAt: nowISO(),
      })
      toast(t('calendar.toasts.clientCreated'))
      onCreated(created.id)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('calendar.client.newTitle')}
      subtitle={t('calendar.client.newSubtitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('calendar.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={save} data-testid="add-client-save">
            {t('calendar.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('calendar.client.firstName')} error={touched ? errors.firstName : ''}>
          {(id) => <TextInput id={id} value={form.firstName} onChange={set('firstName')} invalid={touched && Boolean(errors.firstName)} autoFocus />}
        </Field>
        <Field label={t('calendar.client.lastName')}>{(id) => <TextInput id={id} value={form.lastName} onChange={set('lastName')} />}</Field>
        <Field label={t('calendar.client.email')} error={touched ? errors.email || errors.contact : ''} className="col-span-2">
          {(id) => <TextInput id={id} type="email" value={form.email} onChange={set('email')} invalid={touched && Boolean(errors.email || errors.contact)} placeholder="example@domain.com" />}
        </Field>
        <Field label={t('calendar.client.phone')} className="col-span-2">
          {(id) => <TextInput id={id} type="tel" value={form.phone} onChange={set('phone')} placeholder="+351 912 345 678" />}
        </Field>
        <Field label={t('calendar.client.birthday')} optional>
          {(id) => <TextInput id={id} type="date" value={form.birthday} onChange={set('birthday')} />}
        </Field>
        <Field label={t('calendar.client.pronouns')} optional>
          {(id) => <Select id={id} value={form.pronouns} onChange={set('pronouns')} placeholder={t('calendar.client.selectOption')} options={['She/Her', 'He/Him', 'They/Them'].map((value) => ({ value, label: t(PRONOUN_KEYS[value]) }))} />}
        </Field>
      </div>
    </Modal>
  )
}

type ActionModal = 'message' | 'alert' | 'allergy' | 'patch' | 'tag' | null

function ClientDetails({ client, readOnly, onRemove, onChangeClient, onViewProfile, onLeaveTo }: { client: Client; readOnly?: boolean; onRemove: () => void; onChangeClient: () => void; onViewProfile: () => void; onLeaveTo: (path: string) => void }) {
  const { t } = useTranslation()
  const appointments = useDb((s) => s.appointments)
  const tags = useDb((s) => s.clientTags)
  const [modal, setModal] = useState<ActionModal>(null)
  const noShows = useMemo(() => appointments.filter((a) => a.clientId === client.id && a.status === 'no_show').length, [appointments, client.id])
  const isNew = toISODate(now()) <= toISODate(new Date(parseISO(client.createdAt).getTime() + 30 * 86400000))
  const clientTags = tags.filter((tag) => client.tagIds.includes(tag.id))

  const block = async () => {
    const blocking = !client.blocked
    if (!(await confirm({ title: t(blocking ? 'calendar.client.blockTitle' : 'calendar.client.unblockTitle'), body: t(blocking ? 'calendar.client.blockBody' : 'calendar.client.unblockBody', { name: fullName(client) }), confirmLabel: t(blocking ? 'calendar.client.block' : 'calendar.client.unblock'), tone: blocking ? 'danger' : 'primary' }))) return
    await crud('clients').update(client.id, { blocked: blocking ? { reason: t('calendar.client.blockReason'), at: nowISO() } : undefined })
    toast(t(blocking ? 'calendar.toasts.clientBlocked' : 'calendar.toasts.clientUnblocked'))
  }
  const remove = async () => {
    if (!(await confirm({ title: t('calendar.client.deleteTitle'), body: t('calendar.client.deleteBody', { name: fullName(client) }), confirmLabel: t('calendar.client.delete'), tone: 'danger' }))) return
    await crud('clients').update(client.id, { deletedAt: nowISO() })
    toast(t('calendar.toasts.clientDeleted'))
    onRemove()
  }

  return (
    <div className="pb-6">
      <div className="flex flex-col items-center border-b border-line px-5 pb-6 pt-8 text-center">
        <ClientAvatar name={client.firstName} photo={client.photo} size={96} />
        <p className="mt-4 text-title-3 font-semibold text-ink">{fullName(client)}</p>
        {client.email && (
          <a href={`mailto:${client.email}`} className="mt-0.5 max-w-full truncate text-body text-muted hover:underline">
            {client.email}
          </a>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <DropMenu
            width={240}
            trigger={({ open, toggle }) => (
              <Button size="sm" onClick={toggle} aria-expanded={open} iconRight={<ChevronDown size={14} />}>
                {t('calendar.client.actions')}
              </Button>
            )}
            groups={[
              ...(!readOnly ? [{ items: [{ label: t('calendar.client.change'), onSelect: onChangeClient }, { label: t('calendar.client.remove'), onSelect: onRemove }] }] : []),
              {
                items: [
                  { label: t('calendar.client.messages'), onSelect: () => setModal('message') },
                  { label: t('calendar.client.addAlert'), onSelect: () => setModal('alert') },
                  { label: t('calendar.client.addAllergy'), onSelect: () => setModal('allergy') },
                  { label: t('calendar.client.addPatchTest'), onSelect: () => setModal('patch') },
                  { label: t('calendar.client.addTag'), onSelect: () => setModal('tag') },
                ],
              },
              {
                items: [
                  { label: t('calendar.client.edit'), onSelect: () => onLeaveTo(`/clients/list/${client.id}/edit`) },
                  { label: t(client.blocked ? 'calendar.client.unblock' : 'calendar.client.block'), onSelect: () => void block() },
                  { label: t('calendar.client.delete'), danger: true, onSelect: () => void remove() },
                ],
              },
            ]}
          />
          <Button size="sm" onClick={onViewProfile}>
            {t('calendar.client.viewProfile')}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 pt-5 text-body">
        <InfoRow icon={<VenusAndMars size={18} />} text={client.pronouns && PRONOUN_KEYS[client.pronouns] ? t(PRONOUN_KEYS[client.pronouns]) : client.pronouns} placeholder={t('calendar.client.addPronouns')} onAdd={() => onLeaveTo(`/clients/list/${client.id}/edit?focus=pronoun`)} />
        <InfoRow icon={<Cake size={18} />} text={client.birthday ? format(parseISO(client.birthday), 'd MMMM yyyy') : undefined} placeholder={t('calendar.client.addBirthday')} onAdd={() => onLeaveTo(`/clients/list/${client.id}/edit?focus=birthday`)} />
        <InfoRow icon={<UserRound size={18} />} text={t('calendar.client.created', { date: format(parseISO(client.createdAt), 'MMM d, yyyy') })} />
        {client.phone && <InfoRow icon={<Phone size={18} />} text={client.phone} />}
        {(noShows > 0 || clientTags.length > 0 || isNew || client.blocked) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {client.blocked && <span className="chip bg-danger text-white">{t('calendar.client.blocked')}</span>}
            {noShows > 0 && <span className="chip bg-danger-subtle text-danger">{t('calendar.client.noShows', { count: noShows })}</span>}
            {isNew && <span className="chip bg-info-subtle text-info">{t('calendar.client.new')}</span>}
            {clientTags.map((tag) => (
              <span key={tag.id} className="chip bg-sunken text-ink">
                {tag.name}
              </span>
            ))}
            <button type="button" onClick={() => setModal('tag')} className="chip bg-transparent text-primary ring-1 ring-line hover:bg-sunken">
              + {t('calendar.client.addTag')}
            </button>
          </div>
        )}
        {client.staffAlert && (
          <div className="flex gap-2 rounded-md bg-warning-subtle p-3 text-small text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{client.staffAlert}</span>
          </div>
        )}
        {client.allergies.filter((a) => a.kind !== 'none').map((a) => (
          <div key={a.id} className="flex gap-2 rounded-md bg-danger-subtle p-3 text-small text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <b>{t('calendar.client.allergy')}:</b> {a.name}
              {a.reaction ? ` · ${a.reaction}` : ''}
              {a.severity ? ` · ${t(`calendar.client.severity.${a.severity}`)}` : ''}
            </span>
          </div>
        ))}
        {client.patchTests.map((p) => (
          <div key={p.id} className="flex gap-2 rounded-md bg-sunken p-3 text-small text-ink">
            <FlaskConical size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span>
              {p.title} · {t(`calendar.client.patchStatus.${p.status}`)} · {t('calendar.client.expires', { date: format(parseISO(p.expiresAt), 'd MMM yyyy') })}
            </span>
          </div>
        ))}
      </div>
      <ClientActionModals client={client} modal={modal} onClose={() => setModal(null)} />
    </div>
  )
}

function InfoRow({ icon, text, placeholder, onAdd }: { icon: ReactNode; text?: string; placeholder?: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted">{icon}</span>
      {text ? (
        <span className="text-ink">{text}</span>
      ) : (
        <button type="button" onClick={onAdd} className={clsx('text-muted hover:text-primary hover:underline')}>
          {placeholder}
        </button>
      )}
    </div>
  )
}

function ClientActionModals({ client, modal, onClose }: { client: Client; modal: ActionModal; onClose: () => void }) {
  const { t } = useTranslation()
  const tags = useDb((s) => s.clientTags)
  const members = useDb((s) => s.teamMembers)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [channel, setChannel] = useState<MessageLog['channel']>('sms')
  const [allergy, setAllergy] = useState({ name: '', reaction: '', severity: 'mild' })
  const [patch, setPatch] = useState({ title: '', testedAt: toISODate(now()), status: 'passed', testedBy: '' })
  const [tagIds, setTagIds] = useState<string[]>(client.tagIds)
  const [openFor, setOpenFor] = useState<ActionModal>(null)
  if (modal !== openFor) {
    setOpenFor(modal)
    setText(modal === 'alert' ? (client.staffAlert ?? '') : '')
    setAllergy({ name: '', reaction: '', severity: 'mild' })
    setPatch({ title: '', testedAt: toISODate(now()), status: 'passed', testedBy: '' })
    setTagIds(client.tagIds)
  }

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true)
    try {
      await fn()
      toast(message)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const footer = (onSave: () => void, disabled: boolean, label = t('calendar.common.save')) => (
    <>
      <Button onClick={onClose}>{t('calendar.common.cancel')}</Button>
      <Button variant="primary" loading={busy} disabled={disabled} onClick={onSave}>
        {label}
      </Button>
    </>
  )

  return (
    <>
      <Modal open={modal === 'message'} onClose={onClose} title={t('calendar.client.messageTitle', { name: client.firstName })} footer={footer(() => run(() => messageClient(client.id, channel, text.trim()), t('calendar.toasts.messageSent')), !text.trim(), t('calendar.client.send'))}>
        <div className="flex flex-col gap-4">
          <Field label={t('calendar.client.channel')}>
            {(id) => (
              <Select
                id={id}
                value={channel}
                onChange={(e) => setChannel(e.target.value as MessageLog['channel'])}
                options={[
                  { value: 'sms', label: t('calendar.client.channels.sms') },
                  { value: 'email', label: t('calendar.client.channels.email') },
                  { value: 'whatsapp', label: t('calendar.client.channels.whatsapp') },
                ]}
              />
            )}
          </Field>
          <Field label={t('calendar.client.message')} counter={{ value: text.length, max: 480 }}>
            {(id) => <TextArea id={id} maxLength={480} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
        </div>
      </Modal>
      <Modal open={modal === 'alert'} onClose={onClose} title={t('calendar.client.addAlert')} subtitle={t('calendar.client.alertHint')} footer={footer(() => run(() => crud('clients').update(client.id, { staffAlert: text.trim() || undefined }), t('calendar.toasts.alertSaved')), false)}>
        <Field label={t('calendar.client.alert')}>{(id) => <TextArea id={id} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
      </Modal>
      <Modal
        open={modal === 'allergy'}
        onClose={onClose}
        title={t('calendar.client.addAllergy')}
        footer={footer(
          () =>
            run(
              () =>
                crud('clients').update(client.id, {
                  allergies: [...client.allergies, { id: uid('alg'), kind: 'non_drug', name: allergy.name.trim(), reaction: allergy.reaction.trim() || undefined, severity: allergy.severity as 'mild', createdAt: nowISO() }],
                }),
              t('calendar.toasts.allergyAdded'),
            ),
          !allergy.name.trim(),
        )}
      >
        <div className="flex flex-col gap-4">
          <Field label={t('calendar.client.allergen')}>{(id) => <TextInput id={id} value={allergy.name} onChange={(e) => setAllergy((a) => ({ ...a, name: e.target.value }))} placeholder={t('calendar.client.allergenPlaceholder')} />}</Field>
          <Field label={t('calendar.client.reaction')} optional>
            {(id) => <TextInput id={id} value={allergy.reaction} onChange={(e) => setAllergy((a) => ({ ...a, reaction: e.target.value }))} />}
          </Field>
          <Field label={t('calendar.client.severityLabel')}>
            {(id) => (
              <Select id={id} value={allergy.severity} onChange={(e) => setAllergy((a) => ({ ...a, severity: e.target.value }))} options={['mild', 'moderate', 'severe', 'fatal'].map((v) => ({ value: v, label: t(`calendar.client.severity.${v}`) }))} />
            )}
          </Field>
        </div>
      </Modal>
      <Modal
        open={modal === 'patch'}
        onClose={onClose}
        title={t('calendar.client.addPatchTest')}
        footer={footer(
          () =>
            run(() => {
              const tested = parseISO(patch.testedAt)
              const expires = toISODate(new Date(tested.getFullYear(), tested.getMonth() + 6, tested.getDate()))
              return crud('clients').update(client.id, {
                patchTests: [...client.patchTests, { id: uid('pt'), title: patch.title.trim(), testedAt: patch.testedAt, expiresAt: expires, status: patch.status as 'passed', testedBy: patch.testedBy || undefined }],
              })
            }, t('calendar.toasts.patchAdded')),
          !patch.title.trim() || !patch.testedAt,
        )}
      >
        <div className="flex flex-col gap-4">
          <Field label={t('calendar.client.patchTitle')}>{(id) => <TextInput id={id} value={patch.title} onChange={(e) => setPatch((p) => ({ ...p, title: e.target.value }))} placeholder={t('calendar.client.patchPlaceholder')} />}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('calendar.client.testedOn')}>{(id) => <TextInput id={id} type="date" value={patch.testedAt} onChange={(e) => setPatch((p) => ({ ...p, testedAt: e.target.value }))} />}</Field>
            <Field label={t('calendar.client.result')}>
              {(id) => <Select id={id} value={patch.status} onChange={(e) => setPatch((p) => ({ ...p, status: e.target.value }))} options={['pending', 'passed', 'failed'].map((v) => ({ value: v, label: t(`calendar.client.patchStatus.${v}`) }))} />}
            </Field>
          </div>
          <Field label={t('calendar.client.testedBy')} optional>
            {(id) => (
              <Select
                id={id}
                value={patch.testedBy}
                onChange={(e) => setPatch((p) => ({ ...p, testedBy: e.target.value }))}
                placeholder={t('calendar.client.selectOption')}
                options={members.filter((m) => !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
              />
            )}
          </Field>
        </div>
      </Modal>
      <Modal open={modal === 'tag'} onClose={onClose} title={t('calendar.client.tagsTitle')} footer={footer(() => run(() => crud('clients').update(client.id, { tagIds }), t('calendar.toasts.tagsUpdated')), false)}>
        <div className="flex flex-col gap-3">
          {tags.map((tag) => (
            <Checkbox key={tag.id} label={tag.name} checked={tagIds.includes(tag.id)} onChange={(on) => setTagIds((ids) => (on ? [...ids, tag.id] : ids.filter((x) => x !== tag.id)))} />
          ))}
        </div>
      </Modal>
    </>
  )
}
