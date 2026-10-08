import { addDays, addMonths, addWeeks, addYears } from 'date-fns'
import { commit, db } from '@/store/db'
import type {
  Client,
  ClientAllergy,
  ClientNote,
  ClientReward,
  ClientSegment,
  ClientTag,
  FormResponse,
  ID,
  PaletteColor,
  PatchTest,
  Review,
} from '@/types'
import { uid } from '@/lib/ids'
import { now, nowISO, todayISO, toISODate } from '@/lib/time'
import { PALETTE_ORDER } from '@/styles/palette'
import { queueMessage, pushNotification } from './messaging'
import { actorName, ApiError, latency } from './client'

/**
 * Clients domain (reference/clients.md): profiles, tags, notes, clinical
 * records, rewards, blocking, merging, CSV import, segments, review replies
 * and the Google Business Profile connection.
 */

export const IMPORTED_SOURCE_ID = 'src_imported'
export const GOOGLE_REVIEWS_SLUG = 'google-reviews'

export type ClientInput = Partial<Omit<Client, 'id' | 'createdAt'>> & Pick<Client, 'firstName'>

/** Defaults for a new client record (all channels on, as in the reference). */
export function blankClient(): Omit<Client, 'id' | 'createdAt'> {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    sourceId: 'src_walkin',
    tagIds: [],
    addresses: [],
    emergencyContacts: [],
    notifications: { email: true, sms: true, whatsapp: true },
    marketing: { email: true, sms: true, whatsapp: true },
    marketplace: false,
    allergies: [],
    patchTests: [],
    rewards: [],
    walletBalance: 0,
    files: [],
  }
}

const findClient = (id: ID) => {
  const client = db().clients.find((c) => c.id === id)
  if (!client) throw new ApiError('not_found', `Client ${id} not found`)
  return client
}

// ─── Profiles ──────────────────────────────────────────────────────────────

export async function createClient(input: ClientInput): Promise<Client> {
  await latency()
  const email = (input.email ?? '').trim().toLowerCase()
  if (email && db().clients.some((c) => !c.deletedAt && c.email.toLowerCase() === email)) {
    throw new ApiError('duplicate_email', 'A client with this email already exists')
  }
  const record: Client = { ...blankClient(), ...input, id: uid('cl'), createdAt: nowISO() }
  commit((d) => {
    d.clients.push(record)
  })
  return record
}

export async function updateClient(id: ID, patch: Partial<Omit<Client, 'id' | 'createdAt'>>): Promise<void> {
  await latency()
  findClient(id)
  const email = patch.email?.trim().toLowerCase()
  if (email && db().clients.some((c) => c.id !== id && !c.deletedAt && c.email.toLowerCase() === email)) {
    throw new ApiError('duplicate_email', 'A client with this email already exists')
  }
  commit((d) => {
    const c = d.clients.find((x) => x.id === id)
    if (!c) return
    Object.assign(c, patch)
    // Cleared optional fields (e.g. a removed photo) are dropped rather than stored as undefined.
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete (c as Partial<Client>)[key]
  })
}

/** Soft delete: the client disappears from every list (deletedAt). */
export async function deleteClients(ids: ID[]): Promise<void> {
  await latency()
  const at = nowISO()
  commit((d) => {
    d.clients.forEach((c) => {
      if (ids.includes(c.id)) {
        c.deletedAt = at
        delete c.blocked
      }
    })
  })
}

export const deleteClient = (id: ID) => deleteClients([id])

export async function blockClients(ids: ID[], reason: string): Promise<void> {
  await latency()
  const at = nowISO()
  commit((d) => {
    d.clients.forEach((c) => {
      if (ids.includes(c.id)) c.blocked = { reason, at }
    })
  })
}

export async function unblockClient(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === id)
    if (c) delete c.blocked
  })
}

// ─── Tags ──────────────────────────────────────────────────────────────────

export async function createTag(name: string): Promise<ClientTag> {
  await latency(150, 300)
  const clean = name.trim()
  const existing = db().clientTags.find((t) => t.name.toLowerCase() === clean.toLowerCase())
  if (existing) return existing
  const tags = db().clientTags
  const tag: ClientTag = { id: uid('tag'), name: clean, color: PALETTE_ORDER[(tags.length * 5) % PALETTE_ORDER.length], order: tags.length }
  commit((d) => {
    d.clientTags.push(tag)
  })
  return tag
}

/** Add tags to several clients (bulk "Add tags"). */
export async function assignTags(clientIds: ID[], tagIds: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    d.clients.forEach((c) => {
      if (!clientIds.includes(c.id)) return
      tagIds.forEach((t) => {
        if (!c.tagIds.includes(t)) c.tagIds.push(t)
      })
    })
  })
}

/** Replace one client's tags ("Manage client tags"). */
export async function setClientTags(clientId: ID, tagIds: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.tagIds = [...new Set(tagIds)]
  })
}

// ─── Alerts and clinical records ───────────────────────────────────────────

export async function setStaffAlert(clientId: ID, text: string): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (!c) return
    if (text.trim()) c.staffAlert = text.trim()
    else delete c.staffAlert
  })
}

export async function saveAllergy(clientId: ID, allergy: Omit<ClientAllergy, 'id' | 'createdAt'> & { id?: ID }): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (!c) return
    const index = allergy.id ? c.allergies.findIndex((a) => a.id === allergy.id) : -1
    if (index >= 0) c.allergies[index] = { ...c.allergies[index], ...allergy, id: c.allergies[index].id }
    else c.allergies.push({ ...allergy, id: uid('alg'), createdAt: nowISO() })
  })
}

export async function removeAllergy(clientId: ID, allergyId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.allergies = c.allergies.filter((a) => a.id !== allergyId)
  })
}

/** Patch tests expire six months after the test date. */
export const patchTestExpiry = (testedAt: string) => toISODate(addMonths(new Date(`${testedAt}T00:00:00`), 6))

export async function savePatchTest(clientId: ID, test: Omit<PatchTest, 'id' | 'expiresAt'> & { id?: ID }): Promise<void> {
  await latency()
  const record = { ...test, expiresAt: patchTestExpiry(test.testedAt) }
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (!c) return
    const index = test.id ? c.patchTests.findIndex((p) => p.id === test.id) : -1
    if (index >= 0) c.patchTests[index] = { ...record, id: c.patchTests[index].id }
    else c.patchTests.push({ ...record, id: uid('pt') })
  })
}

export async function removePatchTest(clientId: ID, testId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.patchTests = c.patchTests.filter((p) => p.id !== testId)
  })
}

// ─── Rewards ───────────────────────────────────────────────────────────────

export interface RewardInput {
  type: ClientReward['type']
  name: string
  value: number
  inStoreOnly: boolean
  expires?: { value: number; unit: 'day' | 'week' | 'month' | 'year' }
  /** Extra settings kept on the record (applies to, minimum purchase, deals). */
  extra?: Record<string, unknown>
}

export function rewardExpiry(expires: RewardInput['expires']): string | undefined {
  if (!expires || !expires.value) return undefined
  const base = now()
  const fn = { day: addDays, week: addWeeks, month: addMonths, year: addYears }[expires.unit]
  return toISODate(fn(base, expires.value))
}

export async function addReward(clientId: ID, input: RewardInput): Promise<ClientReward> {
  await latency()
  const base: ClientReward = { id: uid('rw'), type: input.type, name: input.name, value: input.value, inStoreOnly: input.inStoreOnly, expiresAt: rewardExpiry(input.expires) }
  const reward = { ...base, ...(input.extra ?? {}), createdAt: nowISO(), by: actorName() }
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.rewards.push(reward)
  })
  return reward
}

export async function removeReward(clientId: ID, rewardId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.rewards = c.rewards.filter((r) => r.id !== rewardId)
  })
}

// ─── Notes and files ───────────────────────────────────────────────────────

export async function addClientNote(clientId: ID, html: string): Promise<ClientNote> {
  await latency()
  const note: ClientNote = { id: uid('cn'), clientId, html, kind: 'client', createdAt: nowISO(), by: actorName() }
  commit((d) => {
    d.clientNotes.push(note)
  })
  return note
}

export async function updateClientNote(id: ID, html: string): Promise<void> {
  await latency()
  commit((d) => {
    const n = d.clientNotes.find((x) => x.id === id)
    if (n) n.html = html
  })
}

export async function deleteClientNote(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.clientNotes = d.clientNotes.filter((n) => n.id !== id)
  })
}

export async function addClientFiles(clientId: ID, files: { name: string; size: number }[]): Promise<void> {
  await latency(600, 1100)
  const at = nowISO()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.files.push(...files.map((f) => ({ id: uid('file'), name: f.name, size: f.size, at })))
  })
}

export async function removeClientFile(clientId: ID, fileId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const c = d.clients.find((x) => x.id === clientId)
    if (c) c.files = c.files.filter((f) => f.id !== fileId)
  })
}

/** Send a form from Settings › Forms to the client (lands in the outbox). */
export async function sendClientForm(clientId: ID, templateId: ID): Promise<FormResponse> {
  await latency()
  const client = findClient(clientId)
  const template = db().formTemplates.find((f) => f.id === templateId)
  if (!template) throw new ApiError('not_found', 'Form not found')
  const response: FormResponse = { id: uid('fr'), templateId, clientId, status: 'sent', answers: {}, sentAt: nowISO() }
  commit((d) => {
    d.formResponses.push(response)
  })
  queueMessage({
    clientId,
    to: client.email || client.phone,
    toName: `${client.firstName} ${client.lastName}`.trim(),
    channel: client.email ? 'email' : 'sms',
    type: 'form',
    subject: `Please complete: ${template.name}`,
    body: `Hi ${client.firstName}, please fill in the "${template.name}" form before your next visit.`,
  })
  return response
}

// ─── Duplicates and merging ────────────────────────────────────────────────

const digits = (s: string) => s.replace(/\D/g, '')

/** Groups of clients sharing an email or a phone number (name-only matches are ignored). */
export function findDuplicateGroups(clients: Client[]): Client[][] {
  const live = clients.filter((c) => !c.deletedAt)
  const parent = new Map<ID, ID>(live.map((c) => [c.id, c.id]))
  const root = (id: ID): ID => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  const join = (a: ID, b: ID) => parent.set(root(a), root(b))
  const byKey = new Map<string, ID>()
  for (const c of live) {
    const keys = [c.email.trim().toLowerCase() && `e:${c.email.trim().toLowerCase()}`, digits(c.phone).length >= 6 && `p:${digits(c.phone)}`].filter(Boolean) as string[]
    for (const key of keys) {
      const seen = byKey.get(key)
      if (seen) join(c.id, seen)
      else byKey.set(key, c.id)
    }
  }
  const groups = new Map<ID, Client[]>()
  for (const c of live) {
    const r = root(c.id)
    groups.set(r, [...(groups.get(r) ?? []), c])
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/** Likely duplicates of one client: same email, phone or full name. */
export function duplicatesOf(client: Client, clients: Client[]): Client[] {
  const email = client.email.trim().toLowerCase()
  const phone = digits(client.phone)
  const name = `${client.firstName} ${client.lastName}`.trim().toLowerCase()
  return clients.filter(
    (c) =>
      c.id !== client.id &&
      !c.deletedAt &&
      ((email && c.email.trim().toLowerCase() === email) || (phone.length >= 6 && digits(c.phone) === phone) || (name && `${c.firstName} ${c.lastName}`.trim().toLowerCase() === name)),
  )
}

/**
 * Merge duplicates into `keepId`: appointments, sales, payments, notes,
 * reviews, items and conversations move to the kept client; empty profile
 * fields are filled from the duplicates; lists are combined.
 */
export async function mergeClients(keepId: ID, mergeIds: ID[], details: { firstName: string; lastName: string; email: string }): Promise<void> {
  await latency(500, 900)
  findClient(keepId)
  const ids = mergeIds.filter((id) => id !== keepId)
  const at = nowISO()
  const move = (id: ID | null | undefined) => (id && ids.includes(id) ? keepId : id)
  commit((d) => {
    const keep = d.clients.find((c) => c.id === keepId)!
    d.appointments.forEach((a) => (a.clientId = move(a.clientId) ?? null))
    d.sales.forEach((s) => (s.clientId = move(s.clientId) ?? null))
    d.payments.forEach((p) => (p.clientId = move(p.clientId) ?? null))
    d.clientNotes.forEach((n) => (n.clientId = move(n.clientId)!))
    d.reviews.forEach((r) => (r.clientId = move(r.clientId)!))
    d.formResponses.forEach((f) => (f.clientId = move(f.clientId)!))
    d.clientPackages.forEach((p) => (p.clientId = move(p.clientId)!))
    d.clientMemberships.forEach((m) => (m.clientId = move(m.clientId)!))
    d.productOrders.forEach((o) => (o.clientId = move(o.clientId)!))
    d.waitlist.forEach((w) => (w.clientId = move(w.clientId) ?? null))
    d.messages.forEach((m) => (m.clientId = move(m.clientId) ?? null))
    d.groups.forEach((g) => (g.organiserClientId = move(g.organiserClientId) ?? null))
    d.giftCards.forEach((g) => {
      g.ownerClientId = move(g.ownerClientId) ?? null
      g.purchaserClientId = move(g.purchaserClientId) ?? null
    })
    d.clients.forEach((c) => {
      if (c.referredById && ids.includes(c.referredById)) c.referredById = keepId
    })
    // One conversation per client.
    const keepConv = d.conversations.find((c) => c.clientId === keepId)
    d.conversations.forEach((conv) => {
      if (!ids.includes(conv.clientId)) return
      if (keepConv) {
        keepConv.messages.push(...conv.messages)
        keepConv.messages.sort((a, b) => a.at.localeCompare(b.at))
        conv.messages = []
      } else conv.clientId = keepId
    })
    d.conversations = d.conversations.filter((c) => c.clientId === keepId || !ids.includes(c.clientId) || c.messages.length > 0)

    for (const id of ids) {
      const other = d.clients.find((c) => c.id === id)
      if (!other || other.deletedAt) continue
      const scalar = ['phone', 'birthday', 'gender', 'pronouns', 'language', 'occupation', 'country', 'additionalPhone', 'staffAlert', 'referredById', 'photo'] as const
      for (const key of scalar) {
        if (!keep[key] && other[key]) (keep as unknown as Record<string, unknown>)[key] = other[key]
      }
      if (other.email && other.email.toLowerCase() !== details.email.toLowerCase() && !keep.additionalEmail) keep.additionalEmail = other.email
      keep.tagIds = [...new Set([...keep.tagIds, ...other.tagIds])]
      keep.addresses.push(...other.addresses)
      keep.emergencyContacts.push(...other.emergencyContacts.filter((e) => !keep.emergencyContacts.some((k) => k.fullName === e.fullName)))
      keep.allergies.push(...other.allergies)
      keep.patchTests.push(...other.patchTests)
      keep.rewards.push(...other.rewards)
      keep.files.push(...other.files)
      keep.walletBalance += other.walletBalance
      keep.marketplace = keep.marketplace || other.marketplace
      if (other.createdAt < keep.createdAt) keep.createdAt = other.createdAt
      other.deletedAt = at
    }
    keep.firstName = details.firstName
    keep.lastName = details.lastName
    keep.email = details.email
  })
}

// ─── CSV import ────────────────────────────────────────────────────────────

export interface ImportRow {
  firstName: string
  lastName: string
  email: string
  phone: string
  gender?: Client['gender']
  birthday?: string
  marketing: Client['marketing']
  notifications: Client['notifications']
  staffAlert?: string
  tags: string[]
}

/** Create imported clients (source Imported, tag Imported). Returns how many were added. */
export async function importClients(rows: ImportRow[]): Promise<number> {
  await latency(900, 1400)
  const created = nowISO()
  commit((d) => {
    const tagId = (name: string): ID => {
      let tag = d.clientTags.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
      if (!tag) {
        tag = { id: uid('tag'), name: name.trim(), color: PALETTE_ORDER[(d.clientTags.length * 5) % PALETTE_ORDER.length] as PaletteColor, order: d.clientTags.length }
        d.clientTags.push(tag)
      }
      return tag.id
    }
    if (!d.clientSources.some((s) => s.id === IMPORTED_SOURCE_ID)) d.clientSources.push({ id: IMPORTED_SOURCE_ID, name: 'Imported', active: true, system: true, order: d.clientSources.length })
    const imported = tagId('Imported')
    for (const row of rows) {
      d.clients.push({
        ...blankClient(),
        id: uid('cl'),
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        gender: row.gender,
        birthday: row.birthday,
        marketing: row.marketing,
        notifications: row.notifications,
        staffAlert: row.staffAlert || undefined,
        sourceId: IMPORTED_SOURCE_ID,
        tagIds: [...new Set([imported, ...row.tags.filter(Boolean).map(tagId)])],
        createdAt: created,
      })
    }
  })
  return rows.length
}

// ─── Segments ──────────────────────────────────────────────────────────────

export async function saveSegment(segment: Omit<ClientSegment, 'id'> & { id?: ID }): Promise<ClientSegment> {
  await latency()
  const record = { ...segment, id: segment.id ?? uid('seg') } as ClientSegment
  commit((d) => {
    const index = d.segments.findIndex((s) => s.id === record.id)
    if (index >= 0) d.segments[index] = record
    else d.segments.push(record)
  })
  return record
}

export async function duplicateSegment(id: ID): Promise<ClientSegment> {
  await latency()
  const source = db().segments.find((s) => s.id === id)
  if (!source) throw new ApiError('not_found', 'Segment not found')
  const copy: ClientSegment = { ...structuredClone(source), id: uid('seg'), key: undefined, standard: false, name: `${source.name} (copy)`, badge: undefined }
  commit((d) => {
    d.segments.push(copy)
  })
  return copy
}

export async function deleteSegment(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.segments = d.segments.filter((s) => s.id !== id)
  })
}

// ─── Reviews and Google ────────────────────────────────────────────────────

export async function replyToReview(reviewId: ID, text: string): Promise<void> {
  await latency()
  const review = db().reviews.find((r) => r.id === reviewId)
  if (!review) throw new ApiError('not_found', 'Review not found')
  commit((d) => {
    const r = d.reviews.find((x) => x.id === reviewId)
    if (!r) return
    if (text.trim()) r.reply = { text: text.trim(), at: nowISO() }
    else delete r.reply
  })
  const client = db().clients.find((c) => c.id === review.clientId)
  if (client && text.trim() && client.email) {
    queueMessage({
      clientId: client.id,
      to: client.email,
      toName: `${client.firstName} ${client.lastName}`.trim(),
      channel: 'email',
      type: 'review_request',
      subject: 'The business replied to your review',
      body: text.trim(),
    })
  }
}

export const googleConnected = (addOns: { slug: string; status: string }[]) => addOns.some((a) => a.slug === GOOGLE_REVIEWS_SLUG && a.status === 'active')

/** Simulated Google Business Profile connection (stored as an active add-on entry). */
export async function connectGoogle(locationIds: ID[]): Promise<void> {
  await latency(900, 1400)
  commit((d) => {
    const entry = d.addOns.find((a) => a.slug === GOOGLE_REVIEWS_SLUG)
    if (entry) {
      entry.status = 'active'
      entry.enabledAt = nowISO()
    } else d.addOns.push({ slug: GOOGLE_REVIEWS_SLUG, status: 'active', enabledAt: nowISO() })
  })
  const count = db().reviews.filter((r: Review) => r.platform === 'google').length
  pushNotification({ tab: 'reviews', title: 'Google Business Profile connected', body: `${count} Google reviews synced for ${locationIds.length} location${locationIds.length === 1 ? '' : 's'}.`, link: '/clients/online-reputation?tab=all' })
}

export async function disconnectGoogle(): Promise<void> {
  await latency()
  commit((d) => {
    const entry = d.addOns.find((a) => a.slug === GOOGLE_REVIEWS_SLUG)
    if (entry) entry.status = 'inactive'
  })
}

/** Today's date helper re-exported for forms (patch test default). */
export const today = () => todayISO()
