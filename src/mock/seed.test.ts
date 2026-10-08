import { setLang } from '@/i18n/language'
import { buildSeed } from './seed'

describe('seed', () => {
  const today = new Date('2026-10-08T15:00:00')
  const data = buildSeed(today)

  it('is deterministic', () => {
    const again = buildSeed(today)
    expect(again.appointments.length).toBe(data.appointments.length)
    expect(again.clients[10].email).toBe(data.clients[10].email)
  })

  it('matches the brief', () => {
    expect(data.locations).toHaveLength(2)
    expect(data.teamMembers).toHaveLength(6)
    expect(data.services).toHaveLength(40)
    expect(data.serviceCategories).toHaveLength(6)
    expect(data.bundles).toHaveLength(3)
    expect(data.memberships).toHaveLength(2)
    expect(data.products).toHaveLength(30)
    expect(data.suppliers).toHaveLength(3)
    expect(data.clients).toHaveLength(200)
    expect(data.clients.some((c) => c.marketplace)).toBe(true)
    expect(data.users.map((u) => u.email)).toEqual(expect.arrayContaining(['owner@demo.app', 'staff@demo.app']))
  })

  it('has 10 weeks of history and 3 weeks of bookings', () => {
    const dates = data.appointments.map((a) => a.date).sort()
    expect(dates[0] <= '2026-07-31').toBe(true)
    expect(dates[dates.length - 1] >= '2026-10-27').toBe(true)
    expect(data.appointments.filter((a) => a.date > '2026-10-08').length).toBeGreaterThan(100)
    for (const status of ['completed', 'no_show', 'cancelled', 'booked', 'confirmed'] as const) {
      expect(data.appointments.some((a) => a.status === status), status).toBe(true)
    }
    expect(data.appointments.some((a) => a.source === 'online')).toBe(true)
    expect(data.sales.some((s) => s.kind === 'refund')).toBe(true)
    expect(data.giftCards.length).toBeGreaterThan(5)
    expect(data.clientPackages.length).toBeGreaterThan(3)
    expect(data.productOrders.length).toBeGreaterThan(3)
    expect(data.reviews.length).toBeGreaterThan(20)
  })

  it('pays every completed sale in full', () => {
    for (const sale of data.sales.filter((s) => s.status === 'completed' && s.kind === 'sale')) {
      const items = sale.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
      const discount = sale.cartDiscount ? (items * sale.cartDiscount.value) / 100 : 0
      const tips = sale.tips.reduce((s, t) => s + t.amount, 0)
      const paid = data.payments.filter((p) => sale.paymentIds.includes(p.id)).reduce((s, p) => s + p.amount, 0)
      expect(Math.abs(items - discount + tips - paid), `sale ${sale.number}`).toBeLessThan(0.02)
    }
  })

  it('stays small enough to persist', () => {
    expect(JSON.stringify(data).length).toBeLessThan(6_000_000)
  })

  it('builds the same data in Portuguese, with Portuguese text', () => {
    // Text becomes a placeholder; ids, numbers, dates and flags must match exactly.
    const shape = (v: unknown, key = ''): unknown => {
      if (typeof v === 'string') return /(^id$|Ids?$)/.test(key) || /^[\d\-:.TZ+]+$/.test(v) ? v : 'text'
      if (Array.isArray(v)) return v.map((x) => shape(x, key))
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, k)]))
      return v
    }
    setLang('pt')
    try {
      const pt = buildSeed(today)
      expect(shape(pt)).toEqual(shape(data))
      expect(pt.services.find((s) => s.id === 'svc_womens-cut')?.name).toBe('Corte de senhora')
      expect(pt.settings.permissionRoles.find((r) => r.id === 'owner')?.name).toBe('Proprietário do espaço de trabalho')
      expect(pt.sales.flatMap((s) => s.items).find((i) => i.type === 'gift_card')?.name).toBe('Cartão-oferta')
      expect(pt.clientSources.find((s) => s.id === 'src_walkin')?.name).toBe('Sem marcação')
    } finally {
      setLang('en')
    }
  })
})
