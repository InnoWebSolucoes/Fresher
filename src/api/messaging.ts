import { format, parseISO } from 'date-fns'
import { commit, db } from '@/store/db'
import type { AppNotification, Appointment, ID, MessageLog, MessageType } from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { money } from '@/lib/format'
import { latency } from './client'

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
  const when = `${format(parseISO(appointment.date), 'EEE, MMM d')} at ${first?.start}`
  const subjects: Record<typeof type, string> = {
    confirmation: `Your appointment is confirmed for ${when}`,
    reschedule: `Your appointment has been moved to ${when}`,
    cancellation: `Your appointment on ${when} was canceled`,
    no_show: `We missed you on ${when}`,
    thank_you: `Thanks for visiting ${location?.name ?? data.workspace.name}`,
    reminder: `Reminder about your appointment on ${when}`,
  }
  const services = appointment.items.map((i) => i.name).join(', ')
  const total = appointment.items.reduce((s, i) => s + i.price, 0)
  const bodies: Record<typeof type, string> = {
    confirmation: `Hi ${client.firstName}, your booking at ${location?.name} is confirmed.\n\n${services} with ${member?.firstName ?? 'our team'}\n${when}\nTotal ${money(total)}\n\nBooking ref: ${appointment.ref}\n${location?.address.line1}, ${location?.address.postcode} ${location?.address.city}`,
    reschedule: `Hi ${client.firstName}, your ${services} with ${member?.firstName} is now on ${when}. Booking ref: ${appointment.ref}.`,
    cancellation: `Hi ${client.firstName}, your ${services} on ${when} has been canceled.${appointment.cancellation?.fee ? ` A late cancellation fee of ${money(appointment.cancellation.fee)} was charged.` : ''} We hope to see you soon.`,
    no_show: `Hi ${client.firstName}, we missed you at your ${services} appointment on ${when}.${appointment.noShowFee ? ` A no-show fee of ${money(appointment.noShowFee)} was charged.` : ''} Book again any time.`,
    thank_you: `Hi ${client.firstName}, thank you for visiting ${location?.name} today. How was your ${services}? Leave a review: ★★★★★`,
    reminder: `Hi ${client.firstName}, just a quick reminder about your ${services} on ${when} at ${location?.name}.`,
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
    subject: `Your receipt from ${data.workspace.name} (Sale #${sale?.number})`,
    body: `Sale #${sale?.number}\n${lines}\n\nTotal ${money(total)}\nThank you for your visit!`,
    saleId,
  })
}
