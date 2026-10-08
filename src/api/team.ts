import { addDays, format, parseISO } from 'date-fns'
import { commit, db } from '@/store/db'
import type {
  ActivityEntry,
  ClosedPeriod,
  ID,
  ISODate,
  PayAdjustment,
  PayRun,
  PayRunLine,
  ShiftPattern,
  TeamMember,
  TimeOff,
  TimeRange,
  Timesheet,
  TimesheetBreak,
  User,
} from '@/types'
import type { PermissionRole } from '@/lib/permissions'
import { uid } from '@/lib/ids'
import { nowISO } from '@/lib/time'
import { round2 } from '@/lib/format'
import { actorName, ApiError, latency } from './client'
import { queueMessage } from './messaging'
import { cashMovement } from './register'

/**
 * Team domain (reference/team.md): team members, invites, scheduled shifts,
 * time off, closed periods, timesheets and pay runs.
 *
 * Fields the shared TeamMember / PayRun types don't have yet are stored as
 * extra properties on the same persisted records (see TeamMemberRecord and
 * PayRunRecord below).
 */

export type TriState = 'default' | 'enabled' | 'disabled'

export interface MemberAddress {
  id: ID
  type: 'home' | 'work' | 'other'
  line1: string
  line2?: string
  city: string
  postcode: string
  country: string
}

export interface MemberEmergencyContact {
  id: ID
  fullName: string
  relationship: string
  email: string
  phone: string
  primary: boolean
}

export interface MemberExtras {
  photo?: string
  phoneCode?: string
  additionalPhone?: string
  additionalPhoneCode?: string
  addresses?: MemberAddress[]
  emergencyContacts?: MemberEmergencyContact[]
  compensationType?: 'none' | 'hourly'
  timesheetSettings?: { proximity: TriState; autoClockIn: TriState; autoClockOut: TriState; autoBreaks: TriState }
  payRunSettings?: { calculation: 'automatic' | 'manual'; deductProcessingFees: boolean; deductNewClientFees: boolean; cashAdvances: boolean }
  inviteToken?: string
  createdAt?: string
  updatedAt?: string
}

export type TeamMemberRecord = TeamMember & MemberExtras

export interface PayRunRecord extends PayRun {
  createdBy?: string
  locationId?: ID
  includes?: ('wages' | 'commissions' | 'tips' | 'other')[]
  /** Per-member payment method when it differs from the run's. */
  memberMethods?: Record<ID, PayRun['method']>
}

export const asRecord = (m: TeamMember): TeamMemberRecord => m as TeamMemberRecord

/** Editable fields of a team member (the form's payload). */
export type MemberInput = Omit<TeamMemberRecord, 'id' | 'order' | 'rating' | 'reviewCount' | 'archived' | 'linkedCalendars' | 'invite' | 'inviteToken' | 'createdAt' | 'updatedAt'>

const normaliseEmail = (email: string) => email.trim().toLowerCase()

export function linkedUser(memberId: ID): User | undefined {
  return db().users.find((u) => u.teamMemberId === memberId)
}

/**
 * Billing rule (SPEC §7): the Independent plan covers one bookable team
 * member. True when saving `bookable` for this member would make a second one.
 */
export function bookableLimitReached(memberId: ID | null, bookable: boolean): boolean {
  const data = db()
  if (data.workspace.plan.type !== 'independent' || !bookable) return false
  if (memberId && data.teamMembers.find((m) => m.id === memberId)?.bookable) return false
  return data.teamMembers.filter((m) => m.id !== memberId && m.bookable && !m.archived).length >= 1
}

/** Whether saving these values sends an invite (role above No access, an email, no login yet). */
export function inviteWouldSend(memberId: ID | null, role: PermissionRole, email: string): boolean {
  if (role === 'none' || role === 'owner' || !email.trim()) return false
  if (memberId && linkedUser(memberId)) return false
  if (db().users.some((u) => u.email === normaliseEmail(email))) return false
  const member = memberId ? asRecord(db().teamMembers.find((m) => m.id === memberId)!) : undefined
  if (member?.invite?.status === 'pending' && normaliseEmail(member.email) === normaliseEmail(email) && member.role === role) return false
  return true
}

function sendInviteNow(memberId: ID): void {
  const data = db()
  const member = data.teamMembers.find((m) => m.id === memberId)
  if (!member) return
  const token = crypto.randomUUID()
  const by = actorName()
  const role = data.settings.permissionRoles.find((r) => r.id === member.role)?.name ?? member.role
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === memberId) as TeamMemberRecord | undefined
    if (!m) return
    m.invite = { status: 'pending', sentAt: nowISO() }
    m.inviteToken = token
  })
  queueMessage({
    clientId: null,
    to: member.email,
    toName: `${member.firstName} ${member.lastName}`.trim(),
    channel: 'email',
    type: 'invite',
    subject: `${by} invited you to join ${data.workspace.name} on Innoweb Bookings`,
    body: `Hi ${member.firstName},\n\n${by} has invited you to join the ${data.workspace.name} team on Innoweb Bookings with the permission role ${role}.\n\nAccept the invitation to set your password and sign in to the workspace.`,
    link: { label: 'Accept invitation', href: `/invite/${token}` },
  })
}

/** Resend or send an invite (Grant access). */
export async function sendInvite(memberId: ID): Promise<void> {
  await latency()
  sendInviteNow(memberId)
}

function syncLinkedUser(memberId: ID): void {
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === memberId)
    const u = d.users.find((x) => x.teamMemberId === memberId)
    if (!m || !u) return
    u.role = m.role
    u.firstName = m.firstName
    u.lastName = m.lastName
    if (m.email.trim()) u.email = normaliseEmail(m.email)
  })
}

function validateMember(input: Pick<MemberInput, 'firstName' | 'email'>, memberId: ID | null) {
  if (!input.firstName.trim()) throw new ApiError('validation', 'team.form.errors.firstName')
  const email = normaliseEmail(input.email)
  if (email && db().teamMembers.some((m) => m.id !== memberId && normaliseEmail(m.email) === email && !m.archived)) {
    throw new ApiError('email_taken', 'team.form.errors.emailTaken')
  }
}

export async function createMember(input: MemberInput): Promise<{ member: TeamMemberRecord; invited: boolean }> {
  await latency()
  validateMember(input, null)
  if (bookableLimitReached(null, input.bookable)) throw new ApiError('plan_limit', 'team.billing.body')
  const data = db()
  const order = data.teamMembers.reduce((min, m) => Math.min(min, m.order), 0) - 1
  const at = nowISO()
  const member: TeamMemberRecord = {
    ...input,
    id: uid('tm'),
    email: input.email.trim(),
    archived: false,
    order,
    rating: 0,
    reviewCount: 0,
    linkedCalendars: [],
    createdAt: at,
    updatedAt: at,
  }
  commit((d) => {
    d.teamMembers.push(member)
  })
  const invited = inviteWouldSend(member.id, member.role, member.email)
  if (invited) sendInviteNow(member.id)
  return { member, invited }
}

export async function updateMember(id: ID, input: Partial<MemberInput>): Promise<{ invited: boolean }> {
  await latency()
  const current = db().teamMembers.find((m) => m.id === id)
  if (!current) throw new ApiError('not_found', 'team.errors.notFound')
  validateMember({ firstName: input.firstName ?? current.firstName, email: input.email ?? current.email }, id)
  if (input.bookable !== undefined && bookableLimitReached(id, input.bookable)) throw new ApiError('plan_limit', 'team.billing.body')
  const invited = inviteWouldSend(id, input.role ?? current.role, input.email ?? current.email)
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === id)
    if (!m) return
    Object.assign(m, input, { updatedAt: nowISO() })
    if (m.role === 'none' && m.invite?.status === 'pending') delete m.invite
  })
  syncLinkedUser(id)
  if (invited) sendInviteNow(id)
  return { invited }
}

export async function setMemberRole(id: ID, role: PermissionRole): Promise<{ invited: boolean }> {
  return updateMember(id, { role })
}

export async function archiveMember(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === id)
    if (m) Object.assign(m, { archived: true, updatedAt: nowISO() })
  })
}

/** Unarchive runs immediately; calendar bookings come back disabled (team.md §1.4). */
export async function unarchiveMember(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === id)
    if (m) Object.assign(m, { archived: false, bookable: false, updatedAt: nowISO() })
  })
}

export async function deleteMember(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.teamMembers = d.teamMembers.filter((m) => m.id !== id)
    d.shiftPatterns = d.shiftPatterns.filter((p) => p.teamMemberId !== id)
    d.shiftOverrides = d.shiftOverrides.filter((o) => o.teamMemberId !== id)
    d.timeOff = d.timeOff.filter((t) => t.teamMemberId !== id)
    // Their login goes with them (the owner can't be deleted).
    d.users = d.users.filter((u) => u.teamMemberId !== id || u.role === 'owner')
  })
}

export async function reorderMembers(ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    ids.forEach((id, index) => {
      const m = d.teamMembers.find((x) => x.id === id)
      if (m) m.order = index
    })
  })
}

// ─── Invites ───────────────────────────────────────────────────────────────

export function memberForInvite(token: string): TeamMemberRecord | undefined {
  return db().teamMembers.map(asRecord).find((m) => m.inviteToken === token)
}

/** Accepting an invite creates the staff login (SPEC §8). */
export async function acceptInvite(token: string, password: string): Promise<User> {
  await latency()
  const member = memberForInvite(token)
  if (!member || member.invite?.status !== 'pending') throw new ApiError('invalid_token', 'team.invite.errors.invalid')
  if (password.length < 8) throw new ApiError('validation', 'team.invite.errors.password')
  const email = normaliseEmail(member.email)
  if (db().users.some((u) => u.email === email)) throw new ApiError('email_taken', 'team.invite.errors.emailTaken')
  const user: User = { id: uid('u_inv'), email, password, firstName: member.firstName, lastName: member.lastName, role: member.role, teamMemberId: member.id, phone: member.phone }
  commit((d) => {
    d.users.push(user)
    const m = d.teamMembers.find((x) => x.id === member.id) as TeamMemberRecord | undefined
    if (m) {
      m.invite = { status: 'accepted', sentAt: m.invite?.sentAt ?? nowISO(), userId: user.id }
      delete m.inviteToken
    }
  })
  return user
}

// ─── Linked calendars ──────────────────────────────────────────────────────

export async function addLinkedCalendar(memberId: ID, calendar: { name: string; url: string }): Promise<TeamMember['linkedCalendars'][number]> {
  await latency()
  const record = { id: uid('cal'), name: calendar.name, url: calendar.url, createdAt: nowISO() }
  commit((d) => {
    d.teamMembers.find((m) => m.id === memberId)?.linkedCalendars.push(record)
  })
  return record
}

export async function renameLinkedCalendar(memberId: ID, calendarId: ID, name: string): Promise<void> {
  await latency(200, 400)
  commit((d) => {
    const cal = d.teamMembers.find((m) => m.id === memberId)?.linkedCalendars.find((c) => c.id === calendarId)
    if (cal) cal.name = name
  })
}

export async function removeLinkedCalendar(memberId: ID, calendarId: ID): Promise<void> {
  await latency(200, 400)
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === memberId)
    if (m) m.linkedCalendars = m.linkedCalendars.filter((c) => c.id !== calendarId)
  })
}

// ─── Locations ─────────────────────────────────────────────────────────────

/** "Team members at <location>" → Apply. */
export async function assignLocationMembers(locationId: ID, memberIds: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    d.teamMembers.forEach((m) => {
      if (m.archived) return
      const has = m.locationIds.includes(locationId)
      const want = memberIds.includes(m.id)
      if (want && !has) m.locationIds.push(locationId)
      if (!want && has) m.locationIds = m.locationIds.filter((l) => l !== locationId)
    })
  })
}

export async function unassignFromLocation(memberId: ID, locationId: ID): Promise<void> {
  await latency()
  commit((d) => {
    const m = d.teamMembers.find((x) => x.id === memberId)
    if (m) m.locationIds = m.locationIds.filter((l) => l !== locationId)
  })
}

// ─── Shifts ────────────────────────────────────────────────────────────────

const dayBefore = (date: ISODate) => format(addDays(parseISO(date), -1), 'yyyy-MM-dd')

/** "Edit this day": replaces the day with these ranges (empty = not working). */
export async function saveDayShifts(memberId: ID, locationId: ID, date: ISODate, ranges: TimeRange[]): Promise<void> {
  await latency()
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
  commit((d) => {
    d.shiftOverrides = d.shiftOverrides.filter((o) => !(o.teamMemberId === memberId && o.locationId === locationId && o.date === date))
    d.shiftOverrides.push({ id: uid('so'), teamMemberId: memberId, locationId, date, ranges: sorted })
  })
}

/** "Delete all shifts" from a date: ends repeating shifts and clears edited days. */
export async function deleteAllShifts(memberId: ID, locationId: ID, from: ISODate): Promise<void> {
  await latency()
  const end = dayBefore(from)
  commit((d) => {
    d.shiftPatterns = d.shiftPatterns
      .filter((p) => !(p.teamMemberId === memberId && p.locationId === locationId && p.startDate >= from))
      .map((p) => (p.teamMemberId === memberId && p.locationId === locationId && (!p.endDate || p.endDate >= from) ? { ...p, endDate: end } : p))
    d.shiftOverrides = d.shiftOverrides.filter((o) => !(o.teamMemberId === memberId && o.locationId === locationId && o.date >= from))
  })
}

/** "Set repeating shifts": replaces the member's pattern at this location from the start date. */
export async function saveShiftPattern(input: Omit<ShiftPattern, 'id'>): Promise<ShiftPattern> {
  await latency()
  const { teamMemberId, locationId, startDate, endDate } = input
  const record: ShiftPattern = { ...input, id: uid('sp') }
  const end = dayBefore(startDate)
  commit((d) => {
    d.shiftPatterns = d.shiftPatterns
      .filter((p) => !(p.teamMemberId === teamMemberId && p.locationId === locationId && p.startDate >= startDate && (!endDate || p.startDate <= endDate)))
      .map((p) => (p.teamMemberId === teamMemberId && p.locationId === locationId && p.startDate < startDate && (!p.endDate || p.endDate >= startDate) ? { ...p, endDate: end } : p))
    d.shiftPatterns.push(record)
    d.shiftOverrides = d.shiftOverrides.filter((o) => !(o.teamMemberId === teamMemberId && o.locationId === locationId && o.date >= startDate && (!endDate || o.date <= endDate)))
  })
  return record
}

// ─── Time off and closed periods ───────────────────────────────────────────

export async function saveTimeOff(input: Omit<TimeOff, 'id'> & { id?: ID }): Promise<TimeOff> {
  await latency()
  if (input.endTime <= input.startTime) throw new ApiError('validation', 'team.timeOff.errors.endTime')
  const record: TimeOff = { ...input, id: input.id ?? uid('off') }
  if (!record.repeatUntil) delete record.repeatUntil
  commit((d) => {
    const index = d.timeOff.findIndex((t) => t.id === record.id)
    if (index === -1) d.timeOff.push(record)
    else d.timeOff[index] = record
  })
  return record
}

export async function deleteTimeOff(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.timeOff = d.timeOff.filter((t) => t.id !== id)
  })
}

export async function saveClosedPeriod(input: Omit<ClosedPeriod, 'id'> & { id?: ID }): Promise<ClosedPeriod> {
  await latency()
  if (input.endDate < input.startDate) throw new ApiError('validation', 'team.closed.errors.endDate')
  const record: ClosedPeriod = { ...input, id: input.id ?? uid('cp') }
  commit((d) => {
    const index = d.closedPeriods.findIndex((p) => p.id === record.id)
    if (index === -1) d.closedPeriods.push(record)
    else d.closedPeriods[index] = record
  })
  return record
}

export async function deleteClosedPeriod(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.closedPeriods = d.closedPeriods.filter((p) => p.id !== id)
  })
}

// ─── Timesheets ────────────────────────────────────────────────────────────

export async function enableTimesheets(): Promise<void> {
  await latency()
  commit((d) => {
    d.settings.timesheets.enabled = true
  })
}

export interface TimesheetInput {
  teamMemberId: ID
  locationId: ID
  date: ISODate
  clockIn: string
  clockOut?: string
  breaks: TimesheetBreak[]
}

function breakName(typeId: ID): string {
  return db().blockedTimeTypes.find((t) => t.id === typeId)?.name ?? 'Break'
}

function timesheetChanges(before: Timesheet | undefined, after: TimesheetInput): string[] {
  const lines: string[] = []
  if (!before) {
    lines.push(`Clock-in time of ${after.clockIn} added`)
    if (after.clockOut) lines.push(`Clock-out time of ${after.clockOut} added`)
    after.breaks.forEach((b) => lines.push(`${breakName(b.typeId)} added from ${b.start} to ${b.end ?? '-'}`))
    return lines
  }
  if (before.date !== after.date) lines.push(`Date changed from ${before.date} to ${after.date}`)
  if (before.clockIn !== after.clockIn) lines.push(`Clock-in time changed from ${before.clockIn} to ${after.clockIn}`)
  if (before.clockOut !== after.clockOut) lines.push(after.clockOut ? `Clock-out time changed from ${before.clockOut ?? '-'} to ${after.clockOut}` : 'Clock-out time removed')
  after.breaks.forEach((b) => {
    const old = before.breaks.find((x) => x.id === b.id)
    if (!old) lines.push(`${breakName(b.typeId)} added from ${b.start} to ${b.end ?? '-'}`)
    else if (old.start !== b.start || old.end !== b.end) lines.push(`${breakName(b.typeId)} changed to ${b.start} - ${b.end ?? '-'}`)
  })
  before.breaks.filter((b) => !after.breaks.some((x) => x.id === b.id)).forEach((b) => lines.push(`${breakName(b.typeId)} removed`))
  return lines
}

export async function saveTimesheet(input: TimesheetInput, id?: ID): Promise<Timesheet> {
  await latency()
  if (input.clockOut && input.clockOut <= input.clockIn) throw new ApiError('validation', 'team.timesheets.form.errors.clockOutAfter')
  const before = id ? db().timesheets.find((t) => t.id === id) : undefined
  const changes = timesheetChanges(before, input)
  const by = actorName()
  const entry: ActivityEntry = { id: uid('act'), at: nowISO(), by, title: before ? 'Timesheet updated' : 'Timesheet created', detail: changes.join('\n') }
  const record: Timesheet = {
    id: id ?? uid('ts'),
    ...input,
    status: input.clockOut ? 'clocked_out' : 'clocked_in',
    activity: [...(before?.activity ?? []), entry],
  }
  if (!record.clockOut) delete record.clockOut
  commit((d) => {
    const index = d.timesheets.findIndex((t) => t.id === record.id)
    if (index === -1) d.timesheets.push(record)
    else d.timesheets[index] = record
  })
  return record
}

export async function deleteTimesheet(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.timesheets = d.timesheets.filter((t) => t.id !== id)
  })
}

// ─── Pay runs ──────────────────────────────────────────────────────────────

export async function enablePayRuns(): Promise<void> {
  await latency()
  commit((d) => {
    d.settings.payRuns.enabled = true
  })
}

export async function addPayAdjustment(input: Omit<PayAdjustment, 'id' | 'at'>): Promise<PayAdjustment> {
  await latency()
  const record: PayAdjustment = { ...input, amount: round2(input.amount), id: uid('adj'), at: nowISO() }
  commit((d) => {
    d.payAdjustments.push(record)
  })
  return record
}

export async function deletePayAdjustment(id: ID): Promise<void> {
  await latency(200, 400)
  commit((d) => {
    d.payAdjustments = d.payAdjustments.filter((a) => a.id !== id)
  })
}

export interface PayRunInput {
  periodStart: ISODate
  periodEnd: ISODate
  lines: PayRunLine[]
  method: PayRun['method']
  note?: string
  source: PayRun['source']
  status: PayRun['status']
  includes: PayRunRecord['includes']
  memberMethods?: PayRunRecord['memberMethods']
  locationId?: ID
}

/** "Save and exit" / "Skip": keeps the pay run for later. */
export async function savePayRunDraft(input: PayRunInput, id?: ID): Promise<PayRunRecord> {
  await latency()
  const record: PayRunRecord = { ...input, id: id ?? uid('pr'), createdAt: nowISO(), createdBy: actorName() }
  commit((d) => {
    const index = d.payRuns.findIndex((p) => p.id === record.id)
    if (index === -1) d.payRuns.push(record)
    else d.payRuns[index] = record
  })
  return record
}

let pendingCode: { code: string; expires: number } | null = null

/** Emails a 4-digit verification code to the owner (demo outbox). */
export async function requestPayRunCode(): Promise<{ to: string }> {
  await latency()
  const data = db()
  const owner = data.users.find((u) => u.role === 'owner') ?? data.users[0]
  const code = String(1000 + Math.floor(Math.random() * 9000))
  pendingCode = { code, expires: Date.now() + 5 * 60 * 1000 }
  queueMessage({
    clientId: null,
    to: owner.email,
    toName: `${owner.firstName} ${owner.lastName}`,
    channel: 'email',
    type: 'pay_run',
    subject: `Your verification code is ${code}`,
    body: `Use this code to complete your pay run on Innoweb Bookings:\n\n${code}\n\nIt expires in 5 minutes. If you didn't request it, you can ignore this email.`,
  })
  return { to: owner.email }
}

export async function completePayRun(input: Omit<PayRunInput, 'status'> & { code: string; registerSessionId?: ID }, draftId?: ID): Promise<PayRunRecord> {
  await latency()
  if (!pendingCode || pendingCode.code !== input.code || Date.now() > pendingCode.expires) throw new ApiError('invalid_code', 'team.payRunNew.code.invalid')
  pendingCode = null
  if (input.method === 'cash_register' && input.registerSessionId) {
    const cashTotal = round2(input.lines.filter((l) => (input.memberMethods?.[l.teamMemberId] ?? input.method) === 'cash_register').reduce((s, l) => s + l.paid, 0))
    if (cashTotal > 0) await cashMovement(input.registerSessionId, 'cash_out', 'Pay team member tips', cashTotal, input.note)
  }
  const at = nowISO()
  const { code: _code, registerSessionId: _session, ...rest } = input
  void _code
  void _session
  const record: PayRunRecord = { ...rest, id: draftId ?? uid('pr'), status: 'completed', createdAt: at, completedAt: at, createdBy: actorName() }
  const walletTotal = round2(input.lines.filter((l) => (input.memberMethods?.[l.teamMemberId] ?? input.method) === 'wallet').reduce((s, l) => s + l.paid, 0))
  commit((d) => {
    const index = d.payRuns.findIndex((p) => p.id === record.id)
    if (index === -1) d.payRuns.push(record)
    else d.payRuns[index] = record
    if (walletTotal > 0) {
      d.wallet.balance = round2(d.wallet.balance - walletTotal)
      d.wallet.available = round2(d.wallet.available - walletTotal)
      d.wallet.transactions.unshift({ id: uid('wt'), at, type: 'payout', description: 'Team pay run', amount: -walletTotal })
    }
  })
  return record
}

export async function deletePayRunDraft(id: ID): Promise<void> {
  await latency(200, 400)
  commit((d) => {
    d.payRuns = d.payRuns.filter((p) => !(p.id === id && p.status !== 'completed'))
  })
}
