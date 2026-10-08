import { commit, db } from '@/store/db'
import type { ClientMembership, ID, ProductOrder } from '@/types'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { money } from '@/lib/format'
import { actorName, ApiError, latency } from './client'
import { queueMessage } from './messaging'
import { isoDay, t } from './i18n'

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
  if (!record) throw new ApiError('not_found', t('api.salesPages.membershipNotFound'))
  commit((d) => {
    const m = d.clientMemberships.find((x) => x.id === id)
    if (m) m.status = status
  })
  const def = db().memberships.find((m) => m.id === record.membershipId)
  const contact = clientContact(record.clientId)
  if (contact && def) {
    const vars = { name: def.name, firstName: contact.client.firstName, amount: money(record.price), date: isoDay(record.nextBillingAt) }
    queueMessage({
      clientId: contact.client.id,
      to: contact.client.email,
      toName: contact.name,
      channel: 'email',
      type: 'other',
      subject: t(`api.salesPages.membership.${status}.subject`, vars),
      body: t(`api.salesPages.membership.${status}.body`, vars),
      saleId: record.saleId || undefined,
    })
  }
  return db().clientMemberships.find((m) => m.id === id)!
}

export async function cancelClientPackage(id: ID): Promise<void> {
  await latency()
  const record = db().clientPackages.find((p) => p.id === id)
  if (!record) throw new ApiError('not_found', t('api.salesPages.packageNotFound'))
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
      subject: t('api.salesPages.packageCanceled.subject', { name: def.name }),
      body: t('api.salesPages.packageCanceled.body', { name: def.name, firstName: contact.client.firstName }),
      saleId: record.saleId,
    })
  }
}


/** Move an online store order through its fulfilment steps and tell the client. */
export async function setProductOrderStatus(id: ID, status: Exclude<ProductOrder['status'], 'new'>, notifyClient = true): Promise<ProductOrder> {
  await latency()
  const data = db()
  const order = data.productOrders.find((o) => o.id === id)
  if (!order) throw new ApiError('not_found', t('api.salesPages.orderNotFound'))
  if (order.status === 'cancelled' || order.status === 'completed') throw new ApiError('closed', t('api.salesPages.orderClosed'))
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
      status === 'ready'
        ? location
          ? ` ${t('api.salesPages.order.readyAt', { place: `${location.name}, ${location.address.line1}` })}`
          : ''
        : status === 'cancelled'
          ? ` ${t('api.salesPages.order.refundIssued', { amount: money(order.total) })}`
          : ''
    const vars = { firstName: contact.client.firstName, number: order.number, extra }
    queueMessage({ clientId: contact.client.id, to: contact.client.email, toName: contact.name, channel: 'email', type: 'other', subject: t(`api.salesPages.order.${status}.subject`, vars), body: t(`api.salesPages.order.${status}.body`, vars), saleId: order.saleId })
  }
  return db().productOrders.find((o) => o.id === id)!
}
