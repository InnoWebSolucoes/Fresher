import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import { AppointmentWorkspace } from '../appointment/AppointmentWorkspace'
import { draftFromAppointment, draftItemFromService } from '../appointment/editor'
import { useCalendarParams } from '../hooks'
import { isISODate } from '../lib'
import { NO_REPEAT, useCalendarUi, type AppointmentDraft } from '../store'

export function AppointmentDrawer({ id, close }: DrawerProps) {
  const { t } = useTranslation()
  const appointment = useDb((s) => s.appointments.find((a) => a.id === id))
  const initial = useMemo(() => (appointment ? draftFromAppointment(appointment) : null), [appointment?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!appointment || !initial) return <EmptyState title={t('calendar.drawer.notFound')} body={t('calendar.drawer.notFoundBody')} />
  return <AppointmentWorkspace key={appointment.id} appointment={appointment} initial={initial} close={close} />
}

export function NewAppointmentDrawer({ params, close }: DrawerProps) {
  const { locationId } = useCalendarParams()
  const services = useDb((s) => s.services)
  const initial = useMemo<AppointmentDraft>(() => {
    const stored = useCalendarUi.getState().draft
    const date = params.get('d_date')
    const time = params.get('d_time')
    const member = params.get('d_member')
    if (params.get('d_resume') && stored) {
      return {
        ...stored,
        date: isISODate(date) ? date : stored.date,
        start: time ?? stored.start,
        items: stored.items.map((it, i) => (i === 0 && member && !it.teamMemberId ? { ...it, teamMemberId: member } : it)),
      }
    }
    const serviceIds = (params.get('d_services') ?? '').split(',').filter(Boolean)
    const group = params.get('d_group')
    return {
      clientId: params.get('d_client') || null,
      walkIn: false,
      locationId,
      date: isISODate(date) ? date : todayISO(),
      start: time || null,
      items: serviceIds.map((sid) => services.find((s) => s.id === sid)).filter((s) => s !== undefined).map((s) => draftItemFromService(s!, member)),
      repeat: NO_REPEAT,
      note: '',
      paymentPolicy: false,
      groupId: group || undefined,
      waitlistEntryId: params.get('d_waitlist') || undefined,
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <AppointmentWorkspace initial={initial} defaultMember={params.get('d_member')} close={close} />
}
