import clsx from 'clsx'
import { Delete, KeyRound, LockKeyhole, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setSettingsExtra, updateSettings } from '@/api/settings'
import { Avatar, Button, Checkbox, Field, IconButton, Modal, Select, TextInput, confirm } from '@/components/ui'
import { fullName } from '@/lib/format'
import { useDb } from '@/store/db'
import type { ID, Settings } from '@/types'
import { CardButton, EditCard, SettingsPage, SummaryList } from '../components/ui'
import { useAction } from '../components/useAction'
import { EXTRA_PINS, randomPin, usePins, type Pins } from '../team/data'
import { StateChip, TeamFullPage } from '../team/parts'

const PIN_BASE = '/setup/team/pin-switching'
const LOCK_AFTER = [1, 2, 5, 10, 15, 30]
type Pin = Settings['pinSwitching']

/** Team members who get a PIN (active, including the owner). */
function usePinMembers() {
  const members = useDb((s) => s.teamMembers)
  return useMemo(() => members.filter((m) => !m.archived).sort((a, b) => a.order - b.order), [members])
}

/** Settings › Team › PIN switching (settings-team.md §7). */
export function PinSwitchingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pin = useDb((s) => s.settings.pinSwitching)
  const pins = usePins()
  const members = usePinMembers()
  const [busy, run] = useAction()
  const withPin = members.filter((m) => pins[m.id])

  const turnOff = async () => {
    const ok = await confirm({ title: t('settings.more2.pin.offTitle'), body: t('settings.more2.pin.offBody'), confirmLabel: t('settings.more2.pin.turnOff'), cancelLabel: t('settings.common.cancel'), tone: 'danger' })
    if (!ok) return
    await run(
      () =>
        updateSettings((s) => {
          s.pinSwitching.enabled = false
        }),
      t('settings.more2.pin.toast.off'),
    )
  }

  return (
    <SettingsPage title={t('settings.more2.pin.title')} description={t('settings.more2.pin.description')} learnMore={t('settings.more2.pin.title')}>
      <EditCard
        testId="pin-switching"
        title={
          <span className="flex items-center gap-2">
            {t('settings.more2.pin.title')}
            <StateChip on={pin.enabled} onLabel={t('settings.common.on')} offLabel={t('settings.common.off')} />
          </span>
        }
        description={t('settings.more2.pin.cardBody')}
        action={
          pin.enabled ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void turnOff()} loading={busy} data-testid="pin-turn-off">
                {t('settings.more2.pin.turnOff')}
              </Button>
              <CardButton onClick={() => navigate(`${PIN_BASE}/setup`)}>{t('settings.common.edit')}</CardButton>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => navigate(`${PIN_BASE}/setup`)} data-testid="pin-setup">
              {t('settings.more2.pin.setUp')}
            </Button>
          )
        }
      >
        {pin.enabled ? (
          <div className="flex flex-col gap-5">
            <SummaryList
              items={[
                { key: 'i', text: pin.lockInactive ? t('settings.more2.pin.sumInactive', { count: pin.lockAfterMin }) : t('settings.more2.pin.sumInactiveOff') },
                { key: 'c', text: t(pin.lockAfterCheckout ? 'settings.more2.pin.sumCheckout' : 'settings.more2.pin.sumCheckoutOff') },
                { key: 's', text: t('settings.more2.pin.sumStyle', { style: t(`settings.more2.pin.${pin.style}`) }) },
              ]}
            />
            <div>
              <p className="mb-2 text-body-strong text-ink">{t('settings.more2.pin.membersWithPin', { count: withPin.length, total: members.length })}</p>
              <div className="flex flex-wrap gap-2">
                {withPin.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-small text-ink">
                    <Avatar name={fullName(m)} color={m.color} size={24} />
                    {fullName(m)}
                    <span className="tracking-widest text-muted" aria-label={t('settings.more2.pin.pinHidden')}>
                      ••••
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : undefined}
      </EditCard>
    </SettingsPage>
  )
}

// ─── Set up wizard ─────────────────────────────────────────────────────────

/** Full-screen PIN switching set up: lock screen → PINs → turn on. */
export function PinSwitchingSetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const saved = useDb((s) => s.settings.pinSwitching)
  const savedPins = usePins()
  const members = usePinMembers()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Pin>(saved)
  const [pins, setPins] = useState<Pins>(() => Object.fromEntries(members.map((m) => [m.id, savedPins[m.id] ?? ''])))
  const [showErrors, setShowErrors] = useState(false)
  const [preview, setPreview] = useState(false)
  const [busy, run] = useAction()
  const set = (patch: Partial<Pin>) => setDraft((d) => ({ ...d, ...patch }))

  const errors = useMemo(() => {
    const out: Record<ID, string> = {}
    const seen = new Map<string, number>()
    members.forEach((m) => seen.set(pins[m.id] ?? '', (seen.get(pins[m.id] ?? '') ?? 0) + 1))
    members.forEach((m) => {
      const value = pins[m.id] ?? ''
      if (!/^\d{4}$/.test(value)) out[m.id] = t('settings.more2.pin.pinInvalid')
      else if ((seen.get(value) ?? 0) > 1) out[m.id] = t('settings.more2.pin.pinDuplicate')
    })
    return out
  }, [members, pins, t])

  const close = () => navigate(PIN_BASE)
  const finish = () =>
    run(
      async () => {
        await setSettingsExtra<Pins>(EXTRA_PINS, Object.fromEntries(members.map((m) => [m.id, pins[m.id]])))
        await updateSettings((s) => {
          s.pinSwitching = { ...draft, enabled: true }
        })
      },
      t('settings.more2.pin.toast.on'),
      close,
    )
  const next = () => {
    if (step === 1) {
      setShowErrors(true)
      if (Object.keys(errors).length) return
    }
    if (step < 2) setStep(step + 1)
    else void finish()
  }
  const generateAll = () => {
    const used: string[] = []
    const out: Pins = {}
    members.forEach((m) => {
      const current = pins[m.id] ?? ''
      const keep = /^\d{4}$/.test(current) && !used.includes(current)
      out[m.id] = keep ? current : randomPin(used)
      used.push(out[m.id])
    })
    setPins(out)
  }

  return (
    <TeamFullPage step={{ total: 3, current: step }} onBack={step > 0 ? () => setStep(step - 1) : undefined} onClose={close} onSave={next} saving={busy} saveLabel={t(step === 2 ? 'settings.more2.pin.turnOn' : 'settings.common.continue')} testId="pin-setup-wizard">
      {step === 0 && (
        <>
          <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{t('settings.more2.pin.step1')}</h1>
          <section className="mt-8">
            <h2 className="text-body-lg font-semibold text-ink">{t('settings.more2.pin.autoLock')}</h2>
            <p className="mt-1 text-body text-muted">{t('settings.more2.pin.autoLockBody')}</p>
            <div className="mt-4 flex flex-col gap-4">
              <Checkbox checked={draft.lockInactive} onChange={(v) => set({ lockInactive: v })} label={t('settings.more2.pin.lockInactive')} />
              {draft.lockInactive && (
                <Select
                  aria-label={t('settings.more2.pin.lockAfter')}
                  className="ml-8 max-w-[calc(100%-2rem)]"
                  value={String(draft.lockAfterMin)}
                  onChange={(e) => set({ lockAfterMin: Number(e.target.value) })}
                  options={LOCK_AFTER.map((n) => ({ value: String(n), label: t('settings.more2.pin.after', { count: n }) }))}
                />
              )}
              <Checkbox checked={draft.lockAfterCheckout} onChange={(v) => set({ lockAfterCheckout: v })} label={t('settings.more2.pin.lockCheckout')} />
            </div>
          </section>
          <section className="mt-10">
            <h2 className="text-body-lg font-semibold text-ink">{t('settings.more2.pin.selectStyle')}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label={t('settings.more2.pin.selectStyle')}>
              {(['light', 'dark'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={draft.style === style}
                  onClick={() => set({ style })}
                  className={clsx('rounded-xl border-2 p-2 text-left transition-colors', draft.style === style ? 'border-primary' : 'border-line hover:border-line-strong')}
                >
                  <LockScreen style={style} small />
                  <span className="mt-2 block px-1 text-body-strong text-ink">{t(`settings.more2.pin.${style}`)}</span>
                </button>
              ))}
            </div>
            <Button className="mt-4" onClick={() => setPreview(true)}>
              {t('settings.more2.pin.preview')}
            </Button>
          </section>
        </>
      )}
      {step === 1 && (
        <>
          <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{t('settings.more2.pin.step2')}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('settings.more2.pin.step2Body')}</p>
          <div className="mt-6 flex justify-end">
            <Button icon={<RefreshCw size={16} aria-hidden />} onClick={generateAll}>
              {t('settings.more2.pin.generateAll')}
            </Button>
          </div>
          <ul className="card mt-3 divide-y divide-line">
            {members.map((m) => {
              const error = showErrors ? errors[m.id] : undefined
              return (
                <li key={m.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <Avatar name={fullName(m)} color={m.color} size={40} />
                  <div className="min-w-0 flex-1 pt-2">
                    <p className="text-body-strong text-ink">{fullName(m)}</p>
                    <p className="text-small text-muted">{m.jobTitle}</p>
                  </div>
                  <Field error={error} className="w-44">
                    {(id) => (
                      <TextInput
                        id={id}
                        aria-label={t('settings.more2.pin.pinFor', { name: fullName(m) })}
                        value={pins[m.id] ?? ''}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        placeholder="0000"
                        className="text-center tracking-[0.4em]"
                        invalid={Boolean(error)}
                        onChange={(e) => setPins((p) => ({ ...p, [m.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        data-testid={`pin-${m.id}`}
                      />
                    )}
                  </Field>
                  <IconButton
                    label={t('settings.more2.pin.generate')}
                    className="mt-0.5"
                    onClick={() =>
                      setPins((p) => ({
                        ...p,
                        [m.id]: randomPin(Object.entries(p).filter(([k]) => k !== m.id).map(([, v]) => v)),
                      }))
                    }
                  >
                    <RefreshCw size={16} aria-hidden />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="font-display text-[34px] font-bold leading-[42px] text-ink">{t('settings.more2.pin.step3')}</h1>
          <p className="mt-2 text-body-lg text-muted">{t('settings.more2.pin.step3Body')}</p>
          <div className="card mt-8 flex flex-col gap-4 p-6">
            <SummaryList
              variant="check"
              items={[
                { key: 'i', on: draft.lockInactive, text: draft.lockInactive ? t('settings.more2.pin.sumInactive', { count: draft.lockAfterMin }) : t('settings.more2.pin.sumInactiveOff') },
                { key: 'c', on: draft.lockAfterCheckout, text: t(draft.lockAfterCheckout ? 'settings.more2.pin.sumCheckout' : 'settings.more2.pin.sumCheckoutOff') },
                { key: 's', text: t('settings.more2.pin.sumStyle', { style: t(`settings.more2.pin.${draft.style}`) }) },
                { key: 'p', text: t('settings.more2.pin.sumPins', { count: members.length }) },
              ]}
            />
          </div>
        </>
      )}
      {preview && <PreviewModal style={draft.style} onClose={() => setPreview(false)} />}
    </TeamFullPage>
  )
}

/** Our own lock screen artwork (keypad over a teal gradient). */
function LockScreen({ style, small, entered = 0, onKey }: { style: Pin['style']; small?: boolean; entered?: number; onKey?: (key: string) => void }) {
  const { t } = useTranslation()
  const dark = style === 'dark'
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
  return (
    <div
      className={clsx('flex flex-col items-center justify-center rounded-lg', small ? 'aspect-[16/10] gap-1.5' : 'gap-5 py-10', dark ? 'bg-gradient-to-br from-[#062B29] via-[#0B4F4C] to-[#12312F] text-white' : 'bg-gradient-to-br from-primary-subtle via-surface to-accent-subtle text-ink')}
      aria-hidden={small}
    >
      <LockKeyhole size={small ? 12 : 28} aria-hidden />
      <p className={small ? 'text-[9px] font-semibold' : 'text-body-lg font-semibold'}>{t('settings.more2.pin.enterPin')}</p>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={clsx('rounded-full border', small ? 'h-1.5 w-1.5' : 'h-3.5 w-3.5', dark ? 'border-white/70' : 'border-ink/60', i < entered && (dark ? 'bg-white' : 'bg-ink'))} />
        ))}
      </div>
      <div className={clsx('grid grid-cols-3', small ? 'gap-1' : 'gap-3')}>
        {keys.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : small ? (
            <span key={i} className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[6px]', dark ? 'border-white/50' : 'border-ink/40')}>
              {k === 'del' ? '' : k}
            </span>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => onKey?.(k)}
              aria-label={k === 'del' ? t('settings.more2.pin.deleteDigit') : k}
              className={clsx('flex h-14 w-14 items-center justify-center rounded-full border text-title-3 transition-colors', dark ? 'border-white/40 hover:bg-white/10' : 'border-ink/30 hover:bg-ink/5')}
            >
              {k === 'del' ? <Delete size={20} aria-hidden /> : k}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function PreviewModal({ style, onClose }: { style: Pin['style']; onClose: () => void }) {
  const { t } = useTranslation()
  const [entered, setEntered] = useState('')
  const done = entered.length === 4
  const onKey = (k: string) => setEntered((v) => (k === 'del' ? v.slice(0, -1) : v.length < 4 ? v + k : v))
  return (
    <Modal open onClose={onClose} size="lg" title={t('settings.more2.pin.previewTitle')} subtitle={t('settings.more2.pin.previewBody')}>
      <LockScreen style={style} entered={entered.length} onKey={onKey} />
      <p className="mt-3 flex min-h-6 items-center justify-center gap-2 text-body text-muted" role="status">
        {done && (
          <>
            <KeyRound size={16} aria-hidden />
            {t('settings.more2.pin.previewDone')}
            <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => setEntered('')}>
              {t('settings.more2.pin.tryAgain')}
            </button>
          </>
        )}
      </p>
    </Modal>
  )
}
