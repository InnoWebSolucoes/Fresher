/**
 * Data model for the whole workspace (SPEC §4). Every collection lives in the
 * single persisted store (src/store/db.ts). Dates are ISO strings: full
 * timestamps for moments (`createdAt`), `yyyy-MM-dd` for days, `HH:mm` for
 * clock times. Money is a number in euros, tax inclusive (IVA 23%).
 */
import type { PermissionRole } from '@/lib/permissions'

export type ID = string
export type ISODate = string // yyyy-MM-dd
export type ISODateTime = string // full ISO timestamp
export type ClockTime = string // HH:mm

export type PaletteColor =
  | 'blue'
  | 'darkBlue'
  | 'jordyBlue'
  | 'indigo'
  | 'lavender'
  | 'purple'
  | 'wisteria'
  | 'pink'
  | 'coral'
  | 'red'
  | 'bloodOrange'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'

export interface ActivityEntry {
  id: ID
  at: ISODateTime
  by: string
  title: string
  detail?: string
}

export interface Address {
  line1: string
  line2?: string
  district?: string
  city: string
  region?: string
  postcode: string
  country: string
}

// ─── Workspace, locations, opening hours ───────────────────────────────────

export type PlanType = 'independent' | 'team'

export interface Workspace {
  id: ID
  name: string
  country: string
  currency: 'EUR'
  taxCalculation: 'inclusive' | 'exclusive'
  teamLanguage: string
  clientLanguage: string
  externalLinks: { facebook: string; instagram: string; x: string; website: string }
  plan: { type: PlanType; status: 'trial' | 'active'; trialEndsAt: ISODate; billingDetails?: BillingDetails; card?: { brand: string; last4: string; expiry: string } }
  messageCredits: number
  businessTypes: string[]
}

export interface BillingDetails {
  accountType: string
  firstName: string
  lastName: string
  businessName: string
  address: string
  vatNumber?: string
}

/** Weekday index: 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface TimeRange {
  start: ClockTime
  end: ClockTime
}

export type OpeningHours = Record<Weekday, { open: boolean; ranges: TimeRange[] }>

export interface Location {
  id: ID
  name: string
  internalName?: string
  phone: string
  email: string
  address: Address
  directions?: string
  openingHours: OpeningHours
  businessTypes: string[]
  receiptPrefix: string
  nextReceiptNumber: number
  imageUrl?: string
  marketplace: { listed: boolean; description: string; amenities: string[]; highlights: string[]; values: string[]; images: string[]; step?: string }
}

export interface ClosedPeriod {
  id: ID
  startDate: ISODate
  endDate: ISODate
  description: string
  /** Empty array = all locations. */
  locationIds: ID[]
}

// ─── People ────────────────────────────────────────────────────────────────

export interface User {
  id: ID
  email: string
  password: string
  firstName: string
  lastName: string
  role: PermissionRole
  teamMemberId?: ID
  phone?: string
  theme?: 'light' | 'dark' | 'system'
}

export interface PermissionLevel {
  id: PermissionRole | string
  name: string
  description: string
  system: boolean
  /** area → enabled permission keys */
  permissions: Record<string, string[]>
  order: number
}

export interface TeamMember {
  id: ID
  firstName: string
  lastName: string
  email: string
  phone?: string
  jobTitle: string
  color: PaletteColor
  role: PermissionRole
  invite?: { status: 'pending' | 'accepted'; sentAt: ISODateTime; userId?: ID }
  bookable: boolean
  excludeOnline: boolean
  excludeAutoAssign: boolean
  locationIds: ID[]
  /** 'all' or explicit service ids */
  serviceIds: 'all' | ID[]
  startDate: ISODate
  endDate?: ISODate
  employmentType?: 'employee' | 'self_employed'
  teamMemberCode?: string
  notes?: string
  birthday?: ISODate
  gender?: string
  pronouns?: string
  country?: string
  archived: boolean
  order: number
  rating: number
  reviewCount: number
  wages: { enabled: boolean; hourlyRate: number; overtime: boolean }
  commission: { enabled: boolean; serviceRate: number; productRate: number }
  payRuns: { enabled: boolean; method: 'manual' }
  linkedCalendars: { id: ID; name: string; url: string; createdAt: ISODateTime }[]
}

/** Repeating shifts ("Set repeating shifts", team.md §4.3). */
export interface ShiftPattern {
  id: ID
  teamMemberId: ID
  locationId: ID
  /** Every N weeks. */
  scheduleType: 1 | 2 | 3 | 4
  startDate: ISODate
  endDate?: ISODate
  /** One entry per week of the cycle; a missing weekday = not working. */
  weeks: Partial<Record<Weekday, TimeRange[]>>[]
}

/** A single day edited in Scheduled shifts ("Edit this day"); empty ranges = not working. */
export interface ShiftOverride {
  id: ID
  teamMemberId: ID
  locationId: ID
  date: ISODate
  ranges: TimeRange[]
}

/** Resolved shift for one member on one day (computed, not stored). */
export interface Shift {
  teamMemberId: ID
  locationId: ID
  date: ISODate
  start: ClockTime
  end: ClockTime
}

export interface TimeOffType {
  id: ID
  name: string
  system: boolean
}

export interface TimeOff {
  id: ID
  teamMemberId: ID
  typeId: ID
  startDate: ISODate
  startTime: ClockTime
  endTime: ClockTime
  repeatUntil?: ISODate
  description: string
  approved: boolean
}

export interface BlockedTimeType {
  id: ID
  emoji: string
  name: string
  durationMin: number
  paid: boolean
}

export interface BlockedTime {
  id: ID
  teamMemberId: ID
  locationId: ID
  date: ISODate
  start: ClockTime
  end: ClockTime
  typeId?: ID
  title: string
  description: string
  onlineBookingAllowed: boolean
  repeat?: RepeatRule
}

export interface TimesheetBreak {
  id: ID
  typeId: ID
  start: ClockTime
  end?: ClockTime
}

export interface Timesheet {
  id: ID
  teamMemberId: ID
  locationId: ID
  date: ISODate
  clockIn: ClockTime
  clockOut?: ClockTime
  breaks: TimesheetBreak[]
  status: 'clocked_in' | 'clocked_out'
  activity: ActivityEntry[]
}

export interface PayAdjustment {
  id: ID
  teamMemberId: ID
  periodStart: ISODate
  kind: 'wages' | 'commissions' | 'tips' | 'other'
  amount: number
  note: string
  at: ISODateTime
}

export interface PayRunLine {
  teamMemberId: ID
  wages: number
  commissions: number
  tips: number
  other: number
  total: number
  paid: number
}

export interface PayRun {
  id: ID
  periodStart: ISODate
  periodEnd: ISODate
  status: 'draft' | 'needs_review' | 'approved' | 'completed'
  lines: PayRunLine[]
  method: 'manual' | 'cash_register' | 'wallet'
  note?: string
  createdAt: ISODateTime
  completedAt?: ISODateTime
  source: 'pay_team' | 'register_tips'
}

// ─── Catalog ───────────────────────────────────────────────────────────────

export interface ServiceCategory {
  id: ID
  name: string
  color: PaletteColor
  description: string
  order: number
  archived?: boolean
}

export type ExtraTimeType = 'processing' | 'blocked' | 'servicing'

export interface ExtraTime {
  type: ExtraTimeType
  durationMin: number
}

export interface ServiceVariant {
  id: ID
  name: string
  description?: string
  priceType: 'fixed' | 'from' | 'free'
  price: number
  durationMin: number
  sku?: string
}

export interface ServiceAddOn {
  id: ID
  name: string
  price: number
  durationMin: number
}

export interface ServiceAddOnGroup {
  id: ID
  name: string
  required: boolean
  multiple: boolean
  options: ServiceAddOn[]
}

export interface Service {
  id: ID
  name: string
  categoryId: ID
  treatmentType: string
  description: string
  priceType: 'fixed' | 'from' | 'free'
  price: number
  durationMin: number
  extraTime: ExtraTime[]
  variants: ServiceVariant[]
  addOnGroups: ServiceAddOnGroup[]
  teamMemberIds: 'all' | ID[]
  locationIds: ID[]
  resourceTypeIds: ID[]
  /** Per team member / location overrides (catalog.md "Advanced pricing and duration"). */
  advancedPricing: { teamMemberId?: ID; locationId?: ID; price?: number; durationMin?: number; priceType?: 'fixed' | 'from' | 'free' }[]
  images: string[]
  onlineBooking: boolean
  availableFor: 'all' | 'female' | 'male'
  /** Online availability limits. */
  limits: { dateRange?: { from: ISODate; to: ISODate }; weekly?: Partial<Record<Weekday, TimeRange[]>> }
  patchTestRequired: boolean
  formIds: ID[]
  taxRateId: ID | null
  commissionEnabled: boolean
  cost?: number
  sku?: string
  rebookReminderWeeks?: number
  aftercare?: string
  archived: boolean
  order: number
}

export interface Bundle {
  id: ID
  name: string
  categoryId: ID
  description: string
  serviceIds: ID[]
  schedule: 'sequence' | 'parallel'
  priceType: 'service' | 'custom' | 'percentage' | 'free'
  price?: number
  discountPct?: number
  onlineBooking: boolean
  availableFor: 'all' | 'female' | 'male'
  archived: boolean
}

export interface Resource {
  id: ID
  name: string
  typeId: ID
  description: string
  capacity: number
  color: PaletteColor
  locationId: ID
  availability: 'always' | 'specific'
  code?: string
}

export interface ResourceType {
  id: ID
  name: string
  icon: string
  description: string
}

export interface MembershipBenefit {
  serviceIds: ID[]
  sessions: number | 'unlimited'
}

export interface Membership {
  id: ID
  name: string
  description: string
  price: number
  interval: 'week' | 'month'
  firstPeriodPrice?: number
  benefits: MembershipBenefit[]
  color: string
  onlineSale: boolean
  archived: boolean
}

export type PackageBenefitType = 'service' | 'service_group' | 'product' | 'product_group' | 'amount_discount' | 'percent_discount'

export interface PackageBenefit {
  id: ID
  type: PackageBenefitType
  serviceIds?: ID[]
  productIds?: ID[]
  quantity: number | 'unlimited'
  value?: number
}

export interface PackageDef {
  id: ID
  name: string
  theme: string
  categoryId?: ID
  description: string
  benefits: PackageBenefit[]
  price: number
  expiresValue: number
  expiresUnit: 'days' | 'weeks' | 'months' | 'years'
  onlineSale: boolean
  giftable: boolean
  terms: string
  commission: boolean
  taxRateId: ID | null
  archived: boolean
  order: number
}

export interface Brand {
  id: ID
  name: string
}

export interface ProductCategory {
  id: ID
  name: string
}

export interface Product {
  id: ID
  name: string
  barcode?: string
  brandId?: ID
  measure: string
  amount?: number
  shortDescription: string
  description: string
  categoryId?: ID
  supplyPrice: number
  retailSales: boolean
  retailPrice: number
  taxRateId: ID | null
  commission: boolean
  skus: string[]
  supplierId?: ID
  trackStock: boolean
  stock: number
  lowStockLevel: number
  reorderQty: number
  lowStockNotify: boolean
  images: string[]
  archived: boolean
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface Supplier {
  id: ID
  name: string
  description: string
  firstName: string
  lastName: string
  mobile: string
  telephone: string
  email: string
  website: string
  address: Partial<Address> & { suburb?: string; state?: string }
  updatedAt: ISODateTime
}

export interface StockOrderItem {
  productId: ID
  qty: number
  unitCost: number
  receivedQty?: number
}

export interface StockOrder {
  id: ID
  number: string
  supplierId: ID
  locationId: ID
  items: StockOrderItem[]
  fees: { name: string; amount: number; type: 'amount' | 'percent' }[]
  expectedAt?: ISODate
  status: 'draft' | 'ordered' | 'received' | 'cancelled'
  createdAt: ISODateTime
  receivedAt?: ISODateTime
  activity: ActivityEntry[]
}

export interface StocktakeItem {
  productId: ID
  expected: number
  counted?: number
  excluded: boolean
  countedAt?: ISODateTime
}

export interface Stocktake {
  id: ID
  name: string
  description: string
  locationId: ID
  status: 'in_progress' | 'paused' | 'draft' | 'completed' | 'cancelled'
  items: StocktakeItem[]
  startedAt: ISODateTime
  completedAt?: ISODateTime
  note?: string
  countedBy: string
  reviewedBy?: string
}

export interface StockMovement {
  id: ID
  productId: ID
  locationId: ID
  qty: number
  reason: string
  by: string
  at: ISODateTime
  supplyPrice?: number
  ref?: string
}

export interface ProductOrder {
  id: ID
  number: number
  clientId: ID
  items: { productId: ID; qty: number; price: number }[]
  shipping: number
  total: number
  fulfilment: 'pickup' | 'shipping'
  status: 'new' | 'ready' | 'shipped' | 'completed' | 'cancelled'
  saleId?: ID
  createdAt: ISODateTime
}

// ─── Clients ───────────────────────────────────────────────────────────────

export interface ClientAllergy {
  id: ID
  kind: 'non_drug' | 'drug' | 'none'
  name: string
  reaction?: string
  severity?: 'mild' | 'moderate' | 'severe' | 'fatal'
  note?: string
  createdAt: ISODateTime
}

export interface PatchTest {
  id: ID
  title: string
  testedAt: ISODate
  expiresAt: ISODate
  testedBy?: ID
  status: 'pending' | 'passed' | 'failed'
  description?: string
}

export interface ClientReward {
  id: ID
  type: 'amount' | 'percent' | 'free_service' | 'free_product'
  name: string
  value: number
  expiresAt?: ISODate
  redeemedAt?: ISODateTime
  inStoreOnly: boolean
}

export interface Client {
  id: ID
  firstName: string
  lastName: string
  email: string
  phone: string
  birthday?: ISODate
  gender?: 'female' | 'male' | 'non_binary' | 'undisclosed'
  pronouns?: string
  sourceId: ID
  referredById?: ID
  language?: string
  occupation?: string
  country?: string
  additionalEmail?: string
  additionalPhone?: string
  tagIds: ID[]
  addresses: (Address & { id: ID; type: 'home' | 'work' | 'other'; name: string })[]
  emergencyContacts: { id: ID; fullName: string; relationship: string; email: string; phone: string; primary: boolean }[]
  notifications: { email: boolean; sms: boolean; whatsapp: boolean }
  marketing: { email: boolean; sms: boolean; whatsapp: boolean }
  blocked?: { reason: string; at: ISODateTime }
  /** Came from the marketplace and has a verified account. */
  marketplace: boolean
  staffAlert?: string
  allergies: ClientAllergy[]
  patchTests: PatchTest[]
  rewards: ClientReward[]
  walletBalance: number
  /** Profile photo as a data URL. */
  photo?: string
  files: { id: ID; name: string; size: number; at: ISODateTime }[]
  createdAt: ISODateTime
  deletedAt?: ISODateTime
}

export interface ClientNote {
  id: ID
  clientId: ID
  html: string
  kind: 'client' | 'appointment'
  appointmentId?: ID
  createdAt: ISODateTime
  by: string
}

export interface ClientTag {
  id: ID
  name: string
  color: PaletteColor
  order: number
}

export interface ClientSource {
  id: ID
  name: string
  active: boolean
  system: boolean
  order: number
}

export interface SegmentCondition {
  field: string
  operator: string
  value: string | number | string[]
}

export interface SegmentRule {
  attribute: string
  conditions: SegmentCondition[]
}

export interface ClientSegment {
  id: ID
  key?: string
  name: string
  description: string
  standard: boolean
  rules: SegmentRule[]
  periodDays?: number
  badge?: { name: string; color: PaletteColor }
}

export interface FormSection {
  id: ID
  kind: 'client_details' | 'custom'
  title: string
  blocks: { id: ID; type: 'paragraph' | 'yes_no' | 'short_text' | 'long_text' | 'checkbox' | 'signature'; label: string }[]
}

export interface FormTemplate {
  id: ID
  name: string
  status: 'active' | 'inactive'
  sections: FormSection[]
  request: 'before' | 'manual'
  frequency: 'every' | 'once'
  serviceIds: 'all' | ID[]
  signatureRequired: boolean
  createdAt: ISODateTime
}

export interface FormResponse {
  id: ID
  templateId: ID
  clientId: ID
  appointmentId?: ID
  status: 'sent' | 'completed' | 'not_completed'
  answers: Record<string, string>
  sentAt: ISODateTime
  completedAt?: ISODateTime
}

// ─── Appointments ──────────────────────────────────────────────────────────

export type AppointmentStatus = 'booked' | 'confirmed' | 'arrived' | 'started' | 'completed' | 'no_show' | 'cancelled'

export type BookingChannel =
  | 'offline'
  | 'marketplace'
  | 'book_now_link'
  | 'google'
  | 'facebook'
  | 'instagram'
  | 'automations'
  | 'blast'

export interface RepeatRule {
  frequency: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
  interval: number
  unit: 'day' | 'week' | 'month'
  ends: 'never' | 'after' | 'on'
  count?: number
  until?: ISODate
  seriesId?: ID
}

export interface AppointmentItem {
  id: ID
  serviceId: ID
  variantId?: ID
  name: string
  teamMemberId: ID
  start: ClockTime
  durationMin: number
  extraTime: ExtraTime[]
  price: number
  originalPrice?: number
  priceNote?: string
  addOns: ServiceAddOn[]
  resourceId?: ID
  preferred: boolean
}

export interface Appointment {
  id: ID
  ref: string
  clientId: ID | null
  locationId: ID
  date: ISODate
  items: AppointmentItem[]
  status: AppointmentStatus
  /** How it reached the business (SPEC: online / phone / walk-in). */
  source: 'online' | 'phone' | 'walk_in' | 'in_person'
  channel: BookingChannel
  createdAt: ISODateTime
  createdBy: string
  repeat?: RepeatRule
  groupId?: ID
  deposit?: { amount: number; paidAt: ISODateTime; paymentId?: ID }
  cancellation?: { reasonId: string; at: ISODateTime; late: boolean; fee: number; by: string }
  noShowFee?: number
  saleId?: ID
  waitlistEntryId?: ID
  requested: boolean
  activity: ActivityEntry[]
  formResponseIds: ID[]
  paymentPolicy?: boolean
}

export interface GroupAppointment {
  id: ID
  organiserClientId: ID | null
  appointmentIds: ID[]
  createdAt: ISODateTime
}

export interface WaitlistEntry {
  id: ID
  clientId: ID | null
  preferences: { date: ISODate; from?: ClockTime; to?: ClockTime }[]
  items: { serviceId: ID; variantId?: ID; teamMemberId: ID | null }[]
  notes: string
  status: 'waiting' | 'expired' | 'booked'
  createdAt: ISODateTime
  appointmentId?: ID
  source: 'online' | 'in_person'
}

// ─── Sales and payments ────────────────────────────────────────────────────

export type SaleStatus = 'draft' | 'unpaid' | 'part_paid' | 'completed' | 'refunded' | 'voided'

export type SaleItemType =
  | 'service'
  | 'service_addon'
  | 'product'
  | 'package'
  | 'membership'
  | 'gift_card'
  | 'late_cancellation_fee'
  | 'no_show_fee'
  | 'shipping'
  | 'manual'

export interface SaleItem {
  id: ID
  type: SaleItemType
  refId?: ID
  name: string
  detail?: string
  quantity: number
  unitPrice: number
  originalPrice?: number
  discount?: { type: 'amount' | 'percent'; value: number; dealId?: ID }
  teamMemberId: ID | null
  appointmentId?: ID
  appointmentItemId?: ID
  taxRate: number
  /** Set for gift card sales: the issued gift card. */
  giftCardId?: ID
  clientPackageId?: ID
  clientMembershipId?: ID
  /** Covered by a package benefit or reward. */
  benefitNote?: string
}

export type PaymentMethod =
  | 'cash'
  | 'other'
  | 'gift_card'
  | 'card_terminal'
  | 'self_checkout'
  | 'qr_code'
  | 'manual_card'
  | 'deposit'
  | 'online_card'
  | 'custom'

export interface Payment {
  id: ID
  saleId: ID
  kind: 'sale' | 'refund' | 'deposit'
  method: PaymentMethod
  customMethodId?: ID
  methodLabel: string
  amount: number
  change?: number
  at: ISODateTime
  by: string
  collectedById?: ID
  giftCardId?: ID
  registerSessionId?: ID
  status: 'succeeded' | 'declined'
  clientId: ID | null
  locationId: ID
}

export interface Sale {
  id: ID
  number: number
  kind: 'sale' | 'refund'
  status: SaleStatus
  clientId: ID | null
  locationId: ID
  appointmentId?: ID
  createdAt: ISODateTime
  completedAt?: ISODateTime
  createdBy: string
  items: SaleItem[]
  cartDiscount?: { type: 'amount' | 'percent'; value: number }
  serviceCharges: { id: ID; name: string; amount: number }[]
  tips: { teamMemberId: ID; amount: number }[]
  receiptNote?: string
  paymentIds: ID[]
  refundOfId?: ID
  refundReason?: string
  refundedById?: ID
  channel: BookingChannel | 'store'
  notes: { id: ID; text: string; at: ISODateTime; by: string }[]
  activity: ActivityEntry[]
}

export interface GiftCard {
  id: ID
  code: string
  customCode?: string
  value: number
  price: number
  balance: number
  issuedAt: ISODateTime
  expiresAt?: ISODate
  status: 'active' | 'redeemed' | 'expired' | 'cancelled'
  purchaserClientId: ID | null
  ownerClientId: ID | null
  saleId: ID
  isGift: boolean
  onlinePurchase: boolean
  recipientName?: string
  activity: ActivityEntry[]
}

export interface ClientPackage {
  id: ID
  packageId: ID
  clientId: ID
  saleId: ID
  startDate: ISODate
  expiresAt: ISODate
  status: 'active' | 'expired' | 'canceled' | 'pending' | 'used'
  usage: { benefitId: ID; used: number }[]
  price: number
}

export interface ClientMembership {
  id: ID
  membershipId: ID
  clientId: ID
  saleId: ID
  startDate: ISODate
  nextBillingAt: ISODate
  status: 'active' | 'paused' | 'canceled'
  price: number
}

export interface RegisterSettings {
  requireOpen: boolean
  minFloat?: { amount: number; when: 'opening' | 'closing' | 'both' }
  middayCounts: boolean
  promptLeftOpen: boolean
  autoPrint: boolean
  autoEmail: boolean
}

export interface CashRegister {
  id: ID
  name: string
  locationId: ID
  settings: RegisterSettings
  archived: boolean
  order: number
}

export interface RegisterMovement {
  id: ID
  type: 'opening_float' | 'cash_in' | 'cash_out' | 'count' | 'closed'
  reason: string
  amount: number
  note?: string
  at: ISODateTime
  by: string
}

export interface RegisterSession {
  id: ID
  registerId: ID
  openedAt: ISODateTime
  openedBy: string
  openingFloat: number
  movements: RegisterMovement[]
  closedAt?: ISODateTime
  closedBy?: string
  closingFloat?: number
  cashToBank?: number
  counted?: Record<string, number>
  note?: string
}

// ─── Marketing ─────────────────────────────────────────────────────────────

export interface Deal {
  id: ID
  type: 'promotion' | 'flash_sale' | 'last_minute'
  name: string
  description: string
  discountType: 'percent' | 'amount'
  value: number
  code?: string
  startsAt: ISODate
  endsAt?: ISODate
  pos: boolean
  appliesTo: { services: 'all' | ID[]; products: 'all' | ID[]; packages: 'all' | ID[]; memberships: 'all' | ID[]; giftCards: boolean }
  limits: { onePerClient: boolean; totalUses?: number; minPurchase?: number }
  lastMinuteHours?: number
  teamMemberIds: 'all' | ID[]
  status: 'active' | 'inactive' | 'archived'
  createdAt: ISODateTime
  uses: number
  salesTotal: number
}

export interface SmartPricingRule extends TimeRange {
  direction: 'increase' | 'decrease'
  value: number
  unit: 'percent' | 'amount'
}

export interface SmartPricing {
  configured: boolean
  status: 'active' | 'paused'
  teamMemberIds: 'all' | ID[]
  serviceIds: 'all' | ID[]
  rules: Partial<Record<Weekday, SmartPricingRule[]>>
}

export interface Campaign {
  id: ID
  name: string
  status: 'draft' | 'pending' | 'scheduled' | 'sent'
  channel: 'email' | 'sms'
  audience: { type: 'all' | 'segments' | 'clients'; segmentIds: ID[]; clientIds: ID[] }
  subject: string
  heading: string
  body: string
  buttonLabel?: string
  imageUrl?: string
  dealId?: ID
  scheduledAt?: ISODateTime
  sentAt?: ISODateTime
  createdAt: ISODateTime
  recipients: number
  cost: number
  stats: { sent: number; delivered: number; opened: number; clicked: number; bookings: number; revenue: number }
}

export interface Automation {
  id: ID
  key: string
  section: 'reminders' | 'appointment_updates' | 'waitlist_updates' | 'increase_bookings' | 'celebrate_milestones' | 'client_messages' | 'client_loyalty'
  name: string
  description: string
  enabled: boolean
  marketing: boolean
  channels: { email: boolean; sms: boolean; whatsapp: boolean }
  /** Reminder advance notice etc. */
  trigger?: string
  smsOperator: 'and' | 'or'
  content: { importantInfo: string; displayPrice: boolean }
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type MessageType =
  | 'confirmation'
  | 'reminder'
  | 'reschedule'
  | 'cancellation'
  | 'no_show'
  | 'thank_you'
  | 'receipt'
  | 'campaign'
  | 'invite'
  | 'password_reset'
  | 'gift_card'
  | 'waitlist'
  | 'review_request'
  | 'chat'
  | 'stock_order'
  | 'pay_run'
  | 'form'
  | 'other'

export interface MessageLog {
  id: ID
  at: ISODateTime
  clientId: ID | null
  to: string
  toName: string
  channel: 'email' | 'sms' | 'whatsapp'
  type: MessageType
  subject: string
  /** Plain text or simple HTML. */
  body: string
  appointmentId?: ID
  saleId?: ID
  campaignId?: ID
  status: 'sent' | 'delivered' | 'opened' | 'error'
  link?: { label: string; href: string }
}

export interface ConversationMessage {
  id: ID
  from: 'client' | 'business'
  text: string
  at: ISODateTime
  by?: string
}

export interface Conversation {
  id: ID
  clientId: ID
  status: 'open' | 'closed'
  messages: ConversationMessage[]
  unread: boolean
  updatedAt: ISODateTime
}

export interface Review {
  id: ID
  clientId: ID
  appointmentId?: ID
  teamMemberId?: ID
  serviceName?: string
  rating: 1 | 2 | 3 | 4 | 5
  text: string
  at: ISODateTime
  platform: 'marketplace' | 'google'
  reply?: { text: string; at: ISODateTime }
  hasImages: boolean
}

export interface AppNotification {
  id: ID
  tab: 'appointments' | 'reviews' | 'tips' | 'online_sales' | 'actions'
  title: string
  body: string
  at: ISODateTime
  read: boolean
  /** In-app link (path + query). */
  link?: string
  initials?: string
}

export interface WalletTransaction {
  id: ID
  at: ISODateTime
  type: 'payment' | 'payout' | 'fee' | 'refund' | 'deposit'
  description: string
  amount: number
}

export interface Wallet {
  balance: number
  available: number
  credits: number
  transactions: WalletTransaction[]
  payoutsEnabled: boolean
}

export interface Payout {
  id: ID
  amount: number
  at: ISODateTime
  status: 'in_transit' | 'paid'
  bankLast4: string
}

export interface AddOnState {
  slug: string
  status: 'inactive' | 'trial' | 'active'
  enabledAt?: ISODateTime
  trialEndsAt?: ISODate
  /** Add-on or integration settings (tracking IDs, accounting sync…). */
  config?: Record<string, unknown>
  disabledAt?: ISODateTime
  disabledReason?: string
}

export interface Invoice {
  id: ID
  number: string
  date: ISODate
  lines: { description: string; quantity: number; unitPrice: number }[]
  subtotal: number
  tax: number
  total: number
  status: 'paid' | 'due'
}

export interface TaxRate {
  id: ID
  name: string
  rate: number
}

export interface ServiceCharge {
  id: ID
  name: string
  description: string
  rateType: 'flat' | 'percent'
  amount: number
  apply: 'manual' | 'automatic'
  online: boolean
  inStore: boolean
  on: 'full' | 'selected'
  taxRateId: ID | null
}

export interface CustomPaymentMethod {
  id: ID
  name: string
  system: boolean
  active: boolean
  order: number
}

export interface CancellationReason {
  id: ID
  name: string
  order: number
}

export interface CustomStatus {
  id: ID
  name: string
  icon: string
  color: PaletteColor
  system: boolean
  order: number
}

export interface SavedFilter {
  id: ID
  name: string
  filters: Record<string, string[]>
}

export interface Settings {
  timezone: string
  timeFormat: '12h' | '24h'
  firstDayOfWeek: Weekday
  calendar: { colorSource: 'team_member' | 'category' | 'status' | 'resource'; displayProcessing: boolean; displayBlocked: boolean }
  waitlist: { type: 'manual' | 'auto'; priority: 'first' | 'highest_value' | 'all'; online: boolean; anyTime: boolean }
  cancellationReasons: CancellationReason[]
  appointmentStatuses: CustomStatus[]
  dynamicAssignment: { strategy: 'fill' | 'turns' | 'ratings' | 'priority'; period: 'day' | '7d' | '14d'; prioritizeLast: boolean; excluded: ID[]; split: boolean; reassignOnline: boolean; reassignTeam: boolean; cutoffMin: number }
  /** Online booking window and notice (settings-scheduling.md §9). */
  availability: { advanceDays: number; minNoticeMin: number; cancelWindowMin: number; showContact: boolean }
  scheduleOptimization: { intervalMin: number; mode: 'regular' | 'reduce' | 'eliminate' }
  bookingOptions: { bookSpecific: boolean; showProfiles: boolean; showPortfolio: boolean; showRatings: boolean; bookByGender: boolean; serviceImages: boolean; featured: boolean; serviceNamesInReviews: boolean; groupBooking: boolean; importantInfo: string; emailBooked: boolean; emailAddresses: string }
  onlineBookingsEnabled: boolean
  taxRates: TaxRate[]
  taxDefaults: { services: ID | null; products: ID | null; memberships: ID | null }
  receipts: { showContact: boolean; showAddress: boolean; showTeam: boolean; title: string; line1: string; line2: string; footer: string; autoPrint: boolean }
  tipping: { pos: boolean; terminal: boolean; online: boolean; values: number[]; include: { services: boolean; addons: boolean; products: boolean; memberships: boolean; packages: boolean; giftCards: boolean; serviceCharges: boolean; discounts: boolean; taxes: boolean } }
  serviceCharges: ServiceCharge[]
  giftCards: { enabled: boolean; values: number[]; expiry: string; online: boolean; customMin: number; customMax: number }
  customPaymentMethods: CustomPaymentMethod[]
  /** Payment policy (deposits and fees). Configurable once Payments is active. */
  paymentPolicy: { depositsEnabled: boolean; depositPct: number; cancellationWindowHours: number; lateCancelFeePct: number; noShowFeePct: number }
  clientConnect: { allowStart: boolean; readReceipts: boolean; typing: boolean; instantReply: boolean; instantReplyText: string; contactPage: boolean; requiredContact: string; attachments: boolean; marketingConsent: boolean; redirect: 'profile' | 'custom'; customLink: string }
  timeOffTypes: TimeOffType[]
  timesheets: { proximity: boolean; autoClockIn: boolean; autoClockOut: boolean; autoBreaks: boolean; enabled: boolean }
  shifts: { autoCreate: boolean }
  payRuns: { frequency: 'weekly' | 'biweekly' | 'monthly'; restartsOn: Weekday; autoPay: boolean; autoTips: boolean; enabled: boolean }
  commissions: Record<string, boolean>
  pinSwitching: { enabled: boolean; lockInactive: boolean; lockAfterMin: number; lockAfterCheckout: boolean; style: 'light' | 'dark' }
  permissionRoles: PermissionLevel[]
  defaultRole: PermissionRole
  quickSaleItems: { type: 'service' | 'product'; id: ID }[]
  calendarZoom: 48 | 96 | 144 | 288
  quickActions: boolean
  savedFilters: SavedFilter[]
  clientSourcesOrder?: ID[]
  registersEnabled: boolean
  /** Settings the reference shows that have no dedicated field (per-location overrides, bank accounts, terminals…). */
  extras?: Record<string, unknown>
}

export interface DemoMeta {
  version: number
  seededAt: ISODateTime
  /** Time-travel override for "now" (ISO). */
  todayOverride?: ISODateTime
  nextSaleNumber: number
  nextOrderNumber: number
}

/** Everything persisted in the store. */
export interface DbData {
  meta: DemoMeta
  workspace: Workspace
  locations: Location[]
  closedPeriods: ClosedPeriod[]
  users: User[]
  teamMembers: TeamMember[]
  shiftPatterns: ShiftPattern[]
  shiftOverrides: ShiftOverride[]
  timeOff: TimeOff[]
  blockedTimeTypes: BlockedTimeType[]
  blockedTimes: BlockedTime[]
  timesheets: Timesheet[]
  payAdjustments: PayAdjustment[]
  payRuns: PayRun[]
  serviceCategories: ServiceCategory[]
  services: Service[]
  bundles: Bundle[]
  resources: Resource[]
  resourceTypes: ResourceType[]
  memberships: Membership[]
  packages: PackageDef[]
  brands: Brand[]
  productCategories: ProductCategory[]
  products: Product[]
  suppliers: Supplier[]
  stockOrders: StockOrder[]
  stocktakes: Stocktake[]
  stockMovements: StockMovement[]
  productOrders: ProductOrder[]
  clients: Client[]
  clientNotes: ClientNote[]
  clientTags: ClientTag[]
  clientSources: ClientSource[]
  segments: ClientSegment[]
  formTemplates: FormTemplate[]
  formResponses: FormResponse[]
  appointments: Appointment[]
  groups: GroupAppointment[]
  waitlist: WaitlistEntry[]
  sales: Sale[]
  payments: Payment[]
  giftCards: GiftCard[]
  clientPackages: ClientPackage[]
  clientMemberships: ClientMembership[]
  registers: CashRegister[]
  registerSessions: RegisterSession[]
  deals: Deal[]
  smartPricing: SmartPricing
  campaigns: Campaign[]
  automations: Automation[]
  messages: MessageLog[]
  conversations: Conversation[]
  reviews: Review[]
  notifications: AppNotification[]
  wallet: Wallet
  payouts: Payout[]
  addOns: AddOnState[]
  invoices: Invoice[]
  settings: Settings
  /**
   * Section-owned data with no shared collection, keyed by section namespace
   * (e.g. ext.marketing, ext.online). Read and write it through @/api/ext so
   * it persists, syncs between tabs and resets with the demo.
   */
  ext: Record<string, Record<string, unknown>>
}
