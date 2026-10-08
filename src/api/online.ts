import { format, getDaysInMonth } from 'date-fns'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { commit, db, useDb } from '@/store/db'
import type { ActivityEntry, AddOnState, Address, DbData, ID, Location, OpeningHours } from '@/types'
import { uid } from '@/lib/ids'
import { now, nowISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { ApiError, actorName, latency } from './client'

/**
 * Online presence: marketplace profile, Facebook/Instagram connection, link
 * builder, Smart Website and product store. Everything that has a home in
 * DbData is written there; the rest (site design, generated links, store
 * product visibility, profile activity) lives in a small section-local store
 * that resets together with the demo seed.
 */

export const BOOKING_BASE = 'https://book.innoweb.example'
export const STORE_BASE = 'https://shop.innoweb.example'
export const SITE_SUFFIX = '.innowebsite.example'
export const SMART_WEBSITE_PRICE = 13.95
export const IVA = 0.23

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const businessSlug = (name: string) => slugify(name) || 'business'

function upsertAddOn(d: DbData, slug: string, status: AddOnState['status']) {
  const existing = d.addOns.find((a) => a.slug === slug)
  if (existing) {
    existing.status = status
    if (status === 'active') existing.enabledAt = nowISO()
  } else {
    d.addOns.push({ slug, status, enabledAt: status === 'active' ? nowISO() : undefined })
  }
}

export const addOnStatus = (addOns: AddOnState[] | undefined, slug: string) => addOns?.find((a) => a.slug === slug)?.status

// ─── Section-local state ───────────────────────────────────────────────────

export interface SitePage {
  id: string
  name: string
  heading: string
  text: string
  hidden: boolean
  system: boolean
}

export interface WebsiteConfig {
  template: string
  palette: number
  fontPack: number
  hideNavigation: boolean
  hero: { eyebrow: string; heading: string; text: string; button: string }
  pages: SitePage[]
  domainType: 'included' | 'custom' | 'existing'
  domain: string
  publishedAt?: string
}

export interface BookingLink {
  id: string
  kind: 'everything' | 'services' | 'packages' | 'memberships' | 'gift_cards'
  name: string
  url: string
  locationId: string
  serviceIds: string[]
  teamMemberId: string
  itemId: string
  createdAt: string
}

export interface FacebookConnection {
  pageName: string
  instagram: string | null
  locationId: string
  connectedAt: string
}

export interface StoreConfig {
  hiddenProductIds: string[]
  pickup: boolean
  shipping: boolean
  shippingFee: number
}

interface OnlineLocal {
  seededAt: string | null
  website: WebsiteConfig | null
  links: BookingLink[]
  facebook: FacebookConnection | null
  store: StoreConfig
  profileActivity: Record<string, ActivityEntry[]>
}

const ONLINE_DEFAULTS: OnlineLocal = {
  seededAt: null,
  website: null,
  links: [],
  facebook: null,
  store: { hiddenProductIds: [], pickup: true, shipping: true, shippingFee: 4.5 },
  profileActivity: {},
}

const useOnlineLocal = create<OnlineLocal>()(persist(() => ({ ...ONLINE_DEFAULTS }), { name: 'ib-online-local', version: 1 }))

function local(): OnlineLocal {
  const seededAt = db().meta?.seededAt ?? null
  const state = useOnlineLocal.getState()
  if (state.seededAt !== seededAt) {
    const fresh = { ...ONLINE_DEFAULTS, seededAt }
    useOnlineLocal.setState(fresh)
    return fresh
  }
  return state
}

function setLocal(patch: Partial<OnlineLocal> | ((s: OnlineLocal) => Partial<OnlineLocal>)) {
  const current = local()
  useOnlineLocal.setState(typeof patch === 'function' ? patch(current) : patch)
}

/** React hook over the section-local state for the current seed. */
export function useOnlineState(): OnlineLocal {
  const seededAt = useDb((s) => s.meta?.seededAt ?? null)
  const state = useOnlineLocal()
  return state.seededAt === seededAt ? state : { ...ONLINE_DEFAULTS, seededAt }
}

// ─── Marketplace profile ───────────────────────────────────────────────────

export interface ProfilePatch {
  name?: string
  phone?: string
  email?: string
  address?: Address
  directions?: string
  openingHours?: OpeningHours
  marketplace?: Partial<Location['marketplace']>
}

function logProfile(locationId: ID, title: string) {
  setLocal((s) => ({
    profileActivity: { ...s.profileActivity, [locationId]: [{ id: uid('act'), at: nowISO(), by: actorName(), title }, ...(s.profileActivity[locationId] ?? [])].slice(0, 50) },
  }))
}

/** Save one or more profile sections (wizard step or dashboard edit). */
export async function saveProfile(locationId: ID, patch: ProfilePatch, activityTitle?: string): Promise<void> {
  await latency()
  commit((d) => {
    const loc = d.locations.find((l) => l.id === locationId)
    if (!loc) throw new ApiError('not_found', 'Location not found')
    const { marketplace, ...rest } = patch
    Object.assign(loc, rest)
    if (marketplace) Object.assign(loc.marketplace, marketplace)
  })
  if (activityTitle) logProfile(locationId, activityTitle)
}

/** Enable (list) or unlist the location on the marketplace. */
export async function setProfileListed(locationId: ID, listed: boolean): Promise<void> {
  await latency(600, 1000)
  const loc = db().locations.find((l) => l.id === locationId)
  if (!loc) throw new ApiError('not_found', 'Location not found')
  if (listed) {
    if (!loc.phone) throw new ApiError('incomplete', 'Add a business phone number')
    if (loc.marketplace.description.length < 200) throw new ApiError('incomplete', 'A venue description of at least 200 characters is required')
    if (loc.marketplace.images.length < 3) throw new ApiError('incomplete', 'You must have at least 3 images')
  }
  commit((d) => {
    const l = d.locations.find((x) => x.id === locationId)!
    l.marketplace.listed = listed
    l.marketplace.step = listed ? undefined : l.marketplace.step
  })
  logProfile(locationId, listed ? 'Listed profile on the marketplace' : 'Unlisted profile')
}

/** "✨ Generate with AI" (simulated): a description built from the venue's own data. */
export async function generateDescription(locationId: ID): Promise<string> {
  await latency(1400, 2000)
  const data = db()
  const loc = data.locations.find((l) => l.id === locationId)
  if (!loc) throw new ApiError('not_found', 'Location not found')
  const services = data.services.filter((s) => !s.archived && s.locationIds.includes(locationId))
  const categories = [...new Set(services.map((s) => data.serviceCategories.find((c) => c.id === s.categoryId)?.name).filter(Boolean))] as string[]
  const team = data.teamMembers.filter((m) => !m.archived && m.locationIds.includes(locationId) && m.bookable)
  const featured = services.slice(0, 3).map((s) => s.name.toLowerCase())
  const extras = [...loc.marketplace.amenities, ...loc.marketplace.highlights].map((x) => x.toLowerCase())
  const area = loc.address.district && loc.address.district !== loc.address.city ? `${loc.address.district}, ${loc.address.city}` : loc.address.city
  const parts = [
    `${loc.name} brings ${categories.slice(0, 3).join(', ').toLowerCase() || 'beauty and wellness'} together under one roof in ${area}.`,
    `From ${featured.join(', ')} to tailored treatments, our team of ${team.length || 'skilled'} professionals takes the time to listen and make every visit feel personal.`,
    extras.length ? `Expect a calm, welcoming space that is ${extras.slice(0, 3).join(', ')}.` : 'Expect a calm, welcoming space and a warm hello every time.',
    'Book online in seconds, any time of day, and leave feeling refreshed.',
  ]
  return parts.join(' ').slice(0, 1200)
}

// ─── Facebook and Instagram bookings ───────────────────────────────────────

export async function facebookSignIn(): Promise<string[]> {
  await latency(1100, 1600)
  const name = db().workspace.name
  return [name, `${name} Foz`, `${name} Barber Club`]
}

export async function connectFacebook(connection: Omit<FacebookConnection, 'connectedAt'>): Promise<void> {
  await latency(900, 1400)
  commit((d) => upsertAddOn(d, 'fb-and-ig-bookings', 'active'))
  setLocal({ facebook: { ...connection, connectedAt: nowISO() } })
}

export async function disconnectFacebook(): Promise<void> {
  await latency()
  commit((d) => upsertAddOn(d, 'fb-and-ig-bookings', 'inactive'))
  setLocal({ facebook: null })
}

// ─── Link builder ──────────────────────────────────────────────────────────

export type BookingLinkInput = Omit<BookingLink, 'id' | 'url' | 'createdAt'>

export function bookingLinkUrl(input: Omit<BookingLinkInput, 'name'>, workspaceName: string): string {
  const base = `${BOOKING_BASE}/${businessSlug(workspaceName)}`
  const params = new URLSearchParams()
  if (input.locationId && input.locationId !== 'all') params.set('location', input.locationId.replace(/^loc_/, ''))
  if (input.teamMemberId) params.set('team', input.teamMemberId.replace(/^tm_/, ''))
  let path = ''
  switch (input.kind) {
    case 'everything':
      path = '/'
      break
    case 'services':
      path = '/services'
      if (input.serviceIds.length) params.set('ids', input.serviceIds.map((id) => id.replace(/^svc_/, '')).join(','))
      break
    case 'packages':
      path = input.itemId ? `/packages/${input.itemId}` : '/packages'
      break
    case 'memberships':
      path = input.itemId ? `/memberships/${input.itemId}` : '/memberships'
      break
    case 'gift_cards':
      path = '/gift-cards'
      break
  }
  const query = params.toString()
  return `${base}${path}${query ? `?${query}` : ''}`
}

export async function createBookingLink(input: BookingLinkInput): Promise<BookingLink> {
  await latency()
  const link: BookingLink = { ...input, id: uid('lnk'), url: bookingLinkUrl(input, db().workspace.name), createdAt: nowISO() }
  setLocal((s) => ({ links: [link, ...s.links] }))
  return link
}

export async function deleteBookingLink(id: string): Promise<void> {
  await latency()
  setLocal((s) => ({ links: s.links.filter((l) => l.id !== id) }))
}

// ─── Smart Website ─────────────────────────────────────────────────────────

export function defaultWebsite(data: Pick<DbData, 'workspace' | 'services'>): WebsiteConfig {
  const featured = data.services.filter((s) => !s.archived && s.onlineBooking).slice(0, 3)
  return {
    template: 'elegant',
    palette: 2,
    fontPack: 0,
    hideNavigation: false,
    hero: {
      eyebrow: 'Porto’s friendly neighbourhood studio',
      heading: 'Look and feel your best, every visit',
      text: `Expert care tailored just for you. Book your ${featured.map((s) => s.name).join(', ').replace(/, ([^,]*)$/, ' or $1')} today.`,
      button: 'Book now',
    },
    pages: [
      { id: 'home', name: 'Home', heading: '', text: '', hidden: false, system: true },
      { id: 'services', name: 'Services', heading: 'Our services', text: 'Prices and durations are always up to date with our booking menu.', hidden: false, system: true },
      { id: 'about', name: 'About', heading: `About ${data.workspace.name}`, text: 'Two salons in Porto with one idea: unhurried, honest beauty care from a team that listens.', hidden: false, system: true },
      { id: 'team', name: 'Team', heading: 'Meet the team', text: 'Book directly with your favourite professional.', hidden: false, system: true },
      { id: 'contact', name: 'Contact', heading: 'Visit us', text: 'Find us in Baixa and Foz. We would love to see you.', hidden: false, system: true },
    ],
    domainType: 'included',
    domain: `${businessSlug(data.workspace.name).replace(/-/g, '')}${SITE_SUFFIX}`,
  }
}

export async function saveWebsite(config: WebsiteConfig, silent = false): Promise<void> {
  await latency(silent ? 150 : 300, silent ? 300 : 700)
  setLocal({ website: config })
}

const TAKEN = ['salon', 'studio', 'beauty', 'hair', 'nails', 'test', 'aliados', 'porto', 'barber']

/** Simulated availability check for a domain name. */
export async function checkDomain(name: string, kind: WebsiteConfig['domainType']): Promise<{ available: boolean; price?: number }> {
  await latency(500, 900)
  const base = name.trim().toLowerCase().split('.')[0]
  if (!base || !/^[a-z0-9-]{3,63}$/.test(base)) return { available: false }
  if (kind === 'existing') return { available: true }
  if (TAKEN.includes(base)) return { available: false }
  return { available: true, price: kind === 'custom' ? 12 : undefined }
}

/** Pro-rata first payment for the Smart Website add-on (incl. IVA). */
export function smartWebsiteProRata(): { subtotal: number; tax: number; payNow: number } {
  const today = now()
  const days = getDaysInMonth(today)
  const remaining = days - today.getDate() + 1
  const subtotal = SMART_WEBSITE_PRICE
  const tax = round2(subtotal * IVA)
  return { subtotal, tax, payNow: round2(((subtotal + tax) * remaining) / days) }
}

export interface BillingInput {
  cardHolder: string
  cardNumber: string
  expiry: string
  accountType: string
  firstName: string
  lastName: string
  businessName: string
  vatNumber?: string
  address: string
}

/** Activate the add-on (simulated payment) and publish the site. */
export async function activateSmartWebsite(config: WebsiteConfig, billing: BillingInput): Promise<void> {
  await latency(1000, 1500)
  if (billing.cardNumber.replace(/\D/g, '').length < 12) throw new ApiError('card_declined', 'Check your card number')
  const { payNow } = smartWebsiteProRata()
  commit((d) => {
    upsertAddOn(d, 'smart-website', 'active')
    const net = round2(payNow / (1 + IVA))
    d.invoices.unshift({
      id: uid('inv'),
      number: `IB-${format(now(), 'yyyyMM')}-${300 + d.invoices.length}`,
      date: format(now(), 'yyyy-MM-dd'),
      lines: [{ description: 'Smart Website add-on (first month, pro-rata)', quantity: 1, unitPrice: net }],
      subtotal: net,
      tax: round2(payNow - net),
      total: payNow,
      status: 'paid',
    })
    if (!d.workspace.plan.billingDetails) {
      d.workspace.plan.billingDetails = { accountType: billing.accountType, firstName: billing.firstName, lastName: billing.lastName, businessName: billing.businessName, address: billing.address, vatNumber: billing.vatNumber || undefined }
    }
    d.workspace.externalLinks.website = config.domain
  })
  setLocal({ website: { ...config, publishedAt: nowISO() } })
}

export async function cancelSmartWebsite(): Promise<void> {
  await latency()
  commit((d) => upsertAddOn(d, 'smart-website', 'inactive'))
  setLocal((s) => ({ website: s.website ? { ...s.website, publishedAt: undefined } : null }))
}

// ─── Product store ─────────────────────────────────────────────────────────

export async function setStoreActive(active: boolean): Promise<void> {
  await latency(500, 900)
  commit((d) => upsertAddOn(d, 'product-store', active ? 'active' : 'inactive'))
}

export async function setProductOnline(productId: ID, online: boolean): Promise<void> {
  await latency(200, 400)
  setLocal((s) => ({
    store: { ...s.store, hiddenProductIds: online ? s.store.hiddenProductIds.filter((id) => id !== productId) : [...new Set([...s.store.hiddenProductIds, productId])] },
  }))
}

export async function saveStoreSettings(patch: Partial<StoreConfig>): Promise<void> {
  await latency()
  setLocal((s) => ({ store: { ...s.store, ...patch } }))
}
