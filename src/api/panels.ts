import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { del, get, set } from 'idb-keyval'
import { addMinutes } from 'date-fns'
import { commit, db, useDb } from '@/store/db'
import { useSessionStore } from '@/store/session'
import type { ID, Review } from '@/types'
import { uid } from '@/lib/ids'
import { now, nowISO } from '@/lib/time'
import { money2, round2 } from '@/lib/format'
import { ApiError, actorName, latency } from './client'
import { pushNotification, queueMessage } from './messaging'
import { logout } from './auth'

/**
 * Top-bar panels, Help, Client Connect inbox and the account area.
 *
 * Records the shared data model has no collection for (online profile,
 * notification preferences, support tickets, live chat, login sessions,
 * referrals…) live in a small persisted store of their own, keyed by user.
 * It resets together with the demo (Reset demo changes meta.seededAt).
 * Everything else (users, conversations, wallet, payouts, notifications,
 * linked calendars, review replies) is written to the main store.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube' | 'pinterest' | 'linkedin' | 'website'

export interface SocialLink {
  platform: SocialPlatform
  handle: string
}

export interface PortfolioImage {
  id: ID
  src: string
  name: string
  at: string
}

export interface OnlineProfile {
  displayName: string
  headline: string
  about: string
  avatar?: string
  languages: string[]
  interests: string[]
  socials: SocialLink[]
  portfolio: PortfolioImage[]
  portfolioStarted: boolean
  hidden: boolean
}

export type PrefChannel = 'email' | 'push' | 'inApp'
export type PrefSectionKey = 'appointments' | 'sales' | 'reviews' | 'messaging' | 'inventory' | 'insights'

export interface PrefRowDef {
  key: string
  channels: PrefChannel[]
  defaults: Partial<Record<PrefChannel, boolean>>
  /** Row has an "Edit" link for a sub-setting. */
  edit?: 'statuses' | 'tipsScope' | 'reviewsScope' | 'lowStockFrequency'
}

export interface PrefGroupDef {
  key?: string
  rows: PrefRowDef[]
}

export interface PrefSectionDef {
  key: PrefSectionKey
  groups: PrefGroupDef[]
}

const all3: PrefChannel[] = ['email', 'push', 'inApp']
const push2: PrefChannel[] = ['push', 'inApp']
const on2 = { push: true, inApp: true }

/** Notification preferences (profile-and-personal-settings.md §5.1). */
export const PREF_SCHEMA: PrefSectionDef[] = [
  {
    key: 'appointments',
    groups: [
      {
        key: 'clientActivity',
        rows: [
          { key: 'newAppointment', channels: push2, defaults: on2 },
          { key: 'appointmentConfirmed', channels: push2, defaults: { push: false, inApp: false } },
          { key: 'clientReschedules', channels: push2, defaults: on2 },
          { key: 'clientCancellations', channels: push2, defaults: on2 },
          { key: 'clientWaitlist', channels: push2, defaults: on2 },
        ],
      },
      {
        key: 'teamActivity',
        rows: [
          { key: 'teamNew', channels: push2, defaults: on2 },
          { key: 'teamReschedules', channels: push2, defaults: on2 },
          { key: 'teamCancellations', channels: push2, defaults: on2 },
          { key: 'teamNoShows', channels: push2, defaults: on2 },
          { key: 'teamStatusUpdates', channels: push2, defaults: { push: false, inApp: false }, edit: 'statuses' },
          { key: 'teamWaitlist', channels: push2, defaults: on2 },
        ],
      },
    ],
  },
  {
    key: 'sales',
    groups: [
      {
        rows: [
          { key: 'onlineProductSales', channels: all3, defaults: { email: true, push: true, inApp: true } },
          { key: 'onlineMembershipSales', channels: push2, defaults: on2 },
          { key: 'tips', channels: push2, defaults: on2, edit: 'tipsScope' },
        ],
      },
    ],
  },
  { key: 'reviews', groups: [{ rows: [{ key: 'newReview', channels: push2, defaults: on2, edit: 'reviewsScope' }] }] },
  {
    key: 'messaging',
    groups: [
      { key: 'clientConnect', rows: [{ key: 'newClientMessage', channels: all3, defaults: { email: true, push: true, inApp: true } }] },
      {
        key: 'teamConnect',
        rows: [
          { key: 'directMessages', channels: push2, defaults: on2 },
          { key: 'mentions', channels: push2, defaults: on2 },
          { key: 'threadReplies', channels: push2, defaults: on2 },
          { key: 'channelMessage', channels: push2, defaults: on2 },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    groups: [
      {
        rows: [
          { key: 'lowStockAlerts', channels: push2, defaults: on2 },
          { key: 'lowStockSummary', channels: push2, defaults: on2, edit: 'lowStockFrequency' },
        ],
      },
    ],
  },
  {
    key: 'insights',
    groups: [
      {
        rows: [
          { key: 'dailySummary', channels: ['email'], defaults: { email: true } },
          { key: 'weeklySummary', channels: ['email'], defaults: { email: true } },
          { key: 'monthlySummary', channels: ['email'], defaults: { email: true } },
        ],
      },
    ],
  },
]

export interface NotificationPrefs {
  locationId: 'all' | ID
  scope: 'all' | 'me'
  sections: Record<PrefSectionKey, boolean>
  rows: Record<string, Partial<Record<PrefChannel, boolean>>>
  /** Appointment statuses that trigger "Appointment status updates" (empty = all). */
  statuses: string[]
  tipsScope: 'anyone' | 'me'
  reviewsScope: 'anyone' | 'me'
  lowStockFrequency: 'daily' | 'weekly' | 'monthly'
}

export function defaultPrefs(): NotificationPrefs {
  const rows: NotificationPrefs['rows'] = {}
  PREF_SCHEMA.forEach((s) => s.groups.forEach((g) => g.rows.forEach((r) => (rows[r.key] = { ...r.defaults }))))
  return {
    locationId: 'all',
    scope: 'all',
    sections: { appointments: true, sales: true, reviews: true, messaging: true, inventory: true, insights: true },
    rows,
    statuses: [],
    tipsScope: 'anyone',
    reviewsScope: 'anyone',
    lowStockFrequency: 'weekly',
  }
}

/** Number of notification settings switched on (sections that are off don't count). */
export function countPrefsOn(prefs: NotificationPrefs): number {
  let count = 0
  PREF_SCHEMA.forEach((s) => {
    if (!prefs.sections[s.key]) return
    s.groups.forEach((g) => g.rows.forEach((r) => r.channels.forEach((c) => prefs.rows[r.key]?.[c] && count++)))
  })
  return count
}

export interface SupportTicket {
  id: ID
  ref: string
  userId: ID
  email: string
  reason: string
  description: string
  files: { name: string; size: number }[]
  at: string
  status: 'open' | 'solved'
}

export interface ChatMessage {
  id: ID
  from: 'agent' | 'user' | 'system'
  /** Free text (user messages). */
  text?: string
  /** i18n key for agent/system messages, rendered by the UI. */
  key?: string
  vars?: Record<string, string>
  at: string
}

export interface LiveChat {
  status: 'idle' | 'connecting' | 'active' | 'ended'
  agent: string | null
  messages: ChatMessage[]
}

export interface LoginSession {
  id: ID
  device: string
  current: boolean
  signedInAt: string
}

export interface Referral {
  id: ID
  email: string
  message: string
  at: string
  status: 'invited' | 'signed_up'
}

export interface AccessCode {
  code: string
  expiresAt: string
}

interface PanelsData {
  seededAt: string
  profiles: Record<ID, OnlineProfile>
  prefs: Record<ID, NotificationPrefs>
  tickets: SupportTicket[]
  chat: LiveChat
  sessions: Record<ID, LoginSession[]>
  logins: Record<ID, { google: boolean; apple: boolean }>
  verifiedPhones: Record<ID, string>
  pendingPhoneCode: Record<ID, string>
  inboxIntroSeen: Record<ID, boolean>
  inboxTourDone: Record<ID, boolean>
  referrals: Referral[]
  newsRead: string[]
  newsActions: string[]
  guidesCompleted: string[]
  accessCode: AccessCode | null
}

interface PanelsState extends PanelsData {
  /** Not persisted: the support agent is typing. */
  chatTyping: boolean
}

const initialData = (): PanelsData => ({
  seededAt: '',
  profiles: {},
  prefs: {},
  tickets: [],
  chat: { status: 'idle', agent: null, messages: [] },
  sessions: {},
  logins: {},
  verifiedPhones: {},
  pendingPhoneCode: {},
  inboxIntroSeen: {},
  inboxTourDone: {},
  referrals: [],
  newsRead: [],
  newsActions: [],
  guidesCompleted: [],
  accessCode: null,
})

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value)
  },
  removeItem: async (name) => {
    await del(name)
  },
}

/** Section-local persisted records (read with `usePanels(selector)`; written only by the functions below). */
export const usePanels = create<PanelsState>()(
  persist((): PanelsState => ({ ...initialData(), chatTyping: false }), {
    name: 'ib-panels',
    version: 1,
    storage: createJSONStorage(() => (typeof indexedDB === 'undefined' ? localStorage : idbStorage)),
    partialize: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { chatTyping, ...data } = state
      return data as PanelsState
    },
    onRehydrateStorage: () => () => syncWithSeed(),
  }),
)

/** Reset demo creates a new seed: start these records over too. */
function syncWithSeed() {
  const seededAt = db().meta?.seededAt
  if (!seededAt || !usePanels.persist.hasHydrated()) return
  const current = usePanels.getState().seededAt
  if (current === seededAt) return
  if (current) usePanels.setState({ ...initialData(), seededAt, chatTyping: false })
  else usePanels.setState({ seededAt })
}
useDb.subscribe(syncWithSeed)

const patch = (fn: (s: PanelsState) => Partial<PanelsState>) => usePanels.setState((s) => fn(s))

const currentUserId = () => useSessionStore.getState().currentUserId
const userById = (id: ID) => db().users.find((u) => u.id === id)

// ─── Online profile & portfolio ───────────────────────────────────────────

export function defaultProfile(userId: ID): OnlineProfile {
  const user = userById(userId)
  return {
    displayName: user ? `${user.firstName} ${user.lastName}` : '',
    headline: '',
    about: '',
    languages: [],
    interests: [],
    socials: [],
    portfolio: [],
    portfolioStarted: false,
    hidden: false,
  }
}

const profileOf = (s: PanelsData, userId: ID) => s.profiles[userId] ?? defaultProfile(userId)

export async function saveOnlineProfile(userId: ID, changes: Partial<OnlineProfile>): Promise<void> {
  await latency()
  if (changes.displayName !== undefined && !changes.displayName.trim()) throw new ApiError('invalid', 'Display name is required')
  if (changes.headline && changes.headline.length > 64) throw new ApiError('invalid', 'Headline is too long')
  if (changes.about && changes.about.length > 400) throw new ApiError('invalid', 'About you is too long')
  if (changes.interests && changes.interests.length > 10) throw new ApiError('invalid', 'Pick up to 10 interests')
  patch((s) => ({ profiles: { ...s.profiles, [userId]: { ...profileOf(s, userId), ...changes } } }))
}

export async function setProfileHidden(userId: ID, hidden: boolean): Promise<void> {
  await latency()
  patch((s) => ({ profiles: { ...s.profiles, [userId]: { ...profileOf(s, userId), hidden } } }))
}

export async function startPortfolio(userId: ID): Promise<void> {
  await latency(150, 300)
  patch((s) => ({ profiles: { ...s.profiles, [userId]: { ...profileOf(s, userId), portfolioStarted: true } } }))
}

/** Downscale an image file to a JPEG data URL so it fits in browser storage. */
export async function imageToDataUrl(file: File, max = 900, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ApiError('bad_image', `${file.name} is not an image`)
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new ApiError('bad_image', `${file.name} could not be read`))
      el.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const PORTFOLIO_LIMIT = 24

export async function addPortfolioImages(userId: ID, files: File[]): Promise<number> {
  const existing = profileOf(usePanels.getState(), userId).portfolio.length
  if (existing + files.length > PORTFOLIO_LIMIT) throw new ApiError('limit', `You can add up to ${PORTFOLIO_LIMIT} images`)
  const images: PortfolioImage[] = []
  for (const file of files) images.push({ id: uid('pf'), src: await imageToDataUrl(file), name: file.name, at: nowISO() })
  await latency()
  patch((s) => {
    const p = profileOf(s, userId)
    return { profiles: { ...s.profiles, [userId]: { ...p, portfolioStarted: true, portfolio: [...images, ...p.portfolio] } } }
  })
  return images.length
}

export async function removePortfolioImage(userId: ID, imageId: ID): Promise<void> {
  await latency(150, 300)
  patch((s) => {
    const p = profileOf(s, userId)
    return { profiles: { ...s.profiles, [userId]: { ...p, portfolio: p.portfolio.filter((i) => i.id !== imageId) } } }
  })
}

// ─── Notification preferences ─────────────────────────────────────────────

export async function saveNotificationPrefs(userId: ID, prefs: NotificationPrefs): Promise<void> {
  await latency()
  patch((s) => ({ prefs: { ...s.prefs, [userId]: prefs } }))
}

// ─── Personal info, login & security ──────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function updatePersonalInfo(userId: ID, info: { firstName: string; lastName: string; phone: string; email: string }): Promise<void> {
  await latency()
  const email = info.email.trim().toLowerCase()
  if (!info.firstName.trim() || !info.lastName.trim()) throw new ApiError('invalid', 'First and last name are required')
  if (!EMAIL_RE.test(email)) throw new ApiError('invalid_email', 'Enter a valid email address')
  if (db().users.some((u) => u.id !== userId && u.email === email)) throw new ApiError('email_taken', 'This email address is already used by another login')
  const before = userById(userId)
  commit((d) => {
    const u = d.users.find((x) => x.id === userId)
    if (!u) return
    u.firstName = info.firstName.trim()
    u.lastName = info.lastName.trim()
    u.phone = info.phone.trim() || undefined
    u.email = email
  })
  if (before && before.phone !== info.phone.trim()) patch((s) => ({ verifiedPhones: omit(s.verifiedPhones, userId) }))
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

/** Texts a 6-digit code to the user's mobile (lands in the demo outbox). */
export async function sendPhoneVerification(userId: ID): Promise<void> {
  await latency()
  const user = userById(userId)
  if (!user?.phone) throw new ApiError('no_phone', 'Add a mobile number first')
  const code = String(100000 + Math.floor(Math.random() * 900000))
  patch((s) => ({ pendingPhoneCode: { ...s.pendingPhoneCode, [userId]: code } }))
  queueMessage({ clientId: null, to: user.phone, toName: `${user.firstName} ${user.lastName}`, channel: 'sms', type: 'other', subject: 'Verification code', body: `Innoweb Bookings: your verification code is ${code}. It expires in 10 minutes.` })
}

export async function verifyPhone(userId: ID, code: string): Promise<void> {
  await latency()
  const expected = usePanels.getState().pendingPhoneCode[userId]
  if (!expected || expected !== code.trim()) throw new ApiError('invalid_code', 'That code is not right. Check the latest text message and try again.')
  const phone = userById(userId)?.phone ?? ''
  patch((s) => ({ verifiedPhones: { ...s.verifiedPhones, [userId]: phone }, pendingPhoneCode: omit(s.pendingPhoneCode, userId) }))
}

export function thisDeviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS'
  return `${browser} • ${os}`
}

export function defaultSessions(): LoginSession[] {
  const seeded = db().meta?.seededAt ?? nowISO()
  return [
    { id: 'this', device: thisDeviceLabel(), current: true, signedInAt: seeded },
    { id: 'ses_unknown', device: '', current: false, signedInAt: seeded },
    { id: 'ses_iphone', device: 'Safari • iOS', current: false, signedInAt: addMinutes(new Date(seeded), -1440).toISOString() },
  ]
}

export async function signOutSession(userId: ID, sessionId: ID): Promise<void> {
  await latency()
  patch((s) => ({ sessions: { ...s.sessions, [userId]: (s.sessions[userId] ?? defaultSessions()).filter((x) => x.id !== sessionId) } }))
}

/** Ends every session, including this one. */
export async function signOutAllDevices(userId: ID): Promise<void> {
  await latency()
  patch((s) => ({ sessions: { ...s.sessions, [userId]: defaultSessions().filter((x) => x.current) } }))
  await logout()
}

export async function setSocialLogin(userId: ID, provider: 'google' | 'apple', connected: boolean): Promise<void> {
  await latency(700, 1200)
  patch((s) => ({ logins: { ...s.logins, [userId]: { ...(s.logins[userId] ?? { google: true, apple: false }), [provider]: connected } } }))
}

// ─── Linked calendars & reviews ───────────────────────────────────────────

export async function linkCalendar(teamMemberId: ID, name: string, url: string): Promise<void> {
  await latency(800, 1400)
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === teamMemberId)
    if (!m) throw new ApiError('not_found', 'Team member not found')
    m.linkedCalendars.push({ id: uid('cal'), name, url, createdAt: nowISO() })
  })
}

export async function unlinkCalendar(teamMemberId: ID, calendarId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === teamMemberId)
    if (m) m.linkedCalendars = m.linkedCalendars.filter((c) => c.id !== calendarId)
  })
}

export async function replyToReview(reviewId: ID, text: string): Promise<void> {
  await latency()
  if (!text.trim()) throw new ApiError('invalid', 'Write a reply first')
  commit((d) => {
    const r = d.reviews.find((x) => x.id === reviewId) as Review | undefined
    if (r) r.reply = { text: text.trim(), at: nowISO() }
  })
}

// ─── Client Connect inbox ─────────────────────────────────────────────────

export async function markConversationRead(id: ID, unread = false): Promise<void> {
  await latency(80, 160)
  commit((d) => {
    const c = d.conversations.find((x) => x.id === id)
    if (c) c.unread = unread
  })
}

function deliverToClient(clientId: ID, text: string) {
  const data = db()
  const client = data.clients.find((c) => c.id === clientId)
  if (!client) return
  const base = { clientId, toName: `${client.firstName} ${client.lastName}`, type: 'chat' as const, subject: `New message from ${data.workspace.name}`, body: text }
  if (client.phone) queueMessage({ ...base, channel: 'sms', to: client.phone })
  else if (client.email) queueMessage({ ...base, channel: 'email', to: client.email })
}

export async function sendConversationMessage(conversationId: ID, text: string): Promise<void> {
  const body = text.trim()
  if (!body) throw new ApiError('empty', 'Type a message first')
  await latency(200, 450)
  const at = nowISO()
  let clientId: ID | undefined
  commit((d) => {
    const c = d.conversations.find((x) => x.id === conversationId)
    if (!c) throw new ApiError('not_found', 'Conversation not found')
    c.messages.push({ id: uid('cm'), from: 'business', text: body, at, by: actorName() })
    c.unread = false
    c.status = 'open'
    c.updatedAt = at
    clientId = c.clientId
  })
  if (clientId) deliverToClient(clientId, body)
}

/** New message to a client: reuses their conversation if one exists. Returns the conversation id. */
export async function startConversation(clientId: ID, text: string): Promise<ID> {
  const existing = db().conversations.find((c) => c.clientId === clientId)
  if (existing) {
    await sendConversationMessage(existing.id, text)
    return existing.id
  }
  const body = text.trim()
  if (!body) throw new ApiError('empty', 'Type a message first')
  await latency()
  const at = nowISO()
  const id = uid('cv')
  commit((d) => {
    d.conversations.unshift({ id, clientId, status: 'open', unread: false, updatedAt: at, messages: [{ id: uid('cm'), from: 'business', text: body, at, by: actorName() }] })
  })
  deliverToClient(clientId, body)
  return id
}

export async function setConversationStatus(id: ID, status: 'open' | 'closed'): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.conversations.find((x) => x.id === id)
    if (c) {
      c.status = status
      if (status === 'closed') c.unread = false
    }
  })
}

export async function deleteConversationMessage(conversationId: ID, messageId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.conversations.find((x) => x.id === conversationId)
    if (c) c.messages = c.messages.filter((m) => m.id !== messageId)
  })
}

export function dismissInboxIntro(userId: ID): void {
  patch((s) => ({ inboxIntroSeen: { ...s.inboxIntroSeen, [userId]: true } }))
}

export function finishInboxTour(userId: ID): void {
  patch((s) => ({ inboxTourDone: { ...s.inboxTourDone, [userId]: true } }))
}

// ─── Notifications ────────────────────────────────────────────────────────

export async function markNotificationRead(id: ID): Promise<void> {
  await latency(50, 120)
  commit((d) => {
    const n = d.notifications.find((x) => x.id === id)
    if (n) n.read = true
  })
}

// ─── Wallet ───────────────────────────────────────────────────────────────

/** Instant payout fee: 1% (min €0.50). */
export const instantPayoutFee = (amount: number) => round2(Math.max(0.5, amount * 0.01))

/** "Pay out now": sends the available balance to the bank account; it lands a few seconds later. */
export async function instantPayout(): Promise<{ amount: number; fee: number }> {
  await latency(700, 1100)
  const wallet = db().wallet
  const available = round2(wallet.available)
  if (available <= 0.5) throw new ApiError('empty', 'There is nothing available to pay out')
  const fee = instantPayoutFee(available)
  const amount = round2(available - fee)
  const id = uid('po')
  const bankLast4 = db().payouts[0]?.bankLast4 ?? '4417'
  commit((d) => {
    d.payouts.unshift({ id, amount, at: nowISO(), status: 'in_transit', bankLast4 })
    d.wallet.balance = round2(d.wallet.balance - available)
    d.wallet.available = 0
    d.wallet.transactions.unshift(
      { id: uid('wt'), at: nowISO(), type: 'fee', description: 'Instant payout fee', amount: -fee },
      { id: uid('wt'), at: nowISO(), type: 'payout', description: `Instant payout to bank account ending ${bankLast4}`, amount: -amount },
    )
  })
  window.setTimeout(() => {
    commit((d) => {
      const p = d.payouts.find((x) => x.id === id)
      if (p) p.status = 'paid'
    })
    pushNotification({ tab: 'actions', title: 'Payout completed', body: `${money2(amount)} was sent to your bank account ending ${bankLast4}.`, link: '/dashboard?drawer=wallet&tab=accounts' })
  }, 6000)
  return { amount, fee }
}

// ─── Referrals ────────────────────────────────────────────────────────────

export const referralCode = (userId: ID) => `${(userById(userId)?.firstName ?? 'innoweb').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}-${userId.replace(/[^a-z0-9]/gi, '').slice(-5).toLowerCase()}`
export const referralLink = (userId: ID) => `https://innoweb.app/r/${referralCode(userId)}`

export async function sendReferralInvite(email: string, message: string): Promise<void> {
  await latency()
  const to = email.trim().toLowerCase()
  if (!EMAIL_RE.test(to)) throw new ApiError('invalid_email', 'Enter a valid email address')
  if (usePanels.getState().referrals.some((r) => r.email === to)) throw new ApiError('duplicate', 'You already invited this business')
  const userId = currentUserId() ?? ''
  const user = userById(userId)
  const sender = user ? `${user.firstName} ${user.lastName}` : 'A friend'
  queueMessage({
    clientId: null,
    to,
    toName: to,
    channel: 'email',
    type: 'invite',
    subject: `${sender} invited you to try Innoweb Bookings`,
    body: `${message.trim() ? `${message.trim()}\n\n` : ''}${sender} from ${db().workspace.name} thinks you'll love Innoweb Bookings. Sign up with this link to get a 7-day free trial, and you'll both get up to €130 off when you start a paid plan.`,
    link: { label: 'Start your free trial', href: referralLink(userId) },
  })
  patch((s) => ({ referrals: [{ id: uid('ref'), email: to, message: message.trim(), at: nowISO(), status: 'invited' }, ...s.referrals] }))
}

// ─── Help: support tickets, access codes, live chat ───────────────────────

export async function createSupportTicket(input: { email: string; reason: string; description: string; files: { name: string; size: number }[] }): Promise<SupportTicket> {
  await latency(600, 1000)
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new ApiError('invalid_email', 'Enter a valid email address')
  const ticket: SupportTicket = {
    id: uid('tk'),
    ref: `IB-${String(Math.floor(100000 + Math.random() * 900000))}`,
    userId: currentUserId() ?? '',
    email,
    reason: input.reason,
    description: input.description.trim(),
    files: input.files,
    at: nowISO(),
    status: 'open',
  }
  patch((s) => ({ tickets: [ticket, ...s.tickets] }))
  const user = userById(ticket.userId)
  queueMessage({
    clientId: null,
    to: email,
    toName: user ? `${user.firstName} ${user.lastName}` : email,
    channel: 'email',
    type: 'other',
    subject: `We've received your request [${ticket.ref}]`,
    body: `Hi ${user?.firstName ?? 'there'},\n\nThanks for contacting Innoweb Bookings support. Your request ${ticket.ref} (${input.reason}) is with our team and we typically reply within 2 days.\n\n"${ticket.description.slice(0, 280)}${ticket.description.length > 280 ? '…' : ''}"${ticket.files.length ? `\n\nAttachments: ${ticket.files.map((f) => f.name).join(', ')}` : ''}\n\nThe Innoweb Bookings support team`,
  })
  return ticket
}

export async function generateAccessCode(): Promise<AccessCode> {
  await latency(500, 900)
  const code: AccessCode = { code: String(100000 + Math.floor(Math.random() * 900000)), expiresAt: addMinutes(now(), 30).toISOString() }
  patch(() => ({ accessCode: code }))
  return code
}

const AGENTS = ['Ana', 'Tiago', 'Carla', 'Miguel']

/** Topic the agent answers, picked from keywords in the client's message. */
const CHAT_TOPICS: { key: string; words: string[] }[] = [
  { key: 'payouts', words: ['payout', 'wallet', 'bank', 'transfer', 'balance'] },
  { key: 'payments', words: ['payment', 'card', 'terminal', 'deposit', 'refund', 'checkout', 'pay'] },
  { key: 'calendar', words: ['calendar', 'appointment', 'booking', 'book', 'reschedule', 'cancel', 'slot'] },
  { key: 'team', words: ['team', 'staff', 'shift', 'schedule', 'hours', 'commission', 'permission'] },
  { key: 'clients', words: ['client', 'customer', 'import', 'segment', 'loyalty'] },
  { key: 'marketing', words: ['campaign', 'marketing', 'sms', 'email', 'reminder', 'automation', 'deal', 'review'] },
  { key: 'billing', words: ['plan', 'billing', 'invoice', 'subscription', 'price', 'fee', 'credit'] },
  { key: 'online', words: ['online', 'marketplace', 'google', 'instagram', 'website', 'link'] },
  { key: 'thanks', words: ['thank', 'thanks', 'great', 'perfect', 'obrigad'] },
]

function chatTopic(text: string): string {
  const lower = text.toLowerCase()
  return CHAT_TOPICS.find((t) => t.words.some((w) => lower.includes(w)))?.key ?? 'default'
}

const chatMsg = (m: Omit<ChatMessage, 'id' | 'at'>): ChatMessage => ({ id: uid('chm'), at: nowISO(), ...m })

/** Opens a chat: "Finding you an expert" for a moment, then an agent joins and says hello. */
export function startLiveChat(firstName: string): void {
  const chat = usePanels.getState().chat
  if (chat.status === 'connecting' || chat.status === 'active') return
  const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)]
  patch(() => ({ chat: { status: 'connecting', agent: null, messages: [] } }))
  window.setTimeout(() => {
    patch((s) => ({
      chat: {
        status: 'active',
        agent,
        messages: [...s.chat.messages, chatMsg({ from: 'system', key: 'panels.chat.joined', vars: { agent } }), chatMsg({ from: 'agent', key: 'panels.chat.answers.greeting', vars: { name: firstName } })],
      },
    }))
  }, 2600)
}

export function sendChatMessage(text: string): void {
  const body = text.trim()
  const state = usePanels.getState()
  if (!body || state.chat.status !== 'active') return
  patch((s) => ({ chat: { ...s.chat, messages: [...s.chat.messages, chatMsg({ from: 'user', text: body })] } }))
  const topic = chatTopic(body)
  window.setTimeout(() => patch(() => ({ chatTyping: true })), 600)
  window.setTimeout(
    () => {
      if (usePanels.getState().chat.status !== 'active') return patch(() => ({ chatTyping: false }))
      patch((s) => ({ chatTyping: false, chat: { ...s.chat, messages: [...s.chat.messages, chatMsg({ from: 'agent', key: `panels.chat.answers.${topic}` })] } }))
    },
    1800 + Math.random() * 1400,
  )
}

/** Ends the chat and emails a transcript to the user. */
export async function endLiveChat(transcript: string): Promise<void> {
  await latency()
  const user = userById(currentUserId() ?? '')
  patch((s) => ({ chatTyping: false, chat: { ...s.chat, status: 'ended', messages: [...s.chat.messages, chatMsg({ from: 'system', key: 'panels.chat.ended' })] } }))
  if (user) {
    queueMessage({ clientId: null, to: user.email, toName: `${user.firstName} ${user.lastName}`, channel: 'email', type: 'other', subject: 'Your chat with Innoweb Bookings support', body: transcript })
  }
}

export function resetLiveChat(): void {
  patch(() => ({ chatTyping: false, chat: { status: 'idle', agent: null, messages: [] } }))
}

// ─── News & guides ────────────────────────────────────────────────────────

export function markNewsRead(ids: string[]): void {
  const read = usePanels.getState().newsRead
  if (ids.every((id) => read.includes(id))) return
  patch((s) => ({ newsRead: Array.from(new Set([...s.newsRead, ...ids])) }))
}

export async function setNewsAction(id: string, done: boolean): Promise<void> {
  await latency(300, 600)
  patch((s) => ({ newsActions: done ? Array.from(new Set([...s.newsActions, id])) : s.newsActions.filter((x) => x !== id) }))
}

export async function completeGuide(id: string): Promise<void> {
  await latency()
  patch((s) => ({ guidesCompleted: Array.from(new Set([...s.guidesCompleted, id])) }))
}
