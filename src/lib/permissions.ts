import { useDb } from '@/store/db'

export type SectionId =
  | 'home'
  | 'calendar'
  | 'sales'
  | 'clients'
  | 'catalog'
  | 'online'
  | 'marketing'
  | 'team'
  | 'reports'
  | 'addons'
  | 'settings'
  | 'account'
  | 'connect'

/** Permission roles from reference/settings-team.md §1. */
export type PermissionRole = 'owner' | 'high' | 'medium' | 'low' | 'basic' | 'none'

/**
 * Fallback when a role has no saved definition (e.g. before the data has
 * loaded). Mirrors the default roles in src/mock/permissionRoles.ts.
 */
const ROLE_SECTIONS: Record<PermissionRole, SectionId[]> = {
  owner: ['home', 'calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'reports', 'addons', 'settings', 'account', 'connect'],
  high: ['home', 'calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'reports', 'addons', 'settings', 'account', 'connect'],
  medium: ['calendar', 'sales', 'clients', 'catalog', 'online', 'marketing', 'team', 'settings', 'account', 'connect'],
  low: ['calendar', 'sales', 'clients', 'online', 'team', 'account', 'connect'],
  basic: ['calendar', 'sales', 'account'],
  none: [],
}

/** Permission area (Settings › Team › Permission roles) that unlocks each section. */
const SECTION_AREA: Partial<Record<SectionId, string>> = {
  calendar: 'calendar',
  sales: 'sales',
  clients: 'clients',
  connect: 'clients',
  catalog: 'catalog',
  online: 'online_profile',
  marketing: 'marketing',
  team: 'team',
  reports: 'reports',
  addons: 'payments_wallet',
  settings: 'workspace',
}

/**
 * Whether a permission role can open a section. Reads the roles saved in
 * Settings › Team › Permission roles, so editing a role's areas changes what
 * its team members see. The workspace owner always has full access.
 */
export function canAccess(role: PermissionRole, section: SectionId): boolean {
  if (role === 'owner') return true
  if (role === 'none') return false
  if (section === 'account') return true
  const def = useDb.getState().settings?.permissionRoles?.find((r) => r.id === role)
  if (!def) return (ROLE_SECTIONS[role] ?? ROLE_SECTIONS.medium).includes(section)
  const keys = (area: string) => def.permissions[area] ?? []
  if (section === 'home') return keys('workspace').includes('active') && keys('workspace').includes('home_page')
  const area = SECTION_AREA[section]
  return area ? keys(area).includes('active') : false
}

/** Re-render on permission-role edits (use next to canAccess in components). */
export function usePermissionRoles() {
  return useDb((s) => s.settings?.permissionRoles)
}

/** Where a user lands after login: Home when allowed, otherwise the calendar. */
export function landingPath(role: PermissionRole): string {
  return canAccess(role, 'home') ? '/dashboard' : '/calendar'
}
