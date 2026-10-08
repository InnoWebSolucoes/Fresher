import clsx from 'clsx'
import { Banknote, ChevronRight, HandCoins, Landmark, Paperclip, Pencil, Plus, X } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Checkbox, Field, Select, TextArea, TextInput, toast } from '@/components/ui'
import { cashMovement, closeRegister, countRegister, createRegister, openRegister } from '@/api/register'
import { ApiError } from '@/api/client'
import { useDb } from '@/store/db'
import { useCurrentUser } from '@/store/session'
import { useNow } from '@/lib/time'
import { fmtDate, money, round2 } from '@/lib/format'
import type { CashRegister, RegisterSettings } from '@/types'
import { AmountInput, CashCounterModal, FlowHeading, FullscreenOverlay, parseAmount } from '../shared/ui'
import { registerBreakdown, type BreakdownLine } from './math'

/** Which register flow is open (owned by the Register page or the period drawer). */
export type RegisterFlow =
  | { kind: 'setup'; locationId?: string }
  | { kind: 'open'; registerId: string }
  | { kind: 'cash_in' | 'cash_out'; sessionId: string }
  | { kind: 'count' | 'close'; sessionId: string }

export function RegisterFlowHost({ flow, onClose, onViewActivity }: { flow: RegisterFlow | null; onClose: () => void; onViewActivity?: (sessionId: string) => void }) {
  if (!flow) return null
  if (flow.kind === 'setup') return <SetupRegisterFlow locationId={flow.locationId} onClose={onClose} />
  if (flow.kind === 'open') return <OpenRegisterFlow registerId={flow.registerId} onClose={onClose} />
  if (flow.kind === 'cash_in' || flow.kind === 'cash_out') return <CashMovementFlow type={flow.kind} sessionId={flow.sessionId} onClose={onClose} />
  return <CountFlow mode={flow.kind} sessionId={flow.sessionId} onClose={onClose} onViewActivity={onViewActivity} />
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback)

function useRegisterContext(registerId: string | undefined) {
  const registers = useDb((s) => s.registers)
  const locations = useDb((s) => s.locations)
  const register = registers.find((r) => r.id === registerId)
  const location = locations.find((l) => l.id === register?.locationId)
  return { register, location, subtitle: register ? `${register.name} • ${location?.name ?? ''}` : '' }
}

function minFloatFor(register: CashRegister | undefined, when: 'opening' | 'closing') {
  const min = register?.settings.minFloat
  if (!min || !min.amount) return undefined
  return min.when === 'both' || min.when === when ? min.amount : undefined
}

function NoteField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { t } = useTranslation()
  return (
    <Field label={label ?? t('sales.register.note')} counter={{ value: value.length, max: 100 }}>
      {(id) => <TextArea id={id} value={value} maxLength={100} placeholder={t('sales.register.notePlaceholder')} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  )
}

// ─── Set up register preferences ───────────────────────────────────────────

function SetupRegisterFlow({ locationId, onClose }: { locationId?: string; onClose: () => void }) {
  const { t } = useTranslation()
  const locations = useDb((s) => s.locations)
  const registers = useDb((s) => s.registers)
  const workspace = useDb((s) => s.workspace)
  const withoutRegister = locations.filter((l) => !registers.some((r) => r.locationId === l.id && !r.archived))
  const [location, setLocation] = useState(locationId ?? withoutRegister[0]?.id ?? locations[0]?.id ?? '')
  const [name, setName] = useState('')
  const [settings, setSettings] = useState<Omit<RegisterSettings, 'minFloat'>>({ requireOpen: true, middayCounts: false, promptLeftOpen: false, autoPrint: false, autoEmail: false })
  const [minOn, setMinOn] = useState(false)
  const [minAmount, setMinAmount] = useState('')
  const [minWhen, setMinWhen] = useState<'opening' | 'closing' | 'both'>('both')
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})
  const [saving, setSaving] = useState(false)
  const locationName = locations.find((l) => l.id === location)?.name ?? workspace.name

  const submit = async () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('sales.register.setup.nameRequired')
    const amount = parseAmount(minAmount)
    if (minOn && (amount === null || amount <= 0)) next.amount = t('sales.register.setup.amountRequired')
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await createRegister({ name: name.trim(), locationId: location, settings: { ...settings, minFloat: minOn && amount ? { amount, when: minWhen } : undefined } })
      toast(t('sales.register.toasts.created'))
      onClose()
    } catch (e) {
      toast(errorText(e, t('sales.common.somethingWrong')), 'error')
      setSaving(false)
    }
  }

  const option = (key: keyof typeof settings, label: string, hint: string) => (
    <Checkbox key={key} label={label} hint={hint} checked={settings[key]} onChange={(v) => setSettings((s) => ({ ...s, [key]: v }))} />
  )

  return (
    <FullscreenOverlay
      open
      onClose={onClose}
      label={t('sales.register.setup.title')}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void submit()} iconRight={<ChevronRight size={16} aria-hidden />}>
          {t('sales.common.continue')}
        </Button>
      }
    >
      <FlowHeading title={t('sales.register.setup.title')} subtitle={t('sales.register.setup.subtitle', { location: locationName })} />
      <div className="card flex flex-col gap-5 p-5 md:gap-6 md:p-8">
        {locations.length > 1 && (
          <Field label={t('sales.register.setup.location')}>{(id) => <Select id={id} value={location} onChange={(e) => setLocation(e.target.value)} options={locations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
        )}
        <Field label={t('sales.register.setup.name')} counter={{ value: name.length, max: 32 }} error={errors.name}>
          {(id) => <TextInput id={id} value={name} maxLength={32} placeholder={t('sales.register.setup.namePlaceholder')} invalid={Boolean(errors.name)} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div>
          <h2 className="mb-4 font-display text-title-3 text-ink">{t('sales.register.setup.advanced')}</h2>
          <div className="flex flex-col gap-5">
            {option('requireOpen', t('sales.register.setup.requireOpen'), t('sales.register.setup.requireOpenHint'))}
            <div>
              <Checkbox label={t('sales.register.setup.minFloat')} hint={t('sales.register.setup.minFloatHint')} checked={minOn} onChange={setMinOn} />
              {minOn && (
                <div className="mt-4 grid gap-4 pl-0 sm:grid-cols-2 md:pl-8">
                  <Field label={t('sales.register.setup.amount')} error={errors.amount}>
                    {(id) => <AmountInput id={id} value={minAmount} onChange={setMinAmount} invalid={Boolean(errors.amount)} />}
                  </Field>
                  <Field label={t('sales.register.setup.requiredWhen')}>
                    {(id) => (
                      <Select
                        id={id}
                        value={minWhen}
                        onChange={(e) => setMinWhen(e.target.value as typeof minWhen)}
                        options={[
                          { value: 'opening', label: t('sales.register.setup.whenOpening') },
                          { value: 'closing', label: t('sales.register.setup.whenClosing') },
                          { value: 'both', label: t('sales.register.setup.whenBoth') },
                        ]}
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>
            {option('middayCounts', t('sales.register.setup.middayCounts'), t('sales.register.setup.middayCountsHint'))}
            {option('promptLeftOpen', t('sales.register.setup.promptLeftOpen'), t('sales.register.setup.promptLeftOpenHint'))}
            {option('autoPrint', t('sales.register.setup.autoPrint'), t('sales.register.setup.autoPrintHint'))}
            {option('autoEmail', t('sales.register.setup.autoEmail'), t('sales.register.setup.autoEmailHint'))}
          </div>
        </div>
      </div>
    </FullscreenOverlay>
  )
}

// ─── Open register ──────────────────────────────────────────────────────────

function OpenRegisterFlow({ registerId, onClose }: { registerId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { register, subtitle } = useRegisterContext(registerId)
  const sessions = useDb((s) => s.registerSessions)
  const lastFloat = useMemo(
    () =>
      sessions
        .filter((s) => s.registerId === registerId && s.closedAt)
        .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0]?.closingFloat,
    [sessions, registerId],
  )
  const [amount, setAmount] = useState(lastFloat !== undefined ? lastFloat.toFixed(2) : '')
  const [note, setNote] = useState('')
  const [counter, setCounter] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const min = minFloatFor(register, 'opening')

  const submit = async () => {
    const value = parseAmount(amount) ?? 0
    if (min !== undefined && value < min) {
      setError(t('sales.register.minimumError', { amount: money(min) }))
      return
    }
    setError(undefined)
    setSaving(true)
    try {
      await openRegister(registerId, value, note.trim() || undefined)
      toast(t('sales.register.toasts.opened'))
      onClose()
    } catch (e) {
      toast(errorText(e, t('sales.common.somethingWrong')), 'error')
      setSaving(false)
    }
  }

  return (
    <FullscreenOverlay
      open
      onClose={onClose}
      escape={!counter}
      label={t('sales.register.open.title')}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {t('sales.register.openRegister')}
        </Button>
      }
    >
      <FlowHeading title={t('sales.register.open.title')} subtitle={subtitle} />
      <div className="card flex flex-col gap-5 p-5 md:gap-6 md:p-8">
        <Field label={t('sales.register.open.openingFloat')} error={error} hint={min !== undefined ? t('sales.register.minimum', { amount: money(min) }) : undefined}>
          {(id) => <AmountInput id={id} value={amount} onChange={setAmount} onCount={() => setCounter(true)} invalid={Boolean(error)} placeholder="0" />}
        </Field>
        <NoteField value={note} onChange={setNote} />
      </div>
      {counter && <CashCounterModal open onClose={() => setCounter(false)} onApply={(total) => setAmount(total.toFixed(2))} />}
    </FullscreenOverlay>
  )
}

// ─── Cash in / Cash out ────────────────────────────────────────────────────

const CASH_IN_REASONS = [
  { key: 'pettyChange', icon: Banknote },
  { key: 'transferIn', icon: Landmark },
  { key: 'otherIn', icon: Pencil },
] as const
const CASH_OUT_REASONS = [
  { key: 'pettyPurchases', icon: Banknote },
  { key: 'tips', icon: HandCoins },
  { key: 'deposit', icon: Landmark },
  { key: 'otherOut', icon: Pencil },
] as const

function CashMovementFlow({ type, sessionId, onClose }: { type: 'cash_in' | 'cash_out'; sessionId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const now = useNow()
  const user = useCurrentUser()
  const sessions = useDb((s) => s.registerSessions)
  const payments = useDb((s) => s.payments)
  const sales = useDb((s) => s.sales)
  const customMethods = useDb((s) => s.settings.customPaymentMethods)
  const session = sessions.find((s) => s.id === sessionId)
  const { register } = useRegisterContext(session?.registerId)
  const [reason, setReason] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [counter, setCounter] = useState(false)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inCash = useMemo(() => (session ? registerBreakdown(session, register, payments, sales, customMethods).cash.expected : 0), [session, register, payments, sales, customMethods])
  const reasons = type === 'cash_in' ? CASH_IN_REASONS : CASH_OUT_REASONS

  if (!session) return null
  const reasonTitle = (key: string) => (key === 'otherIn' ? t('sales.register.cash.inAdjustment') : key === 'otherOut' ? t('sales.register.cash.outAdjustment') : t(`sales.register.cash.reasons.${key}`))

  const pick = (key: string) => {
    if (key === 'tips') {
      onClose()
      navigate(`/team/payrun/new?cashRegisterId=${session.registerId}`)
      return
    }
    setReason(key)
  }

  const submit = async () => {
    const value = parseAmount(amount)
    if (value === null || value <= 0) {
      setError(t('sales.register.cash.amountRequired'))
      return
    }
    if (type === 'cash_out' && value > inCash + 0.001) {
      setError(t('sales.register.cash.tooMuch', { amount: money(inCash) }))
      return
    }
    setError(undefined)
    setSaving(true)
    const fullNote = [note.trim(), file ? t('sales.register.cash.attachmentNote', { name: file.name }) : ''].filter(Boolean).join(' · ')
    try {
      await cashMovement(session.id, type, t(`sales.register.cash.reasons.${reason}`), value, fullNote || undefined)
      toast(type === 'cash_in' ? t('sales.register.toasts.cashAdded') : t('sales.register.toasts.cashRemoved'))
      onClose()
    } catch (e) {
      toast(errorText(e, t('sales.common.somethingWrong')), 'error')
      setSaving(false)
    }
  }

  return (
    <FullscreenOverlay
      open
      onClose={onClose}
      escape={!counter}
      steps={{ total: 2, current: reason ? 2 : 1 }}
      onBack={reason ? () => setReason(null) : undefined}
      label={type === 'cash_in' ? t('sales.register.cashIn') : t('sales.register.cashOut')}
      actions={
        reason ? (
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {t('sales.common.confirm')}
          </Button>
        ) : undefined
      }
    >
      {!reason ? (
        <>
          <FlowHeading title={type === 'cash_in' ? t('sales.register.cash.chooseIn') : t('sales.register.cash.chooseOut')} subtitle={type === 'cash_in' ? t('sales.register.cash.chooseInHint') : t('sales.register.cash.chooseOutHint')} />
          <div className="flex flex-col gap-4">
            {reasons.map(({ key, icon: Icon }) => (
              <button key={key} type="button" onClick={() => pick(key)} className="card flex items-center gap-4 p-4 text-left transition-colors hover:border-line-strong hover:bg-sunken/50 md:p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary md:h-14 md:w-14">
                  <Icon size={22} aria-hidden />
                </span>
                <span className="flex-1 text-body-lg font-semibold text-ink">{t(`sales.register.cash.reasons.${key}`)}</span>
                <ChevronRight size={20} className="text-muted" aria-hidden />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <FlowHeading title={reasonTitle(reason)} subtitle={type === 'cash_in' ? t('sales.register.cash.formInHint') : t('sales.register.cash.formOutHint')} />
          <div className="card flex flex-col gap-5 p-5 md:gap-6 md:p-8">
            <Field label={t('sales.register.cash.amount')} error={error} hint={type === 'cash_out' ? t('sales.register.cash.available', { amount: money(inCash) }) : undefined}>
              {(id) => <AmountInput id={id} value={amount} onChange={setAmount} onCount={() => setCounter(true)} invalid={Boolean(error)} />}
            </Field>
            <NoteField value={note} onChange={setNote} />
            <div>
              <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <span className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface pl-4 pr-2 text-body text-ink">
                  <Paperclip size={16} aria-hidden />
                  {file.name}
                  <button type="button" onClick={() => setFile(null)} aria-label={t('sales.register.cash.removeAttachment')} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-sunken">
                    <X size={14} aria-hidden />
                  </button>
                </span>
              ) : (
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => fileRef.current?.click()} className="rounded-full">
                  {t('sales.register.cash.addAttachment')}
                </Button>
              )}
            </div>
            <p className="text-body text-muted">
              {user ? `${user.firstName} ${user.lastName}` : ''} • {fmtDate(now)}
            </p>
          </div>
        </>
      )}
      {counter && <CashCounterModal open onClose={() => setCounter(false)} onApply={(total) => setAmount(total.toFixed(2))} />}
    </FullscreenOverlay>
  )
}

// ─── Count register / Close register ───────────────────────────────────────

function CountFlow({ mode, sessionId, onClose, onViewActivity }: { mode: 'count' | 'close'; sessionId: string; onClose: () => void; onViewActivity?: (sessionId: string) => void }) {
  const { t } = useTranslation()
  const sessions = useDb((s) => s.registerSessions)
  const payments = useDb((s) => s.payments)
  const sales = useDb((s) => s.sales)
  const customMethods = useDb((s) => s.settings.customPaymentMethods)
  const session = sessions.find((s) => s.id === sessionId)
  const { register, subtitle } = useRegisterContext(session?.registerId)
  const breakdown = useMemo(() => (session ? registerBreakdown(session, register, payments, sales, customMethods) : null), [session, register, payments, sales, customMethods])
  const editableLines = useMemo(() => breakdown?.groups.flatMap((g) => g.lines.filter((l) => l.editable)) ?? [], [breakdown])
  const [inputs, setInputs] = useState<Record<string, string>>(() => Object.fromEntries(editableLines.map((l) => [l.key, l.expected.toFixed(2)])))
  const [cash, setCash] = useState('')
  const [closingFloat, setClosingFloat] = useState(() => {
    const min = minFloatFor(register, 'closing')
    return min !== undefined ? min.toFixed(2) : ''
  })
  const [toBank, setToBank] = useState('')
  const [note, setNote] = useState('')
  const [counter, setCounter] = useState<null | 'cash' | 'float' | 'bank'>(null)
  const [errors, setErrors] = useState<{ cash?: string; float?: string; split?: string }>({})
  const [saving, setSaving] = useState(false)

  if (!session || !breakdown) return null
  const minClose = minFloatFor(register, 'closing')
  const countedOf = (line: BreakdownLine) => (line.editable ? (parseAmount(inputs[line.key] ?? '') ?? 0) : line.expected)
  const countedCash = parseAmount(cash)
  const countedTotal = round2(breakdown.groups.reduce((s, g) => s + g.lines.reduce((x, l) => x + countedOf(l), 0), 0) + (countedCash ?? 0))
  const difference = round2(countedTotal - breakdown.total)

  const submit = async () => {
    const next: typeof errors = {}
    if (countedCash === null) next.cash = t('sales.register.countFlow.cashRequired')
    if (mode === 'close' && countedCash !== null) {
      const float = parseAmount(closingFloat) ?? 0
      const bank = parseAmount(toBank) ?? 0
      if (minClose !== undefined && float < minClose && countedCash >= minClose) next.float = t('sales.register.minimumError', { amount: money(minClose) })
      if (Math.abs(round2(float + bank) - countedCash) > 0.004) next.split = t('sales.register.countFlow.splitError')
    }
    setErrors(next)
    if (Object.keys(next).length) return
    const counted: Record<string, number> = { cash: countedCash ?? 0 }
    breakdown.groups.forEach((g) => g.lines.forEach((l) => (counted[l.key] = countedOf(l))))
    setSaving(true)
    try {
      if (mode === 'count') {
        await countRegister(session.id, counted, note.trim() || undefined)
        toast(t('sales.register.toasts.counted'))
      } else {
        await closeRegister(session.id, { counted, closingFloat: parseAmount(closingFloat) ?? 0, cashToBank: parseAmount(toBank) ?? 0, note: note.trim() || undefined })
        toast(t('sales.register.toasts.closed'))
      }
      onClose()
    } catch (e) {
      toast(errorText(e, t('sales.common.somethingWrong')), 'error')
      setSaving(false)
    }
  }

  const diffCell = (n: number, strong?: boolean) => <span className={clsx('tabular', n < 0 ? 'text-danger' : n > 0 ? 'text-success' : 'text-ink', strong && 'font-semibold')}>{money(n)}</span>
  const cell = 'px-3 py-3 text-right md:px-5 md:py-3.5'
  // Phones: the table scrolls sideways inside its card, with the payment type column pinned.
  const first = 'sticky left-0 z-[1] bg-surface shadow-[1px_0_0_rgb(var(--border))] md:static md:z-auto md:bg-transparent md:shadow-none'
  const lineLabel = (l: BreakdownLine) => l.label ?? t(`sales.register.lines.${l.labelKey}`)

  const rows: ReactNode[] = []
  for (const g of breakdown.groups) {
    const groupCounted = round2(g.lines.reduce((s, l) => s + countedOf(l), 0))
    rows.push(
      <tr key={g.key} className="border-b border-line font-semibold">
        <td className={clsx('px-3 py-3 text-ink md:px-5 md:py-3.5', first)}>{t(`sales.register.groups.${g.key}`)}</td>
        <td className={cell}>{money(g.expected)}</td>
        <td className={cell}>{money(groupCounted)}</td>
        <td className={cell}>{diffCell(round2(groupCounted - g.expected), true)}</td>
      </tr>,
    )
    for (const l of g.lines) {
      rows.push(
        <tr key={l.key} className="border-b border-line">
          <td className={clsx('py-3 pl-6 pr-3 text-ink md:py-3.5 md:pl-10 md:pr-5', first)}>{lineLabel(l)}</td>
          <td className={cell}>{money(l.expected)}</td>
          <td className="w-36 px-3 py-2 text-right md:w-48 md:px-5">
            {l.editable ? <AmountInput value={inputs[l.key] ?? ''} onChange={(v) => setInputs((s) => ({ ...s, [l.key]: v }))} align="right" className="h-10" /> : money(l.expected)}
          </td>
          <td className={cell}>{diffCell(round2(countedOf(l) - l.expected))}</td>
        </tr>,
      )
    }
  }

  const title = mode === 'count' ? t('sales.register.countFlow.countTitle') : t('sales.register.countFlow.closeTitle')
  return (
    <FullscreenOverlay
      open
      onClose={onClose}
      escape={!counter}
      width="max-w-[1100px]"
      label={title}
      actions={
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          {mode === 'count' ? t('sales.register.countFlow.submitCount') : t('sales.register.closeRegister')}
        </Button>
      }
    >
      <FlowHeading title={title} subtitle={subtitle} />
      {mode === 'close' && countedCash !== null && difference !== 0 && (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning-subtle px-5 py-4 text-body text-ink" role="status">
          {difference < 0 ? t('sales.register.countFlow.lessThanExpected', { amount: money(-difference) }) : t('sales.register.countFlow.moreThanExpected', { amount: money(difference) })}{' '}
          {onViewActivity && (
            <button type="button" className="text-primary hover:underline" onClick={() => onViewActivity(session.id)}>
              {t('sales.register.countFlow.viewActivity')}
            </button>
          )}
        </div>
      )}
      <div className="card overflow-x-auto p-1 md:p-4">
        <table className="w-full min-w-[540px] text-body md:min-w-[640px]">
          <thead>
            <tr className="border-b border-line text-body-strong text-ink">
              <th scope="col" className={clsx('px-3 py-3 text-left md:px-5 md:py-3.5', first)}>
                {t('sales.register.countFlow.paymentTypes')}
              </th>
              <th scope="col" className="px-3 py-3 text-right md:px-5 md:py-3.5">
                {t('sales.register.expected')}
              </th>
              <th scope="col" className="px-3 py-3 text-right md:px-5 md:py-3.5">
                {t('sales.register.counted')}
              </th>
              <th scope="col" className="px-3 py-3 text-right md:px-5 md:py-3.5">
                {t('sales.register.difference')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr className="border-b border-line font-semibold">
              <td className={clsx('px-3 py-3 text-ink md:px-5 md:py-3.5', first)}>{t('sales.register.lines.cash')}</td>
              <td className={cell}>{money(breakdown.cash.expected)}</td>
              <td className="w-36 px-3 py-2 text-right md:w-48 md:px-5">
                <AmountInput value={cash} onChange={setCash} onCount={() => setCounter('cash')} align="right" invalid={Boolean(errors.cash)} className="h-10" />
              </td>
              <td className={cell}>{countedCash === null ? '-' : diffCell(round2(countedCash - breakdown.cash.expected), true)}</td>
            </tr>
            <tr className="font-semibold">
              <td className={clsx('px-3 py-3 text-ink md:px-5 md:py-3.5', first)}>{t('sales.register.totalBalance')}</td>
              <td className={cell}>{money(breakdown.total)}</td>
              <td className={cell}>{money(countedTotal)}</td>
              <td className={cell}>{diffCell(difference, true)}</td>
            </tr>
          </tbody>
        </table>
        {errors.cash && <p className="px-5 pb-2 text-right text-small text-danger">{errors.cash}</p>}
      </div>

      {mode === 'close' && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 md:gap-6">
          <div className="card p-5 md:p-6">
            <Field label={t('sales.register.countFlow.closingFloat')} hint={minClose !== undefined ? t('sales.register.minimum', { amount: money(minClose) }) : undefined} error={errors.float}>
              {(id) => (
                <>
                  <p className="-mt-1 mb-3 text-small text-muted">{t('sales.register.countFlow.closingFloatHint')}</p>
                  <AmountInput id={id} value={closingFloat} onChange={setClosingFloat} onCount={() => setCounter('float')} invalid={Boolean(errors.float || errors.split)} />
                </>
              )}
            </Field>
          </div>
          <div className="card p-5 md:p-6">
            <Field label={t('sales.register.countFlow.cashToBank')}>
              {(id) => (
                <>
                  <p className="-mt-1 mb-3 text-small text-muted">{t('sales.register.countFlow.cashToBankHint')}</p>
                  <AmountInput id={id} value={toBank} onChange={setToBank} onCount={() => setCounter('bank')} invalid={Boolean(errors.split)} />
                </>
              )}
            </Field>
          </div>
          {errors.split && (
            <p className="text-small text-danger md:col-span-2" role="alert">
              {errors.split}
            </p>
          )}
        </div>
      )}

      <div className="card mt-6 p-5 md:p-6">
        <NoteField value={note} onChange={setNote} label={t('sales.register.addNote')} />
      </div>
      {counter && (
        <CashCounterModal
          open
          onClose={() => setCounter(null)}
          onApply={(total) => {
            const v = total.toFixed(2)
            if (counter === 'cash') setCash(v)
            else if (counter === 'float') setClosingFloat(v)
            else setToBank(v)
          }}
        />
      )}
    </FullscreenOverlay>
  )
}

