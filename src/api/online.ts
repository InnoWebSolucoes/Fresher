import { getDaysInMonth } from 'date-fns'
import { format } from '@/lib/dates'
import { useMemo } from 'react'
import { commit, db, useDb } from '@/store/db'
import type { ActivityEntry, AddOnState, Address, DbData, ID, Location, OpeningHours } from '@/types'
import { uid } from '@/lib/ids'
import { now, nowISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { ApiError, actorName, latency } from './client'
import { readExt, useExt, writeExt } from './ext'
import { orList, t } from './i18n'

/**
 * Online presence: marketplace profile, Facebook/Instagram connection, link
 * builder, Smart Website and product store. Everything that has a home in
 * DbData is written there; the rest (site design, generated links, store
 * product visibility, profile activity) lives in db.ext.online.
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

/** Leftover copy of the section-local store this data used to live in. */
try {
  localStorage.removeItem('ib-online-local')
} catch {
  /* storage can be blocked; nothing to clean up then */
}

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

// Section data lives in db.ext.online (persists, syncs between tabs and is
// cleared by Reset demo). The Facebook connection is kept on its add-on
// record (AddOnState.config).
export const ONLINE_NS = 'online'
const FB_SLUG = 'fb-and-ig-bookings'

export const DEFAULT_STORE: StoreConfig = Object.freeze({ hiddenProductIds: [], pickup: true, shipping: true, shippingFee: 4.5 }) as StoreConfig
const NO_LINKS: BookingLink[] = Object.freeze([]) as unknown as BookingLink[]
const NO_ACTIVITY: Record<string, ActivityEntry[]> = Object.freeze({}) as Record<string, ActivityEntry[]>

const readWebsite = () => readExt<WebsiteConfig | null>(ONLINE_NS, 'website', null)
const readLinks = () => readExt<BookingLink[]>(ONLINE_NS, 'links', NO_LINKS)
const readStore = () => readExt<StoreConfig>(ONLINE_NS, 'store', DEFAULT_STORE)
const readActivity = () => readExt<Record<string, ActivityEntry[]>>(ONLINE_NS, 'profileActivity', NO_ACTIVITY)

function facebookOf(addOns: AddOnState[] | undefined): FacebookConnection | null {
  const a = addOns?.find((x) => x.slug === FB_SLUG)
  if (a?.status !== 'active' || !a.config?.pageName) return null
  return a.config as unknown as FacebookConnection
}

export const useWebsite = () => useExt<WebsiteConfig | null>(ONLINE_NS, 'website', null)
export const useBookingLinks = () => useExt<BookingLink[]>(ONLINE_NS, 'links', NO_LINKS)
export const useStoreConfig = () => useExt<StoreConfig>(ONLINE_NS, 'store', DEFAULT_STORE)
export const useProfileActivity = () => useExt<Record<string, ActivityEntry[]>>(ONLINE_NS, 'profileActivity', NO_ACTIVITY)

/** Facebook and Instagram connection (null when not connected). */
export function useFacebookConnection(): FacebookConnection | null {
  const addOns = useDb((s) => s.addOns)
  return useMemo(() => facebookOf(addOns), [addOns])
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

/** Activity titles are i18n keys (online.activity.*), rendered by the dashboard. */
function logProfile(locationId: ID, title: string) {
  ensureProfileActivity(locationId)
  const all = readActivity()
  writeExt(ONLINE_NS, 'profileActivity', { ...all, [locationId]: [{ id: uid('act'), at: nowISO(), by: actorName(), title }, ...(all[locationId] ?? [])].slice(0, 50) })
}

/**
 * First use: start the profile's "Latest activity" with the edits that built
 * the seeded profile (written to db.ext so they persist like real entries).
 */
export function ensureProfileActivity(locationId: ID): void {
  const all = readActivity()
  if (all[locationId]) return
  const data = db()
  const loc = data.locations.find((l) => l.id === locationId)
  if (!loc) return
  const owner = data.users.find((u) => u.role === 'owner')
  const by = owner ? `${owner.firstName} ${owner.lastName}` : actorName()
  const m = loc.marketplace
  const steps: [string, boolean][] = [
    ['online.activity.essentials', Boolean(loc.name && loc.phone)],
    ['online.activity.location', Boolean(loc.address.line1)],
    ['online.activity.hours', Object.values(loc.openingHours).some((d) => d.open)],
    ['online.activity.images', m.images.length > 0],
    ['online.activity.features', m.amenities.length + m.highlights.length + m.values.length > 0],
    ['online.activity.description', m.description.length > 0],
    ['online.activity.listed', m.listed],
  ]
  // A first setup session a while before the demo started, a few minutes per step.
  const start = new Date(data.meta?.seededAt ?? nowISO()).getTime() - 118 * 864e5 - 3 * 36e5
  const entries: ActivityEntry[] = steps
    .filter(([, done]) => done)
    .map(([title], i) => ({ id: `act_seed_${locationId}_${i}`, at: new Date(start + i * 4 * 6e4).toISOString(), by, title }))
    .reverse()
  writeExt(ONLINE_NS, 'profileActivity', { ...all, [locationId]: entries })
}

/** Save one or more profile sections (wizard step or dashboard edit). */
export async function saveProfile(locationId: ID, patch: ProfilePatch, activityTitle?: string): Promise<void> {
  await latency()
  commit((d) => {
    const loc = d.locations.find((l) => l.id === locationId)
    if (!loc) throw new ApiError('not_found', t('settings.biz.location.notFound'))
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
  if (!loc) throw new ApiError('not_found', t('settings.biz.location.notFound'))
  if (listed) {
    if (!loc.phone) throw new ApiError('incomplete', t('online.wizard.errors.phone'))
    if (loc.marketplace.description.length < 200) throw new ApiError('incomplete', t('api.online.descriptionTooShort'))
    if (loc.marketplace.images.length < 3) throw new ApiError('incomplete', t('online.wizard.errors.images'))
  }
  commit((d) => {
    const l = d.locations.find((x) => x.id === locationId)!
    l.marketplace.listed = listed
    l.marketplace.step = listed ? undefined : l.marketplace.step
  })
  logProfile(locationId, listed ? 'online.activity.listed' : 'online.activity.unlisted')
}

/** "✨ Generate with AI" (simulated): a description built from the venue's own data. */
export async function generateDescription(locationId: ID): Promise<string> {
  await latency(1400, 2000)
  const data = db()
  const loc = data.locations.find((l) => l.id === locationId)
  if (!loc) throw new ApiError('not_found', t('settings.biz.location.notFound'))
  const services = data.services.filter((s) => !s.archived && s.locationIds.includes(locationId))
  const categories = [...new Set(services.map((s) => data.serviceCategories.find((c) => c.id === s.categoryId)?.name).filter(Boolean))] as string[]
  const team = data.teamMembers.filter((m) => !m.archived && m.locationIds.includes(locationId) && m.bookable)
  const featured = services.slice(0, 3).map((s) => s.name.toLowerCase())
  const extras = [...loc.marketplace.amenities, ...loc.marketplace.highlights].map((x) => x.toLowerCase())
  const area = loc.address.district && loc.address.district !== loc.address.city ? `${loc.address.district}, ${loc.address.city}` : loc.address.city
  const parts = [
    t('api.online.description.intro', { name: loc.name, categories: categories.slice(0, 3).join(', ').toLowerCase() || t('api.online.description.beautyWellness'), area }),
    team.length ? t('api.online.description.team', { featured: featured.join(', '), count: team.length }) : t('api.online.description.teamSkilled', { featured: featured.join(', ') }),
    extras.length ? t('api.online.description.space', { extras: extras.slice(0, 3).join(', ') }) : t('api.online.description.spaceDefault'),
    t('api.online.description.bookOnline'),
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
  commit((d) => {
    upsertAddOn(d, FB_SLUG, 'active')
    const a = d.addOns.find((x) => x.slug === FB_SLUG)!
    a.config = { ...connection, connectedAt: nowISO() }
    a.disabledAt = undefined
  })
}

export async function disconnectFacebook(): Promise<void> {
  await latency()
  commit((d) => {
    upsertAddOn(d, FB_SLUG, 'inactive')
    const a = d.addOns.find((x) => x.slug === FB_SLUG)!
    a.config = undefined
    a.disabledAt = nowISO()
  })
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
  writeExt(ONLINE_NS, 'links', [link, ...readLinks()])
  return link
}

export async function deleteBookingLink(id: string): Promise<void> {
  await latency()
  writeExt(ONLINE_NS, 'links', readLinks().filter((l) => l.id !== id))
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
      eyebrow: t('api.online.website.eyebrow'),
      heading: t('api.online.website.heading'),
      text: t('api.online.website.text', { services: orList(featured.map((s) => s.name)) }),
      button: t('marketing.content.cta.book'),
    },
    pages: [
      { id: 'home', name: t('api.online.website.pages.home'), heading: '', text: '', hidden: false, system: true },
      { id: 'services', name: t('api.online.website.pages.services'), heading: t('api.online.website.pages.servicesHeading'), text: t('api.online.website.pages.servicesText'), hidden: false, system: true },
      { id: 'about', name: t('api.online.website.pages.about'), heading: t('api.online.website.pages.aboutHeading', { business: data.workspace.name }), text: t('api.online.website.pages.aboutText'), hidden: false, system: true },
      { id: 'team', name: t('api.online.website.pages.team'), heading: t('api.online.website.pages.teamHeading'), text: t('api.online.website.pages.teamText'), hidden: false, system: true },
      { id: 'contact', name: t('api.online.website.pages.contact'), heading: t('api.online.website.pages.contactHeading'), text: t('api.online.website.pages.contactText'), hidden: false, system: true },
    ],
    domainType: 'included',
    domain: `${businessSlug(data.workspace.name).replace(/-/g, '')}${SITE_SUFFIX}`,
  }
}

export async function saveWebsite(config: WebsiteConfig, silent = false): Promise<void> {
  await latency(silent ? 150 : 300, silent ? 300 : 700)
  // Keep the publish date of a live site when its draft is saved again.
  const current = readWebsite()
  writeExt(ONLINE_NS, 'website', { ...config, publishedAt: config.publishedAt ?? current?.publishedAt })
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
  if (billing.cardNumber.replace(/\D/g, '').length < 12) throw new ApiError('card_declined', t('api.online.checkCardNumber'))
  const { payNow } = smartWebsiteProRata()
  commit((d) => {
    upsertAddOn(d, 'smart-website', 'active')
    const net = round2(payNow / (1 + IVA))
    d.invoices.unshift({
      id: uid('inv'),
      number: `IB-${format(now(), 'yyyyMM')}-${300 + d.invoices.length}`,
      date: format(now(), 'yyyy-MM-dd'),
      lines: [{ description: t('api.online.smartWebsiteInvoiceLine'), quantity: 1, unitPrice: net }],
      subtotal: net,
      tax: round2(payNow - net),
      total: payNow,
      status: 'paid',
    })
    d.workspace.plan.billingDetails = { accountType: billing.accountType, firstName: billing.firstName, lastName: billing.lastName, businessName: billing.businessName, address: billing.address, vatNumber: billing.vatNumber || undefined }
    const digits = billing.cardNumber.replace(/\D/g, '')
    d.workspace.plan.card = { brand: /^5[1-5]|^2[2-7]/.test(digits) ? 'Mastercard' : /^3[47]/.test(digits) ? 'Amex' : 'Visa', last4: digits.slice(-4), expiry: billing.expiry.replace(/\s+/g, '') }
    d.workspace.externalLinks.website = config.domain
  })
  writeExt(ONLINE_NS, 'website', { ...config, publishedAt: nowISO() })
}

export async function cancelSmartWebsite(): Promise<void> {
  await latency()
  commit((d) => upsertAddOn(d, 'smart-website', 'inactive'))
  const website = readWebsite()
  writeExt(ONLINE_NS, 'website', website ? { ...website, publishedAt: undefined } : null)
}

// ─── Product store ─────────────────────────────────────────────────────────

export async function setStoreActive(active: boolean): Promise<void> {
  await latency(500, 900)
  commit((d) => upsertAddOn(d, 'product-store', active ? 'active' : 'inactive'))
}

export async function setProductOnline(productId: ID, online: boolean): Promise<void> {
  await latency(200, 400)
  const store = readStore()
  writeExt(ONLINE_NS, 'store', { ...store, hiddenProductIds: online ? store.hiddenProductIds.filter((id) => id !== productId) : [...new Set([...store.hiddenProductIds, productId])] })
}

export async function saveStoreSettings(patch: Partial<StoreConfig>): Promise<void> {
  await latency()
  writeExt(ONLINE_NS, 'store', { ...readStore(), ...patch })
}
