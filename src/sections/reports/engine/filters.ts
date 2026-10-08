import {
  Award,
  Banknote,
  BookOpen,
  Box,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Layers,
  ListChecks,
  MapPin,
  MessageSquareText,
  Package,
  Percent,
  ReceiptText,
  Scissors,
  Shapes,
  Sparkles,
  Tag,
  Tags,
  Truck,
  User,
  UserCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { STATUS_STYLES } from '@/styles/palette'
import type { Ctx } from './context'
import { L } from './labels'

export interface FilterOption {
  value: string
  label: string
  hint?: string
}

export interface FilterDef {
  key: string
  icon: LucideIcon
  kind: 'list' | 'range' | 'segments'
  options?: (ctx: Ctx) => FilterOption[]
}

const opts = (key: string, values: string[]) => () => values.map((v) => ({ value: v, label: L(`opt.${key}.${v}`) }))
const uniq = (values: (string | undefined | null)[]) => [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b))
const named = (values: string[]) => values.map((v) => ({ value: v, label: v }))

const locations = (ctx: Ctx) => (ctx.d.locations ?? []).map((l) => ({ value: l.id, label: l.name }))
const members = (ctx: Ctx) => (ctx.d.teamMembers ?? []).filter((m) => !m.archived).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))
const categories = (ctx: Ctx) => (ctx.d.serviceCategories ?? []).map((c) => ({ value: c.id, label: c.name }))
const services = (ctx: Ctx) => (ctx.d.services ?? []).filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name }))
const products = (ctx: Ctx) => (ctx.d.products ?? []).filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name }))

const DEFS: FilterDef[] = [
  { key: 'location', icon: MapPin, kind: 'list', options: locations },
  { key: 'redemptionLocation', icon: MapPin, kind: 'list', options: locations },
  { key: 'teamMember', icon: Users, kind: 'list', options: members },
  { key: 'status', icon: ReceiptText, kind: 'list', options: opts('status', ['unpaid', 'part_paid', 'completed', 'exchanged', 'refunded']) },
  { key: 'channel', icon: CalendarDays, kind: 'list', options: opts('channel', ['online', 'marketplace', 'google', 'book_now_link', 'facebook', 'instagram', 'automations', 'blast', 'offline']) },
  { key: 'type', icon: Tag, kind: 'list', options: opts('type', ['service', 'service_addon', 'product', 'package', 'membership', 'shipping', 'late_cancellation_fee', 'no_show_fee']) },
  { key: 'loyalty', icon: Award, kind: 'list', options: opts('loyalty', ['points', 'tiers', 'referral', 'referred', 'none']) },
  { key: 'clientTags', icon: Tags, kind: 'list', options: (ctx) => [...(ctx.d.clientTags ?? []).map((t) => ({ value: t.id, label: t.name })), { value: 'none', label: L('opt.noTags') }] },
  { key: 'clientSegments', icon: Shapes, kind: 'segments', options: (ctx) => (ctx.d.segments ?? []).map((s) => ({ value: s.id, label: s.name, hint: s.description })) },
  { key: 'clientGender', icon: User, kind: 'list', options: opts('gender', ['female', 'male', 'non_binary', 'undisclosed']) },
  { key: 'clientRetention', icon: UserCheck, kind: 'list', options: opts('retention', ['new', 'returning', 'walk_in']) },
  { key: 'supplier', icon: Truck, kind: 'list', options: (ctx) => (ctx.d.suppliers ?? []).map((s) => ({ value: s.id, label: s.name })) },
  { key: 'brand', icon: Award, kind: 'list', options: (ctx) => (ctx.d.brands ?? []).map((b) => ({ value: b.id, label: b.name })) },
  { key: 'productCategory', icon: Layers, kind: 'list', options: (ctx) => (ctx.d.productCategories ?? []).map((c) => ({ value: c.id, label: c.name })) },
  { key: 'serviceCategory', icon: Layers, kind: 'list', options: categories },
  {
    key: 'category',
    icon: Layers,
    kind: 'list',
    options: (ctx) => [
      ...categories(ctx),
      ...(ctx.d.productCategories ?? []).map((c) => ({ value: c.id, label: c.name })),
      ...['package', 'membership', 'gift_card', 'late_cancellation_fee', 'no_show_fee', 'shipping', 'manual'].map((t) => ({ value: `t_${t}`, label: L(`opt.typeSingle.${t}`) })),
    ],
  },
  { key: 'service', icon: Scissors, kind: 'list', options: services },
  { key: 'benefits', icon: Scissors, kind: 'list', options: services },
  { key: 'item', icon: Box, kind: 'list', options: (ctx) => [...services(ctx), ...products(ctx)] },
  { key: 'product', icon: Box, kind: 'list', options: products },
  { key: 'serviceCharge', icon: Percent, kind: 'list', options: (ctx) => (ctx.d.settings?.serviceCharges ?? []).map((s) => ({ value: s.id, label: s.name })) },
  { key: 'totalSales', icon: CircleDollarSign, kind: 'range' },
  { key: 'amountDue', icon: CircleDollarSign, kind: 'range' },
  { key: 'paymentAmount', icon: CircleDollarSign, kind: 'range' },
  { key: 'saleValue', icon: CircleDollarSign, kind: 'range' },
  { key: 'cartDiscounts', icon: Percent, kind: 'range' },
  { key: 'recognizedRevenue', icon: CircleDollarSign, kind: 'range' },
  { key: 'deferredRevenue', icon: CircleDollarSign, kind: 'range' },
  { key: 'discountCategory', icon: Percent, kind: 'list', options: opts('discountCategory', ['item', 'cart', 'both']) },
  { key: 'discountType', icon: Percent, kind: 'list', options: opts('discountType', ['percent', 'amount']) },
  { key: 'redeemed', icon: Gift, kind: 'list', options: opts('redeemed', ['yes', 'no']) },
  { key: 'giftCardStatus', icon: Gift, kind: 'list', options: opts('giftCardStatus', ['active', 'redeemed', 'expired', 'cancelled']) },
  { key: 'membershipStatus', icon: ListChecks, kind: 'list', options: opts('membershipStatus', ['active', 'paused', 'canceled']) },
  { key: 'membershipId', icon: FileText, kind: 'list', options: (ctx) => (ctx.d.clientMemberships ?? []).map((m) => ({ value: m.id, label: `${m.id.replace('cmem_', 'M-').toUpperCase()} · ${ctx.clientName(m.clientId)}` })) },
  { key: 'membershipName', icon: Sparkles, kind: 'list', options: (ctx) => (ctx.d.memberships ?? []).map((m) => ({ value: m.id, label: m.name })) },
  { key: 'client', icon: User, kind: 'list', options: (ctx) => (ctx.d.clients ?? []).filter((c) => !c.deletedAt).map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })) },
  { key: 'paymentFrequency', icon: Clock, kind: 'list', options: opts('paymentFrequency', ['month', 'week']) },
  { key: 'packageStatus', icon: Package, kind: 'list', options: opts('packageStatus', ['active', 'expired', 'canceled', 'pending', 'used']) },
  { key: 'packageName', icon: Package, kind: 'list', options: (ctx) => (ctx.d.packages ?? []).map((p) => ({ value: p.id, label: p.name })) },
  { key: 'register', icon: Banknote, kind: 'list', options: (ctx) => (ctx.d.registers ?? []).map((r) => ({ value: r.id, label: `${r.name} · ${ctx.locationName(r.locationId)}` })) },
  { key: 'openedBy', icon: User, kind: 'list', options: (ctx) => named(uniq((ctx.d.registerSessions ?? []).map((s) => s.openedBy))) },
  { key: 'paymentMethod', icon: CreditCard, kind: 'list', options: opts('paymentMethod', ['cash', 'card_terminal', 'online_card', 'gift_card', 'other', 'qr_code', 'self_checkout', 'manual_card', 'custom']) },
  { key: 'giftCards', icon: Gift, kind: 'list', options: opts('giftCards', ['only', 'exclude']) },
  { key: 'deposits', icon: Wallet, kind: 'list', options: opts('deposits', ['only', 'exclude']) },
  { key: 'transactionType', icon: ReceiptText, kind: 'list', options: opts('transactionType', ['sale', 'refund', 'deposit', 'cash_in', 'cash_out', 'cash_to_bank']) },
  { key: 'processedBy', icon: User, kind: 'list', options: (ctx) => named(uniq((ctx.d.payments ?? []).map((p) => p.by))) },
  { key: 'liabilityType', icon: Wallet, kind: 'list', options: opts('liabilityType', ['gift_card', 'prepayment']) },
  { key: 'activity', icon: ListChecks, kind: 'list', options: opts('activity', ['collection', 'redemption', 'expiration', 'refund']) },
  { key: 'redemptionStatus', icon: Wallet, kind: 'list', options: opts('redemptionStatus', ['unredeemed', 'redeemed', 'refunded']) },
  { key: 'taxName', icon: Percent, kind: 'list', options: (ctx) => (ctx.d.settings?.taxRates ?? []).map((t) => ({ value: String(t.rate), label: `${t.name} (${t.rate}%)` })) },
  { key: 'appointmentType', icon: CalendarDays, kind: 'list', options: opts('appointmentType', ['single', 'group', 'repeating']) },
  { key: 'appointmentStatus', icon: ListChecks, kind: 'list', options: () => (Object.keys(STATUS_STYLES) as (keyof typeof STATUS_STYLES)[]).map((k) => ({ value: k, label: L(`opt.appointmentStatus.${k}`) })) },
  { key: 'cancellationReason', icon: MessageSquareText, kind: 'list', options: (ctx) => (ctx.d.settings?.cancellationReasons ?? []).map((r) => ({ value: r.id, label: r.name })) },
  { key: 'sourceType', icon: FileText, kind: 'list', options: opts('sourceType', ['timesheet', 'shift']) },
  { key: 'clockInType', icon: Clock, kind: 'list', options: opts('clockType', ['manual', 'automatic']) },
  { key: 'clockOutType', icon: Clock, kind: 'list', options: opts('clockType', ['manual', 'automatic']) },
  { key: 'compensation', icon: Banknote, kind: 'list', options: opts('compensation', ['paid', 'unpaid']) },
  { key: 'deductionType', icon: Percent, kind: 'list', options: opts('deductionType', ['processing', 'new_client']) },
  { key: 'detailedFeeType', icon: Percent, kind: 'list', options: opts('detailedFeeType', ['in_person', 'online', 'new_client']) },
  { key: 'tipChannel', icon: CircleDollarSign, kind: 'list', options: opts('tipChannel', ['pos', 'online', 'terminal']) },
  { key: 'blockedClients', icon: User, kind: 'list', options: opts('blockedClients', ['blocked', 'not_blocked']) },
  { key: 'rebooked', icon: CalendarDays, kind: 'list', options: opts('rebooked', ['yes', 'no']) },
  { key: 'adjustmentReason', icon: BookOpen, kind: 'list', options: (ctx) => named(uniq([...(ctx.d.stockMovements ?? []).map((m) => m.reason), L('sale')])) },
  { key: 'orderedBy', icon: User, kind: 'list', options: (ctx) => named(uniq((ctx.d.stockOrders ?? []).map((o) => o.activity[0]?.by ?? 'Marta Ribeiro'))) },
  { key: 'stockOrderStatus', icon: Truck, kind: 'list', options: opts('stockOrderStatus', ['draft', 'ordered', 'received', 'cancelled']) },
  { key: 'benefitUsageType', icon: Sparkles, kind: 'list', options: opts('benefitUsageType', ['limited', 'unlimited']) },
  { key: 'benefitStatus', icon: Sparkles, kind: 'list', options: opts('benefitStatus', ['redeemed', 'available']) },
  { key: 'redemptionType', icon: Sparkles, kind: 'list', options: opts('redemptionType', ['appointment', 'sale']) },
  { key: 'timeOffStatus', icon: ListChecks, kind: 'list', options: opts('timeOffStatus', ['approved', 'pending']) },
  { key: 'waitlistStatus', icon: ListChecks, kind: 'list', options: opts('waitlistStatus', ['waiting', 'booked', 'expired']) },
  { key: 'resource', icon: Building2, kind: 'list', options: (ctx) => (ctx.d.resources ?? []).map((r) => ({ value: r.id, label: r.name })) },
]

export const FILTERS: Record<string, FilterDef> = Object.fromEntries(DEFS.map((d) => [d.key, d]))

/** Label of a filter value (for chips). */
export function optionLabel(ctx: Ctx, key: string, value: string): string {
  return FILTERS[key]?.options?.(ctx).find((o) => o.value === value)?.label ?? value
}
