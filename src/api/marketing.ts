import { format } from 'date-fns'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { commit, db, useDb } from '@/store/db'
import type { AddOnState, Automation, Campaign, Client, DbData, Deal, ID, MessageLog, SmartPricing } from '@/types'
import { uid } from '@/lib/ids'
import { now, nowISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { clientStats, clientsInSegment } from '@/lib/segments'
import { ApiError, actorName, latency } from './client'

/**
 * Marketing domain operations: blast campaigns (with review + delivery),
 * automations, communication balance, deals and smart pricing.
 */

// ─── Rates ─────────────────────────────────────────────────────────────────

export const RATES = { email: 0.02, sms: 0.08, whatsapp: 0.12 } as const
export const IVA = 0.23

// ─── Shared helpers ────────────────────────────────────────────────────────

function upsertAddOn(d: DbData, slug: string, status: AddOnState['status']) {
  const existing = d.addOns.find((a) => a.slug === slug)
  if (existing) {
    existing.status = status
    existing.enabledAt = status === 'active' ? nowISO() : existing.enabledAt
  } else {
    d.addOns.push({ slug, status, enabledAt: status === 'active' ? nowISO() : undefined })
  }
}

export const addOnActive = (addOns: AddOnState[] | undefined, slug: string) => addOns?.some((a) => a.slug === slug && a.status === 'active') ?? false

/** Deterministic pseudo-random generator seeded from a string (stable demo numbers). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addInvoice(d: DbData, description: string, net: number) {
  const date = format(now(), 'yyyy-MM-dd')
  const subtotal = round2(net)
  const tax = round2(subtotal * IVA)
  d.invoices.unshift({
    id: uid('inv'),
    number: `IB-${format(now(), 'yyyyMM')}-${300 + d.invoices.length}`,
    date,
    lines: [{ description, quantity: 1, unitPrice: subtotal }],
    subtotal,
    tax,
    total: round2(subtotal + tax),
    status: 'paid',
  })
}

/** Insert several outbox messages in one write (same record shape as queueMessage). */
function queueMany(records: Omit<MessageLog, 'id' | 'at'>[]) {
  const at = nowISO()
  commit((d) => {
    d.messages.unshift(...records.map((r) => ({ id: uid('msg'), at, ...r })))
  })
}

// ─── Section-local settings (no field for these in DbData) ────────────────

interface MarketingLocal {
  seededAt: string | null
  autoTopUp: { threshold: number; amount: number }
  advanced: { senderName: string; quietHours: boolean; quietFrom: string; quietTo: string }
  billingCard: { brand: string; last4: string } | null
}

const MARKETING_DEFAULTS: MarketingLocal = {
  seededAt: null,
  autoTopUp: { threshold: 10, amount: 50 },
  advanced: { senderName: 'StudioAliad', quietHours: true, quietFrom: '21:00', quietTo: '08:00' },
  billingCard: null,
}

export const useMarketingLocal = create<MarketingLocal>()(persist(() => ({ ...MARKETING_DEFAULTS }), { name: 'ib-marketing-local', version: 1 }))

/** Local settings, reset automatically when the demo is reset (new seed). */
export function marketingLocal(): MarketingLocal {
  const seededAt = db().meta?.seededAt ?? null
  const state = useMarketingLocal.getState()
  if (state.seededAt !== seededAt) {
    useMarketingLocal.setState({ ...MARKETING_DEFAULTS, seededAt })
    return { ...MARKETING_DEFAULTS, seededAt }
  }
  return state
}

/** React hook: local settings for the current seed. */
export function useMarketingSettings(): MarketingLocal {
  const seededAt = useDb((s) => s.meta?.seededAt ?? null)
  const state = useMarketingLocal()
  return state.seededAt === seededAt ? state : { ...MARKETING_DEFAULTS, seededAt }
}

// ─── Blast campaigns ───────────────────────────────────────────────────────

export type CampaignDraft = Pick<Campaign, 'name' | 'channel' | 'audience' | 'subject' | 'heading' | 'body' | 'buttonLabel' | 'dealId' | 'scheduledAt'>

type AudienceData = Pick<DbData, 'clients' | 'appointments' | 'sales' | 'clientPackages' | 'clientMemberships' | 'giftCards' | 'segments'>

export interface AudienceResult {
  /** Clients matched by the audience rule. */
  matched: Client[]
  /** Matched clients that can receive the campaign (consent + contact details). */
  eligible: Client[]
}

/** Who a campaign reaches. Respects marketing consent and contact details. */
export function campaignAudience(data: AudienceData, audience: Campaign['audience'], channel: Campaign['channel'], stats = clientStats(data)): AudienceResult {
  let matched: Client[]
  if (audience.type === 'all') {
    matched = data.clients.filter((c) => !c.deletedAt)
  } else if (audience.type === 'segments') {
    const ids = new Set<ID>()
    for (const segId of audience.segmentIds) {
      const seg = data.segments.find((s) => s.id === segId)
      if (seg) clientsInSegment(data, seg, stats).forEach((c) => ids.add(c.id))
    }
    matched = data.clients.filter((c) => ids.has(c.id))
  } else {
    const ids = new Set(audience.clientIds)
    matched = data.clients.filter((c) => ids.has(c.id) && !c.deletedAt)
  }
  const eligible = matched.filter((c) => !c.blocked && (channel === 'email' ? c.marketing.email && Boolean(c.email) : c.marketing.sms && Boolean(c.phone)))
  return { matched, eligible }
}

export const campaignCost = (recipients: number, channel: Campaign['channel']) => round2(recipients * RATES[channel])

export async function saveCampaign(draft: CampaignDraft, id?: ID): Promise<Campaign> {
  await latency()
  const data = db()
  const { eligible } = campaignAudience(data, draft.audience, draft.channel)
  const recipients = eligible.length
  const cost = campaignCost(recipients, draft.channel)
  if (id) {
    const existing = data.campaigns.find((c) => c.id === id)
    if (!existing) throw new ApiError('not_found', 'Campaign not found')
    if (existing.status !== 'draft') throw new ApiError('locked', 'Only draft campaigns can be edited')
    commit((d) => {
      const c = d.campaigns.find((x) => x.id === id)!
      Object.assign(c, draft, { recipients, cost })
    })
    return db().campaigns.find((c) => c.id === id)!
  }
  const record: Campaign = {
    id: uid('cmp'),
    ...draft,
    status: 'draft',
    createdAt: nowISO(),
    recipients,
    cost,
    stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bookings: 0, revenue: 0 },
  }
  commit((d) => {
    d.campaigns.unshift(record)
  })
  return record
}

export async function deleteCampaign(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.campaigns = d.campaigns.filter((c) => c.id !== id)
  })
}

export async function duplicateCampaign(id: ID): Promise<Campaign> {
  await latency()
  const source = db().campaigns.find((c) => c.id === id)
  if (!source) throw new ApiError('not_found', 'Campaign not found')
  const copy: Campaign = {
    ...source,
    id: uid('cmp'),
    name: `${source.name} (copy)`,
    status: 'draft',
    scheduledAt: undefined,
    sentAt: undefined,
    createdAt: nowISO(),
    stats: { sent: 0, delivered: 0, opened: 0, clicked: 0, bookings: 0, revenue: 0 },
  }
  commit((d) => {
    d.campaigns.unshift(copy)
  })
  return copy
}

export const blastBillingReady = () => addOnActive(db().addOns, 'blast-marketing')

/** Send a draft: it goes to review (Pending) until approved. */
export async function submitCampaign(id: ID): Promise<Campaign> {
  await latency(500, 900)
  const data = db()
  if (!addOnActive(data.addOns, 'blast-marketing')) throw new ApiError('billing_required', 'Add your payment method and billing details first')
  const campaign = data.campaigns.find((c) => c.id === id)
  if (!campaign) throw new ApiError('not_found', 'Campaign not found')
  const { eligible } = campaignAudience(data, campaign.audience, campaign.channel)
  if (!eligible.length) throw new ApiError('no_recipients', 'This audience has no clients who agreed to receive marketing')
  commit((d) => {
    const c = d.campaigns.find((x) => x.id === id)!
    c.status = 'pending'
    c.recipients = eligible.length
    c.cost = campaignCost(eligible.length, c.channel)
    if (c.scheduledAt && c.scheduledAt <= nowISO()) c.scheduledAt = undefined
  })
  return db().campaigns.find((c) => c.id === id)!
}

function campaignMessageBody(c: Campaign, data: DbData, firstName: string): string {
  const deal = c.dealId ? data.deals.find((x) => x.id === c.dealId) : undefined
  const dealLine = deal ? `\n\n${deal.name}${deal.code ? ` · use code ${deal.code}` : ''}` : ''
  if (c.channel === 'sms') return `${c.body}${deal?.code ? ` Code ${deal.code}.` : ''} Reply STOP to opt out.`
  return `Hi ${firstName},\n\n${c.heading ? `${c.heading}\n\n` : ''}${c.body}${dealLine}${c.buttonLabel ? `\n\n[${c.buttonLabel}]` : ''}\n\n${data.workspace.name}`
}

/** Deliver now: sample outbox messages + performance stats. */
function deliverCampaign(id: ID) {
  const data = db()
  const c = data.campaigns.find((x) => x.id === id)
  if (!c) return
  const { eligible } = campaignAudience(data, c.audience, c.channel)
  const recipients = eligible.length || c.recipients
  const rand = seededRandom(c.id)
  const delivered = Math.round(recipients * (0.95 + rand() * 0.04))
  const opened = Math.round(delivered * (c.channel === 'email' ? 0.42 + rand() * 0.2 : 0.85 + rand() * 0.1))
  const clicked = Math.round(opened * (0.18 + rand() * 0.14))
  const bookings = Math.max(recipients ? 1 : 0, Math.round(clicked * (0.2 + rand() * 0.15)))
  const revenue = Math.round(bookings * (38 + rand() * 30))
  const sample = eligible.slice(0, 25)
  queueMany(
    sample.map((client, i) => ({
      clientId: client.id,
      to: c.channel === 'email' ? client.email : client.phone,
      toName: `${client.firstName} ${client.lastName}`,
      channel: c.channel,
      type: 'campaign' as const,
      subject: c.channel === 'email' ? c.subject || c.name : c.name,
      body: campaignMessageBody(c, data, client.firstName),
      campaignId: c.id,
      status: i < Math.round(sample.length * (opened / Math.max(1, recipients))) ? ('opened' as const) : ('delivered' as const),
    })),
  )
  commit((d) => {
    const x = d.campaigns.find((y) => y.id === id)!
    x.status = 'sent'
    x.sentAt = nowISO()
    x.recipients = recipients
    x.cost = campaignCost(recipients, x.channel)
    x.stats = { sent: recipients, delivered, opened, clicked, bookings, revenue }
  })
}

/**
 * Called by the demo panel's "blast campaign approved after review" event.
 * Pending → Scheduled when `scheduledAt` is in the future, otherwise Sent
 * (queues up to 25 sample outbox messages and fills the stats).
 */
export async function approvePendingCampaign(campaignId: ID): Promise<Campaign['status']> {
  await latency()
  const campaign = db().campaigns.find((c) => c.id === campaignId)
  if (!campaign) throw new ApiError('not_found', 'Campaign not found')
  if (campaign.status !== 'pending') return campaign.status
  if (campaign.scheduledAt && campaign.scheduledAt > nowISO()) {
    commit((d) => {
      d.campaigns.find((c) => c.id === campaignId)!.status = 'scheduled'
    })
    return 'scheduled'
  }
  deliverCampaign(campaignId)
  return 'sent'
}

/** Scheduled campaigns whose time has come are sent (supports time travel). */
export async function processDueCampaigns(): Promise<number> {
  const due = db().campaigns.filter((c) => c.status === 'scheduled' && c.scheduledAt && c.scheduledAt <= nowISO())
  if (!due.length) return 0
  await latency(100, 200)
  due.forEach((c) => deliverCampaign(c.id))
  return due.length
}

export async function sendScheduledNow(id: ID): Promise<void> {
  await latency()
  deliverCampaign(id)
}

export async function cancelSchedule(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.campaigns.find((x) => x.id === id)
    if (c) {
      c.status = 'draft'
      c.scheduledAt = undefined
    }
  })
}

export interface BlastBillingInput {
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

/** Blast marketing billing onboarding (fees overview → payment and billing). */
export async function saveBlastBilling(input: BlastBillingInput): Promise<void> {
  await latency(700, 1100)
  const digits = input.cardNumber.replace(/\D/g, '')
  commit((d) => {
    upsertAddOn(d, 'blast-marketing', 'active')
    d.workspace.plan.billingDetails = {
      accountType: input.accountType,
      firstName: input.firstName,
      lastName: input.lastName,
      businessName: input.businessName,
      address: input.address,
      vatNumber: input.vatNumber || undefined,
    }
  })
  marketingLocal()
  useMarketingLocal.setState({ billingCard: { brand: digits.startsWith('5') ? 'Mastercard' : 'Visa', last4: digits.slice(-4) } })
}

// ─── Automations ───────────────────────────────────────────────────────────

const AUTOMATION_DEFAULTS: Record<string, Pick<Automation, 'channels' | 'trigger'>> = {
  'reminder-3d': { channels: { email: true, sms: false, whatsapp: false }, trigger: '3 days' },
  'reminder-24h': { channels: { email: true, sms: true, whatsapp: true }, trigger: '24 hours' },
  'reminder-1h': { channels: { email: false, sms: true, whatsapp: true }, trigger: '1 hour' },
  rebook: { channels: { email: true, sms: false, whatsapp: false }, trigger: '4 weeks' },
  birthday: { channels: { email: true, sms: false, whatsapp: false }, trigger: '7 days' },
  'win-back': { channels: { email: true, sms: false, whatsapp: false }, trigger: '60 days' },
  'reward-loyal': { channels: { email: true, sms: false, whatsapp: false }, trigger: '€500' },
  welcome: { channels: { email: true, sms: false, whatsapp: false }, trigger: '1 day' },
}

export async function setAutomationEnabled(id: ID, enabled: boolean): Promise<void> {
  await latency()
  commit((d) => {
    const a = d.automations.find((x) => x.id === id)
    if (!a) throw new ApiError('not_found', 'Automation not found')
    a.enabled = enabled
    if (enabled && !a.channels.email && !a.channels.sms && !a.channels.whatsapp) a.channels.email = true
    a.updatedAt = nowISO()
  })
}

export type AutomationPatch = Partial<Pick<Automation, 'name' | 'description' | 'channels' | 'trigger' | 'smsOperator' | 'content' | 'enabled'>>

export async function updateAutomation(id: ID, patch: AutomationPatch): Promise<void> {
  await latency()
  commit((d) => {
    const a = d.automations.find((x) => x.id === id)
    if (!a) throw new ApiError('not_found', 'Automation not found')
    Object.assign(a, patch, { updatedAt: nowISO() })
  })
}

export async function resetAutomation(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const a = d.automations.find((x) => x.id === id)
    if (!a) return
    const defaults = AUTOMATION_DEFAULTS[a.key]
    if (defaults) {
      a.channels = { ...defaults.channels }
      a.trigger = defaults.trigger
    }
    a.smsOperator = 'and'
    a.content = { importantInfo: '', displayPrice: true }
    a.updatedAt = nowISO()
  })
}

export async function removeAutomation(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.automations = d.automations.filter((a) => a.id !== id)
  })
}

export interface NewAutomationInput {
  name: string
  description: string
  section: Automation['section']
  trigger: string
  channels: Automation['channels']
}

export async function createAutomation(input: NewAutomationInput): Promise<Automation> {
  await latency()
  const at = nowISO()
  const record: Automation = {
    id: uid('auto'),
    key: `custom-${uid('c').slice(2)}`,
    section: input.section,
    name: input.name,
    description: input.description,
    enabled: true,
    marketing: true,
    channels: input.channels,
    trigger: input.trigger,
    smsOperator: 'and',
    content: { importantInfo: '', displayPrice: true },
    createdAt: at,
    updatedAt: at,
  }
  commit((d) => {
    d.automations.push(record)
  })
  return record
}

/** Communication balance top-up, charged to the card on file. */
export async function topUpBalance(amount: number): Promise<number> {
  await latency(700, 1100)
  if (!(amount > 0)) throw new ApiError('invalid', 'Choose an amount')
  commit((d) => {
    d.workspace.messageCredits = round2(d.workspace.messageCredits + amount)
    addInvoice(d, 'Communication balance top-up', amount)
  })
  return db().workspace.messageCredits
}

export async function setAutoTopUp(enabled: boolean, config?: { threshold: number; amount: number }): Promise<void> {
  await latency()
  commit((d) => upsertAddOn(d, 'auto-top-up', enabled ? 'active' : 'inactive'))
  marketingLocal()
  if (config) useMarketingLocal.setState({ autoTopUp: config })
}

export async function saveAdvancedOptions(advanced: MarketingLocal['advanced']): Promise<void> {
  await latency()
  marketingLocal()
  useMarketingLocal.setState({ advanced })
}

// ─── Deals ─────────────────────────────────────────────────────────────────

export type DealDraft = Omit<Deal, 'id' | 'createdAt' | 'uses' | 'salesTotal' | 'status'>

export async function saveDeal(draft: DealDraft, id?: ID): Promise<Deal> {
  await latency()
  const data = db()
  const code = draft.code?.trim().toUpperCase() || undefined
  if (code && data.deals.some((x) => x.id !== id && x.status !== 'archived' && x.code?.toUpperCase() === code)) {
    throw new ApiError('code_taken', 'This discount code is already used by another deal')
  }
  if (id) {
    commit((d) => {
      const deal = d.deals.find((x) => x.id === id)
      if (!deal) throw new ApiError('not_found', 'Deal not found')
      Object.assign(deal, draft, { code })
    })
    return db().deals.find((x) => x.id === id)!
  }
  const record: Deal = { ...draft, code, id: uid('deal'), status: 'active', createdAt: nowISO(), uses: 0, salesTotal: 0 }
  commit((d) => {
    d.deals.unshift(record)
  })
  return record
}

export async function setDealStatus(id: ID, status: Deal['status']): Promise<void> {
  await latency()
  commit((d) => {
    const deal = d.deals.find((x) => x.id === id)
    if (deal) deal.status = status
  })
}

export async function duplicateDeal(id: ID): Promise<Deal> {
  await latency()
  const source = db().deals.find((x) => x.id === id)
  if (!source) throw new ApiError('not_found', 'Deal not found')
  const copy: Deal = {
    ...source,
    id: uid('deal'),
    name: `${source.name} (copy)`,
    code: source.code ? `${source.code}COPY` : undefined,
    status: 'inactive',
    createdAt: nowISO(),
    uses: 0,
    salesTotal: 0,
  }
  commit((d) => {
    d.deals.unshift(copy)
  })
  return copy
}

// ─── Smart pricing ─────────────────────────────────────────────────────────

export type SmartPricingInput = Pick<SmartPricing, 'teamMemberIds' | 'serviceIds' | 'rules'>

export async function saveSmartPricing(input: SmartPricingInput): Promise<void> {
  await latency()
  commit((d) => {
    d.smartPricing = { ...input, configured: true, status: 'active' }
  })
}

export async function setSmartPricingStatus(status: SmartPricing['status']): Promise<void> {
  await latency()
  commit((d) => {
    d.smartPricing.status = status
  })
}

export async function clearSmartPricing(): Promise<void> {
  await latency()
  commit((d) => {
    d.smartPricing = { configured: false, status: 'active', teamMemberIds: 'all', serviceIds: 'all', rules: {} }
  })
}

/** Name of the person acting, for activity lines shown in marketing pages. */
export const marketingActor = () => actorName()
