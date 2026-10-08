import { format, parseISO } from 'date-fns'
import { useMemo } from 'react'
import { useDb } from '@/store/db'
import { computeTotals, PAYMENT_LABELS } from '@/api/sales'
import { round2 } from '@/lib/format'
import type { Client, ISODate, Location, Payment, Sale, TeamMember } from '@/types'

/** Local calendar day (yyyy-MM-dd) of an ISO timestamp. */
export const dayOf = (iso: string): ISODate => format(parseISO(iso), 'yyyy-MM-dd')

export const inRange = (day: ISODate, from: ISODate, to: ISODate) => day >= from && day <= to

/** Clients, team members and locations by id. */
export function useLookups() {
  const clients = useDb((s) => s.clients)
  const members = useDb((s) => s.teamMembers)
  const locations = useDb((s) => s.locations)
  return useMemo(
    () => ({
      client: new Map<string, Client>(clients.map((c) => [c.id, c])),
      member: new Map<string, TeamMember>(members.map((m) => [m.id, m])),
      memberByName: new Map<string, TeamMember>(members.map((m) => [`${m.firstName} ${m.lastName}`, m])),
      location: new Map<string, Location>(locations.map((l) => [l.id, l])),
      members,
      locations,
    }),
    [clients, members, locations],
  )
}

/** Gross total shown in sales lists: items after discounts plus service charges, tips excluded. */
export function saleGross(sale: Sale): number {
  const t = computeTotals(sale)
  return round2(t.subtotal + t.serviceCharges)
}

export const saleTips = (sale: Sale) => computeTotals(sale).tips

/** Paid amount for a sale from a payments list (reactive variant of salePaid). */
export function paidFor(sale: Sale, paymentsById: Map<string, Payment>): number {
  return round2(sale.paymentIds.reduce((s, id) => {
    const p = paymentsById.get(id)
    return p && p.status === 'succeeded' ? s + p.amount : s
  }, 0))
}

/** Display label of a payment method ("Cash", "Card terminal", custom method name). */
export function methodName(p: Pick<Payment, 'method' | 'methodLabel'>): string {
  if (p.method === 'custom') return p.methodLabel
  if (p.method === 'gift_card') return PAYMENT_LABELS.gift_card
  return PAYMENT_LABELS[p.method]
}

/** Case-insensitive "contains". */
export const matches = (text: string | undefined | null, query: string) => (text ?? '').toLowerCase().includes(query.trim().toLowerCase())
