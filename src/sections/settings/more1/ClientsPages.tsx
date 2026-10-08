import { Copy, Download, Eye, ImagePlus, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Checkbox, EmptyState, Field, Select, Switch, TextArea, TextInput, confirm, toast } from '@/components/ui'
import { clientSourcesApi, clientTagsApi, deleteClientTag, reorderCollection, updateSettings } from '@/api/settings'
import { useDb } from '@/store/db'
import { PALETTE, PALETTE_ORDER } from '@/styles/palette'
import type { ClientSource, ClientTag, PaletteColor, Settings } from '@/types'
import { useSettings, useWorkspace } from '../hooks'
import { ActionsPill, ActiveLabel, EditCard, PillMenu, PromoCard, SettingsPage, SummaryList } from '../components/ui'
import { SettingsModal } from '../components/SettingsModal'
import { OrderModal } from '../components/OrderModal'
import { ColorSwatches } from '../components/pickers'
import { useAction, useDraft } from '../components/useAction'
import { RadioRow, RowCard, RowStack, deleteItem, rowActions } from '../scheduling/shared'
import { B, M, ModalFooter, ModalForm, moved } from './shared'

// ─── Client sources (§1) ─────────────────────────────────────────────────

const CS = `${M}.sources`

export function ClientSourcesPage() {
  const { t } = useTranslation()
  const raw = useDb((s) => s.clientSources)
  const sources = useMemo(() => [...raw].sort((a, b) => a.order - b.order), [raw])
  const [editing, setEditing] = useState<ClientSource | 'new' | null>(null)
  const [ordering, setOrdering] = useState(false)
  const [, run] = useAction()
  const remove = async (s: ClientSource) => {
    const ok = await confirm({ title: t(`${CS}.deleteTitle`), body: t(`${CS}.deleteBody`, { name: s.name }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (ok) await run(() => clientSourcesApi.remove(s.id), t(`${CS}.deleted`))
  }
  return (
    <SettingsPage
      title={t(`${CS}.title`)}
      description={t(`${CS}.description`)}
      learnMore="Client sources"
      actions={
        <>
          <PillMenu label={t('settings.common.options')} width={200} groups={[{ items: [{ label: t('settings.common.changeOrder'), onSelect: () => setOrdering(true) }] }]} />
          <Button variant="primary" className="rounded-full px-5" onClick={() => setEditing('new')} data-testid="source-add">
            {t('settings.common.add')}
          </Button>
        </>
      }
    >
      <RowStack testId="sources-list">
        {sources.map((s) => (
          <RowCard
            key={s.id}
            testId={`source-${s.id}`}
            title={s.name}
            subtitle={<ActiveLabel active={s.active} />}
            onClick={() => setEditing(s)}
            trailing={<ActionsPill groups={rowActions(t, { onEdit: () => setEditing(s), onDelete: () => void remove(s), deleteDisabled: s.system, deleteHint: s.system ? t(`${CS}.systemHint`) : undefined })} />}
          />
        ))}
      </RowStack>
      {editing && <SourceModal source={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <OrderModal
        open={ordering}
        onClose={() => setOrdering(false)}
        title={t(`${CS}.orderTitle`)}
        items={sources.map((s) => ({ id: s.id, label: s.name }))}
        onSave={(ids) => run(() => reorderCollection('clientSources', ids), t(`${M}.orderSaved`)).then(() => undefined)}
      />
    </SettingsPage>
  )
}

function SourceModal({ source, onClose }: { source: ClientSource | null; onClose: () => void }) {
  const { t } = useTranslation()
  const all = useDb((s) => s.clientSources)
  const [name, setName] = useState(source?.name ?? '')
  const [active, setActive] = useState(source?.active ?? true)
  const [touched, setTouched] = useState(false)
  const [saving, run] = useAction()
  const trimmed = name.trim()
  const duplicate = all.some((x) => x.id !== source?.id && x.name.toLowerCase() === trimmed.toLowerCase())
  const error = touched && !trimmed ? t('settings.common.required') : duplicate ? t(`${CS}.duplicate`) : undefined
  const save = () => {
    setTouched(true)
    if (!trimmed || duplicate) return
    void run(
      () => (source ? clientSourcesApi.update(source.id, { name: source.system ? source.name : trimmed, active }) : clientSourcesApi.create({ name: trimmed, active, system: false, order: all.length })),
      t(source ? `${CS}.updated` : `${CS}.added`),
      onClose,
    )
  }
  return (
    <SettingsModal open onClose={onClose} title={t(source ? `${CS}.editTitle` : `${CS}.addTitle`)} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={source ? undefined : t('settings.common.add')} testId="source-save" />}>
      <ModalForm onSubmit={save}>
        <Field label={t(`${CS}.name`)} error={error} hint={source?.system ? t(`${CS}.systemHint`) : undefined}>
          {(id) => <TextInput id={id} value={name} disabled={source?.system} maxLength={100} invalid={!!error} placeholder={t(`${CS}.namePlaceholder`)} onChange={(e) => setName(e.target.value)} data-testid="source-name" />}
        </Field>
        <Checkbox checked={active} onChange={setActive} label={t('settings.common.active')} />
      </ModalForm>
    </SettingsModal>
  )
}

// ─── Client tags (§2) ────────────────────────────────────────────────────

const CT = `${M}.tags`

function TagChip({ name, color }: { name: string; color: PaletteColor }) {
  const p = PALETTE[color] ?? PALETTE.blue
  return (
    <span className="inline-flex h-7 max-w-full items-center truncate rounded-full px-3 text-small font-semibold" style={{ background: p.fill, color: p.text }}>
      {name}
    </span>
  )
}

export function ClientTagsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const raw = useDb((s) => s.clientTags)
  const clients = useDb((s) => s.clients)
  const tags = useMemo(() => [...raw].sort((a, b) => a.order - b.order), [raw])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    clients.forEach((c) => c.tagIds.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1)))
    return map
  }, [clients])
  const [editing, setEditing] = useState<ClientTag | 'new' | null>(null)
  const [, run] = useAction()
  const remove = async (tag: ClientTag) => {
    const ok = await confirm({ title: t(`${CT}.deleteTitle`), body: t(`${CT}.deleteBody`, { name: tag.name, count: counts.get(tag.id) ?? 0 }), confirmLabel: t('settings.common.delete'), tone: 'danger' })
    if (ok) await run(() => deleteClientTag(tag.id), t(`${CT}.deleted`))
  }
  const move = (index: number, direction: -1 | 1) =>
    void run(
      () =>
        reorderCollection(
          'clientTags',
          moved(
            tags.map((x) => x.id),
            index,
            direction,
          ),
        ),
      t(`${CT}.moved`),
    )
  return (
    <SettingsPage
      title={t(`${CT}.title`)}
      description={t(`${CT}.description`)}
      learnMore="Client tags"
      actions={
        <Button variant="primary" className="rounded-full px-5" onClick={() => setEditing('new')} data-testid="tag-add">
          {t('settings.common.add')}
        </Button>
      }
    >
      {tags.length === 0 ? (
        <div className="card">
          <EmptyState title={t(`${CT}.emptyTitle`)} body={t(`${CT}.emptyBody`)} action={<Button onClick={() => setEditing('new')}>{t(`${CT}.addTitle`)}</Button>} />
        </div>
      ) : (
        <RowStack testId="tags-list">
          {tags.map((tag, i) => (
            <RowCard
              key={tag.id}
              testId={`tag-${tag.id}`}
              title={<TagChip name={tag.name} color={tag.color} />}
              subtitle={t(`${CT}.clientCount`, { count: counts.get(tag.id) ?? 0 })}
              onClick={() => setEditing(tag)}
              trailing={
                <ActionsPill
                  groups={[
                    {
                      items: [
                        { label: t('settings.common.edit'), onSelect: () => setEditing(tag) },
                        { label: t(`${CT}.viewClients`), onSelect: () => navigate(`/clients/list?client-list-tag-ids[0]=${tag.id}`) },
                        deleteItem(t('settings.common.delete'), () => void remove(tag)),
                      ],
                    },
                    {
                      items: [
                        { label: t('settings.common.moveUp'), onSelect: () => move(i, -1), disabled: i === 0 },
                        { label: t('settings.common.moveDown'), onSelect: () => move(i, 1), disabled: i === tags.length - 1 },
                      ],
                    },
                  ]}
                />
              }
            />
          ))}
        </RowStack>
      )}
      {editing && <TagModal tag={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SettingsPage>
  )
}

function TagModal({ tag, onClose }: { tag: ClientTag | null; onClose: () => void }) {
  const { t } = useTranslation()
  const all = useDb((s) => s.clientTags)
  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState<PaletteColor>(tag?.color ?? PALETTE_ORDER[all.length % PALETTE_ORDER.length])
  const [touched, setTouched] = useState(false)
  const [saving, run] = useAction()
  const trimmed = name.trim()
  const duplicate = all.some((x) => x.id !== tag?.id && x.name.toLowerCase() === trimmed.toLowerCase())
  const error = touched && !trimmed ? t('settings.common.required') : duplicate ? t(`${CT}.duplicate`) : undefined
  const save = () => {
    setTouched(true)
    if (!trimmed || duplicate) return
    void run(() => (tag ? clientTagsApi.update(tag.id, { name: trimmed, color }) : clientTagsApi.create({ name: trimmed, color, order: all.length })), t(tag ? `${CT}.updated` : `${CT}.added`), onClose)
  }
  return (
    <SettingsModal open onClose={onClose} title={t(tag ? `${CT}.editTitle` : `${CT}.addTitle`)} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={!trimmed} saveLabel={tag ? undefined : t('settings.common.add')} testId="tag-save" />}>
      <ModalForm onSubmit={save}>
        <Field label={t(`${CT}.name`)} counter={{ value: name.length, max: 15 }} error={error}>
          {(id) => <TextInput id={id} value={name} maxLength={15} invalid={!!error} placeholder={t(`${CT}.namePlaceholder`)} onChange={(e) => setName(e.target.value)} data-testid="tag-name" />}
        </Field>
        <div>
          <p className="mb-2 text-body-strong text-ink">{t(`${CT}.color`)}</p>
          <ColorSwatches value={color} onChange={setColor} label={t(`${CT}.color`)} />
        </div>
        <div className="rounded-lg bg-sunken p-4">
          <p className="mb-2 text-small text-muted">{t(`${CT}.preview`)}</p>
          <TagChip name={trimmed || t(`${CT}.previewEmpty`)} color={color} />
        </div>
      </ModalForm>
    </SettingsModal>
  )
}

// ─── Client Connect (§3) ─────────────────────────────────────────────────

const CC = `${M}.connect`
type Connect = Settings['clientConnect']
type ConnectModal = 'messaging' | 'instant' | 'contact' | 'preview' | 'qr'
const b = { b: <B /> }

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

function useContactLink() {
  const workspace = useWorkspace()
  return `https://innoweb.app/q/${slugify(workspace.name) || 'contact'}`
}

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard can be blocked (e.g. insecure origin); the link is still shown on screen.
  }
  toast(done)
}

export function ClientConnectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const c = useSettings().clientConnect
  const link = useContactLink()
  const [modal, setModal] = useState<ConnectModal | null>(null)
  const [promo, setPromo] = useState(true)
  const vis = (on: boolean) => t(on ? `${CC}.visible` : `${CC}.hidden`)
  return (
    <SettingsPage title={t(`${CC}.title`)} description={t(`${CC}.description`)} learnMore="Client Connect">
      {promo && (
        <PromoCard
          art="phone"
          eyebrow={t(`${CC}.promoEyebrow`)}
          title={t(`${CC}.promoTitle`)}
          body={t(`${CC}.promoBody`)}
          onDismiss={() => setPromo(false)}
          action={
            <Button className="rounded-full" onClick={() => navigate('/connect')}>
              {t(`${CC}.viewInbox`)}
            </Button>
          }
        />
      )}
      <EditCard title={t(`${CC}.messagingTitle`)} description={t(`${CC}.messagingDescription`)} learnMore="Messaging settings" onEdit={() => setModal('messaging')} testId="connect-messaging">
        <SummaryList
          items={[
            { key: 'enabled', text: <Trans i18nKey={`${CC}.summary.enabled`} components={b} /> },
            { key: 'start', text: t(c.allowStart ? `${CC}.summary.startOn` : `${CC}.summary.startOff`) },
            { key: 'read', text: <Trans i18nKey={`${CC}.summary.read`} values={{ value: vis(c.readReceipts) }} components={b} /> },
            { key: 'typing', text: <Trans i18nKey={`${CC}.summary.typing`} values={{ value: vis(c.typing) }} components={b} /> },
          ]}
        />
      </EditCard>
      <EditCard title={t(`${CC}.instantTitle`)} description={t(`${CC}.instantDescription`)} learnMore="Instant replies" onEdit={() => setModal('instant')} testId="connect-instant">
        {c.instantReply ? (
          <div className="flex flex-col gap-3">
            <SummaryList items={[{ key: 'on', text: t(`${CC}.instantOn`) }]} />
            <p className="rounded-lg bg-sunken px-4 py-3 text-body text-ink">{c.instantReplyText}</p>
          </div>
        ) : (
          <SummaryList items={[{ key: 'off', text: t(`${CC}.instantOff`) }]} />
        )}
      </EditCard>
      <EditCard title={t(`${CC}.contactTitle`)} description={t(`${CC}.contactDescription`)} learnMore="Contact page" onEdit={() => setModal('contact')} testId="connect-contact">
        <div className="flex flex-col gap-4">
          <SummaryList items={[{ key: 'state', text: c.contactPage ? <Trans i18nKey={`${CC}.contactEnabled`} values={{ link: link.replace('https://', '') }} components={b} /> : t(`${CC}.contactDisabled`) }]} />
          {c.contactPage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="rounded-full" icon={<Copy size={16} aria-hidden />} onClick={() => void copyText(link, t('settings.common.copied'))} data-testid="contact-copy">
                {t(`${CC}.copyLink`)}
              </Button>
              <Button size="sm" className="rounded-full" icon={<QrCode size={16} aria-hidden />} onClick={() => setModal('qr')} data-testid="contact-qr">
                {t(`${CC}.generateQr`)}
              </Button>
              <Button size="sm" className="rounded-full" icon={<Eye size={16} aria-hidden />} onClick={() => setModal('preview')} data-testid="contact-preview">
                {t(`${CC}.preview`)}
              </Button>
            </div>
          )}
        </div>
      </EditCard>
      {modal === 'messaging' && <MessagingModal onClose={() => setModal(null)} />}
      {modal === 'instant' && <InstantModal onClose={() => setModal(null)} />}
      {modal === 'contact' && <ContactModal onClose={() => setModal(null)} onPreview={() => setModal('preview')} />}
      {modal === 'preview' && <PreviewModal onClose={() => setModal(null)} />}
      {modal === 'qr' && <QrModal onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function useSaveConnect(onClose: () => void, toastKey = `${CC}.saved`) {
  const { t } = useTranslation()
  const [saving, run] = useAction()
  const save = (value: Connect) =>
    run(
      () =>
        updateSettings((s) => {
          s.clientConnect = value
        }),
      t(toastKey),
      onClose,
    )
  return [saving, save] as const
}

function MessagingModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [draft, patch] = useDraft<Connect>(useSettings().clientConnect)
  const [saving, save] = useSaveConnect(onClose)
  return (
    <SettingsModal open onClose={onClose} title={t(`${CC}.messagingTitle`)} footer={<ModalFooter onCancel={onClose} onSave={() => void save(draft)} saving={saving} testId="messaging-save" />}>
      <div className="flex flex-col gap-5 pb-2">
        <Checkbox checked disabled onChange={() => undefined} label={t(`${CC}.opts.reply.label`)} hint={t(`${CC}.opts.reply.hint`)} />
        <Checkbox checked={draft.allowStart} onChange={(allowStart) => patch({ allowStart })} label={t(`${CC}.opts.start.label`)} hint={t(`${CC}.opts.start.hint`)} />
        <Checkbox checked={draft.readReceipts} onChange={(readReceipts) => patch({ readReceipts })} label={t(`${CC}.opts.read.label`)} hint={t(`${CC}.opts.read.hint`)} />
        <Checkbox checked={draft.typing} onChange={(typing) => patch({ typing })} label={t(`${CC}.opts.typing.label`)} hint={t(`${CC}.opts.typing.hint`)} />
      </div>
    </SettingsModal>
  )
}

function InstantModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const current = useSettings().clientConnect
  const [draft, patch] = useDraft<Connect>({ ...current, instantReplyText: current.instantReplyText || t(`${CC}.instantDefault`) })
  const [saving, save] = useSaveConnect(onClose)
  const error = draft.instantReply && !draft.instantReplyText.trim() ? t(`${CC}.instantRequired`) : undefined
  return (
    <SettingsModal open onClose={onClose} title={t(`${CC}.instantTitle`)} footer={<ModalFooter onCancel={onClose} onSave={() => !error && void save({ ...draft, instantReplyText: draft.instantReplyText.trim() })} saving={saving} disabled={!!error} testId="instant-save" />}>
      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-body-strong text-ink">
            {t(`${CC}.sendInstant`)}
            <span className={`chip ${draft.instantReply ? 'bg-success-subtle text-success' : ''}`}>{t(draft.instantReply ? 'settings.common.on' : 'settings.common.off')}</span>
          </span>
          <Switch checked={draft.instantReply} onChange={(instantReply) => patch({ instantReply })} label={<span className="sr-only">{t(`${CC}.sendInstant`)}</span>} />
        </div>
        {draft.instantReply && (
          <Field label={t(`${CC}.instantMessage`)} counter={{ value: draft.instantReplyText.length, max: 500 }} error={error}>
            {(id) => <TextArea id={id} value={draft.instantReplyText} maxLength={500} invalid={!!error} onChange={(e) => patch({ instantReplyText: e.target.value })} data-testid="instant-text" />}
          </Field>
        )}
      </div>
    </SettingsModal>
  )
}

function ContactModal({ onClose, onPreview }: { onClose: () => void; onPreview: () => void }) {
  const { t } = useTranslation()
  const [draft, patch] = useDraft<Connect>(useSettings().clientConnect)
  const [saving, save] = useSaveConnect(onClose)
  const linkError = draft.contactPage && draft.redirect === 'custom' && !/^https?:\/\/\S+\.\S+/.test(draft.customLink.trim()) ? t(`${CC}.customLinkInvalid`) : undefined
  const contacts = Object.entries(CONTACT_OPTIONS).map(([value, key]) => ({ value, label: t(`${CC}.required.${key}`) }))
  return (
    <SettingsModal
      open
      onClose={onClose}
      size="lg"
      title={t(`${CC}.contactTitle`)}
      footer={
        <>
          <Button className="mr-auto rounded-full" icon={<Eye size={16} aria-hidden />} onClick={onPreview}>
            {t(`${CC}.preview`)}
          </Button>
          <ModalFooter onCancel={onClose} onSave={() => !linkError && void save({ ...draft, customLink: draft.customLink.trim() })} saving={saving} disabled={!!linkError} testId="contact-save" />
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-body-strong text-ink">
              {t(`${CC}.contactPage`)}
              <span className={`chip ${draft.contactPage ? 'bg-success-subtle text-success' : ''}`}>{t(draft.contactPage ? 'settings.common.on' : 'settings.common.off')}</span>
            </p>
            <p className="text-small text-muted">{t(`${CC}.contactPageHint`)}</p>
          </div>
          <Switch checked={draft.contactPage} onChange={(contactPage) => patch({ contactPage })} label={<span className="sr-only">{t(`${CC}.contactPage`)}</span>} />
        </div>
        {draft.contactPage && (
          <>
            <div className="flex flex-col gap-4 border-t border-line pt-5">
              <div>
                <p className="font-display text-title-3 text-ink">{t(`${CC}.messageOptions`)}</p>
                <p className="text-small text-muted">{t(`${CC}.messageOptionsHint`)}</p>
              </div>
              <Field label={t(`${CC}.requiredContact`)} hint={t(`${CC}.requiredContactHint`)}>
                {(id) => <Select id={id} value={draft.requiredContact} onChange={(e) => patch({ requiredContact: e.target.value })} options={withCurrent(contacts, draft.requiredContact)} />}
              </Field>
              <Checkbox checked={draft.attachments} onChange={(attachments) => patch({ attachments })} label={t(`${CC}.opts.attachments.label`)} hint={t(`${CC}.opts.attachments.hint`)} />
              <Checkbox checked={draft.marketingConsent} onChange={(marketingConsent) => patch({ marketingConsent })} label={t(`${CC}.opts.consent.label`)} hint={t(`${CC}.opts.consent.hint`)} />
            </div>
            <div className="flex flex-col gap-4 border-t border-line pt-5">
              <div>
                <p className="font-display text-title-3 text-ink">{t(`${CC}.submitted`)}</p>
                <p className="text-small text-muted">{t(`${CC}.submittedHint`)}</p>
              </div>
              <RadioRow name="contact-redirect" checked={draft.redirect === 'profile'} onSelect={() => patch({ redirect: 'profile' })} label={t(`${CC}.redirectProfile`)} hint={t(`${CC}.redirectProfileHint`)} />
              <RadioRow name="contact-redirect" checked={draft.redirect === 'custom'} onSelect={() => patch({ redirect: 'custom' })} label={t(`${CC}.redirectCustom`)} hint={t(`${CC}.redirectCustomHint`)}>
                <Field label={t(`${CC}.customLink`)} error={linkError}>
                  {(id) => <TextInput id={id} value={draft.customLink} invalid={!!linkError} placeholder="https://" onChange={(e) => patch({ customLink: e.target.value })} data-testid="contact-custom-link" />}
                </Field>
              </RadioRow>
            </div>
          </>
        )}
      </div>
    </SettingsModal>
  )
}

/** Stored values (the seed keeps the reference wording) → string keys. */
const CONTACT_OPTIONS: Record<string, string> = {
  'Client phone only': 'phone',
  'Client email only': 'email',
  'Client phone or email': 'phone_or_email',
  'Client phone and email': 'phone_and_email',
}

/** Keep a stored value selectable even if it isn't one of our options. */
function withCurrent(options: { value: string; label: string }[], value: string) {
  return !value || options.some((o) => o.value === value) ? options : [...options, { value, label: value }]
}

function PreviewModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  const c = useSettings().clientConnect
  const link = useContactLink()
  const field = (label: string, el: ReactNode) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-strong text-ink">{label}</span>
      {el}
    </label>
  )
  return (
    <SettingsModal
      open
      onClose={onClose}
      title={t(`${CC}.previewTitle`)}
      footer={
        <>
          <Button className="rounded-full" icon={<Copy size={16} aria-hidden />} onClick={() => void copyText(link, t('settings.common.copied'))}>
            {t(`${CC}.copyLink`)}
          </Button>
          <Button variant="primary" className="rounded-full px-6" onClick={onClose}>
            {t('settings.common.done')}
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-canvas p-5" aria-label={t(`${CC}.previewTitle`)}>
        <h3 className="font-display text-title-2 text-ink">{t(`${CC}.contactUs`)}</h3>
        <p className="mt-1 text-body text-muted">{t(`${CC}.sendTo`, { name: workspace.name })}</p>
        <div className="pointer-events-none mt-5 flex flex-col gap-4" aria-hidden>
          <div className="grid grid-cols-2 gap-3">
            {field(t(`${CC}.firstName`), <input className="input" readOnly tabIndex={-1} />)}
            {field(t(`${CC}.lastName`), <input className="input" readOnly tabIndex={-1} />)}
          </div>
          {CONTACT_OPTIONS[c.requiredContact] !== 'email' && field(t(`${CC}.mobile`), <TextInput prefix="+351" readOnly tabIndex={-1} />)}
          {CONTACT_OPTIONS[c.requiredContact] !== 'phone' && field(t(`${CC}.email`), <input className="input" readOnly tabIndex={-1} />)}
          {field(t(`${CC}.yourMessage`), <textarea className="input min-h-[88px] py-2" placeholder={t(`${CC}.typeMessage`)} readOnly tabIndex={-1} />)}
          {c.attachments && (
            <span className="inline-flex items-center gap-2 text-body-strong text-primary">
              <ImagePlus size={16} aria-hidden />
              {t(`${CC}.attachImage`)}
            </span>
          )}
          {c.marketingConsent && <Checkbox checked={false} onChange={() => undefined} label={t(`${CC}.consentLabel`)} />}
          <p className="text-small text-muted">{t(`${CC}.secure`)}</p>
          <span className="btn-primary w-full justify-center">{t(`${CC}.sendMessage`)}</span>
        </div>
      </div>
    </SettingsModal>
  )
}

function QrModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const link = useContactLink()
  const [qr, setQr] = useState('')
  useEffect(() => {
    let alive = true
    void QRCode.toDataURL(link, { width: 260, margin: 1, color: { dark: '#0B2F2D', light: '#FFFFFF' } }).then((url) => alive && setQr(url))
    return () => {
      alive = false
    }
  }, [link])
  const download = () => {
    const a = document.createElement('a')
    a.href = qr
    a.download = 'contact-page-qr.png'
    a.click()
    toast(t(`${CC}.qrDownloaded`))
  }
  return (
    <SettingsModal
      open
      onClose={onClose}
      size="sm"
      title={t(`${CC}.qrTitle`)}
      subtitle={t(`${CC}.qrSubtitle`)}
      footer={
        <>
          <Button className="rounded-full" onClick={onClose}>
            {t('settings.common.close')}
          </Button>
          <Button variant="primary" className="rounded-full" icon={<Download size={16} aria-hidden />} disabled={!qr} onClick={download} data-testid="qr-download">
            {t(`${CC}.downloadQr`)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 pb-2">
        {qr ? <img src={qr} alt={t(`${CC}.qrAlt`)} className="h-[220px] w-[220px] rounded-lg border border-line" data-testid="qr-image" /> : <div className="h-[220px] w-[220px] animate-pulse rounded-lg bg-sunken" />}
        <p className="break-all text-center text-small text-muted">{link}</p>
      </div>
    </SettingsModal>
  )
}
