import { commit, db } from '@/store/db'
import type { AppNotification, Appointment, ID, MessageLog, MessageType } from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { money } from '@/lib/format'
import { latency } from './client'
import { dateAt, t } from './i18n'

/**
 * Outbox: every email, SMS and WhatsApp the system "sends" lands in
 * db.messages (Messages history + the demo panel outbox). Nothing leaves the
 * browser.
 */
export function queueMessage(message: Omit<MessageLog, 'id' | 'at' | 'status'> & { status?: MessageLog['status'] }): MessageLog {
  const record: MessageLog = { id: uid('msg'), at: nowISO(), status: 'delivered', ...message }
  commit((d) => {
    d.messages.unshift(record)
  })
  return record
}

export function pushNotification(n: Omit<AppNotification, 'id' | 'at' | 'read'>): void {
  commit((d) => {
    d.notifications.unshift({ id: uid('nt'), at: nowISO(), read: false, ...n })
  })
}

export async function markNotificationsRead(tab?: AppNotification['tab']): Promise<void> {
  await latency(100, 250)
  commit((d) => {
    d.notifications.forEach((n) => {
      if (!tab || n.tab === tab) n.read = true
    })
  })
}

const automationOn = (key: string) => db().automations.find((a) => a.key === key)?.enabled ?? false

/** Appointment lifecycle messages, respecting automations and client channel settings. */
export function notifyAppointment(appointment: Appointment, type: Extract<MessageType, 'confirmation' | 'reschedule' | 'cancellation' | 'no_show' | 'thank_you' | 'reminder'>): void {
  const key = { confirmation: 'new-appointment', reschedule: 'rescheduled', cancellation: 'cancelled', no_show: 'no-show', thank_you: 'thank-you', reminder: 'reminder-24h' }[type]
  if (!automationOn(key) || !appointment.clientId) return
  const data = db()
  const client = data.clients.find((c) => c.id === appointment.clientId)
  if (!client) return
  const first = appointment.items[0]
  const member = data.teamMembers.find((m) => m.id === first?.teamMemberId)
  const location = data.locations.find((l) => l.id === appointment.locationId)
  // `when` starts a line in the confirmation; `whenInline` sits mid-sentence.
  const when = dateAt(appointment.date, first?.start, 'EEE, MMM d', false)
  const whenInline = dateAt(appointment.date, first?.start)
  const locationName = location?.name ?? ''
  const subjects: Record<typeof type, string> = {
    confirmation: t('marketing.content.confirmation.subject', { whenShort: whenInline }),
    reschedule: t('marketing.content.reschedule.subject', { whenShort: whenInline }),
    cancellation: t('marketing.content.cancellation.subject', { whenShort: whenInline }),
    no_show: t('api.messaging.subject.noShow', { when: whenInline }),
    thank_you: t('marketing.content.thank_you.subject', { business: location?.name ?? data.workspace.name }),
    reminder: t('marketing.content.reminder.subject', { whenShort: whenInline }),
  }
  const services = appointment.items.map((i) => i.name).join(', ')
  const total = appointment.items.reduce((s, i) => s + i.price, 0)
  const firstName = client.firstName
  const memberName = member?.firstName ?? t('api.messaging.ourTeam')
  const cancellationFee = appointment.cancellation?.fee ? ` ${t('api.messaging.lateCancellationFee', { amount: money(appointment.cancellation.fee) })}` : ''
  const noShowFee = appointment.noShowFee ? ` ${t('api.messaging.noShowFee', { amount: money(appointment.noShowFee) })}` : ''
  const address = `${location?.address.line1}, ${location?.address.postcode} ${location?.address.city}`
  const bodies: Record<typeof type, string> = {
    confirmation: t('api.messaging.body.confirmation', { firstName, location: locationName, services, member: memberName, when, total: money(total), ref: appointment.ref, address }),
    reschedule: t('api.messaging.body.reschedule', { firstName, services, member: memberName, when: whenInline, ref: appointment.ref }),
    cancellation: t('api.messaging.body.cancellation', { firstName, services, when: whenInline, fee: cancellationFee }),
    no_show: t('api.messaging.body.noShow', { firstName, services, when: whenInline, fee: noShowFee }),
    thank_you: t('api.messaging.body.thankYou', { firstName, location: locationName, services }),
    reminder: t('api.messaging.body.reminder', { firstName, services, when: whenInline, location: locationName }),
  }
  const base = { clientId: client.id, toName: `${client.firstName} ${client.lastName}`, type, subject: subjects[type], body: bodies[type], appointmentId: appointment.id }
  if (client.notifications.email) queueMessage({ ...base, channel: 'email', to: client.email })
  if (client.notifications.sms && type !== 'thank_you') queueMessage({ ...base, channel: 'sms', to: client.phone, body: `${data.workspace.name}: ${bodies[type].split('\n')[0]}` })
}

/** Send a sale receipt by email or SMS (sale drawer "Email" / checkout). */
export async function sendReceipt(saleId: ID, to: string, channel: 'email' | 'sms' = 'email'): Promise<MessageLog> {
  await latency()
  const data = db()
  const sale = data.sales.find((s) => s.id === saleId)
  const client = data.clients.find((c) => c.id === sale?.clientId)
  const total = sale ? sale.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) + sale.tips.reduce((s, t) => s + t.amount, 0) : 0
  const lines = sale?.items.map((i) => `${i.quantity} × ${i.name}  ${money(i.unitPrice * i.quantity)}`).join('\n') ?? ''
  return queueMessage({
    clientId: client?.id ?? null,
    to,
    toName: client ? `${client.firstName} ${client.lastName}` : to,
    channel,
    type: 'receipt',
    subject: t('api.messaging.receipt.subject', { business: data.workspace.name, number: sale?.number }),
    body: t('api.messaging.receipt.body', { number: sale?.number, lines, total: money(total) }),
    saleId,
  })
}
