import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isSameYear, parseISO, startOfMonth, startOfWeek, subDays, subHours } from 'date-fns'
import type { Appointment, AppointmentItem, AppointmentStatus, DbData, ID, ISODate, PaletteColor, Sale, TeamMember } from '@/types'
import { PALETTE } from '@/styles/palette'
import { toClock, toISODate } from '@/lib/time'

// ─── Views and dates ───────────────────────────────────────────────────

export type CalView = 'day' | 'day_3' | 'week' | 'month'
export const CAL_VIEWS: CalView[] = ['day', 'day_3', 'week', 'month']
export const isCalView = (v: string | null | undefined): v is CalView => !!v && (CAL_VIEWS as string[]).includes(v)
export const isISODate = (v: string | null | undefined): v is ISODate => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export const addDaysISO = (date: ISODate, n: number): ISODate => toISODate(addDays(parseISO(date), n))
export const weekStartISO = (date: ISODate): ISODate => toISODate(startOfWeek(parseISO(date), { weekStartsOn: 1 }))

/** Days shown by a view (month = full Monday-first weeks covering the month). */
export function viewDays(view: CalView, date: ISODate): ISODate[] {
  if (view === 'day') return [date]
  if (view === 'day_3') return [0, 1, 2].map((i) => addDaysISO(date, i))
  if (view === 'week') {
    const start = weekStartISO(date)
    return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
  }
  const first = startOfWeek(startOfMonth(parseISO(date)), { weekStartsOn: 1 })
  const last = endOfWeek(endOfMonth(parseISO(date)), { weekStartsOn: 1 })
  const days: ISODate[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(toISODate(d))
  return days
}

/** One unit of the view forwards or backwards. */
export function stepDate(view: CalView, date: ISODate, dir: 1 | -1): ISODate {
  if (view === 'day') return addDaysISO(date, dir)
  if (view === 'day_3') return addDaysISO(date, 3 * dir)
  if (view === 'week') return addDaysISO(date, 7 * dir)
  return toISODate(addMonths(parseISO(date), dir))
}

function rangeText(a: Date, b: Date): string {
  if (isSameMonth(a, b)) return `${format(a, 'MMM d')} – ${format(b, 'd, yyyy')}`
  if (isSameYear(a, b)) return `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}`
  return `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`
}

/** Toolbar label: "Wed, Oct 7", "Oct 8 – 10, 2026", "Oct 5 – 11, 2026", "October 2026". */
export function rangeLabel(view: CalView, date: ISODate): string {
  const d = parseISO(date)
  if (view === 'day') return format(d, 'EEE, MMM d')
  if (view === 'month') return format(d, 'MMMM yyyy')
  const days = viewDays(view, date)
  return rangeText(parseISO(days[0]), parseISO(days[days.length - 1]))
}

// ─── Time helpers ──────────────────────────────────────────────────────

/** "00:00" … "23:55" in `step`-minute steps. */
export function clockOptions(step = 5, from = 0, to = 1440): string[] {
  const out: string[] = []
  for (let m = from; m < to; m += step) out.push(toClock(m))
  return out
}

/** Duration choices from the reference: 5–55 min, 1h, 5-min steps to 2h, 15 to 4h, 30 to 8h, hourly to 13h. */
export function durationChoices(): number[] {
  const out: number[] = []
  for (let m = 5; m <= 120; m += 5) out.push(m)
  for (let m = 135; m <= 240; m += 15) out.push(m)
  for (let m = 270; m <= 480; m += 30) out.push(m)
  for (let m = 540; m <= 780; m += 60) out.push(m)
  return out
}

export const snap = (minutes: number, step = 5) => Math.round(minutes / step) * step

// ─── Colours ───────────────────────────────────────────────────────────

export interface BlockTone {
  fill: string
  edge: string
  text: string
}

export const COMPLETED_TONE: BlockTone = { fill: '#E3E8E7', edge: '#9AA8A6', text: '#2B3B3A' }
export const NO_SHOW_TONE: BlockTone = { fill: '#F8C8C2', edge: '#C9374A', text: '#5E1420' }
export const BLOCKED_TONE: BlockTone = { fill: '#DDE3E2', edge: '#8C9A98', text: '#2B3B3A' }

const tone = (color: PaletteColor | undefined): BlockTone => {
  const p = PALETTE[color ?? 'blue'] ?? PALETTE.blue
  return { fill: p.fill, edge: p.edge, text: p.text }
}

export interface ToneLookups {
  colorSource: DbData['settings']['calendar']['colorSource']
  statusColors: Map<string, PaletteColor>
  categoryColorOfService: Map<ID, PaletteColor>
  memberColor: Map<ID, PaletteColor>
  resourceColor: Map<ID, PaletteColor>
}

/** Block colour: Completed grey, No-show salmon, otherwise by the calendar colour source. */
export function toneFor(appt: Pick<Appointment, 'status'>, item: Pick<AppointmentItem, 'serviceId' | 'teamMemberId' | 'resourceId'>, lookups: ToneLookups): BlockTone {
  if (appt.status === 'completed') return COMPLETED_TONE
  if (appt.status === 'no_show') return NO_SHOW_TONE
  switch (lookups.colorSource) {
    case 'team_member':
      return tone(lookups.memberColor.get(item.teamMemberId))
    case 'status':
      return tone(lookups.statusColors.get(appt.status))
    case 'resource':
      return tone((item.resourceId && lookups.resourceColor.get(item.resourceId)) || lookups.categoryColorOfService.get(item.serviceId))
    default:
      return tone(lookups.categoryColorOfService.get(item.serviceId))
  }
}

// ─── Payment status ────────────────────────────────────────────────────

export type PayState = 'unpaid' | 'part_paid' | 'paid'

export function paymentState(appt: Appointment, salesById: Map<ID, Sale>): PayState {
  const sale = appt.saleId ? salesById.get(appt.saleId) : undefined
  if (sale?.status === 'completed') return 'paid'
  if (sale?.status === 'part_paid' || appt.deposit) return 'part_paid'
  return 'unpaid'
}

// ─── Filters ───────────────────────────────────────────────────────────

export interface CalendarFilters {
  status: string[]
  type: string[]
  channel: string[]
  payment: string[]
  services: string[]
  created: string[]
  requested: string[]
  segments: string[]
}

export const FILTER_KEYS: (keyof CalendarFilters)[] = ['status', 'type', 'channel', 'payment', 'services', 'created', 'requested', 'segments']

export const EMPTY_FILTERS: CalendarFilters = { status: [], type: [], channel: [], payment: [], services: [], created: [], requested: [], segments: [] }

export const FILTER_STATUSES: AppointmentStatus[] = ['booked', 'confirmed', 'arrived', 'started', 'completed', 'no_show']
export const FILTER_TYPES = ['single', 'group', 'blocked'] as const
export const FILTER_CHANNELS = ['online', 'offline'] as const
export const FILTER_PAYMENTS = ['unpaid', 'part_paid', 'paid'] as const
export const FILTER_CREATED = ['any', 'today', '1h', '3h', '12h', '24h', '2d', '3d', 'gt3d'] as const
export const FILTER_REQUESTED = ['requested', 'no_preference'] as const

export const activeFilterCount = (f: CalendarFilters) => FILTER_KEYS.filter((k) => f[k].length > 0).length

export const normaliseFilters = (raw: Record<string, string[]> | undefined): CalendarFilters =>
  Object.fromEntries(FILTER_KEYS.map((k) => [k, Array.isArray(raw?.[k]) ? [...raw![k]] : []])) as unknown as CalendarFilters

export interface FilterContext {
  now: Date
  salesById: Map<ID, Sale>
  /** null = no segment filter. */
  segmentClients: Set<ID> | null
}

function createdMatches(createdAt: string, key: string, now: Date): boolean {
  const at = parseISO(createdAt)
  switch (key) {
    case 'today':
      return toISODate(at) === toISODate(now)
    case '1h':
      return at >= subHours(now, 1)
    case '3h':
      return at >= subHours(now, 3)
    case '12h':
      return at >= subHours(now, 12)
    case '24h':
      return at >= subHours(now, 24)
    case '2d':
      return at >= subDays(now, 2)
    case '3d':
      return at >= subDays(now, 3)
    case 'gt3d':
      return at < subDays(now, 3)
    default:
      return true
  }
}

export function appointmentMatches(appt: Appointment, f: CalendarFilters, ctx: FilterContext): boolean {
  if (f.status.length && !f.status.includes(appt.status)) return false
  if (f.type.length && !f.type.includes(appt.groupId ? 'group' : 'single')) return false
  if (f.channel.length && !f.channel.includes(appt.channel === 'offline' ? 'offline' : 'online')) return false
  if (f.payment.length && !f.payment.includes(paymentState(appt, ctx.salesById))) return false
  if (f.services.length && !appt.items.some((i) => f.services.includes(i.serviceId))) return false
  if (f.created.length && !createdMatches(appt.createdAt, f.created[0], ctx.now)) return false
  if (f.requested.length && !f.requested.includes(appt.items.some((i) => i.preferred) ? 'requested' : 'no_preference')) return false
  if (ctx.segmentClients && (!appt.clientId || !ctx.segmentClients.has(appt.clientId))) return false
  return true
}

export const blockedTimeVisible = (f: CalendarFilters) => !f.type.length || f.type.includes('blocked')

// ─── Overlap lanes ─────────────────────────────────────────────────────

/** Side-by-side lanes for overlapping blocks in one column. */
export function layoutLanes(items: { key: string; start: number; end: number }[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const result = new Map<string, { lane: number; lanes: number }>()
  let cluster: { key: string; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length)
    cluster.forEach((c) => result.set(c.key, { lane: c.lane, lanes }))
    cluster = []
    laneEnds = []
  }
  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length) flush()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else laneEnds[lane] = item.end
    cluster.push({ key: item.key, lane })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  if (cluster.length) flush()
  return result
}

// ─── Team ──────────────────────────────────────────────────────────────

export const memberName = (m: Pick<TeamMember, 'firstName' | 'lastName'> | undefined) => (m ? `${m.firstName} ${m.lastName}` : '')

/** Selected member ids from `calendar_selected_resources` ("e-all", "e-working", "e-<id>,e-<id>"). */
export function parseTeam(value: string): { mode: 'all' | 'working' | 'custom'; ids: ID[] } {
  if (value === 'e-working') return { mode: 'working', ids: [] }
  if (!value || value === 'e-all') return { mode: 'all', ids: [] }
  return { mode: 'custom', ids: value.split(',').map((s) => s.replace(/^e-/, '')).filter(Boolean) }
}

export const teamValue = (ids: ID[]) => ids.map((id) => `e-${id}`).join(',')
