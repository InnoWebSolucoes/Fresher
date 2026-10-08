import type { DbState } from '@/store/db'

export type Unit = 'location' | 'bookableMember' | 'teamMember'

/**
 * How each add-on is sold and where its card leads (add-ons.md §1).
 * - paid: intro → setup (order + card + billing) → manage
 * - free: intro → Enable → manage
 * - accounting: intro → 2-step connect wizard → manage
 * - integration: integration intro with an ID form
 */
export interface AddOnMeta {
  kind: 'paid' | 'free' | 'accounting' | 'integration' | 'external'
  price?: number
  was?: number
  unit?: Unit
  trialDays?: number
  cta?: 'continue' | 'startNow' | 'enable' | 'setUpNow'
  /** Cards that don't follow the default links. */
  href?: string
  disabled?: boolean
}

export const ADDONS = ['payments', 'premium-support', 'insights', 'google-rating-boost', 'loyalty', 'data-connector', 'client-connect', 'smart-website', 'team-chat', 'bookable-resources']
export const INTEGRATIONS = ['xero', 'quickbooks', 'google-reserve', 'fb-and-ig-bookings', 'meta-pixel-ads', 'google-analytics', 'google-ads']

export const META: Record<string, AddOnMeta> = {
  payments: { kind: 'external', href: '/payments/payment-processing' },
  'premium-support': { kind: 'paid', price: 12.95, unit: 'bookableMember', cta: 'continue' },
  insights: { kind: 'paid', price: 7.95, unit: 'bookableMember', trialDays: 7, cta: 'continue' },
  'google-rating-boost': { kind: 'paid', price: 10.95, unit: 'location', cta: 'continue' },
  loyalty: { kind: 'paid', price: 29.95, was: 39.95, unit: 'location', trialDays: 7, cta: 'continue' },
  'data-connector': { kind: 'paid', price: 150, unit: 'location', cta: 'startNow' },
  'client-connect': { kind: 'free', cta: 'enable' },
  'smart-website': { kind: 'external', href: '/online-presence/smart-website' },
  'team-chat': { kind: 'paid', price: 2.79, unit: 'teamMember', trialDays: 7, cta: 'startNow' },
  'bookable-resources': { kind: 'free', cta: 'enable' },
  xero: { kind: 'accounting', price: 8.95, unit: 'location', trialDays: 14, cta: 'startNow' },
  quickbooks: { kind: 'accounting', price: 8.95, unit: 'location', trialDays: 14, cta: 'startNow' },
  'google-reserve': { kind: 'external', disabled: true },
  'fb-and-ig-bookings': { kind: 'integration', cta: 'setUpNow' },
  'meta-pixel-ads': { kind: 'integration', cta: 'setUpNow' },
  'google-analytics': { kind: 'integration', cta: 'setUpNow' },
  'google-ads': { kind: 'integration', cta: 'setUpNow' },
}

/** Quantity billed for a unit, from the workspace data. */
export function unitQuantity(d: Pick<DbState, 'locations' | 'teamMembers'>, unit: Unit | undefined): number {
  if (unit === 'location') return Math.max(1, (d.locations ?? []).filter((l) => !('archived' in l) || !(l as { archived?: boolean }).archived).length)
  if (unit === 'bookableMember') return Math.max(1, (d.teamMembers ?? []).filter((m) => m.bookable && !m.archived).length)
  return Math.max(1, (d.teamMembers ?? []).filter((m) => !m.archived).length)
}

/** Where an add-on card's View button goes. */
export function cardHref(slug: string, on: boolean): string | null {
  const meta = META[slug]
  if (!meta || meta.disabled) return null
  if (meta.href) return meta.href
  if (meta.kind === 'integration') return `/add-ons/integration/${slug}/intro`
  return on ? `/add-ons/manage/${slug}` : `/add-ons/add-on/${slug}/intro`
}

export const eur = (n: number) => `€${n.toLocaleString('en-IE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
