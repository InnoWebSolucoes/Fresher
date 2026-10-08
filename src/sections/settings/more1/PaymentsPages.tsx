import { CreditCard, Plug, Smartphone, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Chip, EmptyState, Field, Select, Switch, TextInput, confirm, toast } from '@/components/ui'
import { setSettingsExtra, updateSettings, useSettingsExtra } from '@/api/settings'
import {
  TERMINALS_KEY,
  TERMINAL_MODELS,
  assignTerminalLocation,
  defaultTerminals,
  markTerminalDelivered,
  orderTerminals,
  pairTerminal,
  quoteTerminalOrder,
  renameTerminal,
  testTerminalConnection,
  unpairTerminal,
  type CardTerminal,
} from '@/api/billing'
import { fmtDate, fmtDateTime, money2 } from '@/lib/format'
import type { Settings } from '@/types'
import { useLocations, useSettings, useWorkspace } from '../hooks'
import { ActionsPill, EditCard, PillMenu, SettingsPage, SummaryList, Banner } from '../components/ui'
import { SettingsModal } from '../components/SettingsModal'
import { useAction, useDraft } from '../components/useAction'
import { RowCard, RowStack } from '../scheduling/shared'
import { B, M, ModalFooter, ModalForm } from './shared'

const b = { b: <B /> }

// ─── Payment policy ──────────────────────────────────────────────────────

const PP = `${M}.policy`
type Policy = Settings['paymentPolicy']
const HOURS = [0, 1, 2, 4, 6, 12, 24, 48, 72]

export function PaymentPolicyPage() {
  const { t } = useTranslation()
  const p = useSettings().paymentPolicy
  const [modal, setModal] = useState<'deposits' | 'cancellation' | null>(null)
  return (
    <SettingsPage title={t(`${PP}.title`)} description={t(`${PP}.description`)} learnMore="Payment policy">
      <EditCard title={t(`${PP}.depositsTitle`)} description={t(`${PP}.depositsDescription`)} onEdit={() => setModal('deposits')} testId="policy-deposits">
        <SummaryList
          variant="check"
          items={[{ key: 'dep', on: p.depositsEnabled, text: p.depositsEnabled ? <Trans i18nKey={`${PP}.depositsOn`} values={{ pct: p.depositPct }} components={b} /> : t(`${PP}.depositsOff`) }]}
        />
      </EditCard>
      <EditCard title={t(`${PP}.cancelTitle`)} description={t(`${PP}.cancelDescription`)} onEdit={() => setModal('cancellation')} testId="policy-cancellation">
        <SummaryList
          variant="check"
          items={[
            { key: 'window', on: p.cancellationWindowHours > 0, text: p.cancellationWindowHours > 0 ? <Trans i18nKey={`${PP}.windowOn`} values={{ count: p.cancellationWindowHours }} components={b} /> : t(`${PP}.windowOff`) },
            { key: 'late', on: p.lateCancelFeePct > 0, text: p.lateCancelFeePct > 0 ? <Trans i18nKey={`${PP}.lateOn`} values={{ pct: p.lateCancelFeePct }} components={b} /> : t(`${PP}.lateOff`) },
            { key: 'noshow', on: p.noShowFeePct > 0, text: p.noShowFeePct > 0 ? <Trans i18nKey={`${PP}.noShowOn`} values={{ pct: p.noShowFeePct }} components={b} /> : t(`${PP}.noShowOff`) },
          ]}
        />
      </EditCard>
      {modal && <PolicyModal kind={modal} onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function Percent({ label, hint, value, onChange, error, testId }: { label: string; hint?: string; value: number; onChange: (v: number) => void; error?: string; testId?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className="max-w-[260px]">
      {(id) => <TextInput id={id} type="number" min={0} max={100} suffix="%" value={Number.isNaN(value) ? '' : value} invalid={!!error} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} data-testid={testId} />}
    </Field>
  )
}

function PolicyModal({ kind, onClose }: { kind: 'deposits' | 'cancellation'; onClose: () => void }) {
  const { t } = useTranslation()
  const [draft, patch] = useDraft<Policy>(useSettings().paymentPolicy)
  const [saving, run] = useAction()
  const pctError = (v: number) => (Number.isNaN(v) || v < 0 || v > 100 || !Number.isInteger(v) ? t(`${PP}.pctInvalid`) : undefined)
  const errors = kind === 'deposits' ? [draft.depositsEnabled ? pctError(draft.depositPct) : undefined] : [pctError(draft.lateCancelFeePct), pctError(draft.noShowFeePct)]
  const invalid = errors.some(Boolean)
  const save = () => {
    if (invalid) return
    void run(
      () =>
        updateSettings((s) => {
          s.paymentPolicy = draft
        }),
      t(`${PP}.saved`),
      onClose,
    )
  }
  return (
    <SettingsModal open onClose={onClose} title={t(kind === 'deposits' ? `${PP}.depositsTitle` : `${PP}.cancelTitle`)} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={invalid} testId="policy-save" />}>
      <ModalForm onSubmit={save}>
        {kind === 'deposits' ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-body-strong text-ink">{t(`${PP}.requireDeposit`)}</p>
                <p className="text-small text-muted">{t(`${PP}.requireDepositHint`)}</p>
              </div>
              <Switch checked={draft.depositsEnabled} onChange={(depositsEnabled) => patch({ depositsEnabled })} label={<span className="sr-only">{t(`${PP}.requireDeposit`)}</span>} />
            </div>
            {draft.depositsEnabled && <Percent label={t(`${PP}.depositPct`)} hint={t(`${PP}.depositPctHint`)} value={draft.depositPct} onChange={(depositPct) => patch({ depositPct })} error={errors[0]} testId="policy-deposit-pct" />}
          </>
        ) : (
          <>
            <Field label={t(`${PP}.window`)} hint={t(`${PP}.windowHint`)}>
              {(id) => (
                <Select
                  id={id}
                  value={String(draft.cancellationWindowHours)}
                  onChange={(e) => patch({ cancellationWindowHours: Number(e.target.value) })}
                  options={(HOURS.includes(draft.cancellationWindowHours) ? HOURS : [...HOURS, draft.cancellationWindowHours].sort((a, c) => a - c)).map((h) => ({ value: String(h), label: h === 0 ? t(`${PP}.noWindow`) : t(`${PP}.hoursBefore`, { count: h }) }))}
                  data-testid="policy-window"
                />
              )}
            </Field>
            <Percent label={t(`${PP}.lateFee`)} hint={t(`${PP}.lateFeeHint`)} value={draft.lateCancelFeePct} onChange={(lateCancelFeePct) => patch({ lateCancelFeePct })} error={errors[0]} testId="policy-late" />
            <Percent label={t(`${PP}.noShowFee`)} hint={t(`${PP}.noShowFeeHint`)} value={draft.noShowFeePct} onChange={(noShowFeePct) => patch({ noShowFeePct })} error={errors[1]} testId="policy-noshow" />
          </>
        )}
      </ModalForm>
    </SettingsModal>
  )
}

// ─── Payment methods ─────────────────────────────────────────────────────

const PM = `${M}.methods`
const METHODS_KEY = 'payments.onlineMethods'
type MethodKey = 'card' | 'applePay' | 'googlePay' | 'mbway' | 'multibanco' | 'klarna'
type Methods = Record<MethodKey, boolean>
const METHOD_DEFAULTS: Methods = { card: true, applePay: true, googlePay: true, mbway: true, multibanco: false, klarna: false }
const METHOD_ICONS: Record<MethodKey, ReactNode> = {
  card: <CreditCard size={20} aria-hidden />,
  applePay: <Smartphone size={20} aria-hidden />,
  googlePay: <Smartphone size={20} aria-hidden />,
  mbway: <Wallet size={20} aria-hidden />,
  multibanco: <Wallet size={20} aria-hidden />,
  klarna: <Wallet size={20} aria-hidden />,
}

export function PaymentMethodsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const stored = useSettingsExtra<Partial<Methods>>(METHODS_KEY, METHOD_DEFAULTS)
  const methods = useMemo(() => ({ ...METHOD_DEFAULTS, ...stored }), [stored])
  const [busy, setBusy] = useState<MethodKey | null>(null)
  const toggle = async (key: MethodKey, on: boolean) => {
    if (key === 'card' && !on) {
      toast(t(`${PM}.cardRequired`), 'error')
      return
    }
    setBusy(key)
    try {
      await setSettingsExtra(METHODS_KEY, { ...methods, [key]: on })
      toast(t(on ? `${PM}.enabled` : `${PM}.disabled`, { name: t(`${PM}.names.${key}`) }))
    } finally {
      setBusy(null)
    }
  }
  return (
    <SettingsPage title={t(`${PM}.title`)} description={t(`${PM}.description`)}>
      <EditCard title={t(`${PM}.onlineTitle`)} description={t(`${PM}.onlineDescription`)} testId="methods-online">
        <ul className="divide-y divide-line">
          {(Object.keys(METHOD_DEFAULTS) as MethodKey[]).map((key) => (
            <li key={key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sunken text-ink">{METHOD_ICONS[key]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-body-strong text-ink">{t(`${PM}.names.${key}`)}</p>
                <p className="text-small text-muted">{t(`${PM}.hints.${key}`)}</p>
              </div>
              <Switch checked={methods[key]} disabled={busy !== null} onChange={(on) => void toggle(key, on)} label={<span className="sr-only">{t(`${PM}.names.${key}`)}</span>} />
            </li>
          ))}
        </ul>
      </EditCard>
      <EditCard
        title={t(`${PM}.posTitle`)}
        description={t(`${PM}.posDescription`)}
        action={
          <Button size="sm" className="rounded-full px-4" onClick={() => navigate('/setup/sales/payment-methods')}>
            {t('settings.common.manage')}
          </Button>
        }
      />
    </SettingsPage>
  )
}

// ─── Card terminals ──────────────────────────────────────────────────────

const TM = `${M}.terminals`
type TerminalModal = { kind: 'order' } | { kind: 'pair'; terminal?: CardTerminal } | { kind: 'rename'; terminal: CardTerminal } | { kind: 'location'; terminal: CardTerminal }
const STATUS_TONE: Record<CardTerminal['status'], 'success' | 'neutral' | 'info' | 'warning'> = { online: 'success', offline: 'neutral', shipping: 'info', awaiting_pairing: 'warning' }

export function CardTerminalsPage() {
  const { t } = useTranslation()
  const stored = useSettingsExtra<CardTerminal[] | null>(TERMINALS_KEY, null)
  const terminals = useMemo(() => stored ?? defaultTerminals(), [stored])
  const locations = useLocations()
  const [modal, setModal] = useState<TerminalModal | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [, run] = useAction()
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '-'

  const test = async (terminal: CardTerminal) => {
    setTesting(terminal.id)
    await run(() => testTerminalConnection(terminal.id), t(`${TM}.testOk`, { name: terminal.name }))
    setTesting(null)
  }
  const unpair = async (terminal: CardTerminal) => {
    const ok = await confirm({ title: t(`${TM}.unpairTitle`), body: t(`${TM}.unpairBody`, { name: terminal.name }), confirmLabel: t(`${TM}.unpair`), tone: 'danger' })
    if (ok) await run(() => unpairTerminal(terminal.id), t(`${TM}.unpaired`))
  }
  const subtitle = (x: CardTerminal) => {
    const parts = [x.model, x.serial, locationName(x.locationId)]
    if (x.status === 'shipping' && x.estimatedDelivery) parts.push(t(`${TM}.eta`, { date: fmtDate(x.estimatedDelivery) }))
    if (x.status === 'online' && x.lastCheckedAt) parts.push(t(`${TM}.lastChecked`, { date: fmtDateTime(x.lastCheckedAt) }))
    return parts.join(' • ')
  }

  return (
    <SettingsPage
      title={t(`${TM}.title`)}
      description={t(`${TM}.description`)}
      learnMore="Card terminals"
      actions={
        <>
          <PillMenu label={t('settings.common.options')} width={240} groups={[{ items: [{ label: t(`${TM}.pairExisting`), onSelect: () => setModal({ kind: 'pair' }) }] }]} />
          <Button variant="primary" className="rounded-full px-5" onClick={() => setModal({ kind: 'order' })} data-testid="terminal-order">
            {t(`${TM}.order`)}
          </Button>
        </>
      }
    >
      {terminals.length === 0 ? (
        <div className="card">
          <EmptyState title={t(`${TM}.emptyTitle`)} body={t(`${TM}.emptyBody`)} action={<Button onClick={() => setModal({ kind: 'order' })}>{t(`${TM}.order`)}</Button>} />
        </div>
      ) : (
        <RowStack testId="terminals-list">
          {terminals.map((x) => {
            const paired = x.status === 'online' || x.status === 'offline'
            return (
              <RowCard
                key={x.id}
                testId={`terminal-${x.id}`}
                leading={<CreditCard size={22} aria-hidden />}
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{x.name}</span>
                    <Chip tone={STATUS_TONE[x.status]}>{t(`${TM}.status.${x.status}`)}</Chip>
                  </span>
                }
                subtitle={subtitle(x)}
                trailing={
                  <>
                    {!paired && (
                      <Button size="sm" className="rounded-full" icon={<Plug size={16} aria-hidden />} onClick={() => setModal({ kind: 'pair', terminal: x })} data-testid={`terminal-pair-${x.id}`}>
                        {t(`${TM}.pair`)}
                      </Button>
                    )}
                    <ActionsPill
                      groups={[
                        {
                          items: [
                            { label: t(`${TM}.rename`), onSelect: () => setModal({ kind: 'rename', terminal: x }) },
                            { label: t(`${TM}.changeLocation`), onSelect: () => setModal({ kind: 'location', terminal: x }), disabled: locations.length < 2 },
                            ...(paired ? [{ label: testing === x.id ? t(`${TM}.testing`) : t(`${TM}.test`), onSelect: () => void test(x), disabled: testing !== null }] : []),
                            ...(x.status === 'shipping' ? [{ label: t(`${TM}.markDelivered`), onSelect: () => void run(() => markTerminalDelivered(x.id), t(`${TM}.delivered`)) }] : []),
                          ],
                        },
                        ...(paired ? [{ items: [{ label: t(`${TM}.unpair`), danger: true, onSelect: () => void unpair(x) }] }] : []),
                      ]}
                    />
                  </>
                }
              />
            )
          })}
        </RowStack>
      )}
      {modal?.kind === 'order' && <OrderTerminalModal onClose={() => setModal(null)} />}
      {modal?.kind === 'pair' && <PairModal terminal={modal.terminal} onClose={() => setModal(null)} />}
      {modal?.kind === 'rename' && <RenameModal terminal={modal.terminal} onClose={() => setModal(null)} />}
      {modal?.kind === 'location' && <LocationModal terminal={modal.terminal} onClose={() => setModal(null)} />}
    </SettingsPage>
  )
}

function OrderTerminalModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useLocations()
  const workspace = useWorkspace()
  const [modelId, setModelId] = useState(TERMINAL_MODELS[0].id)
  const [quantity, setQuantity] = useState(1)
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [saving, run] = useAction()
  const quote = quoteTerminalOrder({ modelId, quantity: Math.max(1, Math.min(5, quantity || 1)) })
  const card = workspace.plan.card
  const save = () => void run(() => orderTerminals({ modelId, quantity, locationId }), t(`${TM}.ordered`), onClose)
  return (
    <SettingsModal open onClose={onClose} title={t(`${TM}.orderTitle`)} subtitle={t(`${TM}.orderSubtitle`)} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={!card} saveLabel={t(`${TM}.placeOrder`, { total: money2(quote.total) })} testId="terminal-order-save" />}>
      <ModalForm onSubmit={save}>
        <Field label={t(`${TM}.model`)}>{(id) => <Select id={id} value={modelId} onChange={(e) => setModelId(e.target.value)} options={TERMINAL_MODELS.map((m) => ({ value: m.id, label: `${m.name} · ${money2(m.price)}` }))} />}</Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t(`${TM}.quantity`)}>{(id) => <Select id={id} value={String(quantity)} onChange={(e) => setQuantity(Number(e.target.value))} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />}</Field>
          <Field label={t(`${TM}.deliverTo`)}>{(id) => <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
        </div>
        <dl className="flex flex-col gap-1.5 rounded-lg bg-sunken p-4 text-body">
          <div className="flex justify-between">
            <dt className="text-muted">{t(`${TM}.subtotal`)}</dt>
            <dd className="text-ink">{money2(quote.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t(`${TM}.tax`)}</dt>
            <dd className="text-ink">{money2(quote.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 text-body-strong">
            <dt className="text-ink">{t(`${TM}.total`)}</dt>
            <dd className="text-ink">{money2(quote.total)}</dd>
          </div>
        </dl>
        {card ? <p className="text-small text-muted">{t(`${TM}.chargedTo`, { brand: card.brand, last4: card.last4 })}</p> : <Banner tone="warning">{t(`${TM}.noCard`)}</Banner>}
      </ModalForm>
    </SettingsModal>
  )
}

function PairModal({ terminal, onClose }: { terminal?: CardTerminal; onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useLocations()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState(terminal?.locationId ?? locations[0]?.id ?? '')
  const [touched, setTouched] = useState(false)
  const [saving, run] = useAction()
  const valid = /^\d{6}$/.test(code.replace(/\s+/g, ''))
  const error = touched && !valid ? t(`${TM}.codeInvalid`) : undefined
  const save = () => {
    setTouched(true)
    if (!valid) return
    void run(() => pairTerminal({ terminalId: terminal?.id, code, locationId, name: name || undefined }), t(`${TM}.paired`), onClose)
  }
  return (
    <SettingsModal open onClose={onClose} title={t(`${TM}.pairTitle`)} subtitle={terminal ? terminal.name : t(`${TM}.pairSubtitle`)} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={t(`${TM}.pair`)} testId="terminal-pair-save" />}>
      <ModalForm onSubmit={save}>
        <Field label={t(`${TM}.code`)} hint={t(`${TM}.codeHint`)} error={error}>
          {(id) => <TextInput id={id} inputMode="numeric" maxLength={7} value={code} invalid={!!error} placeholder="000000" onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} data-testid="terminal-code" />}
        </Field>
        {!terminal && <Field label={t(`${TM}.name`)} optional>{(id) => <TextInput id={id} value={name} maxLength={60} placeholder={t(`${TM}.namePlaceholder`)} onChange={(e) => setName(e.target.value)} />}</Field>}
        {locations.length > 1 && <Field label={t(`${TM}.location`)}>{(id) => <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>}
      </ModalForm>
    </SettingsModal>
  )
}

function RenameModal({ terminal, onClose }: { terminal: CardTerminal; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(terminal.name)
  const [saving, run] = useAction()
  const save = () => name.trim() && void run(() => renameTerminal(terminal.id, name), t(`${TM}.renamed`), onClose)
  return (
    <SettingsModal open onClose={onClose} title={t(`${TM}.renameTitle`)} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} disabled={!name.trim()} testId="terminal-rename-save" />}>
      <ModalForm onSubmit={save}>
        <Field label={t(`${TM}.name`)} error={!name.trim() ? t('settings.common.required') : undefined}>
          {(id) => <TextInput id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-testid="terminal-name" />}
        </Field>
      </ModalForm>
    </SettingsModal>
  )
}

function LocationModal({ terminal, onClose }: { terminal: CardTerminal; onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useLocations()
  const [locationId, setLocationId] = useState(terminal.locationId)
  const [saving, run] = useAction()
  const save = () => void run(() => assignTerminalLocation(terminal.id, locationId), t(`${TM}.locationSaved`), onClose)
  return (
    <SettingsModal open onClose={onClose} title={t(`${TM}.changeLocation`)} subtitle={terminal.name} footer={<ModalFooter onCancel={onClose} onSave={save} saving={saving} />}>
      <ModalForm onSubmit={save}>
        <Field label={t(`${TM}.location`)}>{(id) => <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
      </ModalForm>
    </SettingsModal>
  )
}
