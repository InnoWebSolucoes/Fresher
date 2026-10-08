import { db, replaceAll } from '@/store/db'
import { buildSeed } from '@/mock/seed'
import { firstOnlineSlotFrom, simulateClientCancel, simulateOnlineBooking } from './demo'
import { setStatus } from './appointments'
import { checkout, computeTotals, refundSale, salePaid } from './sales'
import { useSessionStore } from '@/store/session'

/**
 * The SPEC golden path at the data level: online booking → calendar →
 * arrived → checked out → sale and payment recorded → client history.
 */
describe('golden path', () => {
  beforeAll(() => {
    replaceAll(buildSeed(new Date()))
    useSessionStore.getState().setCurrentUser('u_owner')
  })

  it('takes an online booking through checkout', async () => {
    const client = db().clients.find((c) => !c.blocked)!
    const query = { clientId: client.id, serviceId: 'svc_blow-dry', teamMemberId: null, locationId: 'loc_baixa', date: new Date().toISOString().slice(0, 10) }
    const found = firstOnlineSlotFrom(query)
    expect(found).not.toBeNull()
    const notificationsBefore = db().notifications.length
    const messagesBefore = db().messages.length

    const appt = await simulateOnlineBooking({ ...query, date: found!.date, slot: found!.slots[0], channel: 'marketplace', deposit: true })
    expect(db().appointments.find((a) => a.id === appt.id)).toMatchObject({ source: 'online', channel: 'marketplace', status: 'booked' })
    expect(db().notifications.length).toBe(notificationsBefore + 1)
    expect(db().messages.length).toBeGreaterThan(messagesBefore)
    expect(appt.deposit?.amount).toBeGreaterThan(0)

    await setStatus(appt.id, 'arrived')
    expect(db().appointments.find((a) => a.id === appt.id)?.status).toBe('arrived')

    const item = db().appointments.find((a) => a.id === appt.id)!.items[0]
    const draft = { items: [{ id: 'x', type: 'service' as const, name: item.name, quantity: 1, unitPrice: item.price, teamMemberId: item.teamMemberId, taxRate: 0.23 }], tips: [{ teamMemberId: item.teamMemberId, amount: 2.5 }], serviceCharges: [] }
    const total = computeTotals(draft).total
    const toPay = total - appt.deposit!.amount
    const sale = await checkout({
      clientId: client.id,
      locationId: 'loc_baixa',
      appointmentId: appt.id,
      items: [{ type: 'service', refId: item.serviceId, name: item.name, quantity: 1, unitPrice: item.price, teamMemberId: item.teamMemberId, appointmentId: appt.id, appointmentItemId: item.id }],
      tips: [{ teamMemberId: item.teamMemberId, amount: 2.5 }],
      payments: [{ method: 'cash', amount: toPay }],
    })
    expect(sale.status).toBe('completed')
    expect(salePaid(sale, db().payments)).toBeCloseTo(total, 2)
    const after = db().appointments.find((a) => a.id === appt.id)!
    expect(after.status).toBe('completed')
    expect(after.saleId).toBe(sale.id)
    expect(db().sales.filter((s) => s.clientId === client.id).map((s) => s.id)).toContain(sale.id)
    expect(db().messages.some((m) => m.appointmentId === appt.id && m.type === 'thank_you')).toBe(true)

    const refund = await refundSale({ saleId: sale.id, itemIds: [sale.items[0].id], method: 'cash', reason: "Client's request" })
    expect(refund.kind).toBe('refund')
    expect(refund.items[0].unitPrice).toBeLessThan(0)
  })

  it('charges a late cancellation fee inside the policy window', async () => {
    const soon = db().appointments.find((a) => a.clientId && a.status === 'booked' && new Date(`${a.date}T${a.items[0].start}`).getTime() - Date.now() < 20 * 3600 * 1000 && new Date(`${a.date}T${a.items[0].start}`).getTime() > Date.now())
    if (!soon) return
    const salesBefore = db().sales.length
    const result = await simulateClientCancel(soon.id)
    expect(result.late).toBe(true)
    expect(result.fee).toBeGreaterThan(0)
    expect(db().sales.length).toBe(salesBefore + 1)
  })
})
