import { commit, db } from '@/store/db'
import type { Appointment, BlockedTimeType, FormResponse, ID, MessageLog, RepeatRule, SavedFilter, Settings } from '@/types'
import { bookingRef, uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { activity, actorName, ApiError, latency } from './client'
import { queueMessage } from './messaging'
import { repeatDates } from './appointments'

/**
 * Calendar-only operations (calendar.md): personal calendar settings, saved
 * filter presets, forms sent from an appointment, payment policy, repeating
 * an existing appointment and blocked time types.
 */

export async function saveCalendarSettings(patch: { calendarZoom?: Settings['calendarZoom']; quickActions?: boolean }): Promise<void> {
  await latency(250, 500)
  commit((d) => {
    if (patch.calendarZoom) d.settings.calendarZoom = patch.calendarZoom
    if (patch.quickActions !== undefined) d.settings.quickActions = patch.quickActions
  })
}

// ─── Saved filter presets ──────────────────────────────────────────────

export async function createFilterPreset(name: string, filters: Record<string, string[]>): Promise<SavedFilter> {
  await latency(250, 500)
  const preset: SavedFilter = { id: uid('flt'), name: name.trim(), filters }
  commit((d) => {
    d.settings.savedFilters.push(preset)
  })
  return preset
}

export async function renameFilterPreset(id: ID, name: string): Promise<void> {
  await latency(250, 500)
  commit((d) => {
    const preset = d.settings.savedFilters.find((f) => f.id === id)
    if (!preset) throw new ApiError('not_found', 'Saved filter not found')
    preset.name = name.trim()
  })
}

export async function deleteFilterPreset(id: ID): Promise<void> {
  await latency(250, 500)
  commit((d) => {
    d.settings.savedFilters = d.settings.savedFilters.filter((f) => f.id !== id)
  })
}

// ─── Appointment extras ────────────────────────────────────────────────

/** Send a client form for an appointment: creates the response and emails the client. */
export async function sendAppointmentForm(appointmentId: ID, templateId: ID): Promise<FormResponse> {
  await latency()
  const data = db()
  const appt = data.appointments.find((a) => a.id === appointmentId)
  const template = data.formTemplates.find((f) => f.id === templateId)
  if (!appt || !template) throw new ApiError('not_found', 'Appointment or form not found')
  if (!appt.clientId) throw new ApiError('walk_in', 'Forms can only be sent to a client')
  const client = data.clients.find((c) => c.id === appt.clientId)
  const response: FormResponse = { id: uid('fr'), templateId, clientId: appt.clientId, appointmentId, status: 'sent', answers: {}, sentAt: nowISO() }
  commit((d) => {
    d.formResponses.push(response)
    const a = d.appointments.find((x) => x.id === appointmentId)
    if (a) {
      a.formResponseIds.push(response.id)
      a.activity.unshift(activity('Form sent', `${template.name} sent to ${client?.firstName ?? 'the client'}`))
    }
  })
  if (client) {
    queueMessage({
      clientId: client.id,
      to: client.email,
      toName: `${client.firstName} ${client.lastName}`,
      channel: 'email',
      type: 'form',
      subject: `Please complete "${template.name}" before your appointment`,
      body: `Hi ${client.firstName}, please fill in the form "${template.name}" before your visit. It only takes a couple of minutes.`,
      appointmentId,
      link: { label: 'Complete form', href: `/forms/${response.id}` },
    })
  }
  return response
}

export async function setAppointmentPaymentPolicy(id: ID, on: boolean): Promise<void> {
  await latency(250, 500)
  commit((d) => {
    const appt = d.appointments.find((a) => a.id === id)
    if (!appt) throw new ApiError('not_found', 'Appointment not found')
    appt.paymentPolicy = on
    appt.activity.unshift(activity(on ? 'Payment policy added' : 'Payment policy removed'))
  })
}

/** Turn an existing appointment into a repeating series (creates the future occurrences). Returns how many were added. */
export async function setAppointmentRepeat(id: ID, rule: RepeatRule): Promise<number> {
  await latency()
  const appt = db().appointments.find((a) => a.id === id)
  if (!appt) throw new ApiError('not_found', 'Appointment not found')
  if (rule.frequency === 'none') {
    commit((d) => {
      const a = d.appointments.find((x) => x.id === id)
      if (a) {
        a.repeat = undefined
        a.activity.unshift(activity('Repeat removed'))
      }
    })
    return 0
  }
  const seriesId = appt.repeat?.seriesId ?? uid('series')
  const dates = repeatDates(appt.date, rule).slice(1)
  const by = actorName()
  const copies: Appointment[] = dates.map((date) => ({
    ...appt,
    id: uid('apt'),
    ref: bookingRef(),
    date,
    status: 'booked',
    createdAt: nowISO(),
    createdBy: by,
    items: appt.items.map((item) => ({ ...item, id: uid('ai') })),
    repeat: { ...rule, seriesId },
    groupId: undefined,
    deposit: undefined,
    cancellation: undefined,
    noShowFee: undefined,
    saleId: undefined,
    waitlistEntryId: undefined,
    formResponseIds: [],
    activity: [{ ...activity('Appointment created', `Booked by ${by.split(' ')[0]}, repeating series`), by }],
  }))
  commit((d) => {
    const a = d.appointments.find((x) => x.id === id)
    if (a) {
      a.repeat = { ...rule, seriesId }
      a.activity.unshift(activity('Set as repeating', `${copies.length + 1} appointments in the series`))
    }
    d.appointments.push(...copies)
  })
  return copies.length
}

// ─── Blocked time types ────────────────────────────────────────────────

export async function createBlockedTimeType(input: Omit<BlockedTimeType, 'id'>): Promise<BlockedTimeType> {
  await latency()
  const record: BlockedTimeType = { ...input, id: uid('btt') }
  commit((d) => {
    d.blockedTimeTypes.push(record)
  })
  return record
}

// ─── Client quick actions from the appointment drawer ──────────────────

/** Message a client from the appointment (lands in the outbox / Messages history). */
export async function messageClient(clientId: ID, channel: MessageLog['channel'], text: string): Promise<MessageLog> {
  await latency()
  const client = db().clients.find((c) => c.id === clientId)
  if (!client) throw new ApiError('not_found', 'Client not found')
  return queueMessage({
    clientId,
    to: channel === 'email' ? client.email : client.phone,
    toName: `${client.firstName} ${client.lastName}`,
    channel,
    type: 'chat',
    subject: `Message from ${db().workspace.name}`,
    body: text,
  })
}
