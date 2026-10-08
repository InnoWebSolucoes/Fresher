import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import { readSettingsExtra, setBuiltInRoleMembers, updateSettingsExtra, useSettingsExtra } from '@/api/settings'
import { db, useDb } from '@/store/db'
import type { PermissionRole } from '@/lib/permissions'
import type { ID, PermissionLevel, TeamMember } from '@/types'
import { AREA_KEYS, accessSummary, type PermissionSet } from './catalogue'

/**
 * Data helpers for Settings › Team. Fields the shared types don't have are
 * kept in settings extras (src/api/settings.ts):
 * - team.customRoleMembers  Record<roleId, teamMemberIds> for custom roles
 *   (TeamMember.role only knows the built-in roles).
 * - team.permissionsSaved   role ids whose matrix was saved from the editor.
 * - team.pins               Record<teamMemberId, 4-digit PIN>.
 * - team.timesheetRadius    proximity distance in metres.
 * - team.payRunStartsFrom   'next' | 'current' billing cycle.
 */
export const EXTRA_CUSTOM_MEMBERS = 'team.customRoleMembers'
export const EXTRA_SAVED_ROLES = 'team.permissionsSaved'
export const EXTRA_PINS = 'team.pins'
export const EXTRA_RADIUS = 'team.timesheetRadius'
export const EXTRA_STARTS_FROM = 'team.payRunStartsFrom'

export type CustomMembers = Record<string, ID[]>
export type Pins = Record<ID, string>

const NO_CUSTOM: CustomMembers = {}
const NO_IDS: string[] = []
const NO_PINS: Pins = {}

export const BUILT_IN: readonly string[] = ['basic', 'low', 'medium', 'high']
export const isBuiltIn = (id: string): id is PermissionRole => BUILT_IN.includes(id)

export const useCustomMembers = () => useSettingsExtra<CustomMembers>(EXTRA_CUSTOM_MEMBERS, NO_CUSTOM)
export const useSavedRoles = () => useSettingsExtra<string[]>(EXTRA_SAVED_ROLES, NO_IDS)
export const usePins = () => useSettingsExtra<Pins>(EXTRA_PINS, NO_PINS)

/** Permission roles in display order. */
export function useRoles(): PermissionLevel[] {
  const roles = useDb((s) => s.settings.permissionRoles)
  return useMemo(() => [...roles].sort((a, b) => a.order - b.order), [roles])
}

/** Team members that can be moved between roles (not archived, not the owner). */
export function eligibleMembers(members: TeamMember[]): TeamMember[] {
  return members.filter((m) => !m.archived && m.role !== 'owner').sort((a, b) => a.order - b.order)
}

/**
 * Members shown under each role: custom roles from extras, built-in and
 * system roles from TeamMember.role (minus members placed in a custom role).
 */
export function useRoleMembers(): Map<string, TeamMember[]> {
  const members = useDb((s) => s.teamMembers)
  const custom = useCustomMembers()
  return useMemo(() => {
    const active = members.filter((m) => !m.archived).sort((a, b) => a.order - b.order)
    const byId = new Map(active.map((m) => [m.id, m]))
    const inCustom = new Set<ID>()
    const map = new Map<string, TeamMember[]>()
    Object.entries(custom).forEach(([roleId, ids]) => {
      const list = ids.map((id) => byId.get(id)).filter((m): m is TeamMember => Boolean(m) && m?.role !== 'owner')
      list.forEach((m) => inCustom.add(m.id))
      map.set(roleId, list)
    })
    active.forEach((m) => {
      if (inCustom.has(m.id)) return
      const list = map.get(m.role) ?? []
      list.push(m)
      map.set(m.role, list)
    })
    return map
  }, [members, custom])
}

/** Put members in a custom role (they leave any other custom role). */
export async function assignCustomRoleMembers(roleId: string, ids: ID[]): Promise<void> {
  await updateSettingsExtra<CustomMembers>(EXTRA_CUSTOM_MEMBERS, NO_CUSTOM, (current) => {
    const next: CustomMembers = {}
    Object.entries(current).forEach(([key, list]) => {
      if (key !== roleId) next[key] = list.filter((id) => !ids.includes(id))
    })
    next[roleId] = [...ids]
    return next
  })
}

/** Put members in a built-in role (or No access); they leave any custom role. */
export async function assignBuiltInRoleMembers(roleId: PermissionRole, ids: ID[]): Promise<void> {
  const custom = readSettingsExtra<CustomMembers>(EXTRA_CUSTOM_MEMBERS, NO_CUSTOM)
  const inCustom = new Set(Object.values(custom).flat())
  // Members displayed under a custom role keep their underlying built-in role.
  const keep = db()
    .teamMembers.filter((m) => m.role === roleId && inCustom.has(m.id) && !ids.includes(m.id))
    .map((m) => m.id)
  await setBuiltInRoleMembers(roleId, [...ids, ...keep])
  if (ids.some((id) => inCustom.has(id))) {
    await updateSettingsExtra<CustomMembers>(EXTRA_CUSTOM_MEMBERS, NO_CUSTOM, (current) => Object.fromEntries(Object.entries(current).map(([key, list]) => [key, list.filter((id) => !ids.includes(id))])))
  }
}

/** Remember that a role's matrix is fully stored (no more default filling). */
export async function markRoleSaved(roleId: string): Promise<void> {
  await updateSettingsExtra<string[]>(EXTRA_SAVED_ROLES, NO_IDS, (ids) => (ids.includes(roleId) ? ids : [...ids, roleId]))
}

/** Forget a deleted custom role's members. */
export async function forgetCustomRole(roleId: string): Promise<void> {
  await updateSettingsExtra<CustomMembers>(EXTRA_CUSTOM_MEMBERS, NO_CUSTOM, (current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== roleId)))
}

export const nameTaken = (roles: PermissionLevel[], name: string, exceptId?: string) => roles.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.trim().toLowerCase())

/** "Name copy", "Name copy 2"… */
export function copyName(roles: PermissionLevel[], name: string, suffix: string): string {
  const base = `${name} ${suffix}`.slice(0, 50)
  if (!nameTaken(roles, base)) return base
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 46)} ${n}`
    if (!nameTaken(roles, candidate)) return candidate
  }
  return base
}

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/** "Full access to Clients. Partial access to Calendar, Sales, and Reports." */
export function describePermissions(set: PermissionSet, t: TFunction): string {
  const { full, partial } = accessSummary(set)
  const names = (keys: typeof AREA_KEYS) => listFormat.format(keys.map((k) => t(`settings.tm.perm.${k}.title`)))
  const parts: string[] = []
  if (full.length) parts.push(t('settings.tm.roles.describeFull', { areas: names(full) }))
  if (partial.length) parts.push(t('settings.tm.roles.describePartial', { areas: names(partial) }))
  return parts.length ? parts.join(' ') : t('settings.tm.roles.describeNone')
}

/** Random 4-digit PIN not in `taken`. */
export function randomPin(taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 0; n < 200; n++) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    if (!used.has(pin) && !/^(\d)\1{3}$/.test(pin) && pin !== '1234') return pin
  }
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}
