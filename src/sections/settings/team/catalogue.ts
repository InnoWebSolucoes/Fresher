import { BookOpen, Calendar, ChartLine, LayoutGrid, Megaphone, Smile, SquareUser, Tag, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { PermissionLevel } from '@/types'

/**
 * Permission catalogue for the "Edit permissions" matrix
 * (reference/settings-team.md §8 and the settings-team-01-…-x05-medium-*
 * screenshots): area → groups → items, with nested children.
 *
 * Labels live in strings/tm.json:
 *   settings.tm.perm.<area>.title / .description
 *   settings.tm.perm.<area>.groups.<groupKey>
 *   settings.tm.perm.<area>.items.<itemKey>
 *   settings.tm.perm.<area>.hints.<itemKey>   (grey helper line, when `hint`)
 *
 * Storage (PermissionLevel.permissions): area → enabled keys, where 'active'
 * switches the area on. Locked items are never stored: they are on whenever
 * their area is active.
 */

export type AreaKey = 'calendar' | 'sales' | 'clients' | 'catalog' | 'online_profile' | 'marketing' | 'team' | 'reports' | 'payments_wallet' | 'workspace'

export interface PermItem {
  key: string
  /** Always on (and not editable) while the area is active. */
  locked?: boolean
  /** Has a grey helper line under the label. */
  hint?: boolean
  /** Nested options, disabled while this item is unchecked. */
  children?: PermItem[]
}

export interface PermGroup {
  key: string
  /** Show a heading above the items. */
  heading: boolean
  items: PermItem[]
}

export interface PermArea {
  key: AreaKey
  icon: LucideIcon
  learnMore: boolean
  groups: PermGroup[]
  /** Reports: "Permissions for individual reports can be managed in Insights". */
  insightsNote?: boolean
}

const i = (key: string, extra: Omit<PermItem, 'key'> = {}): PermItem => ({ key, ...extra })
const g = (key: string, items: PermItem[], heading = true): PermGroup => ({ key, heading, items })

export const PERMISSION_AREAS: PermArea[] = [
  {
    key: 'calendar',
    icon: Calendar,
    learnMore: true,
    groups: [
      g('access', [
        i('view_own', { locked: true, children: [i('view_others')] }),
        i('create_appointments', { children: [i('edit_preferred_member'), i('apply_discounts')] }),
        i('reschedule'),
        i('reassign'),
        i('cancel'),
        i('no_show'),
      ]),
      g('blocked', [i('blocked_own'), i('blocked_all'), i('blocked_types')]),
      g('restrictions', [i('book_unassigned_members'), i('book_unassigned_resources')]),
      g('settings', [i('closed_dates')]),
      g('sync', [
        i('link_own', { children: [i('link_own_export', { locked: true }), i('link_own_import')] }),
        i('link_any', { children: [i('link_any_export', { locked: true }), i('link_any_import')] }),
      ]),
    ],
  },
  {
    key: 'sales',
    icon: Tag,
    learnMore: true,
    groups: [
      g('checkout', [
        i('checkout', { children: [i('add_tip'), i('edit_prices'), i('discount_orders'), i('discount_items')] }),
        i('view_all_sales'),
        i('view_own_sales'),
        i('void_sale'),
        i('edit_sale'),
        i('refund_sale'),
        i('collect_cash'),
        i('tap_to_pay'),
        i('sell_memberships'),
        i('sell_packages'),
      ]),
      g('registers', [
        i('take_cash'),
        i('view_registers', {
          children: [i('manage_registers', { hint: true }), i('view_closed_registers'), i('open_register'), i('close_register'), i('cash_in_out'), i('mid_day_count', { hint: true })],
        }),
      ]),
      g('reports', [i('daily_summary'), i('appointments_list'), i('gift_card_templates'), i('packages_sold'), i('memberships_sold'), i('export_reports')]),
      g('gift_cards', [i('sold_gift_cards')]),
    ],
  },
  {
    key: 'clients',
    icon: Smile,
    learnMore: true,
    groups: [
      g('profile', [
        i('view_profile', { locked: true }),
        i('view_details', { children: [i('full_name'), i('contact_details')] }),
        i('tags'),
        i('view_form_responses'),
        i('complete_forms'),
        i('edit_forms'),
        i('add_rewards'),
      ]),
      g('notes', [i('notes_assigned', { children: [i('notes_all_locations')] }), i('notes_edit', { children: [i('notes_edit_others')] })]),
      g('list', [i('download'), i('segments')]),
      g('reputation', [i('reputation_view', { children: [i('reputation_settings')] }), i('reply_reviews')]),
      g('loyalty', [i('loyalty_view', { children: [i('loyalty_settings')] }), i('loyalty_rewards')]),
      g('messaging', [i('messages_view', { children: [i('messages_send')] })]),
      g('settings', [i('client_sources', { hint: true }), i('client_tags', { hint: true })]),
    ],
  },
  {
    key: 'catalog',
    icon: BookOpen,
    learnMore: true,
    groups: [
      g('management', [
        i('services', { children: [i('bulk_edit_services')] }),
        i('products'),
        i('import_products'),
        i('bulk_products'),
        i('gift_cards'),
        i('memberships'),
        i('packages'),
      ]),
    ],
  },
  {
    key: 'online_profile',
    icon: SquareUser,
    learnMore: true,
    groups: [g('main', [i('online_booking'), i('product_store', { children: [i('shopkeeper_orders', { locked: true })] })], false)],
  },
  {
    key: 'marketing',
    icon: Megaphone,
    learnMore: true,
    groups: [g('actions', [i('blast', { hint: true }), i('automations', { hint: true }), i('deals_view', { children: [i('deals_edit')] }), i('smart_pricing')])],
  },
  {
    key: 'team',
    icon: Users,
    learnMore: true,
    groups: [
      g('list', [i('view_list')]),
      g('time', [i('own_shifts', { children: [i('manage_others_shifts'), i('manage_own_shifts')] }), i('own_timesheets', { children: [i('manage_others_timesheets')] })]),
      g('compensation', [i('pay_runs', { hint: true }), i('compensation_settings', { hint: true }), i('merchant_accounts', { hint: true })]),
      g('settings', [i('permission_levels'), i('pin_switching'), i('timesheet_settings'), i('provider_onboarding')]),
      g('connect', [i('team_connect', { children: [i('public_channels'), i('private_channels')] })]),
    ],
  },
  {
    key: 'reports',
    icon: ChartLine,
    learnMore: true,
    insightsNote: true,
    groups: [g('main', [i('access', { locked: true }), i('view_all_data'), i('insights_drawer'), i('data_connections')], false)],
  },
  {
    key: 'payments_wallet',
    icon: Wallet,
    learnMore: false,
    groups: [g('main', [i('wallet_billing'), i('pos_settings')], false)],
  },
  {
    key: 'workspace',
    icon: LayoutGrid,
    learnMore: false,
    groups: [g('main', [i('business_setup')], false), g('other', [i('home_page'), i('all_locations', { hint: true }), i('tips_notifications')])],
  },
]

export const AREA_KEYS: AreaKey[] = PERMISSION_AREAS.map((a) => a.key)

export type PermissionSet = Record<AreaKey, string[]>

/** Every item of an area, depth first. */
export function flatItems(area: PermArea): PermItem[] {
  const out: PermItem[] = []
  const walk = (items: PermItem[]) =>
    items.forEach((item) => {
      out.push(item)
      if (item.children) walk(item.children)
    })
  area.groups.forEach((group) => walk(group.items))
  return out
}

const AREA_BY_KEY = new Map(PERMISSION_AREAS.map((a) => [a.key, a]))
export const areaOf = (key: AreaKey): PermArea => AREA_BY_KEY.get(key) as PermArea

/** Editable (non-locked) item keys of an area. */
export function editableKeys(area: AreaKey): string[] {
  return flatItems(areaOf(area))
    .filter((x) => !x.locked)
    .map((x) => x.key)
}

const empty = (): PermissionSet => Object.fromEntries(AREA_KEYS.map((a) => [a, []])) as unknown as PermissionSet

/** Everything on, minus the listed item keys per area. */
function allExcept(exclude: Partial<Record<AreaKey, string[]>>): PermissionSet {
  const set = empty()
  AREA_KEYS.forEach((a) => {
    const skip = exclude[a] ?? []
    set[a] = ['active', ...editableKeys(a).filter((k) => !skip.includes(k))]
  })
  return set
}

/** The Medium role exactly as captured (settings-team.md §8). */
const MEDIUM: PermissionSet = {
  calendar: ['active', 'view_others', 'create_appointments', 'edit_preferred_member', 'apply_discounts', 'reschedule', 'reassign', 'cancel', 'no_show', 'blocked_own', 'blocked_all', 'book_unassigned_members', 'book_unassigned_resources', 'link_own', 'link_own_import', 'link_any'],
  sales: ['active', 'checkout', 'add_tip', 'edit_prices', 'discount_orders', 'discount_items', 'view_all_sales', 'void_sale', 'edit_sale', 'refund_sale', 'collect_cash', 'tap_to_pay', 'sell_memberships', 'sell_packages', 'daily_summary', 'appointments_list', 'gift_card_templates', 'packages_sold', 'memberships_sold', 'sold_gift_cards'],
  clients: ['active', 'view_details', 'full_name', 'contact_details', 'tags', 'edit_forms', 'notes_assigned', 'notes_all_locations', 'notes_edit', 'download', 'reputation_view', 'loyalty_view', 'messages_view', 'messages_send', 'client_tags'],
  catalog: ['active', 'services', 'bulk_edit_services', 'products', 'memberships', 'packages'],
  online_profile: ['active'],
  marketing: ['active', 'automations', 'deals_view'],
  team: ['active', 'team_connect'],
  reports: ['view_all_data'],
  payments_wallet: [],
  workspace: ['active', 'all_locations', 'tips_notifications'],
}

/** Full access to Clients, Online profile, Marketing and Workspace; partial elsewhere. */
const HIGH: PermissionSet = allExcept({
  calendar: ['closed_dates'],
  sales: ['view_own_sales', 'export_reports'],
  catalog: ['import_products'],
  team: ['permission_levels', 'merchant_accounts', 'provider_onboarding'],
  reports: ['data_connections'],
  payments_wallet: ['wallet_billing'],
})

/** Partial access to Calendar, Sales, Clients, Online profile, Marketing, Team, Reports and Workspace. */
const LOW: PermissionSet = {
  calendar: ['active', 'view_others', 'create_appointments', 'reschedule', 'cancel', 'no_show', 'blocked_own', 'link_own', 'link_own_import'],
  sales: ['active', 'checkout', 'add_tip', 'view_own_sales', 'collect_cash', 'tap_to_pay', 'daily_summary', 'appointments_list', 'sold_gift_cards'],
  clients: ['active', 'view_details', 'full_name', 'tags', 'notes_assigned', 'notes_edit', 'messages_view', 'messages_send'],
  catalog: [],
  online_profile: ['active'],
  marketing: ['active', 'deals_view'],
  team: ['active', 'own_shifts', 'own_timesheets', 'team_connect'],
  reports: ['active'],
  payments_wallet: [],
  workspace: ['active', 'tips_notifications'],
}

/** Partial access to Calendar, Sales and Reports. */
const BASIC: PermissionSet = {
  ...empty(),
  calendar: ['active', 'create_appointments', 'reschedule', 'blocked_own'],
  sales: ['active', 'checkout', 'add_tip', 'view_own_sales', 'daily_summary'],
  reports: ['active'],
}

const clone = (set: PermissionSet): PermissionSet => Object.fromEntries(AREA_KEYS.map((a) => [a, [...set[a]]])) as unknown as PermissionSet

/** Default permission set of a role (custom roles start from Medium). */
export function defaultPermissions(roleId: string): PermissionSet {
  switch (roleId) {
    case 'owner':
      return allExcept({})
    case 'none':
      return empty()
    case 'basic':
      return clone(BASIC)
    case 'low':
      return clone(LOW)
    case 'high':
      return clone(HIGH)
    default:
      return clone(MEDIUM)
  }
}

/** System roles can't be edited: the owner has everything, No access nothing. */
export const isReadOnlyRole = (role: Pick<PermissionLevel, 'id' | 'system'>) => role.system || role.id === 'owner' || role.id === 'none'

/**
 * The effective matrix of a role. Roles saved from the editor (`saved`) are
 * taken as stored. The seed only stores ['active'] per area, so for other
 * roles each area keeps its stored on/off state and its items come from the
 * role's default set when the stored list has no item keys.
 */
export function resolvePermissions(role: Pick<PermissionLevel, 'id' | 'system' | 'permissions'>, saved: readonly string[]): PermissionSet {
  if (role.id === 'owner') return defaultPermissions('owner')
  if (role.id === 'none') return defaultPermissions('none')
  const stored = role.permissions ?? {}
  const defaults = defaultPermissions(role.id)
  const set = empty()
  const isSaved = saved.includes(role.id)
  AREA_KEYS.forEach((a) => {
    const list = stored[a] ?? []
    const valid = new Set(editableKeys(a))
    const items = list.filter((k) => valid.has(k))
    const active = list.includes('active')
    const base = isSaved || items.length ? items : defaults[a].filter((k) => k !== 'active')
    set[a] = active ? ['active', ...base] : [...base]
  })
  return set
}

/** Copy for storing (drops unknown keys; always all ten areas). */
export function normalizePermissions(set: PermissionSet): Record<string, string[]> {
  return Object.fromEntries(
    AREA_KEYS.map((a) => {
      const valid = new Set(['active', ...editableKeys(a)])
      return [a, Array.from(new Set(set[a].filter((k) => valid.has(k))))]
    }),
  )
}

export const isAreaActive = (set: PermissionSet, area: AreaKey) => set[area].includes('active')

/** Is an item shown as checked, given its parent's checked state. */
export function itemChecked(set: PermissionSet, area: AreaKey, item: PermItem, parentChecked = true): boolean {
  if (item.locked) return isAreaActive(set, area)
  if (!parentChecked) return false
  return set[area].includes(item.key)
}

/** Every descendant key of an item. */
function descendants(item: PermItem): string[] {
  return (item.children ?? []).flatMap((c) => [c.key, ...descendants(c)])
}

/** Check / uncheck an item; unchecking clears its children too. */
export function toggleItem(set: PermissionSet, area: AreaKey, item: PermItem, on: boolean): PermissionSet {
  const list = new Set(set[area])
  if (on) list.add(item.key)
  else [item.key, ...descendants(item)].forEach((k) => list.delete(k))
  return { ...set, [area]: Array.from(list) }
}

export function toggleArea(set: PermissionSet, area: AreaKey, on: boolean): PermissionSet {
  const list = set[area].filter((k) => k !== 'active')
  return { ...set, [area]: on ? ['active', ...list] : list }
}

/** Areas switched on, and which of them have every editable item checked. */
export function accessSummary(set: PermissionSet): { full: AreaKey[]; partial: AreaKey[] } {
  const full: AreaKey[] = []
  const partial: AreaKey[] = []
  AREA_KEYS.forEach((a) => {
    if (!isAreaActive(set, a)) return
    const keys = editableKeys(a)
    if (keys.every((k) => set[a].includes(k))) full.push(a)
    else partial.push(a)
  })
  return { full, partial }
}

export function samePermissions(a: PermissionSet, b: PermissionSet): boolean {
  return AREA_KEYS.every((k) => {
    const x = new Set(a[k])
    const y = new Set(b[k])
    return x.size === y.size && [...x].every((v) => y.has(v))
  })
}
