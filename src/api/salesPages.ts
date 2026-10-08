import { commit, db } from '@/store/db'
import type { ClientMembership, ID, ProductOrder } from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { money } from '@/lib/format'
import { actorName, ApiError, latency } from './client'
import { queueMessage } from './messaging'

/**
 * Domain operations for the Sales "Sold items" pages (sales.md §6):
 * memberships (pause / resume / cancel), client packages (cancel) and
 * online store product orders (ready / shipped / completed / cancelled).
 * Each change notifies the client through the demo outbox.
 */

function clientContact(clientId: ID | null) {
  const client = db().clients.find((c) => c.id === clientId)
  if (!client) return undefined
  return { client, name: `${client.firstName} ${client.lastName}` }
}

export async function setMembershipStatus(id: ID, status: ClientMembership['status']): Promise<ClientMembership> {
  await latency()
  const record = db().clientMemberships.find((m) => m.id === id)
  if (!record) throw new ApiError('not_found', 'Membership not found')
  commit((d) => {
    const m = d.clientMemberships.find((x) => x.id === id)
    if (m) m.status = status
  })
  const def = db().memberships.find((m) => m.id === record.membershipId)
  const contact = clientContact(record.clientId)
  if (contact && def) {
    const subjects: Record<ClientMembership['status'], string> = {
      active: `Your ${def.name} membership is active again`,
      paused: `Your ${def.name} membership has been paused`,
      canceled: `Your ${def.name} membership has been canceled`,
    }
    const bodies: Record<ClientMembership['status'], string> = {
      active: `Hi ${contact.client.firstName}, your ${def.name} membership has been resumed. Your next payment of ${money(record.price)} is due on ${record.nextBillingAt}.`,
      paused: `Hi ${contact.client.firstName}, your ${def.name} membership is paused. You won't be charged until it is resumed.`,
      canceled: `Hi ${contact.client.firstName}, your ${def.name} membership has been canceled. No further payments will be taken. We hope to see you again soon.`,
    }
    queueMessage({ clientId: contact.client.id, to: contact.client.email, toName: contact.name, channel: 'email', type: 'other', subject: subjects[status], body: bodies[status], saleId: record.saleId || undefined })
  }
  return db().clientMemberships.find((m) => m.id === id)!
}

export async function cancelClientPackage(id: ID): Promise<void> {
  await latency()
  const record = db().clientPackages.find((p) => p.id === id)
  if (!record) throw new ApiError('not_found', 'Package not found')
  commit((d) => {
    const p = d.clientPackages.find((x) => x.id === id)
    if (p) p.status = 'canceled'
  })
  const def = db().packages.find((p) => p.id === record.packageId)
  const contact = clientContact(record.clientId)
  if (contact && def) {
    queueMessage({
      clientId: contact.client.id,
      to: contact.client.email,
      toName: contact.name,
      channel: 'email',
      type: 'other',
      subject: `Your ${def.name} package has been canceled`,
      body: `Hi ${contact.client.firstName}, your ${def.name} package has been canceled and can no longer be used for bookings. Contact us if you have any questions.`,
      saleId: record.saleId,
    })
  }
}

const ORDER_MESSAGES: Record<Exclude<ProductOrder['status'], 'new'>, { subject: (n: number) => string; body: (first: string, n: number, extra: string) => string }> = {
  ready: {
    subject: (n) => `Your order #${n} is ready for pickup`,
    body: (first, n, extra) => `Hi ${first}, good news: your order #${n} is ready to collect${extra}. Bring your order number with you.`,
  },
  shipped: {
    subject: (n) => `Your order #${n} has shipped`,
    body: (first, n) => `Hi ${first}, your order #${n} is on its way. It should arrive in 2 to 4 working days.`,
  },
  completed: {
    subject: (n) => `Your order #${n} is complete`,
    body: (first, n) => `Hi ${first}, your order #${n} is complete. Thank you for shopping with us!`,
  },
  cancelled: {
    subject: (n) => `Your order #${n} has been cancelled`,
    body: (first, n, extra) => `Hi ${first}, your order #${n} has been cancelled.${extra} We're sorry for any inconvenience.`,
  },
}

/** Move an online store order through its fulfilment steps and tell the client. */
export async function setProductOrderStatus(id: ID, status: Exclude<ProductOrder['status'], 'new'>, notifyClient = true): Promise<ProductOrder> {
  await latency()
  const data = db()
  const order = data.productOrders.find((o) => o.id === id)
  if (!order) throw new ApiError('not_found', 'Order not found')
  if (order.status === 'cancelled' || order.status === 'completed') throw new ApiError('closed', 'This order is already closed')
  const by = actorName()
  const at = nowISO()
  commit((d) => {
    const o = d.productOrders.find((x) => x.id === id)
    if (!o) return
    o.status = status
    if (status === 'cancelled') {
      // Put the reserved stock back on the shelf.
      for (const item of o.items) {
        const product = d.products.find((p) => p.id === item.productId)
        if (product?.trackStock) {
          product.stock += item.qty
          d.stockMovements.push({ id: uid('sm'), productId: product.id, locationId: d.locations[0]?.id ?? '', qty: item.qty, reason: 'Order cancelled', by, at, ref: `Order #${o.number}` })
        }
      }
    }
  })
  const contact = clientContact(order.clientId)
  if (notifyClient && contact) {
    const location = data.locations[0]
    const extra =
      status === 'ready' ? (location ? ` at ${location.name}, ${location.address.line1}` : '') : status === 'cancelled' ? ` A refund of ${money(order.total)} has been issued to your original payment method.` : ''
    const message = ORDER_MESSAGES[status]
    queueMessage({ clientId: contact.client.id, to: contact.client.email, toName: contact.name, channel: 'email', type: 'other', subject: message.subject(order.number), body: message.body(contact.client.firstName, order.number, extra), saleId: order.saleId })
  }
  return db().productOrders.find((o) => o.id === id)!
}
