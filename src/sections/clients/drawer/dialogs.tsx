import clsx from 'clsx'
import { Check, MessagesSquare, X } from 'lucide-react'
import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { useState } from 'react'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import type { Client, ClientAllergy, FormResponse, PatchTest } from '@/types'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import { Button, Field, LearnMore, Modal, Segmented, Select, TextArea, TextInput, toast } from '@/components/ui'
import { patchTestExpiry, saveAllergy, savePatchTest, sendClientForm, setStaffAlert } from '@/api/clients'
import { startConversation } from '@/api/panels'
import { canonicalReaction, reactionOptions, SEVERITY_COLORS } from '../lib/constants'
import { fmtLongDate } from '../lib/helpers'
import { useClientDrawer, useEscape } from './context'

/** "Add staff alert" (clients.md §4). */
export function StaffAlertModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(client.staffAlert ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await setStaffAlert(client.id, text)
      toast(text.trim() ? t('clients.alert.toast') : t('clients.alert.removed'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={client.staffAlert ? t('clients.alert.editTitle') : t('clients.alert.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('clients.common.close')}</Button>
          <Button variant="primary" loading={busy} disabled={!text.trim() && !client.staffAlert} onClick={() => void save()}>
            {client.staffAlert ? t('clients.common.save') : t('clients.common.add')}
          </Button>
        </>
      }
    >
      <Field hint={t('clients.alert.hint')} counter={{ value: text.length, max: 500 }}>
        {(id) => <TextArea id={id} autoFocus maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('clients.alert.placeholder')} />}
      </Field>
    </Modal>
  )
}

type Kind = ClientAllergy['kind']
type Severity = NonNullable<ClientAllergy['severity']>

/** "No known allergies" entries are shown in the current language (the stored name is the text saved at the time). */
export const allergyName = (a: Pick<ClientAllergy, 'kind' | 'name'>) => (a.kind === 'none' ? i18n.t('clients.allergy.noKnown') : a.name)

/** Severity dot cluster (our own artwork for the reference's halftone icons). */
export function SeverityIcon({ severity, size = 36 }: { severity?: Severity; size?: number }) {
  const color = severity ? SEVERITY_COLORS[severity] : '#8C8C8C'
  return (
    <span aria-hidden className="relative inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: `radial-gradient(circle, ${color} 0 28%, ${color}55 30% 55%, transparent 58%)` }} />
  )
}

/** "Add allergy" (clients.md §4). */
export function AllergyModal({ client, allergy, onClose }: { client: Client; allergy?: ClientAllergy; onClose: () => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>(allergy?.kind ?? 'non_drug')
  const [name, setName] = useState(allergy?.name ?? '')
  const [reaction, setReaction] = useState(canonicalReaction(allergy?.reaction) ?? '')
  const [severity, setSeverity] = useState<Severity | undefined>(allergy?.severity)
  const [note, setNote] = useState(allergy?.note ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (kind !== 'none' && !name.trim()) return setError(t('clients.allergy.nameError'))
    setBusy(true)
    try {
      await saveAllergy(client.id, { id: allergy?.id, kind, name: kind === 'none' ? t('clients.allergy.noKnown') : name.trim(), reaction: kind === 'none' ? undefined : reaction || undefined, severity: kind === 'none' ? undefined : severity, note: note.trim() || undefined })
      toast(allergy ? t('clients.allergy.updated') : t('clients.allergy.toast'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={allergy ? t('clients.allergy.editTitle') : t('clients.allergy.title')}
      footer={
        <Button variant="primary" loading={busy} onClick={() => void save()}>
          {t('clients.common.save')}
        </Button>
      }
    >
      <Segmented<Kind>
        className="flex w-full [&>button]:flex-1"
        value={kind}
        onChange={setKind}
        items={[
          { value: 'non_drug', label: t('clients.allergy.nonDrug') },
          { value: 'drug', label: t('clients.allergy.drug') },
          { value: 'none', label: t('clients.allergy.none') },
        ]}
      />
      {kind === 'none' ? (
        <p className="mt-6 rounded-md bg-sunken p-4 text-body text-muted">{t('clients.allergy.noneHint')}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label={t('clients.allergy.name')} error={error}>
              {(id) => (
                <TextInput
                  id={id}
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setError('')
                  }}
                  placeholder={t('clients.allergy.namePlaceholder')}
                  invalid={Boolean(error)}
                />
              )}
            </Field>
            <Field label={t('clients.allergy.reaction')}>{(id) => <Select id={id} value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder={t('clients.form.selectOption')} options={reactionOptions()} />}</Field>
          </div>
          <div className="mt-6">
            <p className="text-body-strong text-ink">{t('clients.allergy.severity')}</p>
            <p className="text-small text-muted">{t('clients.allergy.severityHint')}</p>
            <div role="radiogroup" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['mild', 'moderate', 'severe', 'fatal'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={severity === s}
                  onClick={() => setSeverity(severity === s ? undefined : s)}
                  className={clsx('flex h-24 flex-col items-center justify-center gap-2 rounded-lg border text-body text-ink transition-colors md:h-32 md:gap-3', severity === s ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary' : 'border-line hover:border-line-strong')}
                >
                  <SeverityIcon severity={s} size={52} />
                  {t(`clients.allergy.severities.${s}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <Field label={t('clients.allergy.note')} counter={{ value: note.length, max: 1000 }} className="mt-6">
        {(id) => <TextArea id={id} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('clients.allergy.notePlaceholder')} />}
      </Field>
    </Modal>
  )
}

const PATCH_COLORS: Record<PatchTest['status'], string> = { pending: '#C98213', passed: '#2E9B48', failed: '#D0304A' }

export function PatchIcon({ status, size = 32 }: { status: PatchTest['status']; size?: number }) {
  const c = PATCH_COLORS[status]
  return (
    <span aria-hidden className="relative inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: `${c}1f` }}>
      <span className="absolute h-[22%] w-[22%] rounded-full" style={{ background: c, transform: 'translate(-45%, 35%)' }} />
      <span className="absolute h-[22%] w-[22%] rounded-full" style={{ background: c, transform: 'translate(45%, 35%)' }} />
      <span className="absolute h-[22%] w-[22%] rounded-full" style={{ background: c, transform: 'translate(0, -40%)' }} />
    </span>
  )
}

/** "Patch test" (clients.md §4). Expires six months after the test date. */
export function PatchTestModal({ client, test, onClose }: { client: Client; test?: PatchTest; onClose: () => void }) {
  const { t } = useTranslation()
  const members = useDb((s) => s.teamMembers)
  const users = useDb((s) => s.users)
  const [title, setTitle] = useState(test?.title ?? '')
  const [testedAt, setTestedAt] = useState(test?.testedAt ?? todayISO())
  const [testedBy, setTestedBy] = useState(test?.testedBy ?? users[0]?.teamMemberId ?? members[0]?.id ?? '')
  const [status, setStatus] = useState<PatchTest['status']>(test?.status ?? 'pending')
  const [description, setDescription] = useState(test?.description ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!title.trim()) return setError(t('clients.patch.titleError'))
    setBusy(true)
    try {
      await savePatchTest(client.id, { id: test?.id, title: title.trim(), testedAt, testedBy: testedBy || undefined, status, description: description.trim() || undefined })
      toast(t('clients.patch.toast'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('clients.patch.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('clients.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('clients.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('clients.patch.titleLabel')} counter={{ value: title.length, max: 100 }} error={error}>
        {(id) => (
          <TextInput
            id={id}
            autoFocus
            maxLength={100}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError('')
            }}
            placeholder={t('clients.patch.titlePlaceholder')}
            invalid={Boolean(error)}
          />
        )}
      </Field>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label={t('clients.patch.tested')} hint={testedAt ? t('clients.patch.expiresOn', { date: fmtLongDate(patchTestExpiry(testedAt)) }) : undefined}>
          {(id) => <input id={id} type="date" className="input" value={testedAt} max={todayISO()} onChange={(e) => setTestedAt(e.target.value || todayISO())} />}
        </Field>
        <Field label={t('clients.patch.testedBy')}>
          {(id) => <Select id={id} value={testedBy} onChange={(e) => setTestedBy(e.target.value)} options={members.filter((m) => !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))} />}
        </Field>
      </div>
      <p className="mt-5 text-body-strong text-ink">{t('clients.patch.status')}</p>
      <div role="radiogroup" className="mt-2 grid grid-cols-3 gap-3">
        {(['pending', 'passed', 'failed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={clsx('flex h-28 flex-col items-center justify-center gap-3 rounded-lg border text-body text-ink transition-colors', status === s ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary' : 'border-line hover:border-line-strong')}
          >
            <PatchIcon status={s} size={40} />
            {t(`clients.patch.statuses.${s}`)}
          </button>
        ))}
      </div>
      <Field label={t('clients.patch.description')} counter={{ value: description.length, max: 200 }} className="mt-5">
        {(id) => <TextArea id={id} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
    </Modal>
  )
}

/** "Connect to clients with two-way messaging" intro (clients.md §4 Messages). */
export function MessagesIntroModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const conversation = useDb((s) => s.conversations.find((c) => c.clientId === client.id))
  const workspaceName = useDb((s) => s.workspace.name)
  const { close } = useClientDrawer()
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(false)
  const [sending, setSending] = useState(false)
  useEscape(onClose)
  const openInbox = (conversationId: string) => {
    onClose()
    close()
    navigate(`/connect/conversations/${conversationId}`)
  }
  const send = async () => {
    if (!text.trim()) return setError(true)
    setSending(true)
    try {
      const id = await startConversation(client.id, text)
      toast(t('clients.messages.sent'))
      openInbox(id)
    } finally {
      setSending(false)
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[75] flex overflow-y-auto bg-surface" role="dialog" aria-modal="true" aria-label={t('clients.messages.title')}>
      <button type="button" onClick={onClose} aria-label={t('clients.common.close')} className="icon-btn absolute right-3 top-3 z-10 md:right-6 md:top-6">
        <X size={22} aria-hidden />
      </button>
      <div className="grid w-full items-center gap-10 px-4 py-14 md:px-8 md:py-16 lg:grid-cols-2 lg:px-24">
        <div className="max-w-xl">
          <p className="text-small font-semibold uppercase tracking-wide text-primary">{t('clients.messages.badge')}</p>
          <h2 className="mt-3 font-display text-[30px] font-bold leading-[38px] text-ink md:text-[40px] md:leading-[48px]">{t('clients.messages.title')}</h2>
          <p className="mt-4 text-body-lg text-ink">{t('clients.messages.body')}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {(['b1', 'b2', 'b3'] as const).map((b) => (
              <li key={b} className="flex items-start gap-3 text-body-lg text-ink">
                <Check size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                {t(`clients.messages.${b}`)}
              </li>
            ))}
          </ul>
          {composing ? (
            <div className="mt-8 rounded-lg border border-line bg-surface p-4 md:p-5">
              <Field label={t('clients.messages.newTo', { name: client.firstName })} error={error ? t('clients.messages.required') : undefined}>
                {(id) => (
                  <TextArea
                    id={id}
                    autoFocus
                    value={text}
                    maxLength={1000}
                    invalid={error}
                    placeholder={t('clients.messages.placeholder')}
                    onChange={(e) => {
                      setText(e.target.value)
                      setError(false)
                    }}
                  />
                )}
              </Field>
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={() => setComposing(false)}>{t('clients.common.cancel')}</Button>
                <Button variant="primary" loading={sending} onClick={() => void send()}>
                  {t('clients.messages.send')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button variant="primary" size="lg" onClick={() => (conversation ? openInbox(conversation.id) : setComposing(true))}>
                {t('clients.messages.goToInbox')}
              </Button>
              <LearnMore topic={t('settings.tm.perm.clients.groups.messaging')}>
                <span className="text-body-strong">{t('clients.common.learnMore')}</span>
              </LearnMore>
            </div>
          )}
        </div>
        <div className="hidden justify-center lg:flex">
          <div className="relative h-[520px] w-[280px] rounded-[44px] border-[10px] border-ink bg-gradient-to-b from-primary to-primary-active p-5 shadow-lg">
            <p className="mt-10 text-center font-display text-[56px] font-bold text-white">9:41</p>
            <div className="absolute bottom-16 left-4 right-4 flex flex-col gap-2">
              {[client.firstName, workspaceName].map((who, i) => (
                <div key={who} className="rounded-xl bg-white/85 p-3 shadow-sm">
                  <p className="flex items-center gap-2 text-small font-semibold text-ink">
                    <MessagesSquare size={14} aria-hidden /> {who}
                  </p>
                  <p className="text-caption text-muted">{i === 0 ? t('clients.messages.sample1') : t('clients.messages.sample2')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Send a form template to the client (Records › Client forms). */
export function SendFormModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useTranslation()
  const templates = useDb((s) => s.formTemplates)
  const active = templates.filter((f) => f.status === 'active')
  const [templateId, setTemplateId] = useState(active[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const send = async () => {
    if (!templateId) return
    setBusy(true)
    try {
      await sendClientForm(client.id, templateId)
      toast(t('clients.forms.sent'))
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={t('clients.forms.sendTitle')}
      subtitle={t('clients.forms.sendSubtitle', { name: client.firstName })}
      footer={
        <>
          <Button onClick={onClose}>{t('clients.common.cancel')}</Button>
          <Button variant="primary" disabled={!templateId} loading={busy} onClick={() => void send()}>
            {t('clients.forms.send')}
          </Button>
        </>
      }
    >
      {active.length ? (
        <Field label={t('clients.forms.template')}>{(id) => <Select id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)} options={active.map((f) => ({ value: f.id, label: f.name }))} />}</Field>
      ) : (
        <div className="rounded-md bg-sunken p-4 text-body text-muted">
          {t('clients.forms.noTemplates')}{' '}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate('/setup/forms-and-notes/form-templates')}>
            {t('clients.forms.manage')}
          </button>
        </div>
      )}
    </Modal>
  )
}

/** Read-only answers of a completed form. */
export function FormResponseModal({ response, onClose }: { response: FormResponse; onClose: () => void }) {
  const { t } = useTranslation()
  const template = useDb((s) => s.formTemplates.find((f) => f.id === response.templateId))
  const blocks = template?.sections.flatMap((s) => s.blocks) ?? []
  return (
    <Modal open onClose={onClose} title={template?.name ?? t('clients.forms.form')} subtitle={t('clients.forms.sentOn', { date: format(parseISO(response.sentAt), 'MMM d, yyyy') })} footer={<Button onClick={onClose}>{t('clients.common.close')}</Button>}>
      {response.status !== 'completed' ? (
        <p className="rounded-md bg-sunken p-4 text-body text-muted">{t('clients.forms.notCompleted')}</p>
      ) : (
        <dl className="flex flex-col gap-4">
          {blocks.map((b) => (
            <div key={b.id}>
              <dt className="text-body-strong text-ink">{b.label}</dt>
              <dd className="text-body text-muted">{response.answers[b.id] || '—'}</dd>
            </div>
          ))}
          {blocks.length === 0 && <p className="text-body text-muted">{t('clients.forms.noAnswers')}</p>}
        </dl>
      )}
    </Modal>
  )
}
