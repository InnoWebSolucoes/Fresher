import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/ui'
import type { DrawerProps } from '@/app/sectionRegistry'
import { readExt } from '@/api/ext'
import { db, useDb } from '@/store/db'
import { todayISO } from '@/lib/time'
import type { ServiceAddOn } from '@/types'
import { AppointmentWorkspace } from '../appointment/AppointmentWorkspace'
import { draftFromAppointment, draftItemFromService } from '../appointment/editor'
import { useCalendarParams } from '../hooks'
import { isISODate } from '../lib'
import { NO_REPEAT, useCalendarUi, type AppointmentDraft, type DraftItem } from '../store'

/** Add-ons chosen for each service of a waitlist entry (WaitlistEntry has no add-on field). */
export const WAITLIST_ADDONS = 'waitlistAddOns'
export type WaitlistAddOns = Record<string, ServiceAddOn[][]>

export function AppointmentDrawer({ id, params, close }: DrawerProps) {
  const { t } = useTranslation()
  const appointment = useDb((s) => s.appointments.find((a) => a.id === id))
  const resume = params.get('d_resume')
  const initial = useMemo(() => {
    if (!appointment) return null
    const stored = useCalendarUi.getState().draft
    if (resume && stored?.editingId === appointment.id) return stored
    return draftFromAppointment(appointment)
  }, [appointment?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // Unsaved edits come back once; they aren't reused by a later drawer.
  useEffect(() => {
    if (useCalendarUi.getState().draft?.editingId) useCalendarUi.getState().setDraft(null)
  }, [])
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
    if (params.get('d_resume') && stored && !stored.editingId) {
      return {
        ...stored,
        date: isISODate(date) ? date : stored.date,
        start: time ?? stored.start,
        items: stored.items.map((it, i) => (i === 0 && member && !it.teamMemberId ? { ...it, teamMemberId: member } : it)),
      }
    }
    const group = params.get('d_group')
    const waitlistId = params.get('d_waitlist')
    const entry = waitlistId ? db().waitlist.find((w) => w.id === waitlistId) : undefined
    let items: DraftItem[]
    if (entry) {
      // Booking from the waitlist keeps the requested team member (shown with a heart) and add-ons.
      const addOns = readExt<WaitlistAddOns>('calendar', WAITLIST_ADDONS, {})[entry.id] ?? []
      items = entry.items.flatMap((wi, index) => {
        const service = services.find((s) => s.id === wi.serviceId)
        if (!service) return []
        const item = draftItemFromService(service, wi.teamMemberId ?? (index === 0 ? member : null), wi.variantId)
        return [{ ...item, preferred: Boolean(wi.teamMemberId), addOns: addOns[index] ?? [] }]
      })
    } else {
      const serviceIds = (params.get('d_services') ?? '').split(',').filter(Boolean)
      items = serviceIds.map((sid) => services.find((s) => s.id === sid)).filter((s) => s !== undefined).map((s) => draftItemFromService(s!, member))
    }
    return {
      clientId: params.get('d_client') || entry?.clientId || null,
      walkIn: false,
      locationId,
      date: isISODate(date) ? date : todayISO(),
      start: time || null,
      items,
      repeat: NO_REPEAT,
      note: '',
      paymentPolicy: false,
      groupId: group || undefined,
      waitlistEntryId: waitlistId || undefined,
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <AppointmentWorkspace initial={initial} defaultMember={params.get('d_member')} close={close} />
}
