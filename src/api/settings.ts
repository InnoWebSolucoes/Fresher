import type { Draft } from 'immer'
import { commit, db, useDb } from '@/store/db'
import type { DbData, ID, Location, OpeningHours, PermissionLevel, Settings, TeamMember, Weekday, Workspace } from '@/types'
import type { PermissionRole } from '@/lib/permissions'
import { uid } from '@/lib/ids'
import { ApiError, crud, latency } from './client'
import { t } from './i18n'

/**
 * Workspace settings (reference/settings-*.md). Every settings page writes
 * through these functions.
 *
 * Fields the shared `Settings` type doesn't have (per-location tipping,
 * online payment methods, card terminals, PINs, bank accounts…) are kept in a
 * small key/value bag at `settings.extras`, read with `useSettingsExtra()`
 * and written with `setSettingsExtra()` / `updateSettingsExtra()`.
 */

// ─── Generic settings ─────────────────────────────────────────────────────

/** Apply a recipe to `db.settings`. */
export async function updateSettings(recipe: (settings: Draft<Settings>) => void): Promise<void> {
  await latency()
  commit((d) => {
    recipe(d.settings)
  })
}

/** Apply a recipe to `db.workspace` (business name, links, plan…). */
export async function updateWorkspace(recipe: (workspace: Draft<Workspace>) => void): Promise<void> {
  await latency()
  commit((d) => {
    recipe(d.workspace)
  })
}

// ─── Extras (fields the shared types don't cover) ─────────────────────────

/** Synchronous read of one extras value. */
export function readSettingsExtra<T>(key: string, fallback: T): T {
  return (db().settings.extras?.[key] as T | undefined) ?? fallback
}

/**
 * React hook: one extras value, or `fallback` when unset. Pass a module-level
 * constant as fallback so the returned reference stays stable.
 */
export function useSettingsExtra<T>(key: string, fallback: T): T {
  const value = useDb((s) => s.settings?.extras?.[key]) as T | undefined
  return value ?? fallback
}

/** Commit an extras value without latency (use inside other api functions). */
export function writeSettingsExtra<T>(key: string, value: T): void {
  commit((d) => {
    d.settings.extras = { ...d.settings.extras, [key]: value }
  })
}

export async function setSettingsExtra<T>(key: string, value: T): Promise<void> {
  await latency()
  writeSettingsExtra(key, value)
}

/** Update an extras value from its current value (or the fallback). */
export async function updateSettingsExtra<T>(key: string, fallback: T, update: (current: T) => T): Promise<void> {
  await latency()
  writeSettingsExtra(key, update(readSettingsExtra(key, fallback)))
}

// ─── Online booking ───────────────────────────────────────────────────────

/**
 * Save "New appointment assignment". The excluded members are mirrored on
 * TeamMember.excludeAutoAssign, which online availability reads when a
 * client picks "Any professional" (and the team member form edits).
 */
export async function saveDynamicAssignment(value: Settings['dynamicAssignment']): Promise<void> {
  await latency()
  commit((d) => {
    d.settings.dynamicAssignment = { ...value, excluded: [...value.excluded] }
    d.teamMembers.forEach((m) => {
      m.excludeAutoAssign = value.excluded.includes(m.id)
    })
  })
}

// ─── Collections ─────────────────────────────────────────────────────────

export const closedPeriodsApi = crud('closedPeriods', 'cp')
export const resourcesApi = crud('resources', 'res')
export const resourceTypesApi = crud('resourceTypes', 'rt')
export const formTemplatesApi = crud('formTemplates', 'form')
export const clientSourcesApi = crud('clientSources', 'src')
export const clientTagsApi = crud('clientTags', 'tag')
export const blockedTimeTypesApi = crud('blockedTimeTypes', 'btt')

type OrderedKey = 'clientSources' | 'clientTags'

/** Rewrite `order` of an ordered collection following `ids`. */
export async function reorderCollection(key: OrderedKey, ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    const list = d[key] as { id: ID; order: number }[]
    ids.forEach((id, index) => {
      const item = list.find((x) => x.id === id)
      if (item) item.order = index
    })
    list.sort((a, b) => a.order - b.order)
  })
}

/** Ordered lists inside settings (cancellation reasons, statuses, payment methods, time off types, roles). */
type SettingsListKey = 'cancellationReasons' | 'appointmentStatuses' | 'customPaymentMethods' | 'permissionRoles'

export async function reorderSettingsList(key: SettingsListKey, ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    const list = d.settings[key] as { id: ID; order: number }[]
    ids.forEach((id, index) => {
      const item = list.find((x) => x.id === id)
      if (item) item.order = index
    })
    list.sort((a, b) => a.order - b.order)
  })
}

/** Move one item up (-1) or down (+1) inside an ordered settings list. */
export async function moveSettingsListItem(key: SettingsListKey, id: ID, direction: -1 | 1): Promise<void> {
  const list = [...(db().settings[key] as { id: ID; order: number }[])].sort((a, b) => a.order - b.order)
  const index = list.findIndex((x) => x.id === id)
  const target = index + direction
  if (index === -1 || target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
  await reorderSettingsList(
    key,
    list.map((x) => x.id),
  )
}

/** Reorder time off types (no `order` field: the array order is the order). */
export async function reorderTimeOffTypes(ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    const byId = new Map(d.settings.timeOffTypes.map((t) => [t.id, t]))
    const next = ids.map((id) => byId.get(id)).filter(Boolean) as typeof d.settings.timeOffTypes
    d.settings.timeOffTypes.forEach((t) => {
      if (!ids.includes(t.id)) next.push(t)
    })
    d.settings.timeOffTypes = next
  })
}

/** Delete a client tag and remove it from every client. */
export async function deleteClientTag(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.clientTags = d.clientTags.filter((t) => t.id !== id)
    d.clients.forEach((c) => {
      if (c.tagIds.includes(id)) c.tagIds = c.tagIds.filter((t) => t !== id)
    })
  })
}

/** Delete a resource type; fails while resources still use it. */
export async function deleteResourceType(id: ID): Promise<void> {
  await latency()
  if (db().resources.some((r) => r.typeId === id)) throw new ApiError('in_use', t('api.settings.resourceTypeInUse'))
  commit((d) => {
    d.resourceTypes = d.resourceTypes.filter((t) => t.id !== id)
    d.services.forEach((s) => {
      if (s.resourceTypeIds.includes(id)) s.resourceTypeIds = s.resourceTypeIds.filter((t) => t !== id)
    })
  })
}

// ─── Locations ───────────────────────────────────────────────────────────

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]

export function defaultOpeningHours(): OpeningHours {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, { open: d < 6, ranges: d < 6 ? [{ start: '10:00', end: d === 5 ? '17:00' : '19:00' }] : [] }])) as OpeningHours
}

export async function updateLocation(id: ID, recipe: (location: Draft<Location>) => void): Promise<void> {
  await latency()
  commit((d) => {
    const location = d.locations.find((l) => l.id === id)
    if (!location) throw new ApiError('not_found', t('settings.biz.location.notFound'))
    recipe(location)
  })
}

export interface NewLocationInput {
  name: string
  internalName?: string
  phone: string
  email: string
  address: Location['address']
  directions?: string
  businessTypes: string[]
  openingHours: OpeningHours
}

/** Add a location (Add new location wizard). The owner is assigned to it. */
export async function createLocation(input: NewLocationInput): Promise<Location> {
  await latency(500, 900)
  const prefix = input.name
    .replace(/[^A-Za-z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  const location: Location = {
    id: uid('loc'),
    name: input.name.trim(),
    internalName: input.internalName?.trim() || undefined,
    phone: input.phone,
    email: input.email,
    address: input.address,
    directions: input.directions,
    openingHours: input.openingHours,
    businessTypes: input.businessTypes,
    receiptPrefix: prefix || 'LOC',
    nextReceiptNumber: 1,
    marketplace: { listed: false, description: '', amenities: [], highlights: [], values: [], images: [] },
  }
  commit((d) => {
    d.locations.push(location)
    const owner = d.teamMembers.find((m) => m.role === 'owner')
    if (owner && !owner.locationIds.includes(location.id)) owner.locationIds.push(location.id)
  })
  return location
}

/** Records that still point at a location (it can't be deleted while it has history). */
export function locationUsage(id: ID): { appointments: number; sales: number } {
  const data = db()
  return {
    appointments: data.appointments.filter((a) => a.locationId === id).length,
    sales: data.sales.filter((s) => s.locationId === id).length,
  }
}

export async function deleteLocation(id: ID): Promise<void> {
  await latency()
  const data = db()
  if (data.locations.length <= 1) throw new ApiError('last_location', t('settings.biz.locations.lastLocation'))
  const usage = locationUsage(id)
  if (usage.appointments || usage.sales) throw new ApiError('in_use', t('api.settings.locationInUse'))
  commit((d) => {
    d.locations = d.locations.filter((l) => l.id !== id)
    d.teamMembers.forEach((m) => {
      if (m.locationIds.includes(id)) m.locationIds = m.locationIds.filter((l) => l !== id)
    })
    d.services.forEach((s) => {
      if (s.locationIds.includes(id)) s.locationIds = s.locationIds.filter((l) => l !== id)
    })
    d.resources = d.resources.filter((r) => r.locationId !== id)
    d.registers = d.registers.filter((r) => r.locationId !== id)
    d.shiftPatterns = d.shiftPatterns.filter((p) => p.locationId !== id)
    d.shiftOverrides = d.shiftOverrides.filter((p) => p.locationId !== id)
    d.closedPeriods.forEach((c) => {
      if (c.locationIds.includes(id)) c.locationIds = c.locationIds.filter((l) => l !== id)
    })
  })
}

// ─── Permission roles ─────────────────────────────────────────────────────

export const BUILT_IN_ROLES: PermissionRole[] = ['basic', 'low', 'medium', 'high']

export async function savePermissionRole(role: PermissionLevel): Promise<void> {
  await latency()
  commit((d) => {
    const index = d.settings.permissionRoles.findIndex((r) => r.id === role.id)
    if (index === -1) d.settings.permissionRoles.push(role)
    else d.settings.permissionRoles[index] = role
  })
}

export async function createPermissionRole(input: Pick<PermissionLevel, 'name' | 'description' | 'permissions'>): Promise<PermissionLevel> {
  await latency()
  const roles = db().settings.permissionRoles
  const role: PermissionLevel = { ...input, id: uid('role'), system: false, order: roles.filter((r) => !r.system).length }
  commit((d) => {
    const custom = d.settings.permissionRoles.filter((r) => !r.system)
    const system = d.settings.permissionRoles.filter((r) => r.system)
    d.settings.permissionRoles = [...custom, role, ...system].map((r, i) => ({ ...r, order: i }))
  })
  return role
}

export async function deletePermissionRole(id: ID): Promise<void> {
  await latency()
  if (db().teamMembers.some((m) => m.role === id && !m.archived)) throw new ApiError('in_use', t('api.settings.roleInUse'))
  commit((d) => {
    d.settings.permissionRoles = d.settings.permissionRoles.filter((r) => r.id !== id)
  })
}

/**
 * Move team members into a built-in role. Members removed from it go to the
 * workspace default role (or Basic when this role is the default). Linked
 * logins follow their team member. The workspace owner is never moved.
 */
export async function setBuiltInRoleMembers(roleId: PermissionRole, memberIds: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    const fallback: PermissionRole = d.settings.defaultRole === roleId ? (roleId === 'basic' ? 'low' : 'basic') : d.settings.defaultRole
    const apply = (member: Draft<TeamMember>, role: PermissionRole) => {
      member.role = role
      d.users.forEach((u) => {
        if (u.teamMemberId === member.id && u.role !== 'owner') u.role = role
      })
    }
    d.teamMembers.forEach((m) => {
      if (m.role === 'owner') return
      if (memberIds.includes(m.id)) apply(m, roleId)
      else if (m.role === roleId) apply(m, fallback)
    })
  })
}

// ─── Sales: taxes and registers ───────────────────────────────────────────

/** Delete a tax rate and clear it wherever it is used. */
export async function deleteTaxRate(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    d.settings.taxRates = d.settings.taxRates.filter((t) => t.id !== id)
    const defaults = d.settings.taxDefaults
    ;(['services', 'products', 'memberships'] as const).forEach((k) => {
      if (defaults[k] === id) defaults[k] = null
    })
    d.services.forEach((s) => {
      if (s.taxRateId === id) s.taxRateId = null
    })
    d.products.forEach((p) => {
      if (p.taxRateId === id) p.taxRateId = null
    })
    d.packages.forEach((p) => {
      if (p.taxRateId === id) p.taxRateId = null
    })
    d.settings.serviceCharges.forEach((c) => {
      if (c.taxRateId === id) c.taxRateId = null
    })
  })
}

/** "Apply location defaults — Set all catalog items to location defaults". Returns how many items changed. */
export async function applyTaxDefaultsToCatalog(): Promise<number> {
  await latency(500, 900)
  let changed = 0
  commit((d) => {
    const { services, products } = d.settings.taxDefaults
    d.services.forEach((s) => {
      if (s.taxRateId !== services) {
        s.taxRateId = services
        changed++
      }
    })
    d.products.forEach((p) => {
      if (p.taxRateId !== products) {
        p.taxRateId = products
        changed++
      }
    })
    d.packages.forEach((p) => {
      if (p.taxRateId !== services) {
        p.taxRateId = services
        changed++
      }
    })
  })
  return changed
}

/** Persist the register order (Reorder registers, Move up / Move down). */
export async function reorderRegisters(ids: ID[]): Promise<void> {
  await latency()
  commit((d) => {
    ids.forEach((id, index) => {
      const reg = d.registers.find((r) => r.id === id)
      if (reg) reg.order = index
    })
    d.registers.sort((a, b) => a.order - b.order)
  })
}

// ─── Misc helpers for pages ───────────────────────────────────────────────

/** Bookable, not archived team members (plan pricing counts these). */
export function bookableMembers(data: Pick<DbData, 'teamMembers'>): TeamMember[] {
  return data.teamMembers.filter((m) => m.bookable && !m.archived)
}

// ─── Scheduling ───────────────────────────────────────────────────────────

type SchedResource = import('@/types').Resource
type SchedResourceType = import('@/types').ResourceType

/**
 * Resource fields the shared `Resource` type doesn't have, kept on the record
 * itself (settings-scheduling.md §4 Availability).
 */
export interface ResourceAvailabilityExtras {
  /** "Only available on specific days and times": hours per weekday (0 = Monday). */
  weekly?: Partial<Record<import('@/types').Weekday, { open: boolean; start: string; end: string }>>
  /** "Limit availability between specific dates". */
  limitDates?: boolean
  availableFrom?: string
  availableTo?: string
  /** "Link related resources": booking this one makes these unavailable (kept symmetric). */
  linkResources?: boolean
  linkedIds?: ID[]
}

export type ResourceRecord = SchedResource & ResourceAvailabilityExtras

/**
 * Create (id = null) or update a resource. When `newType` is given (a
 * suggested type that doesn't exist yet) it is created first and used as the
 * resource's type. Linked resources are kept symmetric.
 */
export async function saveResource(id: ID | null, input: Omit<ResourceRecord, 'id'>, newType?: Omit<SchedResourceType, 'id'>): Promise<ResourceRecord> {
  await latency()
  const data = db()
  if (id && !data.resources.some((r) => r.id === id)) throw new ApiError('not_found', t('api.settings.resourceNotFound'))
  let typeId = input.typeId
  let typeToCreate: SchedResourceType | null = null
  if (newType) {
    const existing = data.resourceTypes.find((t) => t.name.trim().toLowerCase() === newType.name.trim().toLowerCase())
    if (existing) typeId = existing.id
    else {
      typeToCreate = { ...newType, id: uid('rt') }
      typeId = typeToCreate.id
    }
  }
  if (!typeId) throw new ApiError('invalid', t('api.settings.resourceTypeRequired'))
  const record: ResourceRecord = { ...input, typeId, id: id ?? uid('res') }
  const linked = record.linkResources ? (record.linkedIds ?? []).filter((x) => x !== record.id) : []
  record.linkedIds = linked
  commit((d) => {
    if (typeToCreate) d.resourceTypes.push(typeToCreate)
    const list = d.resources as ResourceRecord[]
    const index = list.findIndex((r) => r.id === record.id)
    if (index === -1) list.push(record)
    else list[index] = record
    list.forEach((r) => {
      if (r.id === record.id) return
      const has = (r.linkedIds ?? []).includes(record.id)
      if (linked.includes(r.id) && !has) {
        r.linkedIds = [...(r.linkedIds ?? []), record.id]
        r.linkResources = true
      } else if (!linked.includes(r.id) && has) {
        r.linkedIds = (r.linkedIds ?? []).filter((x) => x !== record.id)
        if (!r.linkedIds.length) r.linkResources = false
      }
    })
  })
  return record
}

/** Delete a resource and unlink it from related resources (appointments keep their history). */
export async function deleteResource(id: ID): Promise<void> {
  await latency()
  commit((d) => {
    const list = d.resources as ResourceRecord[]
    d.resources = list.filter((r) => r.id !== id)
    ;(d.resources as ResourceRecord[]).forEach((r) => {
      if (r.linkedIds?.includes(id)) {
        r.linkedIds = r.linkedIds.filter((x) => x !== id)
        if (!r.linkedIds.length) r.linkResources = false
      }
    })
  })
}
