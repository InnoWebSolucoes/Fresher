import { addDays, format } from 'date-fns'
import { Info, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import type { TimeRange, Weekday } from '@/types'
import { useDb } from '@/store/db'
import { todayISO, toClock, toMinutes } from '@/lib/time'
import { Button, EmptyState, Field, FullscreenFrame, LearnMore, PageSkeleton, Select, toast, usePageLoading } from '@/components/ui'
import { saveShiftPattern } from '@/api/team'
import { TimeSelect } from '../components/common'
import { hoursLabel, rangesError, rangesMinutes, shiftDate } from '../lib/shifts'

type WeekDraft = Record<Weekday, TimeRange[]>
const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
const DAY_NAMES = WEEKDAYS.map((d) => format(addDays(new Date(2024, 0, 1), d), 'EEEE'))
const emptyWeek = (): WeekDraft => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] })

/** "Set <name>'s repeating shifts" (team.md §4.3). */
export function RepeatingShiftsPage() {
  const loading = usePageLoading()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { locationId = '', memberId = '', date = todayISO() } = useParams()
  const exists = useDb((s) => s.teamMembers.some((m) => m.id === memberId) && s.locations.some((l) => l.id === locationId))
  if (loading) {
    return (
      <FullscreenFrame title={t('team.repeat.titleShort')}>
        <PageSkeleton rows={7} />
      </FullscreenFrame>
    )
  }
  if (!exists) {
    return (
      <FullscreenFrame onClose={() => navigate('/team/scheduled-shifts')}>
        <EmptyState title={t('team.errors.notFoundTitle')} body={t('team.errors.notFound')} action={<Button onClick={() => navigate('/team/scheduled-shifts')}>{t('team.shifts.title')}</Button>} />
      </FullscreenFrame>
    )
  }
  return <RepeatingForm locationId={locationId} memberId={memberId} date={date} />
}

function RepeatingForm({ locationId, memberId, date }: { locationId: string; memberId: string; date: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { member, location, patterns } = useDb(
    useShallow((s) => ({ member: s.teamMembers.find((m) => m.id === memberId)!, location: s.locations.find((l) => l.id === locationId)!, patterns: s.shiftPatterns })),
  )
  // The pattern in force on this date; otherwise the latest one, used only to prefill the days.
  const { existing, covering } = useMemo(() => {
    const mine = patterns.filter((p) => p.teamMemberId === memberId && p.locationId === locationId)
    const current = mine.find((p) => p.startDate <= date && (!p.endDate || date <= p.endDate))
    return { existing: current ?? [...mine].sort((a, b) => b.startDate.localeCompare(a.startDate))[0], covering: current }
  }, [patterns, memberId, locationId, date])

  const [scheduleType, setScheduleType] = useState<1 | 2 | 3 | 4>(existing?.scheduleType ?? 1)
  const [weeks, setWeeks] = useState<WeekDraft[]>(() => {
    if (existing) return existing.weeks.map((w) => ({ ...emptyWeek(), ...Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v ?? []])) }) as WeekDraft)
    const w = emptyWeek()
    ;[0, 1, 2, 3, 4].forEach((d) => (w[d as Weekday] = [{ start: '10:00', end: '19:00' }]))
    return [w]
  })
  const tomorrow = shiftDate(todayISO(), 1)
  const [startDate, setStartDate] = useState(date > tomorrow ? date : tomorrow)
  const [ends, setEnds] = useState<'' | 'never' | 'date'>(covering?.endDate ? 'date' : covering ? 'never' : '')
  const [endDate, setEndDate] = useState(covering?.endDate ?? '')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  const changeType = (n: 1 | 2 | 3 | 4) => {
    setScheduleType(n)
    setWeeks((ws) => Array.from({ length: n }, (_, i) => ws[i] ?? structuredClone(ws[0])))
  }
  const updateDay = (wi: number, day: Weekday, ranges: TimeRange[]) => setWeeks((ws) => ws.map((w, i) => (i === wi ? { ...w, [day]: ranges } : w)))

  const errors = weeks.map((w) => Object.fromEntries(WEEKDAYS.map((d) => [d, rangesError(w[d])])) as Record<Weekday, ReturnType<typeof rangesError>>)
  const hasErrors = errors.some((e) => WEEKDAYS.some((d) => e[d]))
  const endError = ends === 'date' && (!endDate || endDate < startDate) ? t('team.repeat.errors.endDate') : null

  const save = async () => {
    setTouched(true)
    if (hasErrors || endError) return
    setSaving(true)
    await saveShiftPattern({
      teamMemberId: memberId,
      locationId,
      scheduleType,
      startDate,
      endDate: ends === 'date' ? endDate : undefined,
      weeks: weeks.map((w) => Object.fromEntries(WEEKDAYS.filter((d) => w[d].length).map((d) => [d, [...w[d]].sort((a, b) => a.start.localeCompare(b.start))]))),
    })
    setSaving(false)
    toast(t('team.repeat.toast'))
    navigate(`/team/scheduled-shifts?locationId=${locationId}&date=${startDate}`)
  }

  return (
    <FullscreenFrame
      title={t('team.repeat.title', { name: member.firstName })}
      onClose={() => navigate(`/team/scheduled-shifts?locationId=${locationId}&date=${date}`)}
      maxWidth="max-w-6xl"
      actions={
        <Button variant="primary" loading={saving} onClick={save}>
          {t('team.common.save')}
        </Button>
      }
    >
      <h1 className="font-display text-title-1 text-ink">{t('team.repeat.title', { name: member.firstName })}</h1>
      <p className="mb-8 mt-2 text-body-lg text-muted">
        {t('team.repeat.intro')} <LearnMore topic="repeating shifts" />
      </p>
      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-[#2A9CC2] text-on-primary">
              <MapPin size={20} aria-hidden />
            </span>
            <div>
              <p className="text-body-strong text-ink">{location.name}</p>
              <p className="text-small text-muted">{`${location.address.line1}, ${location.address.postcode} ${location.address.city}`}</p>
            </div>
          </div>
          <div className="card flex flex-col gap-4 p-5">
            <Field label={t('team.repeat.type')}>
              {(id) => (
                <Select id={id} value={String(scheduleType)} onChange={(e) => changeType(Number(e.target.value) as 1 | 2 | 3 | 4)} options={([1, 2, 3, 4] as const).map((n) => ({ value: String(n), label: t(`team.repeat.every${n}`) }))} />
              )}
            </Field>
            <Field label={t('team.repeat.startDate')}>{(id) => <input id={id} type="date" className="input" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />}</Field>
            <Field label={t('team.repeat.ends')} error={touched ? endError : null}>
              {(id) =>
                ends === 'date' ? (
                  <div className="flex gap-2">
                    <input id={id} type="date" className="input" min={startDate} placeholder={t('team.repeat.selectEnd')} aria-label={t('team.repeat.selectEnd')} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    <button
                      type="button"
                      className="icon-btn shrink-0"
                      aria-label={t('team.repeat.clear')}
                      title={t('team.repeat.clear')}
                      onClick={() => {
                        setEnds('')
                        setEndDate('')
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <Select
                    id={id}
                    value={ends}
                    onChange={(e) => setEnds(e.target.value as '' | 'never' | 'date')}
                    placeholder={t('team.form.selectOption')}
                    options={[
                      { value: 'never', label: t('team.repeat.never') },
                      { value: 'date', label: t('team.repeat.specific') },
                    ]}
                  />
                )
              }
            </Field>
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-sunken px-4 py-3 text-body text-ink">
            <Info size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            {t('team.repeat.closedInfo')}
          </p>
        </div>

        <div className="flex flex-col gap-10">
          {weeks.map((week, wi) => (
            <section key={wi} aria-label={scheduleType === 1 ? t('team.repeat.weekly') : t('team.repeat.weekOf', { n: wi + 1, total: scheduleType })}>
              <h2 className="font-display text-title-3 text-ink">{scheduleType === 1 ? t('team.repeat.weekly') : t('team.repeat.weekOf', { n: wi + 1, total: scheduleType })}</h2>
              <p className="mb-4 text-body text-muted">{t('team.repeat.total', { hours: Math.round((WEEKDAYS.reduce<number>((s, d) => s + (errors[wi][d] ? 0 : rangesMinutes(week[d] ?? [])), 0) / 60) * 10) / 10 })}</p>
              <div className="flex flex-col divide-y divide-line">
                {WEEKDAYS.map((d) => (
                  <DayRow key={d} name={DAY_NAMES[d]} ranges={week[d]} error={errors[wi][d]} onChange={(r) => updateDay(wi, d, r)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </FullscreenFrame>
  )
}

function DayRow({ name, ranges, error, onChange }: { name: string; ranges: TimeRange[]; error: ReturnType<typeof rangesError>; onChange: (r: TimeRange[]) => void }) {
  const { t } = useTranslation()
  const on = ranges.length > 0
  const nextRange = (): TimeRange | null => {
    const last = ranges[ranges.length - 1]
    const start = last ? toMinutes(last.end) + 60 : 600
    if (start + 60 > 1435) return null
    return { start: toClock(start), end: toClock(Math.min(1435, start + 60)) }
  }
  return (
    <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[180px_1fr]">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [{ start: '10:00', end: '19:00' }] : [])} className="mt-0.5 h-5 w-5 accent-[rgb(var(--primary))]" />
        <span>
          <span className="block text-body-strong text-ink">{name}</span>
          {on && <span className="block text-small text-muted">{hoursLabel(error ? 0 : rangesMinutes(ranges))}</span>}
        </span>
      </label>
      <div className="flex flex-col gap-2">
        {!on && <p className="py-2 text-body text-muted">{t('team.shifts.notWorking')}</p>}
        {ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <TimeSelect aria-label={t('team.shifts.startTime')} value={r.start} onChange={(v) => onChange(ranges.map((x, j) => (j === i ? { ...x, start: v } : x)))} className="max-w-[150px]" />
            <span className="text-body text-muted">{t('team.repeat.to')}</span>
            <TimeSelect aria-label={t('team.shifts.endTime')} value={r.end} onChange={(v) => onChange(ranges.map((x, j) => (j === i ? { ...x, end: v } : x)))} className="max-w-[150px]" />
            <button
              type="button"
              className="icon-btn disabled:opacity-40"
              aria-label={t('team.repeat.addShift')}
              title={t('team.repeat.addShift')}
              disabled={i !== ranges.length - 1 || !nextRange()}
              onClick={() => {
                const n = nextRange()
                if (n) onChange([...ranges, n])
              }}
            >
              <Plus size={18} />
            </button>
            <button type="button" className="icon-btn text-danger" aria-label={t('team.shifts.removeShift')} title={t('team.shifts.removeShift')} onClick={() => onChange(ranges.filter((_, j) => j !== i))}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {error && <p className="text-small text-danger">{t(`team.shifts.errors.${error}`)}</p>}
      </div>
    </div>
  )
}
