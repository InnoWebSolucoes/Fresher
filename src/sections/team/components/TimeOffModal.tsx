import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { ID, TimeOff } from '@/types'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'

import { Button, Checkbox, Field, Modal, Select, TextArea, confirm, toast } from '@/components/ui'
import { deleteTimeOff, saveTimeOff } from '@/api/team'
import { ApiError } from '@/api/client'
import { TimeSelect } from './common'
import { fmtDayUS, hoursLabel, timeOffTotal } from '../lib/shifts'
import { memberName, sortMembers } from '../lib/members'

interface Props {
  open: boolean
  onClose: () => void
  memberId?: ID | null
  date?: string
  timeOff?: TimeOff | null
}

/** Add / Edit time off (team.md §4.6). */
export function TimeOffModal(props: Props) {
  if (!props.open) return null
  return <TimeOffForm key={props.timeOff?.id ?? `${props.memberId}-${props.date}`} {...props} />
}

function TimeOffForm({ onClose, memberId, date, timeOff }: Props) {
  const { t } = useTranslation()
  const { teamMembers, types, shiftPatterns, shiftOverrides, closedPeriods, allTimeOff } = useDb(
    useShallow((s) => ({ teamMembers: s.teamMembers, types: s.settings.timeOffTypes, shiftPatterns: s.shiftPatterns, shiftOverrides: s.shiftOverrides, closedPeriods: s.closedPeriods, allTimeOff: s.timeOff })),
  )
  const members = useMemo(() => sortMembers(teamMembers.filter((m) => !m.archived), 'custom'), [teamMembers])
  const [form, setForm] = useState(() => ({
    teamMemberId: timeOff?.teamMemberId ?? memberId ?? members[0]?.id ?? '',
    typeId: timeOff?.typeId ?? types[0]?.id ?? '',
    startDate: timeOff?.startDate ?? date ?? todayISO(),
    startTime: timeOff?.startTime ?? '09:00',
    endTime: timeOff?.endTime ?? '17:00',
    repeat: Boolean(timeOff?.repeatUntil),
    repeatUntil: timeOff?.repeatUntil ?? '',
    description: timeOff?.description ?? '',
    approved: timeOff?.approved ?? false,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const timeError = form.endTime <= form.startTime ? t('team.timeOff.errors.endTime') : null
  const repeatError = form.repeat && (!form.repeatUntil || form.repeatUntil < form.startDate) ? t('team.timeOff.errors.repeatUntil') : null
  const total = useMemo(
    () => (timeError ? 0 : timeOffTotal({ shiftPatterns, shiftOverrides, closedPeriods, timeOff: allTimeOff }, form.teamMemberId, form.startDate, form.startTime, form.endTime, form.repeat ? form.repeatUntil : undefined)),
    [shiftPatterns, shiftOverrides, closedPeriods, allTimeOff, form, timeError],
  )

  const save = async () => {
    if (timeError || repeatError || !form.teamMemberId) return
    setBusy(true)
    setError(null)
    try {
      await saveTimeOff({
        id: timeOff?.id,
        teamMemberId: form.teamMemberId,
        typeId: form.typeId,
        startDate: form.startDate,
        startTime: form.startTime,
        endTime: form.endTime,
        repeatUntil: form.repeat ? form.repeatUntil : undefined,
        description: form.description.trim(),
        approved: form.approved,
      })
      toast(timeOff ? t('team.timeOff.toastUpdated') : t('team.timeOff.toastAdded'))
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? t(e.message) : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!timeOff) return
    const ok = await confirm({
      title: t('team.timeOff.deleteTitle'),
      body: t('team.timeOff.deleteBody', { date: fmtDayUS(timeOff.startDate), start: timeOff.startTime, end: timeOff.endTime }),
      confirmLabel: t('team.common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    await deleteTimeOff(timeOff.id)
    setBusy(false)
    toast(t('team.timeOff.toastDeleted'))
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={timeOff ? t('team.timeOff.editTitle') : t('team.timeOff.addTitle')}
      footer={
        <>
          {timeOff && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={remove} disabled={busy}>
              {t('team.common.delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={Boolean(timeError || repeatError)} onClick={save}>
            {t('team.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field label={t('team.timeOff.member')}>
          {(id) => <Select id={id} value={form.teamMemberId} onChange={(e) => set('teamMemberId', e.target.value)} options={members.map((m) => ({ value: m.id, label: memberName(m) }))} />}
        </Field>
        <Field label={t('team.timeOff.type')}>{(id) => <Select id={id} value={form.typeId} onChange={(e) => set('typeId', e.target.value)} options={types.map((ty) => ({ value: ty.id, label: ty.name }))} />}</Field>
        <Field label={t('team.timeOff.startDate')} hint={fmtDayUS(form.startDate)}>
          {(id) => <input id={id} type="date" className="input" value={form.startDate} onChange={(e) => e.target.value && set('startDate', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('team.timeOff.startTime')}>{(id) => <TimeSelect id={id} value={form.startTime} onChange={(v) => set('startTime', v)} />}</Field>
          <Field label={t('team.timeOff.endTime')} error={timeError}>
            {(id) => <TimeSelect id={id} value={form.endTime} onChange={(v) => set('endTime', v)} aria-invalid={Boolean(timeError)} />}
          </Field>
        </div>
        <Checkbox label={t('team.timeOff.repeat')} checked={form.repeat} onChange={(v) => set('repeat', v)} />
        {form.repeat && (
          <Field label={t('team.timeOff.repeatUntil')} error={repeatError}>
            {(id) => <input id={id} type="date" className="input" min={form.startDate} value={form.repeatUntil} onChange={(e) => set('repeatUntil', e.target.value)} />}
          </Field>
        )}
        <Field label={t('team.timeOff.description')} counter={{ value: form.description.length, max: 100 }}>
          {(id) => <TextArea id={id} maxLength={100} value={form.description} onChange={(e) => set('description', e.target.value)} className="min-h-[72px]" />}
        </Field>
        <Checkbox label={t('team.timeOff.approved')} checked={form.approved} onChange={(v) => set('approved', v)} />
        <p className="text-body-strong text-ink">{t('team.timeOff.total', { total: hoursLabel(total) })}</p>
        <p className="flex items-center gap-2 rounded-md bg-sunken px-3 py-2.5 text-small text-muted">
          <Info size={16} className="shrink-0" aria-hidden />
          {t('team.timeOff.info')}
        </p>
        {error && <p className="text-small text-danger">{error}</p>}
      </div>
    </Modal>
  )
}
