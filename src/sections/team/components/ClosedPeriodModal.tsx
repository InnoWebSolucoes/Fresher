import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClosedPeriod, ID } from '@/types'
import { useDb } from '@/store/db'
import { Button, Field, LearnMore, Modal, TextInput, confirm, toast } from '@/components/ui'
import { deleteClosedPeriod, saveClosedPeriod } from '@/api/team'

interface Props {
  open: boolean
  onClose: () => void
  locationId: ID
  date?: string
  period?: ClosedPeriod | null
}

/** "Add/Edit closed period for <location>" (team.md §4.5). */
export function ClosedPeriodModal(props: Props) {
  if (!props.open) return null
  return <ClosedPeriodForm key={props.period?.id ?? props.date} {...props} />
}

function ClosedPeriodForm({ onClose, locationId, date, period }: Props) {
  const { t } = useTranslation()
  const location = useDb((s) => s.locations.find((l) => l.id === locationId))
  const [start, setStart] = useState(period?.startDate ?? date ?? '')
  const [end, setEnd] = useState(period?.endDate ?? date ?? '')
  const [description, setDescription] = useState(period?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const days = start && end && end >= start ? differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 : 0
  const errors = {
    start: !start ? t('team.closed.errors.required') : null,
    end: !end ? t('team.closed.errors.required') : end < start ? t('team.closed.errors.endDate') : null,
    description: !description.trim() ? t('team.closed.errors.description') : null,
  }
  const valid = !errors.start && !errors.end && !errors.description

  const save = async () => {
    setTouched(true)
    if (!valid) return
    setBusy(true)
    await saveClosedPeriod({ id: period?.id, startDate: start, endDate: end, description: description.trim(), locationIds: period?.locationIds ?? [locationId] })
    setBusy(false)
    toast(period ? t('team.closed.toastUpdated') : t('team.closed.toastCreated'))
    onClose()
  }
  const remove = async () => {
    if (!period) return
    if (!(await confirm({ title: t('team.closed.deleteTitle'), body: t('team.closed.deleteBody'), confirmLabel: t('team.common.delete'), tone: 'danger' }))) return
    setBusy(true)
    await deleteClosedPeriod(period.id)
    setBusy(false)
    toast(t('team.closed.toastDeleted'))
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t(period ? 'team.closed.editTitle' : 'team.closed.addTitle', { location: location?.name ?? '' })}
      subtitle={
        <>
          {t('team.closed.subtitle')} <LearnMore topic={t('team.topics.closedPeriods')}>{t('team.common.learnMoreDot')}</LearnMore>
        </>
      }
      footer={
        <>
          <span className="mr-auto text-body text-muted">{t('team.closed.days', { count: days })}</span>
          {period && (
            <Button variant="ghost" className="text-danger" onClick={remove} disabled={busy}>
              {t('team.common.delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('team.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {period ? t('team.common.save') : t('team.common.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('team.closed.startDate')} error={touched ? errors.start : null}>
            {(id) => <input id={id} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />}
          </Field>
          <Field label={t('team.closed.endDate')} error={touched ? errors.end : null}>
            {(id) => <input id={id} type="date" className="input" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </div>
        <Field label={t('team.closed.description')} error={touched ? errors.description : null}>
          {(id) => <TextInput id={id} value={description} placeholder={t('team.closed.placeholder')} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <p className="flex items-center gap-2 rounded-md bg-sunken px-3 py-2.5 text-small text-muted">
          <Info size={16} className="shrink-0" aria-hidden />
          {t('team.closed.info')}
        </p>
      </div>
    </Modal>
  )
}
