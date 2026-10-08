import { parseISO } from 'date-fns'
import { format } from '@/lib/dates'
import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Modal, toast } from '@/components/ui'
import { rescheduleAppointment, updateAppointment } from '@/api/appointments'
import { useDb } from '@/store/db'
import { findConflicts } from '@/lib/availability'
import { fullName } from '@/lib/format'
import { movedItems, type PendingMove } from './DayView'
import { useAvailabilityData } from './hooks'

/** "Update appointment" confirmation after a drag, resize or reschedule pick (calendar.md §11). */
export function UpdateAppointmentModal({ move, onCancel, onDone }: { move: PendingMove | null; onCancel: () => void; onDone: (move: PendingMove) => void }) {
  const { t } = useTranslation()
  const data = useAvailabilityData()
  const appt = useDb((s) => (move ? s.appointments.find((a) => a.id === move.appointmentId) : undefined))
  const client = useDb((s) => (appt?.clientId ? s.clients.find((c) => c.id === appt.clientId) : undefined))
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)

  const conflicts = useMemo(() => {
    if (!move || !appt) return []
    return findConflicts(data, { id: appt.id, date: move.date, locationId: appt.locationId, items: movedItems(appt, move) })
  }, [data, move, appt])

  if (!move || !appt) return null
  const name = fullName(client)

  const submit = async () => {
    setBusy(true)
    try {
      const resizeIndex = move.resize ? appt.items.findIndex((i) => i.id === move.resize!.itemId) : -1
      if (move.resize && resizeIndex > 0) {
        await updateAppointment(appt.id, { items: movedItems(appt, move) }, t('calendar.toasts.updated'))
      } else {
        await rescheduleAppointment(appt.id, { date: move.date, start: move.start, teamMemberId: move.teamMemberId, durationMin: move.resize?.durationMin }, { notify: Boolean(client) && notify })
      }
      toast(t(move.resize ? 'calendar.toasts.updated' : 'calendar.toasts.rescheduled'))
      onDone(move)
    } catch (err) {
      toast(err instanceof Error ? err.message : t('calendar.toasts.error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('calendar.update.title')}
      subtitle={t('calendar.update.when', { date: format(parseISO(move.date), 'EEE d MMM'), time: move.start })}
      footer={
        <>
          <Button onClick={onCancel}>{t('calendar.common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit} data-testid="update-appointment-confirm">
            {t('calendar.update.update')}
          </Button>
        </>
      }
    >
      {client ? (
        <Checkbox checked={notify} onChange={setNotify} label={t('calendar.update.notify', { name })} hint={t('calendar.update.notifyHint', { name })} />
      ) : (
        <p className="text-body text-muted">{t('calendar.update.walkIn')}</p>
      )}
      {conflicts.length > 0 && (
        <div className="mt-4 rounded-md bg-warning-subtle p-3 text-small text-warning" role="alert">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden /> {t('calendar.update.conflicts')}
          </p>
          <ul className="mt-1 list-disc pl-6">
            {[...new Set(conflicts.map((c) => c.message))].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-1">{t('calendar.update.conflictsHint')}</p>
        </div>
      )}
    </Modal>
  )
}
