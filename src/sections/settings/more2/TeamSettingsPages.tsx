import { addDays, addMonths, differenceInCalendarDays, endOfMonth, startOfMonth } from 'date-fns'
import { formatRange } from '@/lib/dates'
import { ExternalLink } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { setSettingsExtra, updateSettings, useSettingsExtra } from '@/api/settings'
import { Button, Checkbox, Field, Select, Switch } from '@/components/ui'
import { now } from '@/lib/time'
import { useDb } from '@/store/db'
import type { Settings, Weekday } from '@/types'
import { FullModal } from '../components/FullModal'
import { EditCard, FormCard, FormStack, SettingsPage, SummaryList } from '../components/ui'
import { useAction, usePending } from '../components/useAction'
import { EXTRA_RADIUS, EXTRA_STARTS_FROM } from '../team/data'
import { StateChip } from '../team/parts'

const LOCATIONS_PATH = '/setup/business-setup/location-details'
const RADII = [50, 100, 200, 500, 1000]

function ViewButton({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <Button iconRight={<ExternalLink size={14} aria-hidden />} onClick={() => navigate(to)}>
      {children}
    </Button>
  )
}

// ─── Timesheets ────────────────────────────────────────────────────────────

/** Settings › Team › Timesheets (settings-team.md §3). */
export function TimesheetsSettingsPage() {
  const { t } = useTranslation()
  const ts = useDb((s) => s.settings.timesheets)
  const radius = useSettingsExtra<number>(EXTRA_RADIUS, 100)
  const [open, setOpen] = useState(false)
  const clock = ts.autoClockIn && ts.autoClockOut ? 'both' : ts.autoClockIn ? 'in' : ts.autoClockOut ? 'out' : 'none'
  return (
    <SettingsPage
      title={t('settings.more2.timesheets.title')}
      description={t('settings.more2.timesheets.description')}
      learnMore={t('settings.more2.timesheets.title')}
      actions={<ViewButton to="/team/timesheets">{t('settings.more2.timesheets.view')}</ViewButton>}
    >
      <EditCard title={t('settings.more2.settingsCard')} onEdit={() => setOpen(true)} testId="timesheets-settings">
        <SummaryList
          items={[
            { key: 'p', text: ts.proximity ? t('settings.more2.timesheets.sumProximityOn', { radius }) : t('settings.more2.timesheets.sumProximityOff') },
            { key: 'c', text: t(`settings.more2.timesheets.sumClock.${clock}`) },
            { key: 'b', text: t(ts.autoBreaks ? 'settings.more2.timesheets.sumBreaksOn' : 'settings.more2.timesheets.sumBreaksOff') },
          ]}
        />
      </EditCard>
      {open && <TimesheetsModal value={ts} radius={radius} onClose={() => setOpen(false)} />}
    </SettingsPage>
  )
}

function TimesheetsModal({ value, radius, onClose }: { value: Settings['timesheets']; radius: number; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(value)
  const [distance, setDistance] = useState(radius)
  const [busy, run] = useAction()
  const set = (patch: Partial<Settings['timesheets']>) => setDraft((d) => ({ ...d, ...patch }))
  const save = () =>
    run(
      async () => {
        await updateSettings((s) => {
          s.timesheets = draft
        })
        await setSettingsExtra(EXTRA_RADIUS, distance)
      },
      t('settings.more2.timesheets.toast'),
      onClose,
    )
  return (
    <FullModal open onClose={onClose} title={t('settings.more2.timesheets.modalTitle')} onSave={() => void save()} saving={busy} testId="timesheets-modal">
      <FormStack>
        <FormCard
          title={
            <span className="flex items-center gap-2">
              {t('settings.more2.timesheets.proximity')}
              <StateChip on={draft.proximity} onLabel={t('settings.common.on')} offLabel={t('settings.common.off')} />
            </span>
          }
          description={
            <>
              {t('settings.more2.timesheets.proximityBody')}{' '}
              <button
                type="button"
                className="text-body-strong text-primary hover:underline"
                onClick={() => {
                  onClose()
                  navigate(LOCATIONS_PATH)
                }}
              >
                {t('settings.more2.timesheets.businessLocation')}
              </button>
            </>
          }
        >
          <Checkbox checked={draft.proximity} onChange={(v) => set({ proximity: v })} label={t('settings.more2.timesheets.enableLocation')} />
          {draft.proximity && (
            <Field label={t('settings.more2.timesheets.distance')} className="ml-8 max-w-xs">
              {(id) => <Select id={id} value={String(distance)} onChange={(e) => setDistance(Number(e.target.value))} options={RADII.map((r) => ({ value: String(r), label: t('settings.more2.timesheets.metres', { count: r }) }))} />}
            </Field>
          )}
        </FormCard>
        <FormCard title={t('settings.more2.timesheets.automations')} description={t('settings.more2.timesheets.automationsBody')}>
          <p className="text-body-strong text-ink">{t('settings.more2.timesheets.scheduledShifts')}</p>
          <Checkbox checked={draft.autoClockIn} onChange={(v) => set({ autoClockIn: v })} label={t('settings.more2.timesheets.autoIn')} hint={t('settings.more2.timesheets.autoInHint')} />
          <Checkbox checked={draft.autoClockOut} onChange={(v) => set({ autoClockOut: v })} label={t('settings.more2.timesheets.autoOut')} hint={t('settings.more2.timesheets.autoOutHint')} />
          <p className="text-body-strong text-ink">{t('settings.more2.timesheets.scheduledBreaks')}</p>
          <Checkbox checked={draft.autoBreaks} onChange={(v) => set({ autoBreaks: v })} label={t('settings.more2.timesheets.autoBreaks')} hint={t('settings.more2.timesheets.autoBreaksHint')} />
        </FormCard>
        <p className="text-small text-muted">{t('settings.more2.timesheets.footerNote')}</p>
      </FormStack>
    </FullModal>
  )
}

// ─── Shifts ────────────────────────────────────────────────────────────────

/** Settings › Team › Shifts (settings-team.md §4). */
export function ShiftsSettingsPage() {
  const { t } = useTranslation()
  const auto = useDb((s) => s.settings.shifts.autoCreate)
  const [open, setOpen] = useState(false)
  return (
    <SettingsPage
      title={t('settings.more2.shifts.title')}
      description={t('settings.more2.shifts.description')}
      learnMore={t('settings.more2.shifts.title')}
      actions={<ViewButton to="/team/scheduled-shifts">{t('settings.more2.shifts.view')}</ViewButton>}
    >
      <EditCard title={t('settings.more2.settingsCard')} onEdit={() => setOpen(true)} testId="shifts-settings">
        <SummaryList items={[{ text: t(auto ? 'settings.more2.shifts.sumOn' : 'settings.more2.shifts.sumOff') }]} />
      </EditCard>
      {open && <ShiftsModal value={auto} onClose={() => setOpen(false)} />}
    </SettingsPage>
  )
}

function ShiftsModal({ value, onClose }: { value: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [auto, setAuto] = useState(value)
  const [busy, run] = useAction()
  const save = () =>
    run(
      () =>
        updateSettings((s) => {
          s.shifts.autoCreate = auto
        }),
      t('settings.more2.shifts.toast'),
      onClose,
    )
  return (
    <FullModal open onClose={onClose} title={t('settings.more2.shifts.modalTitle')} onSave={() => void save()} saving={busy} testId="shifts-modal">
      <FormCard>
        <Checkbox checked={auto} onChange={setAuto} label={t('settings.more2.shifts.autoCreate')} hint={t('settings.more2.shifts.autoCreateHint')} />
      </FormCard>
    </FullModal>
  )
}

// ─── Pay runs ──────────────────────────────────────────────────────────────

type PayRuns = Settings['payRuns']
type StartsFrom = 'next' | 'current'
const FREQUENCIES: PayRuns['frequency'][] = ['weekly', 'biweekly', 'monthly']
const DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** Pay period containing `date` (Weekday 0 = Monday). */
function periodAt(date: Date, frequency: PayRuns['frequency'], restartsOn: Weekday): { start: Date; end: Date } {
  if (frequency === 'monthly') return { start: startOfMonth(date), end: endOfMonth(date) }
  const weekday = (date.getDay() + 6) % 7
  const start = addDays(date, -((weekday - restartsOn + 7) % 7))
  return { start, end: addDays(start, frequency === 'biweekly' ? 13 : 6) }
}

/** First full pay period starting on or after `date`. */
function periodFrom(date: Date, frequency: PayRuns['frequency'], restartsOn: Weekday): { start: Date; end: Date } {
  if (frequency === 'monthly') {
    const start = date.getDate() === 1 ? date : startOfMonth(addMonths(date, 1))
    return { start, end: endOfMonth(start) }
  }
  const start = addDays(date, (restartsOn - ((date.getDay() + 6) % 7) + 7) % 7)
  return { start, end: addDays(start, frequency === 'biweekly' ? 13 : 6) }
}

function rangeText(start: Date, end: Date): string {
  return formatRange(start, end)
}

/** Settings › Team › Pay runs (settings-team.md §5). */
export function PayRunsSettingsPage() {
  const { t } = useTranslation()
  const pay = useDb((s) => s.settings.payRuns)
  const startsFrom = useSettingsExtra<StartsFrom>(EXTRA_STARTS_FROM, 'next')
  const [open, setOpen] = useState(false)
  return (
    <SettingsPage
      title={t('settings.more2.payRuns.title')}
      description={t('settings.more2.payRuns.description')}
      learnMore={t('settings.more2.payRuns.title')}
      actions={<ViewButton to="/team/payrun/overview">{t('settings.more2.payRuns.view')}</ViewButton>}
    >
      <EditCard title={t('settings.more2.settingsCard')} description={t('settings.more2.payRuns.cardDescription')} onEdit={() => setOpen(true)} testId="pay-runs-settings">
        <SummaryList
          items={[
            {
              key: 'period',
              text:
                pay.frequency === 'monthly'
                  ? t('settings.more2.payRuns.sumMonthly')
                  : t('settings.more2.payRuns.sumPeriod', { frequency: t(`settings.more2.payRuns.freqLower.${pay.frequency}`), day: t(`settings.more2.days.${pay.restartsOn}`) }),
            },
            { key: 'auto', text: t(pay.autoPay || pay.autoTips ? 'settings.more2.payRuns.sumAutoOn' : 'settings.more2.payRuns.sumAutoOff') },
          ]}
        />
      </EditCard>
      {open && <PayRunsModal value={pay} startsFrom={startsFrom} onClose={() => setOpen(false)} />}
    </SettingsPage>
  )
}

function PayRunsModal({ value, startsFrom, onClose }: { value: PayRuns; startsFrom: StartsFrom; onClose: () => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [from, setFrom] = useState<StartsFrom>(startsFrom)
  const [busy, run] = useAction()
  const set = (patch: Partial<PayRuns>) => setDraft((d) => ({ ...d, ...patch }))

  const schedule = useMemo(() => {
    const today = now()
    const current = periodAt(today, value.frequency, value.restartsOn)
    const first = from === 'next' ? periodFrom(addDays(current.end, 1), draft.frequency, draft.restartsOn) : periodAt(today, draft.frequency, draft.restartsOn)
    const second = periodFrom(addDays(first.end, 1), draft.frequency, draft.restartsOn)
    const days = (p: { start: Date; end: Date }) => differenceInCalendarDays(p.end, p.start) + 1
    return {
      current: `${rangeText(current.start, current.end)} (${t('settings.more2.payRuns.days', { count: days(current) })})`,
      next: [first, second].map((p) => `${rangeText(p.start, p.end)} (${t('settings.more2.payRuns.days', { count: days(p) })})`),
    }
  }, [value, draft, from, t])

  const save = () =>
    run(
      async () => {
        await updateSettings((s) => {
          s.payRuns = draft
        })
        await setSettingsExtra(EXTRA_STARTS_FROM, from)
      },
      t('settings.more2.payRuns.toast'),
      onClose,
    )

  const autoRow = (label: ReactNode, on: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line px-4 py-3">
      <div className="min-w-0">
        <p className="text-body text-ink">{label}</p>
        <p className="text-small text-muted">{t(on ? 'settings.more2.payRuns.autoOnHint' : 'settings.more2.payRuns.autoOffHint')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Phones: the switch alone shows the state, so the label keeps its width. */}
        <span className="hidden text-small text-muted sm:inline">{t(on ? 'settings.common.enabled' : 'settings.common.disabled')}</span>
        <Switch checked={on} onChange={onChange} label={<span className="sr-only">{label}</span>} />
      </div>
    </div>
  )

  return (
    <FullModal open onClose={onClose} title={t('settings.more2.payRuns.modalTitle')} onSave={() => void save()} saving={busy} testId="pay-runs-modal">
      <FormStack>
        <FormCard title={t('settings.more2.payRuns.period')} description={t('settings.more2.payRuns.periodBody')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('settings.more2.payRuns.frequency')}>
              {(id) => <Select id={id} value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as PayRuns['frequency'] })} options={FREQUENCIES.map((f) => ({ value: f, label: t(`settings.more2.payRuns.freq.${f}`) }))} />}
            </Field>
            <Field label={t('settings.more2.payRuns.restartsOn')}>
              {(id) => (
                <Select
                  id={id}
                  value={String(draft.restartsOn)}
                  disabled={draft.frequency === 'monthly'}
                  onChange={(e) => set({ restartsOn: Number(e.target.value) as Weekday })}
                  options={DAYS.map((d) => ({ value: String(d), label: t(`settings.more2.days.${d}`) }))}
                />
              )}
            </Field>
            <Field label={t('settings.more2.payRuns.startsFrom')}>
              {(id) => (
                <Select
                  id={id}
                  value={from}
                  onChange={(e) => setFrom(e.target.value as StartsFrom)}
                  options={[
                    { value: 'next', label: t('settings.more2.payRuns.nextCycle') },
                    { value: 'current', label: t('settings.more2.payRuns.currentCycle') },
                  ]}
                />
              )}
            </Field>
          </div>
          <div className="rounded-lg bg-sunken px-4 py-3">
            <p className="text-body-strong text-ink">{t('settings.more2.payRuns.schedule')}</p>
            <dl className="mt-2 grid gap-2 text-body sm:grid-cols-2">
              <div>
                <dt className="text-muted">{t('settings.more2.payRuns.currentPeriod')}</dt>
                <dd className="text-ink">{schedule.current}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('settings.more2.payRuns.newSchedule')}</dt>
                {schedule.next.map((line) => (
                  <dd key={line} className="text-ink">
                    {line}
                  </dd>
                ))}
              </div>
            </dl>
          </div>
        </FormCard>
        <FormCard title={t('settings.more2.payRuns.automatic')} description={t('settings.more2.payRuns.automaticBody')}>
          {autoRow(t('settings.more2.payRuns.autoPay'), draft.autoPay, (v) => set({ autoPay: v }))}
          {autoRow(t('settings.more2.payRuns.autoTips'), draft.autoTips, (v) => set({ autoTips: v }))}
        </FormCard>
      </FormStack>
    </FullModal>
  )
}

// ─── Commissions ───────────────────────────────────────────────────────────

const COMMISSION_KEYS = ['deductDiscounts', 'deductTaxes', 'deductServiceCost', 'deductProductCost', 'packageServices', 'membershipServices', 'loyaltyFull', 'fullyPaidOnly', 'exceedPaid'] as const

/** Settings › Team › Commissions (settings-team.md §6). */
export function CommissionsSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const commissions = useDb((s) => s.settings.commissions)
  const [, run] = useAction()
  const [shown, pending] = usePending<string>()
  const toggle = (key: string, on: boolean) =>
    pending(key, on, () =>
      run(
        () =>
          updateSettings((s) => {
            s.commissions[key] = on
          }),
        t('settings.more2.commissions.toast'),
      ),
    )
  return (
    <SettingsPage title={t('settings.more2.commissions.title')} description={t('settings.more2.commissions.description')} learnMore={t('settings.more2.commissions.title')}>
      <section className="card flex flex-col gap-5 p-6" data-testid="commissions">
        {COMMISSION_KEYS.map((key) => (
          <Checkbox
            key={key}
            checked={shown(key, Boolean(commissions[key]))}
            onChange={(v) => void toggle(key, v)}
            label={t(`settings.more2.commissions.items.${key}.label`)}
            hint={t(`settings.more2.commissions.items.${key}.hint`)}
          />
        ))}
      </section>
      <p className="text-body text-muted">
        {t('settings.more2.commissions.footer')}{' '}
        <button type="button" className="text-body-strong text-primary hover:underline" onClick={() => navigate('/team/team-members')}>
          {t('settings.common.view')}
        </button>
      </p>
    </SettingsPage>
  )
}
