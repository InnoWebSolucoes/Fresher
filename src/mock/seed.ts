import { fakerPT_PT as faker } from '@faker-js/faker'
import { addDays, addMinutes, addMonths, format, parseISO, subDays } from 'date-fns'
import type {
  Appointment,
  AppointmentItem,
  AppointmentStatus,
  Automation,
  BookingChannel,
  Client,
  ClientPackage,
  ClientSegment,
  ClientTag,
  DbData,
  GiftCard,
  ID,
  ISODate,
  MessageLog,
  OpeningHours,
  Payment,
  PaymentMethod,
  Product,
  RegisterSession,
  Review,
  Sale,
  SaleItem,
  Service,
  ServiceCategory,
  Settings,
  ShiftPattern,
  TeamMember,
  TimeRange,
  Weekday,
} from '@/types'
import { CATEGORY_SEED, PRODUCT_SEED, REVIEW_TEXTS, SUPPLIER_SEED } from './catalog'
import { workingWindows } from '@/lib/schedule'
import { toClock, toMinutes } from '@/lib/time'
import { round2 } from '@/lib/format'
import { defaultPermissionRoles } from './permissionRoles'

/**
 * Deterministic seed for a salon in Porto (SPEC §4): EUR, IVA 23% inclusive,
 * 2 locations, 6 team members, 40 services, 200 clients, 10 weeks of history
 * and 3 weeks of upcoming bookings, generated relative to `today`.
 */
export const SEED_VERSION = 2
const TAX = 0.23
const PAST_DAYS = 70
const FUTURE_DAYS = 21

const r = () => faker.number.float({ min: 0, max: 1 })
const chance = (p: number) => r() < p
const pick = <T,>(items: readonly T[]): T => items[Math.floor(r() * items.length)]
const weighted = <T,>(items: readonly T[], weight: (t: T) => number): T => {
  const total = items.reduce((s, i) => s + weight(i), 0)
  let roll = r() * total
  for (const item of items) {
    roll -= weight(item)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}
const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const stamp = (date: ISODate, time: string) => addMinutes(parseISO(date), toMinutes(time)).toISOString()
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
const hex = () => faker.string.hexadecimal({ length: 8, casing: 'upper', prefix: '' })
const code = () => faker.string.alpha({ length: 8, casing: 'upper' })
const phone = () => `+351 9${faker.helpers.arrayElement(['1', '2', '3', '6'])}${faker.string.numeric(1)} ${faker.string.numeric(3)} ${faker.string.numeric(3)}`

const range = (start: string, end: string): TimeRange => ({ start, end })
const hours = (days: Partial<Record<Weekday, TimeRange[]>>): OpeningHours =>
  Object.fromEntries(([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => [d, { open: Boolean(days[d]?.length), ranges: days[d] ?? [] }])) as OpeningHours

export const LOC_BAIXA = 'loc_baixa'
export const LOC_FOZ = 'loc_foz'

export function buildSeed(todayDate: Date): DbData {
  faker.seed(20261008)
  const today = iso(todayDate)
  const nowIso = todayDate.toISOString()
  const nowMin = todayDate.getHours() * 60 + todayDate.getMinutes()
  const start = subDays(parseISO(today), PAST_DAYS)

  // ── Locations ─────────────────────────────────────────────────────────
  const locations: DbData['locations'] = [
    {
      id: LOC_BAIXA,
      name: 'Studio Aliados Baixa',
      internalName: 'Baixa',
      phone: '+351 222 087 410',
      email: 'baixa@studioaliados.example.com',
      address: { line1: 'Rua de Sá da Bandeira 512', city: 'Porto', district: 'Porto', region: 'Porto', postcode: '4000-430', country: 'Portugal' },
      directions: 'Two minutes from Trindade metro. Ring the bell at the green door.',
      openingHours: hours({ 0: [range('09:00', '19:00')], 1: [range('09:00', '19:00')], 2: [range('09:00', '19:00')], 3: [range('09:00', '20:00')], 4: [range('09:00', '20:00')], 5: [range('09:00', '17:00')] }),
      businessTypes: ['Hair Salon', 'Barber'],
      receiptPrefix: 'BX',
      nextReceiptNumber: 1,
      marketplace: { listed: true, description: 'A bright, friendly salon off Avenida dos Aliados with cuts, colour and classic barbering. Free coffee, good music and a team that listens.', amenities: ['Near public transport'], highlights: ['Kid-friendly'], values: ['Woman-owned'], images: [] },
    },
    {
      id: LOC_FOZ,
      name: 'Studio Aliados Foz',
      internalName: 'Foz',
      phone: '+351 226 170 228',
      email: 'foz@studioaliados.example.com',
      address: { line1: 'Avenida do Brasil 120', city: 'Porto', district: 'Porto', region: 'Porto', postcode: '4150-151', country: 'Portugal' },
      directions: 'Facing the sea, next to the pharmacy. Free parking on Rua do Molhe.',
      openingHours: hours({ 1: [range('10:00', '20:00')], 2: [range('10:00', '20:00')], 3: [range('10:00', '20:00')], 4: [range('10:00', '20:00')], 5: [range('10:00', '18:00')], 0: [range('10:00', '19:00')] }),
      businessTypes: ['Nails', 'Spa & sauna', 'Beauty Salon'],
      receiptPrefix: 'FZ',
      nextReceiptNumber: 1,
      marketplace: { listed: true, description: 'Nails, skin and massage by the sea in Foz do Douro. Calm treatment rooms, natural products and an unhurried pace.', amenities: ['Parking available', 'Showers', 'Bath towels'], highlights: ['Wheelchair accessible'], values: ['Vegan products only'], images: [] },
    },
  ]

  const year = todayDate.getFullYear()
  const closedPeriods: DbData['closedPeriods'] = [
    { id: 'cp_saojoao', startDate: `${year}-06-24`, endDate: `${year}-06-24`, description: 'São João', locationIds: [] },
    { id: 'cp_xmas', startDate: `${year}-12-25`, endDate: `${year}-12-25`, description: 'Christmas Day', locationIds: [] },
    { id: 'cp_newyear', startDate: `${year + 1}-01-01`, endDate: `${year + 1}-01-01`, description: "New Year's Day", locationIds: [] },
  ]

  // ── Catalogue ────────────────────────────────────────────────────────
  const serviceCategories: ServiceCategory[] = CATEGORY_SEED.map((c, i) => ({ id: `cat_${c.key}`, name: c.name, color: c.color, description: c.description, order: i }))
  const services: Service[] = []
  CATEGORY_SEED.forEach((c) =>
    c.services.forEach((s, i) => {
      services.push({
        id: `svc_${s.key}`,
        name: s.name,
        categoryId: `cat_${c.key}`,
        treatmentType: s.treatment,
        description: s.description,
        priceType: s.priceType ?? 'fixed',
        price: s.price,
        durationMin: s.duration,
        extraTime: s.processing ? [{ type: 'processing', durationMin: s.processing }] : [],
        variants: (s.variants ?? []).map((v, vi) => ({ id: `var_${s.key}_${vi}`, name: v.name, priceType: 'fixed', price: v.price, durationMin: v.duration })),
        addOnGroups: [],
        teamMemberIds: 'all',
        locationIds: c.key === 'nails' || c.key === 'skin' || c.key === 'spa' ? [LOC_FOZ] : c.key === 'barber' ? [LOC_BAIXA] : [LOC_BAIXA, LOC_FOZ],
        resourceTypeIds: c.key === 'spa' ? ['rt_room'] : [],
        advancedPricing: [],
        images: [],
        onlineBooking: s.key !== 'correction',
        availableFor: 'all',
        limits: {},
        patchTestRequired: Boolean(s.patch),
        formIds: c.key === 'colour' ? ['form_colour'] : [],
        taxRateId: 'tax_iva23',
        commissionEnabled: true,
        cost: round2(s.price * 0.12),
        sku: undefined,
        rebookReminderWeeks: c.key === 'barber' ? 3 : c.key === 'hair' ? 6 : 4,
        archived: false,
        order: i,
      })
    }),
  )
  const svc = (key: string) => services.find((s) => s.id === `svc_${key}`)!
  svc('gel-mani').addOnGroups = [{ id: 'aog_nailart', name: 'Nail art', required: false, multiple: true, options: [{ id: 'ao_art2', name: 'Nail art (2 nails)', price: 6, durationMin: 10 }, { id: 'ao_art10', name: 'Nail art (all nails)', price: 15, durationMin: 20 }, { id: 'ao_chrome', name: 'Chrome finish', price: 5, durationMin: 5 }] }]
  svc('womens-cut').addOnGroups = [{ id: 'aog_treat', name: 'Treatments', required: false, multiple: false, options: [{ id: 'ao_olaplex', name: 'Bond repair treatment', price: 15, durationMin: 15 }, { id: 'ao_mask', name: 'Deep conditioning mask', price: 10, durationMin: 10 }] }]
  svc('relax-massage').addOnGroups = [{ id: 'aog_aroma', name: 'Aromatherapy', required: false, multiple: false, options: [{ id: 'ao_aroma', name: 'Aromatherapy oils', price: 5, durationMin: 0 }] }]

  const bundles: DbData['bundles'] = [
    { id: 'bun_cutblow', name: 'Cut & blow dry', categoryId: 'cat_hair', description: "Women's haircut finished with a blow dry.", serviceIds: ['svc_womens-cut', 'svc_blow-dry'], schedule: 'sequence', priceType: 'percentage', discountPct: 10, onlineBooking: true, availableFor: 'all', archived: false },
    { id: 'bun_manipedi', name: 'Mani & pedi', categoryId: 'cat_nails', description: 'Gel manicure and gel pedicure together.', serviceIds: ['svc_gel-mani', 'svc_gel-pedi'], schedule: 'sequence', priceType: 'custom', price: 52, onlineBooking: true, availableFor: 'all', archived: false },
    { id: 'bun_spaday', name: 'Spa morning', categoryId: 'cat_spa', description: 'Hydrating facial and relaxing massage.', serviceIds: ['svc_hydra-facial', 'svc_relax-massage'], schedule: 'sequence', priceType: 'custom', price: 105, onlineBooking: true, availableFor: 'all', archived: false },
  ]

  const resourceTypes: DbData['resourceTypes'] = [
    { id: 'rt_room', name: 'Room', icon: 'door', description: 'Treatment rooms' },
    { id: 'rt_chair', name: 'Chair', icon: 'armchair', description: 'Pedicure chairs' },
  ]
  const resources: DbData['resources'] = [
    { id: 'res_room1', name: 'Treatment room 1', typeId: 'rt_room', description: 'Massage bed and shower', capacity: 1, color: 'orange', locationId: LOC_FOZ, availability: 'always' },
    { id: 'res_room2', name: 'Treatment room 2', typeId: 'rt_room', description: 'Facial room', capacity: 1, color: 'teal', locationId: LOC_FOZ, availability: 'always' },
    { id: 'res_pedi', name: 'Pedicure chair', typeId: 'rt_chair', description: '', capacity: 1, color: 'pink', locationId: LOC_FOZ, availability: 'always' },
  ]

  const memberships: DbData['memberships'] = [
    { id: 'mem_blowdry', name: 'Blow dry club', description: 'Four blow dries every month.', price: 79, interval: 'month', benefits: [{ serviceIds: ['svc_blow-dry', 'svc_wash-blow'], sessions: 4 }], color: 'blue', onlineSale: true, archived: false },
    { id: 'mem_barber', name: 'Barber unlimited', description: 'Unlimited barber cuts and beard trims.', price: 45, interval: 'month', firstPeriodPrice: 30, benefits: [{ serviceIds: ['svc_barber-cut', 'svc_skin-fade', 'svc_beard-trim'], sessions: 'unlimited' }], color: 'amber', onlineSale: true, archived: false },
  ]
  const packages: DbData['packages'] = [
    { id: 'pkg_5cuts', name: '5 x Haircuts', theme: 'Blue Rich', categoryId: undefined, description: "Five women's haircuts.", benefits: [{ id: 'pb_cut', type: 'service', serviceIds: ['svc_womens-cut'], quantity: 5 }], price: 170, expiresValue: 6, expiresUnit: 'months', onlineSale: true, giftable: true, terms: '', commission: true, taxRateId: 'tax_iva23', archived: false, order: 0 },
    { id: 'pkg_nails', name: 'Nail care x4', theme: 'Pink Rich', description: 'Four gel manicures.', benefits: [{ id: 'pb_gel', type: 'service', serviceIds: ['svc_gel-mani'], quantity: 4 }], price: 99, expiresValue: 4, expiresUnit: 'months', onlineSale: true, giftable: true, terms: '', commission: true, taxRateId: 'tax_iva23', archived: false, order: 1 },
    { id: 'pkg_massage', name: 'Massage 5-pack', theme: 'Green Rich', description: 'Five 60-minute relaxing massages.', benefits: [{ id: 'pb_mass', type: 'service', serviceIds: ['svc_relax-massage'], quantity: 5 }], price: 240, expiresValue: 1, expiresUnit: 'years', onlineSale: true, giftable: true, terms: 'Non-refundable.', commission: true, taxRateId: 'tax_iva23', archived: false, order: 2 },
  ]

  const suppliers: DbData['suppliers'] = SUPPLIER_SEED.map((s, i) => ({
    id: `sup_${i}`,
    name: s.name,
    description: s.description,
    firstName: s.first,
    lastName: s.last,
    mobile: phone(),
    telephone: s.phone,
    email: s.email,
    website: '',
    address: { line1: s.street, city: s.city, postcode: s.postcode, country: 'Portugal' },
    updatedAt: subDays(todayDate, 20 + i).toISOString(),
  }))
  const brandNames = [...new Set(PRODUCT_SEED.map((p) => p.brand))]
  const brands = brandNames.map((name, i) => ({ id: `brand_${i}`, name }))
  const productCategoryNames = [...new Set(PRODUCT_SEED.map((p) => p.category))]
  const productCategories = productCategoryNames.map((name, i) => ({ id: `pcat_${i}`, name }))
  const products: Product[] = PRODUCT_SEED.map((p, i) => ({
    id: `prd_${i}`,
    name: p.name,
    barcode: `560${faker.string.numeric(10)}`,
    brandId: `brand_${brandNames.indexOf(p.brand)}`,
    measure: p.measure,
    amount: p.amount,
    shortDescription: '',
    description: '',
    categoryId: `pcat_${productCategoryNames.indexOf(p.category)}`,
    supplyPrice: p.supply,
    retailSales: true,
    retailPrice: p.retail,
    taxRateId: 'tax_iva23',
    commission: true,
    skus: [`${strip(p.brand).slice(0, 3).toUpperCase()}-${faker.string.numeric(5)}`],
    supplierId: `sup_${p.supplier}`,
    trackStock: true,
    stock: p.stock,
    lowStockLevel: 5,
    reorderQty: 12,
    lowStockNotify: true,
    images: [],
    archived: false,
    createdAt: subDays(todayDate, 120).toISOString(),
    updatedAt: subDays(todayDate, 10).toISOString(),
  }))

  // ── Team ─────────────────────────────────────────────────────────────
  const tm = (
    id: string,
    firstName: string,
    lastName: string,
    jobTitle: string,
    color: TeamMember['color'],
    role: TeamMember['role'],
    locationIds: ID[],
    serviceCats: string[] | 'all',
    extra: Partial<TeamMember> = {},
  ): TeamMember => ({
    id,
    firstName,
    lastName,
    email: `${strip(firstName)}@studioaliados.example.com`,
    phone: phone(),
    jobTitle,
    color,
    role,
    bookable: true,
    excludeOnline: false,
    excludeAutoAssign: false,
    locationIds,
    serviceIds: serviceCats === 'all' ? 'all' : services.filter((s) => serviceCats.some((c) => s.categoryId === `cat_${c}`)).map((s) => s.id),
    startDate: iso(subDays(todayDate, 400)),
    employmentType: 'employee',
    archived: false,
    order: 0,
    rating: 0,
    reviewCount: 0,
    wages: { enabled: false, hourlyRate: 0, overtime: false },
    commission: { enabled: true, serviceRate: 0.3, productRate: 0.1 },
    payRuns: { enabled: true, method: 'manual' },
    linkedCalendars: [],
    ...extra,
  })
  const teamMembers: TeamMember[] = [
    tm('tm_marta', 'Marta', 'Ribeiro', 'Owner & senior stylist', 'teal', 'owner', [LOC_BAIXA, LOC_FOZ], ['hair', 'colour'], { employmentType: 'self_employed', commission: { enabled: false, serviceRate: 0, productRate: 0 } }),
    tm('tm_ines', 'Inês', 'Carvalho', 'Colourist', 'purple', 'basic', [LOC_BAIXA], ['hair', 'colour'], { wages: { enabled: true, hourlyRate: 11, overtime: true } }),
    tm('tm_rui', 'Rui', 'Fonseca', 'Barber', 'amber', 'basic', [LOC_BAIXA], ['barber'], { wages: { enabled: true, hourlyRate: 10.5, overtime: false }, serviceIds: [...services.filter((s) => s.categoryId === 'cat_barber').map((s) => s.id), 'svc_mens-cut', 'svc_kids-cut'] }),
    tm('tm_sofia', 'Sofia', 'Almeida', 'Nail technician', 'pink', 'low', [LOC_FOZ], ['nails']),
    tm('tm_beatriz', 'Beatriz', 'Costa', 'Aesthetician & massage therapist', 'green', 'low', [LOC_FOZ], ['skin', 'spa']),
    tm('tm_joao', 'João', 'Pereira', 'Front desk', 'blue', 'low', [LOC_BAIXA], [], { bookable: false, wages: { enabled: true, hourlyRate: 9.5, overtime: false }, commission: { enabled: false, serviceRate: 0, productRate: 0.05 } }),
  ]
  teamMembers.forEach((m, i) => (m.order = i))

  const users: DbData['users'] = [
    { id: 'u_owner', email: 'owner@demo.app', password: 'demo1234', firstName: 'Marta', lastName: 'Ribeiro', role: 'owner', teamMemberId: 'tm_marta', phone: '+351 912 000 001' },
    { id: 'u_staff', email: 'staff@demo.app', password: 'demo1234', firstName: 'João', lastName: 'Pereira', role: 'low', teamMemberId: 'tm_joao', phone: '+351 912 000 002' },
    { id: 'u_stylist', email: 'stylist@demo.app', password: 'demo1234', firstName: 'Inês', lastName: 'Carvalho', role: 'basic', teamMemberId: 'tm_ines', phone: '+351 912 000 003' },
  ]

  const patternStart = iso(subDays(todayDate, PAST_DAYS + 14))
  const week = (days: Partial<Record<Weekday, TimeRange[]>>) => days
  const shiftPatterns: ShiftPattern[] = [
    { id: 'sp_marta_bx', teamMemberId: 'tm_marta', locationId: LOC_BAIXA, scheduleType: 1, startDate: patternStart, weeks: [week({ 0: [range('09:00', '18:00')], 1: [range('09:00', '18:00')], 2: [range('09:00', '13:00'), range('14:00', '18:00')], 3: [range('10:00', '19:00')], 4: [range('09:00', '17:00')] })] },
    { id: 'sp_marta_fz', teamMemberId: 'tm_marta', locationId: LOC_FOZ, scheduleType: 1, startDate: patternStart, weeks: [week({ 5: [range('10:00', '16:00')] })] },
    { id: 'sp_ines', teamMemberId: 'tm_ines', locationId: LOC_BAIXA, scheduleType: 1, startDate: patternStart, weeks: [week({ 1: [range('10:00', '19:00')], 2: [range('10:00', '19:00')], 3: [range('11:00', '20:00')], 4: [range('11:00', '20:00')], 5: [range('09:00', '17:00')] })] },
    { id: 'sp_rui', teamMemberId: 'tm_rui', locationId: LOC_BAIXA, scheduleType: 2, startDate: patternStart, weeks: [week({ 0: [range('11:00', '20:00')], 1: [range('11:00', '20:00')], 2: [range('11:00', '20:00')], 3: [range('11:00', '20:00')], 4: [range('11:00', '20:00')] }), week({ 1: [range('11:00', '20:00')], 2: [range('11:00', '20:00')], 3: [range('11:00', '20:00')], 4: [range('11:00', '20:00')], 5: [range('09:00', '17:00')] })] },
    { id: 'sp_sofia', teamMemberId: 'tm_sofia', locationId: LOC_FOZ, scheduleType: 1, startDate: patternStart, weeks: [week({ 1: [range('10:00', '19:00')], 2: [range('10:00', '19:00')], 3: [range('12:00', '20:00')], 4: [range('10:00', '19:00')], 5: [range('10:00', '18:00')] })] },
    { id: 'sp_beatriz', teamMemberId: 'tm_beatriz', locationId: LOC_FOZ, scheduleType: 1, startDate: patternStart, weeks: [week({ 0: [range('10:00', '19:00')], 2: [range('10:00', '19:00')], 3: [range('10:00', '20:00')], 4: [range('10:00', '19:00')], 5: [range('10:00', '18:00')] })] },
    { id: 'sp_joao', teamMemberId: 'tm_joao', locationId: LOC_BAIXA, scheduleType: 1, startDate: patternStart, weeks: [week({ 0: [range('09:00', '18:00')], 1: [range('09:00', '18:00')], 2: [range('09:00', '18:00')], 3: [range('10:00', '19:00')], 4: [range('10:00', '19:00')] })] },
  ]

  const timeOff: DbData['timeOff'] = [
    { id: 'off_bea', teamMemberId: 'tm_beatriz', typeId: 'to_annual', startDate: iso(addDays(todayDate, 9)), startTime: '00:00', endTime: '23:55', repeatUntil: iso(addDays(todayDate, 11)), description: 'Family trip', approved: true },
    { id: 'off_rui', teamMemberId: 'tm_rui', typeId: 'to_training', startDate: iso(addDays(todayDate, 5)), startTime: '15:00', endTime: '20:00', description: 'Fade masterclass', approved: true },
    { id: 'off_ines_past', teamMemberId: 'tm_ines', typeId: 'to_sick', startDate: iso(subDays(todayDate, 23)), startTime: '00:00', endTime: '23:55', description: '', approved: true },
  ]

  const blockedTimeTypes = [
    { id: 'btt_lunch', emoji: '🥪', name: 'Lunch', durationMin: 30, paid: false },
    { id: 'btt_training', emoji: '📚', name: 'Training', durationMin: 60, paid: true },
    { id: 'btt_meeting', emoji: '📆', name: 'Meeting', durationMin: 60, paid: true },
    { id: 'btt_coffee', emoji: '☕', name: 'Coffee break', durationMin: 15, paid: true },
  ]

  const schedule = { shiftPatterns, shiftOverrides: [], closedPeriods, timeOff }

  // Lunch blocks for the bookable team (past and future), skipped by the generator.
  const blockedTimes: DbData['blockedTimes'] = []
  const lunchFor: Record<string, TimeRange> = { tm_marta: range('13:00', '13:30'), tm_ines: range('14:00', '14:30'), tm_rui: range('15:00', '15:30'), tm_sofia: range('14:00', '14:30'), tm_beatriz: range('13:30', '14:00') }
  for (let d = -PAST_DAYS; d <= FUTURE_DAYS; d++) {
    const date = iso(addDays(parseISO(today), d))
    for (const [memberId, lunch] of Object.entries(lunchFor)) {
      const windows = workingWindows(schedule, memberId, date)
      if (!windows.some(([s, e]) => s <= toMinutes(lunch.start) && toMinutes(lunch.end) <= e)) continue
      const loc = shiftPatterns.find((p) => p.teamMemberId === memberId && p.weeks.some((w) => Object.keys(w).length))!
      blockedTimes.push({ id: `bt_${memberId}_${date}`, teamMemberId: memberId, locationId: loc.locationId, date, start: lunch.start, end: lunch.end, typeId: 'btt_lunch', title: 'Lunch', description: '', onlineBookingAllowed: false })
    }
  }
  blockedTimes.push({ id: 'bt_meeting', teamMemberId: 'tm_marta', locationId: LOC_BAIXA, date: iso(addDays(todayDate, 2)), start: '09:00', end: '10:00', typeId: 'btt_meeting', title: 'Meeting', description: 'Supplier visit', onlineBookingAllowed: false })

  // ── Clients ──────────────────────────────────────────────────────────
  const clientSources = ['Walk-In', 'Instagram', 'Marketplace', 'Google', 'Facebook', 'Book Now Link', 'Referral Link', 'Contact page', 'Imported'].map((name, i) => ({ id: `src_${strip(name)}`, name, active: true, system: true, order: i }))
  const clientTags: ClientTag[] = [
    { id: 'tag_vip', name: 'VIP', color: 'amber', order: 0 },
    { id: 'tag_student', name: 'Student', color: 'blue', order: 1 },
    { id: 'tag_bride', name: 'Bride', color: 'pink', order: 2 },
    { id: 'tag_sensitive', name: 'Sensitive skin', color: 'coral', order: 3 },
    { id: 'tag_imported', name: 'Imported', color: 'lavender', order: 4 },
  ]
  const clients: Client[] = []
  const usedEmails = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const female = chance(0.7)
    const sex = female ? 'female' : 'male'
    const firstName = faker.person.firstName(sex)
    const lastName = `${faker.person.lastName()}${chance(0.35) ? ` ${faker.person.lastName()}` : ''}`
    let email = `${strip(firstName)}.${strip(lastName.split(' ').pop()!)}@example.com`
    if (usedEmails.has(email)) email = email.replace('@', `${i}@`)
    usedEmails.add(email)
    const source = weighted(clientSources, (s) => ({ 'Walk-In': 30, Instagram: 14, Marketplace: 22, Google: 10, Facebook: 5, 'Book Now Link': 8, 'Referral Link': 4, 'Contact page': 2, Imported: 5 })[s.name] ?? 1)
    const recent = i < 22
    const createdAt = recent ? subDays(todayDate, faker.number.int({ min: 0, max: 29 })) : subDays(todayDate, faker.number.int({ min: 75, max: 720 }))
    clients.push({
      id: `cl_${String(i).padStart(3, '0')}`,
      firstName,
      lastName,
      email,
      phone: phone(),
      birthday: chance(0.6) ? iso(faker.date.birthdate({ min: 18, max: 72, mode: 'age', refDate: todayDate })) : undefined,
      gender: female ? 'female' : 'male',
      pronouns: chance(0.3) ? (female ? 'She/Her' : 'He/Him') : undefined,
      sourceId: source.id,
      occupation: chance(0.25) ? faker.person.jobTitle() : undefined,
      country: 'Portugal',
      tagIds: [
        ...(chance(0.06) ? ['tag_vip'] : []),
        ...(chance(0.05) ? ['tag_student'] : []),
        ...(chance(0.02) ? ['tag_bride'] : []),
        ...(chance(0.04) ? ['tag_sensitive'] : []),
        ...(source.name === 'Imported' ? ['tag_imported'] : []),
      ],
      addresses: chance(0.4)
        ? [{ id: `addr_${i}`, type: 'home', name: 'Home', line1: faker.location.streetAddress(), city: pick(['Porto', 'Porto', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar']), postcode: `4${faker.string.numeric(3)}-${faker.string.numeric(3)}`, country: 'Portugal' }]
        : [],
      emergencyContacts: [],
      notifications: { email: true, sms: true, whatsapp: chance(0.7) },
      marketing: { email: chance(0.75), sms: chance(0.55), whatsapp: chance(0.4) },
      marketplace: source.name === 'Marketplace',
      allergies: [],
      patchTests: [],
      rewards: [],
      walletBalance: 0,
      files: [],
      createdAt: createdAt.toISOString(),
    })
  }
  // A few clinical records and alerts.
  clients[3].staffAlert = 'Prefers a quiet appointment, no small talk.'
  clients[3].allergies.push({ id: 'alg_1', kind: 'non_drug', name: 'Latex', reaction: 'Rash', severity: 'moderate', createdAt: subDays(todayDate, 40).toISOString() })
  clients[7].allergies.push({ id: 'alg_2', kind: 'non_drug', name: 'PPD (hair dye)', reaction: 'Itching', severity: 'mild', createdAt: subDays(todayDate, 60).toISOString() })
  clients[12].staffAlert = 'Always runs 10 minutes late, book a buffer.'
  clients[5].rewards.push({ id: 'rw_1', type: 'percent', name: '15% discount', value: 15, expiresAt: iso(addMonths(todayDate, 6)), inStoreOnly: false })
  for (const c of clients.slice(0, 40)) {
    if (chance(0.35)) c.patchTests.push({ id: `pt_${c.id}`, title: 'Tint patch test', testedAt: iso(subDays(todayDate, 30)), expiresAt: iso(addMonths(subDays(todayDate, 30), 6)), testedBy: 'tm_ines', status: 'passed' })
  }
  clients[18].blocked = { reason: 'Too many no-shows', at: subDays(todayDate, 15).toISOString() }

  // Regulars come back more often.
  const loyalty = new Map(clients.map((c) => [c.id, chance(0.25) ? 6 : chance(0.5) ? 2.5 : 1]))
  const clientsForGender = (gender: 'female' | 'male' | 'any') => clients.filter((c) => !c.blocked && (gender === 'any' || c.gender === gender))

  // ── Appointments and sales ──────────────────────────────────────────
  const appointments: Appointment[] = []
  const sales: Sale[] = []
  const payments: Payment[] = []
  const giftCards: GiftCard[] = []
  const clientPackages: ClientPackage[] = []
  const clientMemberships: DbData['clientMemberships'] = []
  const reviews: Review[] = []
  const messages: MessageLog[] = []
  const notifications: DbData['notifications'] = []
  let saleNumber = 1
  const memberById = new Map(teamMembers.map((m) => [m.id, m]))
  const servicesFor = (m: TeamMember, locationId: ID) =>
    services.filter((s) => (m.serviceIds === 'all' || m.serviceIds.includes(s.id)) && s.locationIds.includes(locationId) && s.priceType !== 'free')
  const fullName = (c: Client | undefined) => (c ? `${c.firstName} ${c.lastName}` : 'Walk-In')

  const registerByLocation: Record<ID, ID> = { [LOC_BAIXA]: 'reg_baixa', [LOC_FOZ]: 'reg_foz' }
  const sessions: RegisterSession[] = []
  const sessionFor = (locationId: ID, date: ISODate): RegisterSession | undefined => {
    if (date < iso(subDays(todayDate, 14))) return undefined
    let s = sessions.find((x) => x.registerId === registerByLocation[locationId] && x.openedAt.startsWith(date))
    if (!s) {
      const isToday = date === today
      s = {
        id: `rs_${locationId}_${date}`,
        registerId: registerByLocation[locationId],
        openedAt: stamp(date, '08:55'),
        openedBy: locationId === LOC_BAIXA ? 'João Pereira' : 'Sofia Almeida',
        openingFloat: 100,
        movements: [{ id: `mv_${date}_${locationId}`, type: 'opening_float', reason: 'Opening float', amount: 100, at: stamp(date, '08:55'), by: 'João Pereira' }],
        closedAt: isToday ? undefined : stamp(date, '20:10'),
        closedBy: isToday ? undefined : 'Marta Ribeiro',
        closingFloat: isToday ? undefined : 100,
      }
      sessions.push(s)
    }
    return s
  }

  const addPayment = (sale: Sale, method: PaymentMethod, amount: number, at: string, extra: Partial<Payment> = {}) => {
    const label = { cash: 'Cash', other: 'Other', gift_card: 'Gift card', card_terminal: 'Card terminal', self_checkout: 'Self checkout', qr_code: 'QR code', manual_card: 'Manual card entry', deposit: 'Deposit', online_card: 'Card (online)', custom: 'Other' }[method]
    const p: Payment = {
      id: `pay_${payments.length}`,
      saleId: sale.id,
      kind: 'sale',
      method,
      methodLabel: label,
      amount: round2(amount),
      at,
      by: 'Marta Ribeiro',
      status: 'succeeded',
      clientId: sale.clientId,
      locationId: sale.locationId,
      registerSessionId: method === 'cash' ? sessionFor(sale.locationId, at.slice(0, 10))?.id : undefined,
      ...extra,
    }
    payments.push(p)
    sale.paymentIds.push(p.id)
    return p
  }

  const newSale = (partial: Partial<Sale> & Pick<Sale, 'clientId' | 'locationId' | 'createdAt' | 'items'>): Sale => {
    const sale: Sale = {
      id: `sale_${saleNumber}`,
      number: saleNumber++,
      kind: 'sale',
      status: 'completed',
      completedAt: partial.createdAt,
      createdBy: 'Marta Ribeiro',
      serviceCharges: [],
      tips: [],
      paymentIds: [],
      channel: 'offline',
      notes: [],
      activity: [{ id: `act_s${saleNumber}`, at: partial.createdAt, by: 'Marta Ribeiro', title: `Sale ${saleNumber - 1} created`, detail: 'Completed by Marta Ribeiro' }],
      ...partial,
    }
    sales.push(sale)
    return sale
  }

  const saleTotal = (sale: Sale) => {
    const items = sale.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
    const discount = sale.cartDiscount ? (sale.cartDiscount.type === 'percent' ? (items * sale.cartDiscount.value) / 100 : sale.cartDiscount.value) : 0
    return round2(items - discount + sale.serviceCharges.reduce((s, c) => s + c.amount, 0) + sale.tips.reduce((s, t) => s + t.amount, 0))
  }

  const channels: [BookingChannel, number][] = [['marketplace', 15], ['book_now_link', 9], ['instagram', 6], ['google', 5]]
  const bookable = teamMembers.filter((m) => m.bookable)

  for (let d = -PAST_DAYS; d <= FUTURE_DAYS; d++) {
    const date = iso(addDays(parseISO(today), d))
    const isPast = d < 0
    const isToday = d === 0
    for (const member of bookable) {
      const windows = workingWindows(schedule, member.id, date)
      if (!windows.length) continue
      const shift = schedule.shiftPatterns.find((p) => p.teamMemberId === member.id && (p.weeks[0][((parseISO(date).getDay() + 6) % 7) as Weekday] || p.weeks[1]?.[((parseISO(date).getDay() + 6) % 7) as Weekday]))
      const locationId = shift?.locationId ?? member.locationIds[0]
      const lunch = blockedTimes.find((b) => b.teamMemberId === member.id && b.date === date)
      const occupancy = isPast ? 0.55 + r() * 0.25 : isToday ? 0.62 : Math.max(0.12, 0.6 - d * 0.025)
      const pool = servicesFor(member, locationId)
      if (!pool.length) continue
      for (const [ws, we] of windows) {
        let cursor = ws
        while (cursor < we - 15) {
          if (lunch && cursor >= toMinutes(lunch.start) && cursor < toMinutes(lunch.end)) {
            cursor = toMinutes(lunch.end)
            continue
          }
          if (!chance(occupancy)) {
            cursor += pick([15, 30, 30, 45])
            continue
          }
          const service = weighted(pool, (s) => CATEGORY_SEED.flatMap((c) => c.services).find((x) => `svc_${x.key}` === s.id)?.weight ?? 1)
          const variant = service.variants.length && chance(0.6) ? pick(service.variants) : undefined
          const duration = variant?.durationMin ?? service.durationMin
          const total = duration + service.extraTime.reduce((s, e) => s + e.durationMin, 0)
          if (cursor + total > we) break
          if (lunch && cursor < toMinutes(lunch.end) && cursor + total > toMinutes(lunch.start)) {
            cursor = toMinutes(lunch.end)
            continue
          }
          const startClock = toClock(cursor)
          const endMin = cursor + total
          const items: AppointmentItem[] = [
            {
              id: `ai_${appointments.length}_0`,
              serviceId: service.id,
              variantId: variant?.id,
              name: variant ? `${service.name} · ${variant.name}` : service.name,
              teamMemberId: member.id,
              start: startClock,
              durationMin: duration,
              extraTime: service.extraTime,
              price: variant?.price ?? service.price,
              addOns: service.addOnGroups.length && chance(0.25) ? [service.addOnGroups[0].options[0]] : [],
              resourceId: service.resourceTypeIds.includes('rt_room') ? pick(['res_room1', 'res_room2']) : undefined,
              preferred: chance(0.4),
            },
          ]
          let apptEnd = endMin
          // Sometimes a second service straight after.
          if (chance(0.1)) {
            const second = pick(pool.filter((s) => s.durationMin <= 45))
            if (second && apptEnd + second.durationMin <= we) {
              items.push({ id: `ai_${appointments.length}_1`, serviceId: second.id, name: second.name, teamMemberId: member.id, start: toClock(apptEnd), durationMin: second.durationMin, extraTime: [], price: second.price, addOns: [], preferred: items[0].preferred })
              apptEnd += second.durationMin
            }
          }
          const gender = service.categoryId === 'cat_barber' || service.id === 'svc_mens-cut' ? 'male' : service.categoryId === 'cat_nails' || service.categoryId === 'cat_colour' ? 'female' : 'any'
          const walkIn = isPast && chance(0.06)
          const client = walkIn ? undefined : weighted(clientsForGender(gender).filter((c) => c.createdAt.slice(0, 10) <= date), (c) => loyalty.get(c.id) ?? 1)
          const channelRoll = chance(0.34) && !walkIn
          const channel: BookingChannel = channelRoll ? weighted(channels, (c) => c[1])[0] : 'offline'
          const source: Appointment['source'] = channel !== 'offline' ? 'online' : walkIn ? 'walk_in' : chance(0.65) ? 'phone' : 'in_person'

          let status: AppointmentStatus
          if (isPast) status = chance(0.035) ? 'no_show' : chance(0.065) ? 'cancelled' : 'completed'
          else if (isToday) status = apptEnd <= nowMin ? 'completed' : cursor <= nowMin ? pick(['arrived', 'started'] as const) : chance(0.45) ? 'confirmed' : 'booked'
          else status = chance(0.4) ? 'confirmed' : 'booked'

          const createdAt = subDays(parseISO(stamp(date, startClock)), faker.number.int({ min: 1, max: 24 }))
          const apptId = `apt_${appointments.length}`
          const appt: Appointment = {
            id: apptId,
            ref: hex(),
            clientId: client?.id ?? null,
            locationId,
            date,
            items,
            status,
            source,
            channel,
            createdAt: (createdAt > todayDate ? subDays(todayDate, 1) : createdAt).toISOString(),
            createdBy: channel !== 'offline' ? fullName(client) : pick(['Marta Ribeiro', 'João Pereira']),
            requested: items[0].preferred,
            activity: [],
            formResponseIds: [],
          }
          appt.activity.push({ id: `aa_${apptId}`, at: appt.createdAt, by: appt.createdBy, title: 'Appointment created', detail: `Booked by ${appt.createdBy.split(' ')[0]}, reference ${appt.ref}` })
          if (status === 'cancelled') {
            const late = chance(0.3)
            appt.cancellation = { reasonId: pick(['cr_none', 'cr_duplicate', 'cr_mistake', 'cr_unavailable']), at: subDays(parseISO(stamp(date, startClock)), late ? 0 : 3).toISOString(), late, fee: 0, by: late ? fullName(client) : 'João Pereira' }
          }
          // Deposits on some upcoming online bookings.
          if (!isPast && channel !== 'offline' && chance(0.25)) {
            appt.deposit = { amount: round2(items[0].price * 0.2), paidAt: appt.createdAt }
          }
          appointments.push(appt)

          const apptTotal = items.reduce((s, i) => s + i.price + i.addOns.reduce((a, o) => a + o.price, 0), 0)
          const endIso = stamp(date, toClock(apptEnd))

          if (status === 'completed' && (isPast || isToday)) {
            const saleItems: SaleItem[] = items.flatMap((it) => [
              { id: `si_${it.id}`, type: 'service' as const, refId: it.serviceId, name: it.name, quantity: 1, unitPrice: it.price, teamMemberId: it.teamMemberId, appointmentId: apptId, appointmentItemId: it.id, taxRate: TAX },
              ...it.addOns.map((ao) => ({ id: `si_${it.id}_${ao.id}`, type: 'service_addon' as const, refId: ao.id, name: ao.name, quantity: 1, unitPrice: ao.price, teamMemberId: it.teamMemberId, appointmentId: apptId, taxRate: TAX })),
            ])
            if (chance(0.15)) {
              const prod = pick(products)
              saleItems.push({ id: `si_${apptId}_p`, type: 'product', refId: prod.id, name: prod.name, quantity: 1, unitPrice: prod.retailPrice, teamMemberId: member.id, taxRate: TAX })
            }
            const sale = newSale({ clientId: appt.clientId, locationId, createdAt: endIso, items: saleItems, appointmentId: apptId, channel })
            if (chance(0.22)) sale.tips.push({ teamMemberId: member.id, amount: round2(apptTotal * pick([0.1, 0.1, 0.18, 0.25])) })
            if (chance(0.04)) sale.cartDiscount = { type: 'percent', value: 10 }
            const total = saleTotal(sale)
            const method: PaymentMethod = weighted<[PaymentMethod, number]>([['card_terminal', 50], ['cash', 34], ['other', 6], ['qr_code', 4], ['self_checkout', 3]], (m) => m[1])[0]
            if (method === 'cash') {
              const given = Math.ceil(total / 5) * 5
              addPayment(sale, 'cash', total, endIso, given > total ? { change: round2(given - total) } : {})
            } else addPayment(sale, method, total, endIso)
            appt.saleId = sale.id
            appt.activity.push({ id: `ac_${apptId}`, at: endIso, by: 'Marta Ribeiro', title: 'Appointment checked out', detail: `Sale ${sale.number}` })
            // Reviews for a share of completed visits in the last 60 days.
            if (client && d > -60 && chance(0.12)) {
              const rating = weighted<[1 | 2 | 3 | 4 | 5, number]>([[5, 70], [4, 20], [3, 6], [2, 2], [1, 2]], (x) => x[1])[0]
              const review: Review = { id: `rev_${reviews.length}`, clientId: client.id, appointmentId: apptId, teamMemberId: member.id, serviceName: service.name, rating, text: pick(REVIEW_TEXTS[rating]), at: addMinutes(parseISO(endIso), 180).toISOString(), platform: chance(0.85) ? 'marketplace' : 'google', hasImages: chance(0.05) }
              if (chance(0.4)) review.reply = { text: `Thank you, ${client.firstName}! See you soon.`, at: addMinutes(parseISO(review.at), 600).toISOString() }
              reviews.push(review)
            }
          } else if (status === 'no_show' && chance(0.35)) {
            const fee = round2(apptTotal * 0.5)
            appt.noShowFee = fee
            const sale = newSale({ clientId: appt.clientId, locationId, createdAt: endIso, items: [{ id: `si_${apptId}_ns`, type: 'no_show_fee', name: 'No-show fee', detail: items[0].name, quantity: 1, unitPrice: fee, teamMemberId: member.id, appointmentId: apptId, taxRate: TAX }], appointmentId: apptId })
            addPayment(sale, 'online_card', fee, endIso)
          } else if (status === 'cancelled' && appt.cancellation?.late && chance(0.6)) {
            const fee = round2(apptTotal * 0.5)
            appt.cancellation.fee = fee
            const sale = newSale({ clientId: appt.clientId, locationId, createdAt: appt.cancellation.at, items: [{ id: `si_${apptId}_lc`, type: 'late_cancellation_fee', name: 'Late cancellation fee', detail: items[0].name, quantity: 1, unitPrice: fee, teamMemberId: member.id, appointmentId: apptId, taxRate: TAX }], appointmentId: apptId })
            addPayment(sale, 'online_card', fee, appt.cancellation.at)
          }
          // Deposit payment record (held until checkout).
          if (appt.deposit) {
            const dep: Payment = { id: `pay_${payments.length}`, saleId: '', kind: 'deposit', method: 'online_card', methodLabel: 'Deposit (card)', amount: appt.deposit.amount, at: appt.deposit.paidAt, by: fullName(client), status: 'succeeded', clientId: appt.clientId, locationId }
            payments.push(dep)
            appt.deposit.paymentId = dep.id
          }
          cursor = apptEnd + (chance(0.3) ? 15 : 0)
        }
      }
    }
  }

  // Group appointment (today or next working day): two friends at Foz.
  const groups: DbData['groups'] = []
  const groupPair = appointments.filter((a) => a.date === iso(addDays(todayDate, 2)) && a.locationId === LOC_FOZ && a.clientId).slice(0, 2)
  if (groupPair.length === 2) {
    groups.push({ id: 'grp_1', organiserClientId: groupPair[0].clientId, appointmentIds: groupPair.map((a) => a.id), createdAt: groupPair[0].createdAt })
    groupPair.forEach((a) => (a.groupId = 'grp_1'))
  }

  // Repeat series: a client with a weekly blow dry.
  const repeat = appointments.find((a) => a.date > today && a.items[0].serviceId === 'svc_blow-dry' && a.clientId)
  if (repeat) repeat.repeat = { frequency: 'weekly', interval: 1, unit: 'week', ends: 'after', count: 6, seriesId: 'series_1' }

  // ── Retail-only, gift card, package and membership sales ─────────────
  const pastDays = Array.from({ length: PAST_DAYS }, (_, i) => iso(addDays(start, i)))
  for (const date of pastDays) {
    if (!chance(0.3)) continue
    const prod = pick(products)
    const client = chance(0.5) ? pick(clients) : undefined
    const at = stamp(date, toClock(faker.number.int({ min: 10 * 60, max: 18 * 60 })))
    const sale = newSale({ clientId: client?.id ?? null, locationId: pick([LOC_BAIXA, LOC_FOZ]), createdAt: at, items: [{ id: `si_r${saleNumber}`, type: 'product', refId: prod.id, name: prod.name, quantity: chance(0.2) ? 2 : 1, unitPrice: prod.retailPrice, teamMemberId: 'tm_joao', taxRate: TAX }] })
    addPayment(sale, chance(0.5) ? 'cash' : 'card_terminal', saleTotal(sale), at)
  }

  const giftValues = [25, 50, 50, 75, 100, 150]
  for (let i = 0; i < 14; i++) {
    const date = pastDays[faker.number.int({ min: 2, max: PAST_DAYS - 1 })]
    const at = stamp(date, '12:30')
    const value = pick(giftValues)
    const purchaser = pick(clients)
    const online = chance(0.35)
    const sale = newSale({ clientId: purchaser.id, locationId: LOC_BAIXA, createdAt: at, channel: online ? 'marketplace' : 'offline', items: [] })
    const gc: GiftCard = {
      id: `gc_${i}`,
      code: code(),
      value,
      price: value,
      balance: value,
      issuedAt: at,
      expiresAt: iso(addMonths(parseISO(date), 12)),
      status: 'active',
      purchaserClientId: purchaser.id,
      ownerClientId: chance(0.5) ? purchaser.id : null,
      saleId: sale.id,
      isGift: chance(0.6),
      onlinePurchase: online,
      activity: [{ id: `gca_${i}`, at, by: online ? `${purchaser.firstName} ${purchaser.lastName}` : 'Marta Ribeiro', title: 'Gift card purchased', detail: `Sale ${sale.number}` }],
    }
    sale.items.push({ id: `si_gc${i}`, type: 'gift_card', refId: gc.id, giftCardId: gc.id, name: 'Gift Card', detail: `${gc.code} • €${value} value • valid for 1 year`, quantity: 1, unitPrice: value, teamMemberId: 'tm_marta', taxRate: 0 })
    addPayment(sale, online ? 'online_card' : 'card_terminal', value, at)
    giftCards.push(gc)
  }
  // Redeem some gift cards against later completed sales.
  for (const gc of giftCards.slice(0, 6)) {
    const later = sales.find((s) => s.kind === 'sale' && s.appointmentId && s.createdAt > gc.issuedAt && s.createdAt < nowIso && payments.find((p) => p.id === s.paymentIds[0])?.method === 'card_terminal')
    if (!later) continue
    const pay = payments.find((p) => p.id === later.paymentIds[0])!
    const amount = Math.min(gc.balance, pay.amount)
    pay.method = 'gift_card'
    pay.methodLabel = `Gift card (${gc.code})`
    pay.giftCardId = gc.id
    if (amount < pay.amount) {
      const rest = pay.amount - amount
      pay.amount = amount
      addPayment(later, 'card_terminal', rest, later.createdAt)
    }
    gc.balance = round2(gc.balance - amount)
    gc.status = gc.balance <= 0 ? 'redeemed' : 'active'
    gc.activity.push({ id: `gcr_${gc.id}`, at: later.createdAt, by: 'Marta Ribeiro', title: 'Gift card redeemed', detail: `€${amount} in sale ${later.number}` })
  }

  for (let i = 0; i < 8; i++) {
    const def = pick(packages)
    const client = pick(clients.slice(20))
    const date = pastDays[faker.number.int({ min: 5, max: PAST_DAYS - 2 })]
    const at = stamp(date, '17:10')
    const sale = newSale({ clientId: client.id, locationId: def.id === 'pkg_5cuts' ? LOC_BAIXA : LOC_FOZ, createdAt: at, items: [] })
    const cp: ClientPackage = { id: `cpkg_${i}`, packageId: def.id, clientId: client.id, saleId: sale.id, startDate: date, expiresAt: iso(addMonths(parseISO(date), def.expiresUnit === 'years' ? 12 : def.expiresValue)), status: 'active', usage: [{ benefitId: def.benefits[0].id, used: faker.number.int({ min: 0, max: 3 }) }], price: def.price }
    sale.items.push({ id: `si_pk${i}`, type: 'package', refId: def.id, clientPackageId: cp.id, name: def.name, detail: `${def.benefits.length} benefit`, quantity: 1, unitPrice: def.price, teamMemberId: 'tm_marta', taxRate: TAX })
    addPayment(sale, 'card_terminal', def.price, at)
    clientPackages.push(cp)
  }

  for (let i = 0; i < 6; i++) {
    const def = memberships[i % 2]
    const client = pick(clientsForGender(def.id === 'mem_barber' ? 'male' : 'female'))
    const startDate = iso(subDays(todayDate, faker.number.int({ min: 20, max: 65 })))
    const cm = { id: `cmem_${i}`, membershipId: def.id, clientId: client.id, saleId: '', startDate, nextBillingAt: '', status: 'active' as const, price: def.price }
    let billing = parseISO(startDate)
    let first = true
    while (billing <= todayDate) {
      const at = stamp(iso(billing), '09:00')
      const price = first && def.firstPeriodPrice ? def.firstPeriodPrice : def.price
      const sale = newSale({ clientId: client.id, locationId: LOC_BAIXA, createdAt: at, channel: 'marketplace', items: [{ id: `si_m${i}_${iso(billing)}`, type: 'membership', refId: def.id, clientMembershipId: cm.id, name: def.name, detail: 'Monthly payment', quantity: 1, unitPrice: price, teamMemberId: null, taxRate: TAX }] })
      addPayment(sale, 'online_card', price, at)
      if (first) cm.saleId = sale.id
      first = false
      billing = addMonths(billing, 1)
    }
    cm.nextBillingAt = iso(billing)
    clientMemberships.push(cm)
  }

  // Refunds of four earlier sales, two voided and three unpaid recent sales, one draft.
  const refundable = sales.filter((s) => s.appointmentId && s.items.some((i) => i.type === 'service') && s.createdAt < subDays(todayDate, 3).toISOString()).slice(-40)
  for (let i = 0; i < 4; i++) {
    const original = refundable[i * 9]
    if (!original) continue
    const at = addMinutes(parseISO(original.createdAt), 60 * 26).toISOString()
    const amount = round2(original.items[0].unitPrice)
    const refund = newSale({ kind: 'refund', status: 'refunded', clientId: original.clientId, locationId: original.locationId, createdAt: at, refundOfId: original.id, refundReason: pick(["Client's request", 'Incorrect amount', 'Accidental charge']), items: [{ ...original.items[0], id: `si_rf${i}`, unitPrice: -amount }] })
    const p = addPayment(refund, 'card_terminal', -amount, at)
    p.kind = 'refund'
  }
  for (let i = 0; i < 5; i++) {
    const date = iso(subDays(todayDate, i < 2 ? 6 + i : i - 1))
    const at = stamp(date, '16:20')
    const prod = pick(products)
    const sale = newSale({ status: i < 2 ? 'voided' : i < 4 ? 'unpaid' : 'draft', completedAt: undefined, clientId: pick(clients).id, locationId: LOC_BAIXA, createdAt: at, items: [{ id: `si_u${i}`, type: 'product', refId: prod.id, name: prod.name, quantity: 1, unitPrice: prod.retailPrice, teamMemberId: 'tm_joao', taxRate: TAX }] })
    if (sale.status === 'voided') sale.activity.push({ id: `av_${i}`, at, by: 'Marta Ribeiro', title: 'Sale voided' })
  }

  // ── Online store orders ──────────────────────────────────────────────
  const productOrders: DbData['productOrders'] = Array.from({ length: 6 }, (_, i) => {
    const prodA = pick(products)
    const qty = chance(0.3) ? 2 : 1
    const fulfilment = chance(0.5) ? ('pickup' as const) : ('shipping' as const)
    const shipping = fulfilment === 'shipping' ? 4.5 : 0
    return {
      id: `po_${i}`,
      number: 1001 + i,
      clientId: pick(clients).id,
      items: [{ productId: prodA.id, qty, price: prodA.retailPrice }],
      shipping,
      total: round2(prodA.retailPrice * qty + shipping),
      fulfilment,
      status: (['completed', 'completed', 'shipped', 'ready', 'new', 'new'] as const)[i],
      createdAt: subDays(todayDate, 12 - i * 2).toISOString(),
    }
  })

  // ── Waitlist ─────────────────────────────────────────────────────────
  const waitlist: DbData['waitlist'] = [
    { id: 'wl_1', clientId: clients[30].id, preferences: [{ date: iso(addDays(todayDate, 1)) }, { date: iso(addDays(todayDate, 2)), from: '06:00', to: '12:00' }], items: [{ serviceId: 'svc_balayage', teamMemberId: 'tm_ines' }], notes: 'Flexible, can come at short notice.', status: 'waiting', createdAt: subDays(todayDate, 2).toISOString(), source: 'online' },
    { id: 'wl_2', clientId: clients[44].id, preferences: [{ date: iso(addDays(todayDate, 3)), from: '17:00', to: '23:59' }], items: [{ serviceId: 'svc_gel-mani', teamMemberId: null }], notes: '', status: 'waiting', createdAt: subDays(todayDate, 1).toISOString(), source: 'in_person' },
    { id: 'wl_3', clientId: clients[52].id, preferences: [{ date: iso(subDays(todayDate, 3)) }], items: [{ serviceId: 'svc_deep-tissue', teamMemberId: 'tm_beatriz' }], notes: '', status: 'expired', createdAt: subDays(todayDate, 6).toISOString(), source: 'online' },
  ]

  // ── Messages, notifications, conversations ──────────────────────────
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const recentOnline = appointments.filter((a) => a.channel !== 'offline' && a.createdAt > subDays(todayDate, 3).toISOString()).slice(-8)
  for (const a of recentOnline) {
    const c = clientById.get(a.clientId ?? '')
    const m = memberById.get(a.items[0].teamMemberId)!
    notifications.push({ id: `nt_${a.id}`, tab: 'appointments', title: 'New online booking', body: `${format(parseISO(a.date), 'EEE d MMM')} ${a.items[0].start} ${a.items[0].name} for ${c?.firstName ?? 'Walk-In'} booked with ${m.firstName}`, at: a.createdAt, read: chance(0.5), link: `/calendar?date=${a.date}&drawer=appointment&id=${a.id}`, initials: c ? `${c.firstName[0]}${c.lastName[0]}` : 'W' })
  }
  for (const rv of reviews.slice(-3)) {
    const c = clientById.get(rv.clientId)!
    notifications.push({ id: `nt_${rv.id}`, tab: 'reviews', title: `New ${rv.rating}-star review`, body: `${c.firstName} ${c.lastName}: "${rv.text || 'No comment'}"`, at: rv.at, read: false, link: '/clients/online-reputation?tab=all', initials: `${c.firstName[0]}${c.lastName[0]}` })
  }
  for (const po of productOrders.filter((o) => o.status === 'new')) {
    const c = clientById.get(po.clientId)!
    notifications.push({ id: `nt_${po.id}`, tab: 'online_sales', title: 'New product order', body: `Order #${po.number} from ${c.firstName} ${c.lastName} • €${po.total}`, at: po.createdAt, read: false, link: '/sales/store-orders', initials: `${c.firstName[0]}${c.lastName[0]}` })
  }
  notifications.push({ id: 'nt_stock', tab: 'actions', title: 'Low stock', body: '4 products are at or below their low stock level.', at: subDays(todayDate, 1).toISOString(), read: false, link: '/catalogue/products' })

  const recentForMessages = appointments.filter((a) => a.clientId && a.createdAt > subDays(todayDate, 5).toISOString()).slice(-50)
  for (const a of recentForMessages) {
    const c = clientById.get(a.clientId!)!
    const m = memberById.get(a.items[0].teamMemberId)!
    messages.push({ id: `msg_${messages.length}`, at: a.createdAt, clientId: c.id, to: c.email, toName: `${c.firstName} ${c.lastName}`, channel: 'email', type: 'confirmation', subject: `Your appointment is confirmed for ${format(parseISO(a.date), 'EEE, MMM d')} at ${a.items[0].start}`, body: `Hi ${c.firstName}, your ${a.items[0].name} with ${m.firstName} at Studio Aliados is confirmed for ${format(parseISO(a.date), 'EEEE, MMMM d')} at ${a.items[0].start}. Booking ref: ${a.ref}.`, appointmentId: a.id, status: 'delivered' })
  }
  const tomorrow = iso(addDays(todayDate, 1))
  for (const a of appointments.filter((x) => x.date === tomorrow && x.clientId).slice(0, 20)) {
    const c = clientById.get(a.clientId!)!
    messages.push({ id: `msg_${messages.length}`, at: subDays(parseISO(stamp(a.date, a.items[0].start)), 1).toISOString() < nowIso ? subDays(parseISO(stamp(a.date, a.items[0].start)), 1).toISOString() : nowIso, clientId: c.id, to: c.phone, toName: `${c.firstName} ${c.lastName}`, channel: 'sms', type: 'reminder', subject: 'Appointment reminder', body: `Studio Aliados: reminder of your ${a.items[0].name} tomorrow at ${a.items[0].start}. Reply or call ${'+351 222 087 410'} to change.`, appointmentId: a.id, status: 'delivered' })
  }

  const conversations: DbData['conversations'] = [
    { id: 'cv_1', clientId: clients[9].id, status: 'open', unread: true, updatedAt: subDays(todayDate, 0).toISOString(), messages: [{ id: 'cm_1', from: 'client', text: 'Hello! Is there street parking near the Baixa salon?', at: addMinutes(todayDate, -40).toISOString() }] },
    { id: 'cv_2', clientId: clients[15].id, status: 'open', unread: false, updatedAt: subDays(todayDate, 1).toISOString(), messages: [{ id: 'cm_2', from: 'client', text: 'Can I move my gel manicure to Saturday?', at: subDays(todayDate, 1).toISOString() }, { id: 'cm_3', from: 'business', text: 'Of course! Saturday at 11:00 with Sofia works. Shall I book it?', at: subDays(todayDate, 1).toISOString(), by: 'João Pereira' }] },
    { id: 'cv_3', clientId: clients[21].id, status: 'closed', unread: false, updatedAt: subDays(todayDate, 6).toISOString(), messages: [{ id: 'cm_4', from: 'client', text: 'Thank you for today, love the colour!', at: subDays(todayDate, 6).toISOString() }, { id: 'cm_5', from: 'business', text: 'So glad you love it, Inês says hi!', at: subDays(todayDate, 6).toISOString(), by: 'Marta Ribeiro' }] },
  ]

  // ── Team records: timesheets and pay runs ───────────────────────────
  const timesheets: DbData['timesheets'] = []
  for (let d = 14; d >= 1; d--) {
    const date = iso(subDays(todayDate, d))
    for (const m of teamMembers.filter((x) => x.wages.enabled)) {
      const windows = workingWindows(schedule, m.id, date)
      if (!windows.length) continue
      const late = chance(0.15)
      timesheets.push({
        id: `ts_${m.id}_${date}`,
        teamMemberId: m.id,
        locationId: m.locationIds[0],
        date,
        clockIn: toClock(windows[0][0] + (late ? 10 : 0)),
        clockOut: toClock(windows[windows.length - 1][1]),
        breaks: [{ id: `br_${m.id}_${date}`, typeId: 'btt_lunch', start: '13:00', end: '13:30' }],
        status: 'clocked_out',
        activity: [{ id: `tsa_${m.id}_${date}`, at: stamp(date, toClock(windows[0][0])), by: `${m.firstName}`, title: 'Timesheet created', detail: `${m.firstName} clocked in` }],
      })
    }
  }
  const payRuns: DbData['payRuns'] = []

  // ── Marketing ────────────────────────────────────────────────────────
  const deals: DbData['deals'] = [
    { id: 'deal_autumn', type: 'promotion', name: 'Autumn welcome', description: '10% off for new clients this autumn.', discountType: 'percent', value: 10, code: 'AUTUMN10', startsAt: iso(subDays(todayDate, 20)), pos: true, appliesTo: { services: 'all', products: 'all', packages: 'all', memberships: 'all', giftCards: true }, limits: { onePerClient: true }, teamMemberIds: 'all', status: 'active', createdAt: subDays(todayDate, 20).toISOString(), uses: 7, salesTotal: 263 },
    { id: 'deal_tuesday', type: 'flash_sale', name: 'Tuesday nails', description: '15% off gel manicures on Tuesdays.', discountType: 'percent', value: 15, startsAt: iso(subDays(todayDate, 45)), endsAt: iso(addDays(todayDate, 30)), pos: true, appliesTo: { services: ['svc_gel-mani'], products: [], packages: [], memberships: [], giftCards: false }, limits: { onePerClient: false }, teamMemberIds: ['tm_sofia'], status: 'active', createdAt: subDays(todayDate, 45).toISOString(), uses: 12, salesTotal: 286 },
    { id: 'deal_lastmin', type: 'last_minute', name: 'Last-minute massage', description: '20% off massages booked within 4 hours.', discountType: 'percent', value: 20, startsAt: iso(subDays(todayDate, 60)), pos: false, lastMinuteHours: 4, appliesTo: { services: services.filter((s) => s.categoryId === 'cat_spa').map((s) => s.id), products: [], packages: [], memberships: [], giftCards: false }, limits: { onePerClient: false }, teamMemberIds: 'all', status: 'inactive', createdAt: subDays(todayDate, 60).toISOString(), uses: 3, salesTotal: 132 },
  ]
  const smartPricing: DbData['smartPricing'] = { configured: true, status: 'active', teamMemberIds: 'all', serviceIds: 'all', rules: { 1: [{ start: '09:00', end: '11:00', direction: 'increase', value: 10, unit: 'percent' }, { start: '16:00', end: '17:00', direction: 'decrease', value: 10, unit: 'percent' }] } }

  const campaigns: DbData['campaigns'] = [
    { id: 'cmp_sent', name: 'Autumn colour refresh', status: 'sent', channel: 'email', audience: { type: 'segments', segmentIds: ['seg_loyal'], clientIds: [] }, subject: 'Fall for a new colour 🍂', heading: 'Autumn colour refresh', body: 'Warm tones are back. Book a colour or toner this month and get a free bond-repair treatment.', buttonLabel: 'Book now', dealId: 'deal_autumn', createdAt: subDays(todayDate, 12).toISOString(), sentAt: subDays(todayDate, 10).toISOString(), recipients: 86, cost: 1.72, stats: { sent: 86, delivered: 84, opened: 51, clicked: 19, bookings: 7, revenue: 412 } },
    { id: 'cmp_sched', name: 'Christmas gift cards', status: 'scheduled', channel: 'email', audience: { type: 'all', segmentIds: [], clientIds: [] }, subject: 'The easiest gift this Christmas', heading: 'Give the gift of a good hair day', body: 'Studio Aliados gift cards from €25, valid for a year.', buttonLabel: 'Buy a gift card', createdAt: subDays(todayDate, 2).toISOString(), scheduledAt: addDays(todayDate, 5).toISOString(), recipients: 182, cost: 3.64, stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bookings: 0, revenue: 0 } },
    { id: 'cmp_pending', name: 'Barber weekday offer', status: 'pending', channel: 'sms', audience: { type: 'segments', segmentIds: ['seg_lapsed'], clientIds: [] }, subject: '', heading: '', body: 'Studio Aliados: 15% off any barber cut Mon-Wed this month with code BARBER15. Book: studioaliados.example.com', createdAt: subDays(todayDate, 1).toISOString(), recipients: 23, cost: 1.84, stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bookings: 0, revenue: 0 } },
    { id: 'cmp_draft', name: 'New nail art menu', status: 'draft', channel: 'email', audience: { type: 'all', segmentIds: [], clientIds: [] }, subject: 'Our new nail art menu is here', heading: 'Nail art at Foz', body: 'Chrome, French and hand-painted designs, now bookable online.', buttonLabel: 'See the menu', createdAt: todayDate.toISOString(), recipients: 0, cost: 0, stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bookings: 0, revenue: 0 } },
  ]

  const automations = buildAutomations(nowIso)
  const segments = buildSegments()

  const formTemplates: DbData['formTemplates'] = [
    { id: 'form_covid', name: 'COVID 19', status: 'inactive', request: 'before', frequency: 'every', serviceIds: 'all', signatureRequired: true, createdAt: subDays(todayDate, 200).toISOString(), sections: [{ id: 'fs1', kind: 'client_details', title: 'Personal Information', blocks: [] }, { id: 'fs2', kind: 'custom', title: 'Covid 19', blocks: [{ id: 'q1', type: 'yes_no', label: 'Do you, or anyone in your household, have any flu-like symptoms?' }, { id: 'q2', type: 'yes_no', label: 'Are you experiencing a cough?' }] }] },
    { id: 'form_colour', name: 'Colour consultation', status: 'active', request: 'before', frequency: 'once', serviceIds: services.filter((s) => s.categoryId === 'cat_colour').map((s) => s.id), signatureRequired: true, createdAt: subDays(todayDate, 90).toISOString(), sections: [{ id: 'fc1', kind: 'client_details', title: 'Personal Information', blocks: [] }, { id: 'fc2', kind: 'custom', title: 'Your hair history', blocks: [{ id: 'c1', type: 'yes_no', label: 'Have you coloured your hair in the last 6 months?' }, { id: 'c2', type: 'yes_no', label: 'Have you ever reacted to hair dye?' }, { id: 'c3', type: 'long_text', label: 'Describe the result you would like' }] }] },
  ]
  const formResponses: DbData['formResponses'] = appointments
    .filter((a) => a.clientId && a.items[0].serviceId.startsWith('svc_') && services.find((s) => s.id === a.items[0].serviceId)?.categoryId === 'cat_colour')
    .slice(-12)
    .map((a, i) => ({ id: `fr_${i}`, templateId: 'form_colour', clientId: a.clientId!, appointmentId: a.id, status: a.date < today ? 'completed' : 'sent', answers: (a.date < today ? { c1: 'Yes', c2: 'No', c3: 'Warm caramel, low maintenance' } : {}) as Record<string, string>, sentAt: a.createdAt, completedAt: a.date < today ? a.createdAt : undefined }))
  formResponses.forEach((fr) => appointments.find((a) => a.id === fr.appointmentId)?.formResponseIds.push(fr.id))

  // Notes on a few clients.
  const clientNotes: DbData['clientNotes'] = [
    { id: 'cn_1', clientId: clients[3].id, html: '<p>Uses <b>Olaplex</b> at home. Likes a cool blonde, avoid yellow tones.</p>', kind: 'client', createdAt: subDays(todayDate, 30).toISOString(), by: 'Inês Carvalho' },
    { id: 'cn_2', clientId: clients[7].id, html: '<p>Bring her own coffee cup, allergic to dairy.</p>', kind: 'client', createdAt: subDays(todayDate, 12).toISOString(), by: 'João Pereira' },
  ]

  // ── Stock ────────────────────────────────────────────────────────────
  const stockMovements: DbData['stockMovements'] = products.flatMap((p) => [{ id: `sm_${p.id}_0`, productId: p.id, locationId: LOC_BAIXA, qty: p.stock + 6, reason: 'New Stock', by: 'Marta Ribeiro', at: p.createdAt, supplyPrice: p.supplyPrice }])
  const stockOrders: DbData['stockOrders'] = [
    { id: 'so_1', number: 'P1', supplierId: 'sup_0', locationId: LOC_BAIXA, items: [{ productId: 'prd_0', qty: 12, unitCost: 6.5, receivedQty: 12 }, { productId: 'prd_2', qty: 6, unitCost: 9, receivedQty: 6 }], fees: [{ name: 'Delivery', amount: 7.5, type: 'amount' }], status: 'received', createdAt: subDays(todayDate, 30).toISOString(), receivedAt: subDays(todayDate, 26).toISOString(), activity: [] },
    { id: 'so_2', number: 'P2', supplierId: 'sup_2', locationId: LOC_FOZ, items: [{ productId: 'prd_23', qty: 10, unitCost: 9, receivedQty: 0 }, { productId: 'prd_20', qty: 6, unitCost: 8.5 }], fees: [], expectedAt: iso(addDays(todayDate, 3)), status: 'ordered', createdAt: subDays(todayDate, 2).toISOString(), activity: [] },
  ]
  const stocktakes: DbData['stocktakes'] = [
    { id: 'st_1', name: 'September count', description: 'Monthly count', locationId: LOC_BAIXA, status: 'completed', items: products.slice(0, 15).map((p) => ({ productId: p.id, expected: p.stock + 1, counted: p.stock + (chance(0.2) ? 0 : 1), excluded: false })), startedAt: subDays(todayDate, 35).toISOString(), completedAt: subDays(todayDate, 35).toISOString(), countedBy: 'João Pereira', reviewedBy: 'Marta Ribeiro', note: 'Two shampoos damaged in delivery.' },
  ]

  // ── Settings ─────────────────────────────────────────────────────────
  const settings = buildSettings()

  const registers: DbData['registers'] = [
    { id: 'reg_baixa', name: 'Front desk', locationId: LOC_BAIXA, archived: false, order: 0, settings: { requireOpen: false, minFloat: { amount: 50, when: 'both' }, middayCounts: true, promptLeftOpen: true, autoPrint: false, autoEmail: false } },
    { id: 'reg_foz', name: 'Front desk', locationId: LOC_FOZ, archived: false, order: 1, settings: { requireOpen: false, middayCounts: true, promptLeftOpen: false, autoPrint: false, autoEmail: false } },
  ]
  // Register sessions: tally cash movement and close.
  for (const s of sessions) {
    const cash = payments.filter((p) => p.registerSessionId === s.id).reduce((sum, p) => sum + p.amount, 0)
    if (s.closedAt) {
      s.cashToBank = round2(cash)
      s.counted = { cash: round2(100 + cash) }
      s.movements.push({ id: `mvc_${s.id}`, type: 'closed', reason: 'Register closed', amount: round2(100 + cash), at: s.closedAt, by: 'Marta Ribeiro' })
    }
  }

  // Ratings per member.
  for (const m of teamMembers) {
    const mine = reviews.filter((x) => x.teamMemberId === m.id)
    m.reviewCount = mine.length
    m.rating = mine.length ? round2(mine.reduce((s, x) => s + x.rating, 0) / mine.length) : 0
  }

  const cardRecent = payments.filter((p) => p.status === 'succeeded' && ['card_terminal', 'online_card', 'qr_code', 'self_checkout', 'manual_card'].includes(p.method) && p.at > subDays(todayDate, 2).toISOString())
  const walletBalance = round2(cardRecent.reduce((s, p) => s + p.amount, 0) * 0.985)
  const payouts: DbData['payouts'] = Array.from({ length: 12 }, (_, i) => ({ id: `po_${i}`, amount: round2(180 + r() * 420), at: subDays(todayDate, i + 2).toISOString(), status: 'paid' as const, bankLast4: '4417' }))

  const planTotal = round2(5 * 12.95)
  const invoices: DbData['invoices'] = [1, 2, 3].map((n) => {
    const date = iso(addMonths(parseISO(today), -n))
    return { id: `inv_${n}`, number: `IB-${format(parseISO(date), 'yyyyMM')}-${String(200 + n)}`, date, lines: [{ description: 'Team plan · 5 bookable team members', quantity: 5, unitPrice: 12.95 }, ...(n === 2 ? [{ description: 'Text message credits (250)', quantity: 1, unitPrice: 20 }] : [])], subtotal: n === 2 ? planTotal + 20 : planTotal, tax: round2((n === 2 ? planTotal + 20 : planTotal) * TAX), total: round2((n === 2 ? planTotal + 20 : planTotal) * (1 + TAX)), status: 'paid' as const }
  })

  const data: DbData = {
    meta: { version: SEED_VERSION, seededAt: nowIso, nextSaleNumber: saleNumber, nextOrderNumber: 1007 },
    workspace: {
      id: 'ws_aliados',
      name: 'Studio Aliados',
      country: 'Portugal',
      currency: 'EUR',
      taxCalculation: 'inclusive',
      teamLanguage: 'English (US)',
      clientLanguage: 'Português (Portugal)',
      externalLinks: { facebook: 'facebook.com/studioaliados', instagram: 'instagram.com/studioaliados', x: '', website: 'studioaliados.example.com' },
      plan: { type: 'team', status: 'active', trialEndsAt: iso(subDays(todayDate, 100)), billingDetails: { accountType: 'Company', firstName: 'Marta', lastName: 'Ribeiro', businessName: 'Studio Aliados, Lda', address: 'Rua de Sá da Bandeira 512, 4000-430 Porto', vatNumber: 'PT515002233' }, card: { brand: 'Visa', last4: '4417', expiry: '08/28' } },
      messageCredits: 184,
      businessTypes: ['Hair Salon', 'Nails', 'Barber'],
    },
    locations,
    closedPeriods,
    users,
    teamMembers,
    shiftPatterns,
    shiftOverrides: [],
    timeOff,
    blockedTimeTypes,
    blockedTimes,
    timesheets,
    payAdjustments: [],
    payRuns,
    serviceCategories,
    services,
    bundles,
    resources,
    resourceTypes,
    memberships,
    packages,
    brands,
    productCategories,
    products,
    suppliers,
    stockOrders,
    stocktakes,
    stockMovements,
    productOrders,
    clients,
    clientNotes,
    clientTags,
    clientSources,
    segments,
    formTemplates,
    formResponses,
    appointments,
    groups,
    waitlist,
    sales,
    payments,
    giftCards,
    clientPackages,
    clientMemberships,
    registers,
    registerSessions: sessions,
    deals,
    smartPricing,
    campaigns,
    automations,
    messages: messages.sort((a, b) => b.at.localeCompare(a.at)),
    conversations,
    reviews,
    notifications: notifications.sort((a, b) => b.at.localeCompare(a.at)),
    wallet: { balance: walletBalance, available: walletBalance, credits: 0, payoutsEnabled: true, transactions: cardRecent.slice(-15).map((p) => ({ id: `wt_${p.id}`, at: p.at, type: 'payment' as const, description: `${p.methodLabel} payment`, amount: p.amount })) },
    payouts,
    addOns: [
      { slug: 'payments', status: 'active', enabledAt: subDays(todayDate, 300).toISOString() },
      { slug: 'premium-support', status: 'trial', trialEndsAt: iso(addDays(todayDate, 6)) },
      { slug: 'insights', status: 'inactive' },
      { slug: 'google-rating-boost', status: 'inactive' },
      { slug: 'loyalty', status: 'inactive' },
      { slug: 'data-connector', status: 'inactive' },
      { slug: 'client-connect', status: 'active', enabledAt: subDays(todayDate, 200).toISOString() },
      { slug: 'smart-website', status: 'inactive' },
      { slug: 'team-chat', status: 'inactive' },
      { slug: 'bookable-resources', status: 'active', enabledAt: subDays(todayDate, 150).toISOString() },
      { slug: 'xero', status: 'inactive' },
      { slug: 'quickbooks', status: 'inactive' },
    ],
    invoices,
    settings,
    ext: {},
  }
  return data
}

function buildSettings(): Settings {
  return {
    timezone: '(GMT +01:00) Lisbon',
    timeFormat: '24h',
    firstDayOfWeek: 0,
    calendar: { colorSource: 'category', displayProcessing: true, displayBlocked: true },
    waitlist: { type: 'auto', priority: 'first', online: true, anyTime: true },
    cancellationReasons: [
      { id: 'cr_none', name: 'No reason provided', order: 0 },
      { id: 'cr_duplicate', name: 'Duplicate appointment', order: 1 },
      { id: 'cr_mistake', name: 'Appointment made by mistake', order: 2 },
      { id: 'cr_unavailable', name: 'Client not available', order: 3 },
    ],
    appointmentStatuses: [
      { id: 'booked', name: 'Booked', icon: 'calendar', color: 'blue', system: true, order: 0 },
      { id: 'confirmed', name: 'Confirmed', icon: 'check', color: 'teal', system: true, order: 1 },
      { id: 'arrived', name: 'Arrived', icon: 'door-open', color: 'orange', system: false, order: 2 },
      { id: 'started', name: 'Started', icon: 'play', color: 'green', system: false, order: 3 },
      { id: 'completed', name: 'Completed', icon: 'check-check', color: 'darkBlue', system: true, order: 4 },
      { id: 'cancelled', name: 'Canceled', icon: 'x', color: 'red', system: true, order: 5 },
      { id: 'no_show', name: 'No-show', icon: 'eye-off', color: 'red', system: true, order: 6 },
    ],
    dynamicAssignment: { strategy: 'fill', period: 'day', prioritizeLast: false, excluded: [], split: true, reassignOnline: true, reassignTeam: false, cutoffMin: 15 },
    availability: { advanceDays: 365, minNoticeMin: 60, cancelWindowMin: 0, showContact: true },
    scheduleOptimization: { intervalMin: 15, mode: 'regular' },
    bookingOptions: { bookSpecific: true, showProfiles: true, showPortfolio: true, showRatings: true, bookByGender: false, serviceImages: true, featured: true, serviceNamesInReviews: true, groupBooking: true, importantInfo: '', emailBooked: false, emailAddresses: 'bookings@studioaliados.example.com' },
    onlineBookingsEnabled: true,
    taxRates: [{ id: 'tax_iva23', name: 'IVA', rate: 23 }, { id: 'tax_iva6', name: 'IVA reduzido', rate: 6 }],
    taxDefaults: { services: 'tax_iva23', products: 'tax_iva23', memberships: 'tax_iva23' },
    receipts: { showContact: true, showAddress: true, showTeam: false, title: 'Sale', line1: '', line2: '', footer: 'Obrigado pela visita!', autoPrint: false },
    tipping: { pos: true, terminal: true, online: true, values: [10, 18, 25], include: { services: true, addons: true, products: true, memberships: true, packages: true, giftCards: true, serviceCharges: false, discounts: false, taxes: true } },
    serviceCharges: [],
    giftCards: { enabled: true, values: [25, 50, 75, 100, 150], expiry: '1 year', online: true, customMin: 10, customMax: 500 },
    customPaymentMethods: [
      { id: 'cpm_cash', name: 'Cash', system: true, active: true, order: 0 },
      { id: 'cpm_other', name: 'Other', system: false, active: true, order: 1 },
      { id: 'cpm_mbway', name: 'MB WAY', system: false, active: true, order: 2 },
    ],
    paymentPolicy: { depositsEnabled: true, depositPct: 20, cancellationWindowHours: 24, lateCancelFeePct: 50, noShowFeePct: 100 },
    clientConnect: { allowStart: true, readReceipts: true, typing: true, instantReply: false, instantReplyText: 'Thanks for your message! We will reply within the hour.', contactPage: true, requiredContact: 'Client phone only', attachments: true, marketingConsent: true, redirect: 'profile', customLink: '' },
    timeOffTypes: [
      { id: 'to_annual', name: 'Annual leave', system: true },
      { id: 'to_sick', name: 'Sick leave', system: true },
      { id: 'to_training', name: 'Training', system: false },
      { id: 'to_other', name: 'Other absence reasons', system: false },
    ],
    timesheets: { proximity: false, autoClockIn: false, autoClockOut: false, autoBreaks: false, enabled: true },
    shifts: { autoCreate: true },
    payRuns: { frequency: 'weekly', restartsOn: 0, autoPay: false, autoTips: false, enabled: true },
    commissions: { deductDiscounts: true, deductTaxes: true, deductServiceCost: false, deductProductCost: false, packageServices: false, membershipServices: false, loyaltyFull: false, fullyPaidOnly: false, exceedPaid: false },
    pinSwitching: { enabled: false, lockInactive: true, lockAfterMin: 1, lockAfterCheckout: false, style: 'light' },
    permissionRoles: defaultPermissionRoles(),
    defaultRole: 'medium',
    quickSaleItems: [
      { type: 'service', id: 'svc_womens-cut' },
      { type: 'service', id: 'svc_blow-dry' },
      { type: 'service', id: 'svc_barber-cut' },
      { type: 'service', id: 'svc_gel-mani' },
      { type: 'product', id: 'prd_2' },
      { type: 'product', id: 'prd_10' },
    ],
    calendarZoom: 96,
    quickActions: true,
    savedFilters: [],
    registersEnabled: true,
  }
}

function buildAutomations(at: string): Automation[] {
  const a = (key: string, section: Automation['section'], name: string, description: string, enabled: boolean, channels: Automation['channels'], extra: Partial<Automation> = {}): Automation => ({
    id: `auto_${key}`,
    key,
    section,
    name,
    description,
    enabled,
    marketing: false,
    channels,
    smsOperator: 'and',
    content: { importantInfo: '', displayPrice: true },
    createdAt: at,
    updatedAt: at,
    ...extra,
  })
  const all = { email: true, sms: true, whatsapp: true }
  const email = { email: true, sms: false, whatsapp: false }
  return [
    a('reminder-3d', 'reminders', '3 days upcoming appointment reminder', 'Notifies clients reminding them of their upcoming appointment.', true, email, { trigger: '3 days' }),
    a('reminder-24h', 'reminders', '24 hours upcoming appointment reminder', 'Notifies clients reminding them of their upcoming appointment.', true, all, { trigger: '24 hours' }),
    a('reminder-1h', 'reminders', '1 hour upcoming appointment reminder', 'Notifies clients reminding them of their upcoming appointment.', true, { email: false, sms: true, whatsapp: true }, { trigger: '1 hour' }),
    a('new-appointment', 'appointment_updates', 'New appointment', 'Reach out to clients when their appointment is booked for them.', true, all),
    a('rescheduled', 'appointment_updates', 'Rescheduled appointment', 'Automatically sends to clients when their appointment start time is changed.', true, all),
    a('cancelled', 'appointment_updates', 'Canceled appointment', 'Automatically sends to clients when their appointment is canceled.', true, all),
    a('no-show', 'appointment_updates', 'Did not show up', 'Automatically sends to clients when their appointment is marked as a no-show.', true, all),
    a('thank-you', 'appointment_updates', 'Thank you for visiting', 'Reach out to clients when their appointment is checked out, with a link to leave a review.', true, email),
    a('thank-tip', 'appointment_updates', 'Thank you for tipping', 'Reach out to clients when they add a tip after their appointment.', false, email),
    a('waitlist-joined', 'waitlist_updates', 'Joined the waitlist', 'Automatically sends to clients when they join the waitlist.', true, email),
    a('waitlist-slot', 'waitlist_updates', 'Time slot available', 'Automatically sends to clients when a time slot becomes available to book.', true, all),
    a('rebook', 'increase_bookings', 'Reminder to rebook', 'Remind your clients to rebook a few weeks after their last appointment.', true, email, { marketing: true }),
    a('birthday', 'increase_bookings', 'Celebrate birthdays', 'Surprise clients on their special day, a proven way to boost client loyalty and retention.', false, email, { marketing: true }),
    a('win-back', 'increase_bookings', 'Win back lapsed clients', "Reach clients that you haven't seen for a while and encourage them to book their next appointment.", false, email, { marketing: true }),
    a('reward-loyal', 'increase_bookings', 'Reward loyal clients', 'Message top spenders and get them even more engaged with a special offer.', false, email, { marketing: true }),
    a('welcome', 'celebrate_milestones', 'Welcome new clients', 'Celebrate new clients joining your business by offering them a discount.', false, email, { marketing: true }),
    a('chat-message', 'client_messages', 'New chat message', 'Notifies clients when you send them a message via Client Connect.', true, all),
    a('message-received', 'client_messages', 'Message received', 'Notifies clients that you received the message they sent through your contact page', true, email),
    a('points-summary', 'client_loyalty', 'Earned points summary', 'Send clients a summary of points earned', false, email),
    a('tier', 'client_loyalty', 'Achieved loyalty tier', 'Notify clients when they achieve a new tier', false, email),
    a('rewards-summary', 'client_loyalty', 'Earned rewards summary', 'Send clients a summary of their rewards', false, email),
    a('referrer', 'client_loyalty', 'Referrer rewards earned', 'Notify existing clients when their friends complete their first appointments', false, email),
  ]
}

function buildSegments(): ClientSegment[] {
  const s = (key: string, name: string, description: string, standard: boolean, rules: ClientSegment['rules'], extra: Partial<ClientSegment> = {}): ClientSegment => ({ id: `seg_${key}`, key, name, description, standard, rules, ...extra })
  return [
    s('new', 'New clients', 'Clients added in the last 30 days', true, [{ attribute: 'added_date', conditions: [{ field: 'period', operator: 'last_days', value: 30 }] }], { periodDays: 30, badge: { name: 'New', color: 'blue' } }),
    s('recent', 'Recent clients', 'Clients with appointments in the last 30 days', true, [{ attribute: 'any_appointment', conditions: [{ field: 'date', operator: 'last_days', value: 30 }] }], { periodDays: 30 }),
    s('first', 'First visit', 'Clients with no appointments in the past, and with appointments in the future', true, [{ attribute: 'first_visit', conditions: [] }], { badge: { name: 'First visit', color: 'blue' } }),
    s('loyal', 'Loyal clients', 'Clients with 2 or more sales in the last 5 months', true, [{ attribute: 'number_of_sales', conditions: [{ field: 'count', operator: 'gte', value: 2 }, { field: 'date', operator: 'last_days', value: 150 }] }]),
    s('lapsed', 'Lapsed clients', 'Clients with 3 or more sales in the last 12 months, and with no sales in the last 2 months', true, [{ attribute: 'lapsed', conditions: [] }]),
    s('spenders', 'High spenders', 'Clients with more than €500 in sales in the last 12 months', true, [{ attribute: 'total_value_of_sales', conditions: [{ field: 'value', operator: 'gt', value: 500 }, { field: 'date', operator: 'last_days', value: 365 }] }]),
    s('birthdays', 'Upcoming birthdays', 'Clients with birthdays in the next 30 days', true, [{ attribute: 'birthday', conditions: [{ field: 'period', operator: 'next_days', value: 30 }] }]),
    s('online', 'Clients who booked online', 'Clients with appointments, excluding channel Offline', false, [{ attribute: 'any_appointment', conditions: [{ field: 'channel', operator: 'not', value: 'offline' }] }]),
    s('upcoming', 'Clients with upcoming appointments', 'Clients with appointments in the future', false, [{ attribute: 'any_appointment', conditions: [{ field: 'date', operator: 'future', value: 0 }] }]),
    s('withsales', 'Clients with sales', 'Clients with sales in the last 30 days', false, [{ attribute: 'any_sale', conditions: [{ field: 'date', operator: 'last_days', value: 30 }] }]),
    s('imported', 'Imported clients', 'Clients with selected client source', false, [{ attribute: 'client_source', conditions: [{ field: 'source', operator: 'in', value: ['src_imported'] }] }]),
  ]
}
