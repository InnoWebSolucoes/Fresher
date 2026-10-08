import { Armchair, BarChart3, CreditCard, Gem, Globe, Headphones, Link2, MessagesSquare, Star, Users, type LucideIcon } from 'lucide-react'
import type { DbState } from '@/store/db'

export type Unit = 'location' | 'bookableMember' | 'teamMember'

/**
 * How each add-on is sold and where its card leads (add-ons.md §1).
 * - paid: intro → setup (order + card + billing) → manage
 * - free: intro → Enable → manage
 * - accounting: intro → connect wizard → setup → manage
 * - integration: integration intro with an ID form
 * - external: its own page (Payments, Smart Website) or not available (Google Reserve)
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
  /** Icon tile: a lucide icon or a short wordmark, on a token-coloured background. */
  icon?: LucideIcon
  mark?: string
  tile: string
}

export const ADDONS = ['payments', 'premium-support', 'insights', 'google-rating-boost', 'loyalty', 'data-connector', 'client-connect', 'smart-website', 'team-chat', 'bookable-resources']
export const INTEGRATIONS = ['xero', 'quickbooks', 'google-reserve', 'fb-and-ig-bookings', 'meta-pixel-ads', 'google-analytics', 'google-ads']

export const META: Record<string, AddOnMeta> = {
  payments: { kind: 'external', href: '/payments/payment-processing', icon: CreditCard, tile: 'bg-gradient-to-br from-info to-primary text-white' },
  'premium-support': { kind: 'paid', price: 12.95, unit: 'bookableMember', cta: 'continue', icon: Headphones, tile: 'bg-gradient-to-br from-info to-primary-hover text-white' },
  insights: { kind: 'paid', price: 7.95, unit: 'bookableMember', trialDays: 7, cta: 'continue', icon: BarChart3, tile: 'bg-gradient-to-br from-primary to-info text-white' },
  'google-rating-boost': { kind: 'paid', price: 10.95, unit: 'location', cta: 'continue', icon: Star, tile: 'bg-gradient-to-br from-accent to-warning text-white' },
  loyalty: { kind: 'paid', price: 29.95, was: 39.95, unit: 'location', trialDays: 7, cta: 'continue', icon: Gem, tile: 'bg-gradient-to-br from-danger to-accent text-white' },
  'data-connector': { kind: 'paid', price: 150, unit: 'location', cta: 'startNow', icon: Link2, tile: 'bg-gradient-to-br from-success to-primary text-white' },
  'client-connect': { kind: 'free', cta: 'enable', icon: MessagesSquare, tile: 'bg-gradient-to-br from-primary-hover to-info text-white' },
  'smart-website': { kind: 'external', href: '/online-presence/smart-website', icon: Globe, tile: 'bg-gradient-to-br from-primary to-success text-white' },
  'team-chat': { kind: 'paid', price: 2.79, unit: 'teamMember', trialDays: 7, cta: 'startNow', icon: Users, tile: 'bg-gradient-to-br from-success to-info text-white' },
  'bookable-resources': { kind: 'free', cta: 'enable', icon: Armchair, tile: 'bg-gradient-to-br from-accent to-danger text-white' },
  xero: { kind: 'accounting', price: 8.95, unit: 'location', trialDays: 14, cta: 'startNow', mark: 'xero', tile: 'bg-info text-white' },
  quickbooks: { kind: 'accounting', price: 8.95, unit: 'location', trialDays: 14, cta: 'startNow', mark: 'qb', tile: 'bg-success text-white' },
  'google-reserve': { kind: 'integration', cta: 'setUpNow', mark: 'G', tile: 'border border-line bg-surface text-info' },
  'fb-and-ig-bookings': { kind: 'integration', cta: 'setUpNow', mark: 'f·ig', tile: 'border border-line bg-surface text-info' },
  'meta-pixel-ads': { kind: 'integration', cta: 'setUpNow', mark: '∞', tile: 'border border-line bg-surface text-info' },
  'google-analytics': { kind: 'integration', cta: 'setUpNow', icon: BarChart3, tile: 'border border-line bg-surface text-accent' },
  'google-ads': { kind: 'integration', cta: 'setUpNow', mark: 'Ads', tile: 'border border-line bg-surface text-info' },
}

/** Integrations that need a published marketplace profile (add-ons.md §3.2). */
export const NEEDS_PROFILE = ['google-reserve', 'fb-and-ig-bookings', 'meta-pixel-ads', 'google-analytics', 'google-ads']

/** Quantity billed for a unit, from the workspace data. */
export function unitQuantity(d: Pick<DbState, 'locations' | 'teamMembers'>, unit: Unit | undefined): number {
  if (unit === 'location') return Math.max(1, (d.locations ?? []).length)
  if (unit === 'bookableMember') return Math.max(1, (d.teamMembers ?? []).filter((m) => m.bookable && !m.archived).length)
  return Math.max(1, (d.teamMembers ?? []).filter((m) => !m.archived).length)
}

/** Where an add-on card's View button goes (null = disabled). */
export function cardHref(slug: string, on: boolean, profilePublished: boolean): string | null {
  const meta = META[slug]
  if (!meta) return null
  if (slug === 'google-reserve' && !profilePublished) return null
  if (slug === 'payments' && on) return '/add-ons/manage/payments'
  if (meta.href) return meta.href
  if (meta.kind === 'integration') return `/add-ons/integration/${slug}/intro`
  return on ? `/add-ons/manage/${slug}` : `/add-ons/add-on/${slug}/intro`
}

export const eur = (n: number) => `€${n.toLocaleString('en-IE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
