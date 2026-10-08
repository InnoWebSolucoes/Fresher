import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ID, TimeRange } from '@/types'
import { useDb } from '@/store/db'
import { Button, Modal, confirm, toast } from '@/components/ui'
import { saveDayShifts } from '@/api/team'
import { TimeSelect } from './common'
import { fmtDayShortUS, hoursLabel, rangesError, rangesMinutes } from '../lib/shifts'

export interface EditDayTarget {
  memberId: ID
  locationId: ID
  date: string
  ranges: TimeRange[]
}

/** "<Name>'s shift Tue, Oct 6" — edit one day with split shifts (team.md §4.2). */
export function EditDayModal({ target, onClose }: { target: EditDayTarget | null; onClose: () => void }) {
  if (!target) return null
  return <EditDayForm key={`${target.memberId}-${target.date}`} target={target} onClose={onClose} />
}

function EditDayForm({ target, onClose }: { target: EditDayTarget; onClose: () => void }) {
  const { t } = useTranslation()
  const member = useDb((s) => s.teamMembers.find((m) => m.id === target.memberId))
  const [ranges, setRanges] = useState<TimeRange[]>(target.ranges.length ? target.ranges : [{ start: '10:00', end: '19:00' }])
  const [busy, setBusy] = useState(false)
  const error = rangesError(ranges)
  const update = (i: number, patch: Partial<TimeRange>) => setRanges((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = async () => {
    if (error) return
    setBusy(true)
    await saveDayShifts(target.memberId, target.locationId, target.date, ranges)
    setBusy(false)
    toast(t('team.shifts.toastHours'))
    onClose()
  }
  const remove = async () => {
    if (!(await confirm({ title: t('team.shifts.deleteShiftTitle'), body: t('team.shifts.deleteShiftBody', { date: fmtDayShortUS(target.date) }), confirmLabel: t('team.common.delete'), tone: 'danger' }))) return
    setBusy(true)
    await saveDayShifts(target.memberId, target.locationId, target.date, [])
    setBusy(false)
    toast(t('team.shifts.toastShiftDeleted'))
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('team.shifts.dayTitle', { name: member?.firstName ?? '', date: fmtDayShortUS(target.date) })}
      footer={
        <>
          <span className="mr-auto flex items-center gap-3">
            {target.ranges.length > 0 && (
              <Button variant="ghost" className="text-danger" onClick={remove} disabled={busy}>
                {t('team.common.delete')}
              </Button>
            )}
            <span className="text-body text-muted">{t('team.shifts.totalDuration', { total: hoursLabel(error ? 0 : rangesMinutes(ranges)) })}</span>
          </span>
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={Boolean(error)} onClick={save}>
            {t('team.common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {ranges.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <div>
              <label className="label" htmlFor={`start-${i}`}>
                {t('team.shifts.startTime')}
              </label>
              <TimeSelect id={`start-${i}`} value={r.start} onChange={(v) => update(i, { start: v })} />
            </div>
            <div>
              <label className="label" htmlFor={`end-${i}`}>
                {t('team.shifts.endTime')}
              </label>
              <TimeSelect id={`end-${i}`} value={r.end} onChange={(v) => update(i, { end: v })} />
            </div>
            <button type="button" className="icon-btn text-danger disabled:opacity-40" aria-label={t('team.shifts.removeShift')} title={t('team.shifts.removeShift')} disabled={ranges.length === 1} onClick={() => setRanges((rs) => rs.filter((_, j) => j !== i))}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {error && <p className="text-small text-danger">{t(`team.shifts.errors.${error}`)}</p>}
        <div>
          <Button variant="ghost" icon={<Plus size={16} />} onClick={() => setRanges((rs) => [...rs, { start: '20:00', end: '21:00' }])}>
            {t('team.shifts.addShift')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
