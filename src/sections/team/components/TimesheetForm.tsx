import { format, parseISO } from 'date-fns'
import { MoreVertical, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import type { TeamMember, Timesheet, TimesheetBreak } from '@/types'
import { useDb } from '@/store/db'
import { uid } from '@/lib/ids'
import { durationLabel, now, todayISO, toClock, toMinutes } from '@/lib/time'
import { Button, Field, Menu, Modal, Select, toast } from '@/components/ui'
import { ApiError } from '@/api/client'
import { saveTimesheet } from '@/api/team'
import { Row, TimeSelect } from './common'
import { timesheetTotals } from '../lib/timesheets'

const roundedNow = () => {
  const d = now()
  return toClock(Math.floor((d.getHours() * 60 + d.getMinutes()) / 5) * 5)
}

/** Timesheet form used by "Add timesheet" and Edit (team.md §5.1). */
export function TimesheetForm({ member, timesheet, defaultDate, onCancel, onSaved }: { member: TeamMember; timesheet?: Timesheet; defaultDate?: string; onCancel: () => void; onSaved: (ts: Timesheet) => void }) {
  const { t } = useTranslation()
  const { types, locations } = useDb(useShallow((s) => ({ types: s.blockedTimeTypes, locations: s.locations })))
  const memberLocations = locations.filter((l) => member.locationIds.includes(l.id))
  const [date, setDate] = useState(timesheet?.date ?? defaultDate ?? todayISO())
  const [locationId, setLocationId] = useState(timesheet?.locationId ?? member.locationIds[0] ?? locations[0]?.id ?? '')
  const [clockIn, setClockIn] = useState(timesheet?.clockIn ?? roundedNow())
  const [clockOut, setClockOut] = useState(timesheet?.clockOut ?? '')
  const [breaks, setBreaks] = useState<TimesheetBreak[]>(timesheet?.breaks ?? [])
  const [busy, setBusy] = useState(false)
  const [durationFor, setDurationFor] = useState<string | null>(null)
  const location = locations.find((l) => l.id === locationId)

  const errors = useMemo(() => {
    const e: { clockOut?: string; breaks: Record<string, string> } = { breaks: {} }
    if (!clockOut) e.clockOut = t('team.timesheets.form.errors.clockOut')
    else if (toMinutes(clockOut) <= toMinutes(clockIn)) e.clockOut = t('team.timesheets.form.errors.clockOutAfter')
    for (const b of breaks) {
      if (!b.end || toMinutes(b.end) <= toMinutes(b.start)) e.breaks[b.id] = t('team.timesheets.form.errors.breakEnd')
      else if (toMinutes(b.start) < toMinutes(clockIn) || (clockOut && toMinutes(b.end) > toMinutes(clockOut))) e.breaks[b.id] = t('team.timesheets.form.errors.breakInside')
    }
    return e
  }, [clockIn, clockOut, breaks, t])
  const valid = !errors.clockOut && Object.keys(errors.breaks).length === 0
  const totals = timesheetTotals({ clockIn, clockOut: clockOut || undefined, breaks }, types)

  const addBreak = (typeId: string) => {
    const type = types.find((x) => x.id === typeId)
    const length = type?.durationMin ?? 30
    const preferred = toMinutes('13:00')
    const inMin = toMinutes(clockIn)
    const outMin = clockOut ? toMinutes(clockOut) : inMin + 9 * 60
    const start = preferred >= inMin && preferred + length <= outMin ? preferred : Math.min(inMin + 60, Math.max(inMin, outMin - length))
    setBreaks((bs) => [...bs, { id: uid('br'), typeId, start: toClock(start), end: toClock(Math.min(1435, start + length)) }])
  }
  const updateBreak = (id: string, patch: Partial<TimesheetBreak>) => setBreaks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  const save = async () => {
    if (!valid) return
    setBusy(true)
    try {
      const record = await saveTimesheet({ teamMemberId: member.id, locationId, date, clockIn, clockOut: clockOut || undefined, breaks }, timesheet?.id)
      toast(timesheet ? t('team.timesheets.toastUpdated') : t('team.timesheets.toastAdded'))
      onSaved(record)
    } catch (e) {
      toast(e instanceof ApiError ? t(e.message) : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const typeLabel = (typeId: string) => {
    const type = types.find((x) => x.id === typeId)
    return type ? `${type.emoji} ${type.name}` : t('team.timesheets.break')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <h2 className="font-display text-title-1 text-ink">{t('team.timesheets.formTitle', { name: member.firstName })}</h2>
        <p className="mt-1 text-body text-muted">
          {format(parseISO(date), 'EEE, MMM d')} • {location?.name}
        </p>
        <div className="mt-6 flex flex-col gap-5">
          <Field label={t('team.timesheets.form.date')}>{(id) => <input id={id} type="date" className="input" max={todayISO()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
          {memberLocations.length > 1 && (
            <Field label={t('team.timesheets.form.location')}>{(id) => <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} options={memberLocations.map((l) => ({ value: l.id, label: l.name }))} />}</Field>
          )}
          <Field label={t('team.timesheets.form.clockIn')}>{(id) => <TimeSelect id={id} value={clockIn} onChange={setClockIn} />}</Field>
          {breaks.map((b) => {
            const type = types.find((x) => x.id === b.typeId)
            return (
              <div key={b.id}>
                <p className="mb-1.5 text-small text-muted">
                  <span className="text-body-strong text-ink">{typeLabel(b.typeId)}</span> • {type?.paid ? t('team.timesheets.paid') : t('team.timesheets.unpaid')} • {format(parseISO(date), 'MMM d, yyyy')}
                </p>
                <div className="flex items-center gap-2">
                  <TimeSelect aria-label={t('team.timesheets.form.breakStart')} value={b.start} onChange={(v) => updateBreak(b.id, { start: v })} />
                  <span className="text-body text-muted">{t('team.repeat.to')}</span>
                  <TimeSelect aria-label={t('team.timesheets.form.breakEnd')} value={b.end ?? ''} placeholder={t('team.timesheets.form.selectTime')} onChange={(v) => updateBreak(b.id, { end: v })} />
                  <Menu
                    align="right"
                    width={200}
                    groups={[
                      {
                        items: [
                          { label: t('team.timesheets.form.setDuration'), onSelect: () => setDurationFor(b.id) },
                          { label: t('team.timesheets.form.removeBreak'), danger: true, onSelect: () => setBreaks((bs) => bs.filter((x) => x.id !== b.id)) },
                        ],
                      },
                    ]}
                    trigger={({ open, toggle }) => (
                      <button type="button" className="icon-btn shrink-0" aria-label={t('team.common.actions')} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                        <MoreVertical size={18} />
                      </button>
                    )}
                  />
                </div>
                {errors.breaks[b.id] && <p className="mt-1 text-small text-danger">{errors.breaks[b.id]}</p>}
              </div>
            )
          })}
          <div>
            <Menu
              align="left"
              width={280}
              groups={[
                {
                  heading: t('team.timesheets.form.addBreakTitle'),
                  items: types.map((type) => ({
                    label: `${type.emoji} ${type.name}`,
                    hint: `${type.paid ? t('team.timesheets.paid') : t('team.timesheets.unpaid')} • ${durationLabel(type.durationMin)}`,
                    onSelect: () => addBreak(type.id),
                  })),
                },
              ]}
              trigger={({ open, toggle }) => (
                <Button className="rounded-full" icon={<Plus size={16} />} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                  {t('team.timesheets.form.addBreak')}
                </Button>
              )}
            />
          </div>
          <Field label={t('team.timesheets.form.clockOut')} error={errors.clockOut}>
            {(id) => <TimeSelect id={id} value={clockOut} placeholder={t('team.timesheets.form.selectTime')} onChange={setClockOut} aria-invalid={Boolean(errors.clockOut)} />}
          </Field>
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <Row label={t('team.timesheets.hoursWorked')} value={durationLabel(totals.worked)} />
          <Row label={t('team.timesheets.unpaidBreaks')} value={durationLabel(totals.unpaid)} />
          <Row label={t('team.timesheets.totalPaid')} value={durationLabel(totals.paid)} strong />
        </div>
      </div>
      <div className="flex gap-3 border-t border-line px-6 py-4">
        <Button className="flex-1" onClick={onCancel}>
          {t('team.common.cancel')}
        </Button>
        <Button className="flex-1" variant="primary" loading={busy} disabled={!valid} onClick={save}>
          {t('team.common.save')}
        </Button>
      </div>
      <Modal open={durationFor !== null} onClose={() => setDurationFor(null)} title={t('team.timesheets.form.setDuration')} size="sm">
        <div className="grid grid-cols-2 gap-2 pb-4">
          {[15, 30, 45, 60, 90, 120].map((min) => (
            <Button
              key={min}
              onClick={() => {
                const b = breaks.find((x) => x.id === durationFor)
                if (b) updateBreak(b.id, { end: toClock(Math.min(1435, toMinutes(b.start) + min)) })
                setDurationFor(null)
              }}
            >
              {durationLabel(min)}
            </Button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
